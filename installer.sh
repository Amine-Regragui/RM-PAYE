#!/bin/sh
# =====================================================================
# RM Paie — installation complète sur un serveur Linux au Maroc (Ubuntu 22.04 ou 24.04)
#   sudo sh installer.sh
# Peut être relancé sans risque : les étapes déjà faites sont conservées.
# =====================================================================
set -eu
ICI=$(cd "$(dirname "$0")" && pwd)
SRC=$(cd "$ICI/../.." && pwd)          # racine du dossier rmpaie-saas
SUPA_REF="self-hosted/v0.8.4"          # version de Supabase auto-hébergé testée avec RM Paie
. "$ICI/lib.sh"

[ "$(id -u)" = 0 ] || stop "Lancez ce script en administrateur : sudo sh installer.sh"
[ -f "$ICI/config.env" ] || stop "Copiez config.exemple.env en config.env et complétez-le."
charger_config "$ICI/config.env"

dire "1/9 Vérification de la configuration"
for v in DOMAINE EMAIL_ADMIN SMTP_HOST SMTP_USER SMTP_PASS SMTP_EXPEDITEUR ALERTE_EMAIL SAUVEGARDE_CLE_PUBLIQUE; do
  eval "val=\${$v:-}"; [ -n "$val" ] || stop "Renseignez $v dans config.env"
done
case "$SAUVEGARDE_CLE_PUBLIQUE" in age1*) ok "Clé de chiffrement des sauvegardes";; *) stop "SAUVEGARDE_CLE_PUBLIQUE doit commencer par age1 (voir LISEZMOI)";; esac
[ -f "$SRC/web/public/index.html" ] && [ -f "$SRC/web/prive/moteur.js" ] || stop "Site non construit : lancez d'abord « python3 web/build.py » sur votre poste, puis recopiez le dossier."
for h in "$DOMAINE" "api.$DOMAINE" "studio.$DOMAINE"; do
  if getent hosts "$h" >/dev/null 2>&1; then ok "DNS $h → $(getent hosts "$h" | awk '{print $1}' | head -n1)"; else avert "DNS $h introuvable : créez l'enregistrement A vers l'IP de ce serveur (les certificats HTTPS ne pourront pas être émis avant)."; fi
done

dire "2/9 Mise à jour du système et outils"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q && apt-get upgrade -yq
apt-get install -yq ca-certificates curl git jq ufw fail2ban unattended-upgrades age rsync openssl cron >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
timedatectl set-timezone Africa/Casablanca 2>/dev/null || true
ok "Système à jour, mises à jour de sécurité automatiques activées, fuseau Africa/Casablanca"

dire "3/9 Pare-feu"
ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1 || true
# SSH : connexion par clé uniquement — appliqué seulement si une clé est déjà autorisée, pour ne jamais vous enfermer dehors
if [ -s /root/.ssh/authorized_keys ] || { [ -n "${SUDO_USER:-}" ] && [ -s "/home/${SUDO_USER:-x}/.ssh/authorized_keys" ]; }; then
  cat > /etc/ssh/sshd_config.d/60-rmpaie.conf <<SSH
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 4
LoginGraceTime 30
X11Forwarding no
SSH
  if sshd -t 2>/dev/null; then systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true; ok "SSH : connexion par clé uniquement (mots de passe refusés)"; else rm -f /etc/ssh/sshd_config.d/60-rmpaie.conf; avert "Durcissement SSH non appliqué (configuration refusée)"; fi
else
  avert "SSH : aucune clé autorisée trouvée. Ajoutez votre clé publique puis relancez l'installation pour désactiver la connexion par mot de passe."
fi
# Journaux Docker limités (évite un disque plein) et réglages réseau prudents
mkdir -p /etc/docker
[ -f /etc/docker/daemon.json ] || printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "20m", "max-file": "5" },\n  "live-restore": true\n}\n' > /etc/docker/daemon.json
cat > /etc/sysctl.d/60-rmpaie.conf <<SYS
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
kernel.dmesg_restrict = 1
SYS
sysctl --system >/dev/null 2>&1 || true
ok "Seuls SSH (22), HTTP (80) et HTTPS (443) sont ouverts ; fail2ban bloque les tentatives répétées"

