# Fonctions communes aux scripts RM Paie (chargé par « . lib.sh »)
BASE=/opt/rmpaie
SUPA="$BASE/supabase"

dire() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
avert(){ printf '  \033[33m!\033[0m %s\n' "$*"; }
stop() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

charger_config() {
  f="${1:-$BASE/config.env}"
  [ -f "$f" ] || stop "Fichier de configuration introuvable : $f"
  set -a
  # shellcheck disable=SC1090
  . "$f"
  set +a
}

# Lit une valeur du .env de Supabase (sans les guillemets)
lire_env() { grep -E "^$1=" "$SUPA/.env" 2>/dev/null | head -n1 | cut -d= -f2- | sed -e "s/^[\"']//" -e "s/[\"']\$//"; }

# Écrit (ou remplace) une valeur dans le .env de Supabase, entre apostrophes (valeur prise telle quelle, sans interprétation de $)
ecrire_env() {
  case "$2" in *\'*) stop "La valeur de $1 ne doit pas contenir d'apostrophe (')";; esac
  tmp=$(mktemp)
  K="$1" V="$2" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; fait=0} index($0, k "=")==1 {print k "=\047" v "\047"; fait=1; next} {print} END{if(!fait) print k "=\047" v "\047"}' "$SUPA/.env" > "$tmp"
  cat "$tmp" > "$SUPA/.env"; rm -f "$tmp"
}

compose() { (cd "$SUPA" && docker compose "$@"); }
psql_db() { compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# Envoie un e-mail d'alerte par le SMTP configuré (curl), sans dépendre de la pile Supabase
alerter() {
  sujet="$1"; corps="$2"
  [ -n "${ALERTE_EMAIL:-}" ] && [ -n "${SMTP_HOST:-}" ] || return 0
  if [ "${SMTP_SECURITE:-ssl}" = "ssl" ]; then url="smtps://$SMTP_HOST:${SMTP_PORT:-465}"; tls=""; else url="smtp://$SMTP_HOST:${SMTP_PORT:-587}"; tls="--ssl-reqd"; fi
  printf 'From: %s <%s>\r\nTo: %s\r\nSubject: =?UTF-8?B?%s?=\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n' \
    "${SMTP_EXPEDITEUR_NOM:-RM Paie}" "$SMTP_EXPEDITEUR" "$ALERTE_EMAIL" "$(printf '%s' "$sujet" | base64 | tr -d '\n')" "$corps" |
    curl -s --max-time 30 $tls --url "$url" --user "$SMTP_USER:$SMTP_PASS" --mail-from "$SMTP_EXPEDITEUR" --mail-rcpt "$ALERTE_EMAIL" -T - >/dev/null 2>&1 || true
}
