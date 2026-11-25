# Héberger RM Paie au Maroc

Ce dossier installe **tout RM Paie sur un serveur situé au Maroc** : le site, le logiciel, la base de données, les fichiers, les fonctions serveur (paiement, envois, rappels), les sauvegardes et la surveillance. Aucune donnée de paie n'est stockée hors du Maroc.

Ce qui est installé sur le serveur :

| Élément | Rôle |
|---|---|
| Supabase auto-hébergé (version figée `self-hosted/v0.8.4`) | Base PostgreSQL, comptes et double authentification, stockage privé des fichiers, fonctions serveur |
| Caddy | Serveur web, HTTPS automatique (Let's Encrypt), en-têtes de sécurité |
| Site RM Paie | Pages, logiciel, polices : tout est servi depuis le serveur |
| Pare-feu ufw + fail2ban | Seuls les ports 22, 80 et 443 sont ouverts ; la base n'est jamais exposée |
| Sauvegarde chiffrée (age) | Chaque nuit : base + fichiers + configuration, copie sur un second serveur au Maroc |
| Surveillance | Toutes les 5 minutes : site, API, services, disque, sauvegarde, certificat ; alerte e-mail |

---

## 1. Ce qu'il faut avant de commencer

1. **Un serveur au Maroc** (machine virtuelle ou VPS) :
   - Ubuntu 24.04 (ou 22.04), accès administrateur (root) ;
   - au minimum **4 cœurs, 8 Go de mémoire, 75 Go SSD** ; 6 cœurs / 12 Go conseillés au-delà de 50 sociétés clientes ;
   - Docker doit pouvoir y être installé.

   Hébergeurs possibles : OVHcloud (localisation Maroc, avec Maroc Datacenter), Maroc Datacenter en direct, inwi, Maroc Telecom, ou tout hébergeur proposant une machine virtuelle Linux dans un datacenter au Maroc.

   > OVHcloud indique que certaines fonctions ne sont pas disponibles en « Local Zone », dont les applications Docker préinstallées. RM Paie installe Docker lui-même, mais **faites confirmer par écrit à l'hébergeur, avant de commander, que Docker peut être installé** sur le serveur au Maroc.

2. **Un second emplacement au Maroc pour les sauvegardes** (autre ville ou autre hébergeur) : un petit serveur Linux accessible en SSH, ou un NAS au cabinet. Sans lui, la sauvegarde reste sur le serveur principal, ce qui ne protège pas d'une panne de ce serveur.

3. **Le nom de domaine** (ex. `rmpaie.ma`). Créez trois enregistrements DNS de type **A** vers l'adresse IP du serveur :
   - `rmpaie.ma`
   - `api.rmpaie.ma`
   - `studio.rmpaie.ma`

   Ajoutez aussi `www.rmpaie.ma` si vous voulez que l'adresse avec « www » fonctionne : elle redirige vers le domaine principal.

4. **Une adresse e-mail d'envoi** (ex. `no-reply@rmpaie.ma`) avec ses paramètres SMTP, chez l'hébergeur de votre messagerie. Configurez SPF et DKIM chez cet hébergeur, pour que les bulletins n'arrivent pas en courrier indésirable.

5. **La clé de chiffrement des sauvegardes**, à créer sur **votre ordinateur**, pas sur le serveur :
   1. Téléchargez « age » sur <https://github.com/FiloSottile/age/releases> (Windows, Mac ou Linux).
   2. Lancez : `age-keygen -o rmpaie-sauvegarde.key`
   3. La commande affiche la clé **publique** (`age1…`). C'est elle qui va dans `config.env`.
   4. Le fichier `rmpaie-sauvegarde.key` est la clé **privée**. Copiez-le sur 2 clés USB conservées en lieu sûr. **Sans lui, aucune sauvegarde ne peut être relue.** Ne le laissez jamais sur le serveur.

## 2. Installation (environ 30 minutes)

1. Sur votre poste, construisez le site : `python3 web/build.py`.
2. Copiez le dossier `rmpaie-saas` sur le serveur, par exemple avec `scp -r rmpaie-saas root@IP-DU-SERVEUR:/root/`.
3. Sur le serveur :
   ```sh
   cd /root/rmpaie-saas/deploy/maroc
   cp config.exemple.env config.env
   nano config.env          # complétez : domaine, SMTP, clé publique age, second serveur…
   sudo sh installer.sh
   ```
   Le script vérifie la configuration et les DNS, met le système à jour, installe le pare-feu, Supabase et le site, crée la base RM Paie, puis programme les sauvegardes et la surveillance.
4. Créez votre compte éditeur :
   1. Inscrivez-vous sur `https://rmpaie.ma` (bouton **Inscription**) et confirmez l'e-mail.
   2. Lancez `sudo sh /opt/rmpaie/bin/creer-admin.sh votre@email.ma`.
   3. Activez immédiatement la double authentification (onglet **Sécurité**).
5. Faites une première sauvegarde : `sudo sh /opt/rmpaie/bin/sauvegarde.sh`.

### Copie des sauvegardes vers le second serveur

1. Sur le serveur principal, créez une clé SSH dédiée : `sudo ssh-keygen -t ed25519 -N '' -f /root/.ssh/id_ed25519`.
2. Sur le second serveur, créez un utilisateur `sauvegarde` et autorisez cette clé, dans `/home/sauvegarde/.ssh/authorized_keys`.
3. Dans `/opt/rmpaie/config.env`, indiquez par exemple : `SAUVEGARDE_DESTINATION=sauvegarde@IP-SECOND-SERVEUR:/srv/sauvegardes/rmpaie`.

## 3. Exploitation courante

| Action | Commande |
|---|---|
| État des services | `sh /opt/rmpaie/supabase/run.sh status` |
| Journaux d'un service | `sh /opt/rmpaie/supabase/run.sh logs functions` |
| Mettre en ligne une nouvelle version de RM Paie | `sudo sh /opt/rmpaie/bin/mettre-a-jour.sh /root/rmpaie-saas` |
| Mettre à jour aussi Supabase | `sudo sh /opt/rmpaie/bin/mettre-a-jour.sh /root/rmpaie-saas --supabase` |
| Sauvegarde immédiate | `sudo sh /opt/rmpaie/bin/sauvegarde.sh` |
| Restaurer une sauvegarde | `sudo sh /opt/rmpaie/bin/restaurer.sh /var/backups/rmpaie/rmpaie_….tar.age /chemin/rmpaie-sauvegarde.key` |
| Afficher les mots de passe techniques | `sh /opt/rmpaie/supabase/run.sh secrets` |
| Renseigner les identifiants de paiement par carte | modifier `RMPAIE_CMI_*` dans `/opt/rmpaie/supabase/.env`, puis `sh /opt/rmpaie/supabase/run.sh recreate functions` |

- **Console technique** (`https://studio.rmpaie.ma`) : protégée par mot de passe. Pour la limiter à l'adresse IP fixe du cabinet, renseignez `STUDIO_IP_AUTORISEES` dans `config.env`, puis relancez `installer.sh`.
- **Base de données** : elle n'est jamais accessible depuis Internet. Pour un accès direct, ouvrez un tunnel SSH :
  ```sh
  ssh -L 5432:127.0.0.1:5432 root@IP-DU-SERVEUR
  ```
- **Tâches automatiques :**
  - rappels et suppressions des comptes résiliés : chaque matin à 6 h 17 ;
  - alertes d'erreurs : chaque heure ;
  - sauvegarde : 3 h 15 ;
  - surveillance : toutes les 5 minutes.

## 4. Bonnes pratiques de sécurité (à faire une fois)

1. Connexion SSH **par clé uniquement**. Dans `/etc/ssh/sshd_config`, mettez `PasswordAuthentication no` et `PermitRootLogin prohibit-password`, puis `systemctl restart ssh`. Vérifiez d'abord que la connexion par clé fonctionne.
2. **Testez une restauration tous les trimestres** sur un serveur de test : une sauvegarde jamais relue n'est pas une sauvegarde.
3. Gardez la clé privée de sauvegarde hors ligne, en deux exemplaires.
4. Mettez RM Paie et Supabase à jour au moins une fois par trimestre, avec `mettre-a-jour.sh`. Le système se met déjà à jour tout seul pour les correctifs de sécurité.

## 5. Ce qui reste hors du Maroc, et la CNDP

- **WhatsApp :** les bulletins envoyés par WhatsApp passent par les serveurs de Meta. C'est l'utilisateur qui choisit ce canal ; laissez-le désactivé si vous ne le souhaitez pas.
- **E-mails :** une fois envoyés, les e-mails arrivent dans la messagerie du destinataire (Gmail, Outlook…). Votre serveur d'envoi peut, lui, être au Maroc.
- **Paiement par carte :** il est traité au Maroc (acquéreur et plateforme CMI).
- **CNDP :** l'hébergement au Maroc évite la demande d'autorisation de transfert à l'étranger. La **déclaration du traitement** des données des salariés reste obligatoire (loi 09-08).