dire "4/9 Dossiers RM Paie"
mkdir -p "$BASE/bin" "$BASE/site" /var/backups/rmpaie
install -m 600 "$ICI/config.env" "$BASE/config.env"
for s in lib.sh deployer.sh migrer.sh sauvegarde.sh restaurer.sh surveiller.sh mettre-a-jour.sh creer-admin.sh; do install -m 700 "$ICI/$s" "$BASE/bin/$s"; done
chmod 700 /var/backups/rmpaie
ok "$BASE"

dire "5/9 Supabase auto-hébergé ($SUPA_REF)"
if [ ! -f "$SUPA/docker-compose.yml" ]; then
  cd "$BASE"
  curl -fsSL "https://raw.githubusercontent.com/supabase/supabase/$SUPA_REF/docker/setup.sh" -o /tmp/supabase-setup.sh
  sh /tmp/supabase-setup.sh -y --ref "$SUPA_REF" --project-dir supabase
  ok "Supabase installé, secrets générés"
else
  ok "Déjà installé"
fi
command -v docker >/dev/null || stop "Docker n'a pas pu être installé."

dire "6/9 Configuration"
[ -n "$(lire_env RMPAIE_CRON_SECRET)" ] || ecrire_env RMPAIE_CRON_SECRET "$(openssl rand -hex 24)"
ecrire_env SUPABASE_PUBLIC_URL "https://api.$DOMAINE"
ecrire_env API_EXTERNAL_URL "https://api.$DOMAINE/auth/v1"
ecrire_env SITE_URL "https://$DOMAINE"
ecrire_env ADDITIONAL_REDIRECT_URLS "https://$DOMAINE/**,https://www.$DOMAINE/**"
ecrire_env PROXY_DOMAIN "studio.$DOMAINE"
ecrire_env DISABLE_SIGNUP false
ecrire_env ENABLE_EMAIL_SIGNUP true
ecrire_env ENABLE_EMAIL_AUTOCONFIRM false
ecrire_env ENABLE_ANONYMOUS_USERS false
ecrire_env ENABLE_PHONE_SIGNUP false
ecrire_env SMTP_HOST "$SMTP_HOST"; ecrire_env SMTP_PORT "${SMTP_PORT:-465}"; ecrire_env SMTP_USER "$SMTP_USER"; ecrire_env SMTP_PASS "$SMTP_PASS"
ecrire_env SMTP_ADMIN_EMAIL "$SMTP_EXPEDITEUR"; ecrire_env SMTP_SENDER_NAME "${SMTP_EXPEDITEUR_NOM:-RM Paie}"
ecrire_env FUNCTIONS_VERIFY_JWT false    # chaque fonction RM Paie vérifie elle-même l'utilisateur (RLS) ou un secret
ecrire_env RMPAIE_DOMAINE "$DOMAINE"; ecrire_env RMPAIE_EMAIL_ADMIN "$EMAIL_ADMIN"; ecrire_env RMPAIE_STUDIO_IP "${STUDIO_IP_AUTORISEES:-0.0.0.0/0 ::/0}"
ecrire_env RMPAIE_SMTP_SECURITE "${SMTP_SECURITE:-ssl}"; ecrire_env RMPAIE_EMAIL_EXPEDITEUR "${SMTP_EXPEDITEUR_NOM:-RM Paie} <$SMTP_EXPEDITEUR>"
ecrire_env RMPAIE_CMI_CLIENT_ID "${CMI_CLIENT_ID:-}"; ecrire_env RMPAIE_CMI_STORE_KEY "${CMI_STORE_KEY:-}"; ecrire_env RMPAIE_CMI_GATEWAY_URL "${CMI_GATEWAY_URL:-https://testpayment.cmi.co.ma/fim/est3Dgate}"
ecrire_env RMPAIE_WHATSAPP_TOKEN "${WHATSAPP_TOKEN:-}"; ecrire_env RMPAIE_WHATSAPP_PHONE_ID "${WHATSAPP_PHONE_ID:-}"; ecrire_env RMPAIE_WHATSAPP_TEMPLATE "${WHATSAPP_TEMPLATE:-bulletin_paie}"; ecrire_env RMPAIE_WHATSAPP_TEMPLATE_LANG "${WHATSAPP_TEMPLATE_LANG:-fr}"
ecrire_env RMPAIE_ALERTE_EMAIL "$ALERTE_EMAIL"
# Origine de la passerelle de paiement (seule destination autorisée pour le formulaire de paiement)
ecrire_env RMPAIE_ORIGINE_PAIEMENT "$(printf '%s' "${CMI_GATEWAY_URL:-https://testpayment.cmi.co.ma/fim/est3Dgate}" | sed -E 's#^(https://[^/]+).*#\1#')"
chmod 600 "$SUPA/.env"
install -m 644 "$ICI/docker-compose.rmpaie.yml" "$SUPA/docker-compose.rmpaie.yml"
mkdir -p "$SUPA/volumes/proxy/rmpaie"; install -m 644 "$ICI/Caddyfile" "$SUPA/volumes/proxy/rmpaie/Caddyfile"
(cd "$SUPA" && sh run.sh config | grep -q rmpaie) || (cd "$SUPA" && sh run.sh config add rmpaie)
ok "Domaine, e-mails, sécurité des comptes et paiement configurés"
case "${STUDIO_IP_AUTORISEES:-0.0.0.0/0 ::/0}" in *0.0.0.0/0*) avert "La console technique (studio.$DOMAINE) est ouverte à toutes les adresses IP : renseignez STUDIO_IP_AUTORISEES avec l'IP fixe du cabinet dès que possible.";; esac

