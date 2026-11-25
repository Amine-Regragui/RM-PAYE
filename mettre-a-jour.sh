#!/bin/sh
# Mise à jour : sauvegarde, nouvelle version de RM Paie (site, fonctions, migrations) et, au choix, de Supabase.
#   sudo sh /opt/rmpaie/bin/mettre-a-jour.sh /chemin/vers/rmpaie-saas            → RM Paie seulement
#   sudo sh /opt/rmpaie/bin/mettre-a-jour.sh /chemin/vers/rmpaie-saas --supabase → RM Paie + composants Supabase
set -eu
. "$(dirname "$0")/lib.sh"
charger_config
SRC="${1:?Indiquez le dossier rmpaie-saas de la nouvelle version}"; SRC=$(cd "$SRC" && pwd)

dire "Sauvegarde avant mise à jour"
sh "$BASE/bin/sauvegarde.sh"

for s in lib.sh deployer.sh migrer.sh sauvegarde.sh restaurer.sh surveiller.sh mettre-a-jour.sh creer-admin.sh; do
  [ -f "$SRC/deploy/maroc/$s" ] && install -m 700 "$SRC/deploy/maroc/$s" "$BASE/bin/$s"
done
install -m 644 "$SRC/deploy/maroc/docker-compose.rmpaie.yml" "$SUPA/docker-compose.rmpaie.yml"
install -m 644 "$SRC/deploy/maroc/Caddyfile" "$SUPA/volumes/proxy/rmpaie/Caddyfile"

if [ "${2:-}" = "--supabase" ]; then
  dire "Mise à jour de Supabase"
  (cd "$SUPA" && sh update.sh && sh run.sh pull)
fi
(cd "$SUPA" && sh run.sh start)
sh "$BASE/bin/migrer.sh" "$SRC/supabase/migrations"
sh "$BASE/bin/deployer.sh" "$SRC"
compose restart caddy >/dev/null
ok "Mise à jour terminée"
