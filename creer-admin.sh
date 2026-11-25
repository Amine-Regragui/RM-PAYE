#!/bin/sh
# Donne le rôle de super-administrateur (éditeur de RM Paie) au compte indiqué, déjà inscrit sur le site.
#   sudo sh /opt/rmpaie/bin/creer-admin.sh votre@email.ma
set -eu
. "$(dirname "$0")/lib.sh"
EMAIL="${1:?Indiquez l’adresse e-mail du compte}"
case "$EMAIL" in *\'*) stop "Adresse invalide";; esac
n=$(psql_db -tA -c "update public.profils set super_admin = true where user_id = (select id from auth.users where lower(email) = lower('$EMAIL')) returning 1" | head -n1)
[ "$n" = "1" ] || stop "Aucun compte avec cette adresse : inscrivez-vous d'abord sur le site et confirmez l'e-mail."
ok "$EMAIL est super-administrateur. Activez sa double authentification dans l'onglet Sécurité."
