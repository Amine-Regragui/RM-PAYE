#!/bin/sh
# Sauvegarde chiffrée de RM Paie : base de données (export logique, sans interruption) + fichiers (RC, pièces jointes, moteur)
# + configuration. Chiffrée avec la clé publique age, conservée ici et copiée sur un second serveur au Maroc.
#   sudo sh /opt/rmpaie/bin/sauvegarde.sh
set -eu
. "$(dirname "$0")/lib.sh"
charger_config
umask 077
D=/var/backups/rmpaie; T=$(date +%Y-%m-%d_%H%M); TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echec() { alerter "RM Paie : ÉCHEC de la sauvegarde du $T" "La sauvegarde a échoué à l'étape : $1. Voir /var/log/rmpaie-sauvegarde.log sur le serveur."; stop "$1"; }

echo "== Sauvegarde $T"
# 1. Base complète (rôles, schémas auth, storage, public…) — export cohérent sans arrêt du service
compose exec -T db pg_dumpall -U postgres --clean --if-exists > "$TMP/base.sql" || echec "export de la base"
[ -s "$TMP/base.sql" ] || echec "export vide"
# 2. Fichiers stockés (registres de commerce, pièces jointes, moteur)
tar -C "$SUPA/volumes" -czf "$TMP/fichiers.tar.gz" storage 2>/dev/null || echec "archive des fichiers"
# 3. Configuration (secrets compris : indispensable pour restaurer)
tar -C "$BASE" -czf "$TMP/config.tar.gz" config.env supabase/.env supabase/docker-compose.rmpaie.yml supabase/volumes/proxy/rmpaie || echec "archive de la configuration"
printf 'RM Paie — sauvegarde du %s\nServeur : %s\nVersion Supabase : %s\n' "$T" "$(hostname)" "$(cat "$SUPA/.supabase-version" 2>/dev/null || echo '?')" > "$TMP/LISEZMOI.txt"
(cd "$TMP" && sha256sum base.sql fichiers.tar.gz config.tar.gz > sommes.sha256)

F="$D/rmpaie_$T.tar.age"
tar -C "$TMP" -cf - LISEZMOI.txt sommes.sha256 base.sql fichiers.tar.gz config.tar.gz | age -r "$SAUVEGARDE_CLE_PUBLIQUE" -o "$F" || echec "chiffrement"
echo "Fichier : $F ($(du -h "$F" | cut -f1))"

# Copie hors site (second serveur au Maroc)
if [ -n "${SAUVEGARDE_DESTINATION:-}" ]; then
  rsync -a -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" "$F" "$SAUVEGARDE_DESTINATION/" || echec "copie vers $SAUVEGARDE_DESTINATION"
  hote=${SAUVEGARDE_DESTINATION%%:*}; chemin=${SAUVEGARDE_DESTINATION#*:}
  ssh -o BatchMode=yes "$hote" "find '$chemin' -name 'rmpaie_*.tar.age' -mtime +${SAUVEGARDE_JOURS_DISTANT:-90} -delete" || true
  echo "Copie hors site : $SAUVEGARDE_DESTINATION"
fi
# Rotation locale
find "$D" -name 'rmpaie_*.tar.age' -mtime +"${SAUVEGARDE_JOURS:-14}" -delete
date +%s > "$D/.derniere-reussite"
echo "== Terminé"
