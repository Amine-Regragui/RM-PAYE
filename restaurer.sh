#!/bin/sh
# Restaure une sauvegarde RM Paie (sur ce serveur ou sur un nouveau serveur déjà installé avec installer.sh).
#   sudo sh /opt/rmpaie/bin/restaurer.sh /var/backups/rmpaie/rmpaie_AAAA-MM-JJ_HHMM.tar.age /chemin/rmpaie-sauvegarde.key
# La clé privée est demandée en paramètre : copiez-la temporairement, puis supprimez-la du serveur.
set -eu
. "$(dirname "$0")/lib.sh"
charger_config
F="${1:?Fichier de sauvegarde (.tar.age)}"; CLE="${2:?Fichier de clé privée age}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; umask 077

dire "Déchiffrement et contrôle"
age -d -i "$CLE" "$F" | tar -C "$TMP" -xf -
(cd "$TMP" && sha256sum -c sommes.sha256) || stop "Sauvegarde corrompue"
cat "$TMP/LISEZMOI.txt"

printf '\nCette opération REMPLACE toutes les données actuelles par celles de la sauvegarde. Tapez RESTAURER pour continuer : '
read -r rep; [ "$rep" = "RESTAURER" ] || stop "Annulé"

dire "Sauvegarde de sécurité de l'état actuel"
sh "$BASE/bin/sauvegarde.sh" || avert "Sauvegarde de l'état actuel impossible, on continue"

dire "Restauration de la base"
compose stop auth rest realtime storage functions meta studio supavisor >/dev/null 2>&1 || true
compose exec -T db psql -U postgres -d postgres -q < "$TMP/base.sql" > "$TMP/restauration.log" 2>&1 || avert "Messages pendant la restauration : voir $TMP/restauration.log (les rôles déjà existants sont normaux)"
ok "Base restaurée"

dire "Restauration des fichiers"
mv "$SUPA/volumes/storage" "$SUPA/volumes/storage.avant-restauration.$(date +%s)" 2>/dev/null || true
tar -C "$SUPA/volumes" -xzf "$TMP/fichiers.tar.gz"
ok "Fichiers restaurés (ancienne version conservée dans volumes/storage.avant-restauration.*)"

dire "Redémarrage"
(cd "$SUPA" && sh run.sh start)
ok "RM Paie est de nouveau en service. Vérifiez la connexion sur https://$DOMAINE"
echo "  La configuration de la sauvegarde (secrets) est dans $TMP/config.tar.gz : pour un nouveau serveur, extrayez-la AVANT installer.sh."
cp "$TMP/config.tar.gz" "/root/config-restauree-$(date +%s).tar.gz"