dire "7/9 Démarrage (premier lancement : plusieurs minutes, le temps de télécharger les composants)"
sh "$BASE/bin/deployer.sh" "$SRC" --sans-moteur
(cd "$SUPA" && sh run.sh start)
ok "Tous les services sont démarrés"

dire "8/9 Base de données RM Paie et tâches planifiées"
sh "$BASE/bin/migrer.sh" "$SRC/supabase/migrations"
sh "$BASE/bin/deployer.sh" "$SRC" --moteur-seul

dire "9/9 Sauvegardes et surveillance"
cat > /etc/cron.d/rmpaie <<CRON
# RM Paie — sauvegarde chiffrée chaque nuit, surveillance toutes les 5 minutes
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root $BASE/bin/sauvegarde.sh >> /var/log/rmpaie-sauvegarde.log 2>&1
*/5 * * * * root $BASE/bin/surveiller.sh >> /var/log/rmpaie-surveillance.log 2>&1
CRON
chmod 644 /etc/cron.d/rmpaie
ok "Sauvegarde à 3 h 15, surveillance toutes les 5 minutes"

dire "Installation terminée"
echo "  Site et logiciel :  https://$DOMAINE"
echo "  API :               https://api.$DOMAINE"
echo "  Console technique : https://studio.$DOMAINE  (identifiant : $(lire_env DASHBOARD_USERNAME), mot de passe : voir « sh $SUPA/run.sh secrets »)"
echo
echo "  Étapes suivantes :"
echo "   1. Créez votre compte sur https://$DOMAINE (bouton Inscription), confirmez l'e-mail, puis :"
echo "      sudo sh $BASE/bin/creer-admin.sh votre@email.ma"
echo "   2. Testez une sauvegarde : sudo sh $BASE/bin/sauvegarde.sh"
echo "   3. Conservez la clé privée de sauvegarde hors du serveur (voir LISEZMOI)."
