#!/bin/sh
# Applique les migrations SQL de RM Paie qui ne l'ont pas encore été, puis (re)programme les tâches planifiées.
#   sudo sh /opt/rmpaie/bin/migrer.sh /chemin/vers/rmpaie-saas/supabase/migrations
set -eu
. "$(dirname "$0")/lib.sh"
charger_config
DIR="${1:?Indiquez le dossier des migrations}"

dire "Migrations"
psql_db -c "create schema if not exists rmpaie_admin; create table if not exists rmpaie_admin.migrations (nom text primary key, applique_le timestamptz not null default now()); revoke all on schema rmpaie_admin from public;"
for f in "$DIR"/*.sql; do
  n=$(basename "$f")
  deja=$(psql_db -tA -c "select 1 from rmpaie_admin.migrations where nom = '$n'")
  if [ "$deja" = "1" ]; then ok "$n (déjà appliquée)"; continue; fi
  { echo "begin;"; cat "$f"; echo; echo "insert into rmpaie_admin.migrations (nom) values ('$n');"; echo "commit;"; } | psql_db -f - >/dev/null
  ok "$n"
done

dire "Tâches planifiées (pg_cron)"
SECRET=$(lire_env RMPAIE_CRON_SECRET)
psql_db >/dev/null <<SQL
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- Rappels de paiement, résiliations, nettoyage du journal et alerte quotidienne : chaque matin à 6 h 17 (heure de Casablanca, UTC+1)
select cron.schedule('rmpaie-notifications', '17 5 * * *', \$c\$ select net.http_post(url := 'http://functions:9000/notifications', body := '{}'::jsonb, headers := '{"Content-Type":"application/json","x-cron-secret":"$SECRET"}'::jsonb, timeout_milliseconds := 60000) \$c\$);
-- Alerte e-mail des nouvelles erreurs : chaque heure
select cron.schedule('rmpaie-erreurs', '7 * * * *', \$c\$ select net.http_post(url := 'http://functions:9000/notifications', body := '{"tache":"erreurs"}'::jsonb, headers := '{"Content-Type":"application/json","x-cron-secret":"$SECRET"}'::jsonb, timeout_milliseconds := 30000) \$c\$);
-- Purge de l'historique d'exécution de pg_cron (30 jours)
select cron.schedule('rmpaie-purge-cron', '40 4 * * 0', \$c\$ delete from cron.job_run_details where end_time < now() - interval '30 days' \$c\$);
SQL
ok "notifications (quotidien), alertes d'erreurs (horaire), purge de l'historique (hebdomadaire)"
