#!/bin/sh
# Met en ligne une nouvelle version du site et des fonctions serveur RM Paie.
#   sudo sh /opt/rmpaie/bin/deployer.sh /chemin/vers/rmpaie-saas
# Options internes : --sans-moteur (avant le premier démarrage), --moteur-seul
set -eu
. "$(dirname "$0")/lib.sh"
charger_config
SRC="${1:?Indiquez le dossier rmpaie-saas}"; MODE="${2:-}"
SRC=$(cd "$SRC" && pwd)

if [ "$MODE" != "--moteur-seul" ]; then
  dire "Site"
  rsync -a --delete --exclude config.js "$SRC/web/public/" "$BASE/site/"
  cat > "$BASE/site/config.js" <<JS
// Généré par deployer.sh — serveur RM Paie au Maroc
window.RMPAIE_CONFIG = {
  supabaseUrl: 'https://api.$DOMAINE',
  supabaseAnonKey: '$(lire_env ANON_KEY)',
  plausibleDomain: ''
};
JS
  chmod -R a+rX "$BASE/site"
  ok "Fichiers du site copiés ($(find "$BASE/site" -type f | wc -l) fichiers)"

  dire "Fonctions serveur"
  rm -rf "$SUPA/volumes/functions/hello"
  for d in "$SRC"/supabase/functions/*/; do
    n=$(basename "$d"); [ "$n" = "main" ] && continue
    rsync -a --delete "$d" "$SUPA/volumes/functions/$n/"
  done
  ok "Fonctions copiées"
  if compose ps --status running --services 2>/dev/null | grep -qx functions; then compose restart functions >/dev/null && ok "Fonctions redémarrées"; fi
fi

if [ "$MODE" != "--sans-moteur" ]; then
  dire "Moteur de calcul (stockage privé)"
  KEY=$(lire_env SERVICE_ROLE_KEY)
  for _ in 1 2 3 4 5 6; do
    if cat "$SRC/web/prive/moteur.js" | compose exec -T caddy sh -c "cat > /tmp/moteur.js && wget -q -O- \
        --header='Authorization: Bearer $KEY' --header='apikey: $KEY' --header='x-upsert: true' --header='Content-Type: text/javascript' \
        --post-file=/tmp/moteur.js http://api-gw:8000/storage/v1/object/logiciel/moteur.js && rm -f /tmp/moteur.js" >/dev/null 2>&1; then
      ok "moteur.js mis à jour"; exit 0
    fi
    sleep 10
  done
  stop "Envoi du moteur impossible : vérifiez que les migrations ont créé le stockage « logiciel » (sh migrer.sh)."
fi
