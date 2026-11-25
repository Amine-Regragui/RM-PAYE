#!/bin/sh
# Surveillance (toutes les 5 minutes) : site, API, conteneurs, disque, sauvegarde. Alerte e-mail au plus une fois par heure et par problème.
set -u
. "$(dirname "$0")/lib.sh"
charger_config
ETAT=/var/lib/rmpaie; mkdir -p "$ETAT"; problemes=""

http() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null; }
c=$(http "https://$DOMAINE/"); [ "$c" = "200" ] || problemes="$problemes\n- Site https://$DOMAINE inaccessible (code $c)"
c=$(http "https://api.$DOMAINE/auth/v1/health"); case "$c" in 200|401) ;; *) problemes="$problemes\n- API https://api.$DOMAINE inaccessible (code $c)";; esac
for s in $(compose ps --services 2>/dev/null); do
  st=$(compose ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null | awk -v s="$s" '$1==s{print $2" "$3}')
  case "$st" in "running healthy"|"running "|"running") ;; *) problemes="$problemes\n- Service $s : $st";; esac
done
u=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}'); [ "$u" -lt 85 ] || problemes="$problemes\n- Disque rempli à $u %"
if [ -f /var/backups/rmpaie/.derniere-reussite ]; then
  age_s=$(( $(date +%s) - $(cat /var/backups/rmpaie/.derniere-reussite) )); [ "$age_s" -lt 129600 ] || problemes="$problemes\n- Aucune sauvegarde réussie depuis plus de 36 heures"
fi
# Certificat HTTPS : alerte à 14 jours de l'expiration
fin=$(echo | openssl s_client -servername "$DOMAINE" -connect "$DOMAINE:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$fin" ]; then j=$(( ($(date -d "$fin" +%s) - $(date +%s)) / 86400 )); [ "$j" -gt 14 ] || problemes="$problemes\n- Certificat HTTPS expirant dans $j jours"; fi

if [ -n "$problemes" ]; then
  cle=$(printf '%b' "$problemes" | sha256sum | cut -c1-16)
  if [ ! -f "$ETAT/alerte-$cle" ] || [ $(( $(date +%s) - $(stat -c %Y "$ETAT/alerte-$cle") )) -gt 3600 ]; then
    alerter "RM Paie : incident sur le serveur" "$(printf 'Problème(s) détecté(s) le %s sur %s :%b' "$(date '+%d/%m/%Y %H:%M')" "$(hostname)" "$problemes")"
    touch "$ETAT/alerte-$cle"
  fi
  printf '%s%b\n' "$(date '+%F %T')" "$problemes"
  touch "$ETAT/incident"
elif [ -f "$ETAT/incident" ]; then
  alerter "RM Paie : service rétabli" "Tous les contrôles sont de nouveau au vert ($(date '+%d/%m/%Y %H:%M'))."
  rm -f "$ETAT/incident" "$ETAT"/alerte-*
fi
