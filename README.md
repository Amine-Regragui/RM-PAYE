# RM Paie — version commerciale

Logiciel de paie marocaine vendu par abonnement : site public avec tarifs, inscription et essai gratuit, connexion par e-mail, logiciel de paie complet, espace « Mon compte » (factures, paiements, utilisateurs), back-office éditeur et paiement par carte via le CMI.

## Contenu du dossier

| Dossier / fichier | Rôle |
| --- | --- |
| `web/public/` | Le site à mettre en ligne (fichiers statiques) |
| `web/public/config.js` | Adresse et clé publique de votre projet Supabase — **à renseigner** |
| `web/public/cgu.html`, `confidentialite.html` | Modèles à compléter et faire relire |
| `web/src/` | Sources : moteur de paie, logiciel, couche commerciale (`saas.js`) |
| `web/build.py` | Reconstruit `web/public/index.html` après une modification des sources |
| `supabase/migrations/` | Base de données : tables, sécurité, facturation, tableau de bord |
| `supabase/functions/cmi-paiement` | Prépare le paiement d’une facture (signature CMI) |
| `supabase/functions/cmi-callback` | Reçoit la confirmation du CMI et marque la facture payée |
| `supabase/functions/inviter` | Envoie l’e-mail d’invitation d’un collaborateur |
| `supabase/functions/notifications` | Tâche quotidienne : statuts, factures du 1er du mois, e-mails |

## Mise en ligne, pas à pas

### 1. Supabase (base de données, comptes, e-mails)
1. Créez un compte sur supabase.com puis un projet (région européenne la plus proche, par ex. Paris). Notez le mot de passe de la base.
2. **SQL Editor** : exécutez `supabase/migrations/20261115000000_rm_paie.sql`, puis `20261115000001_justificatifs.sql` (stockages privés : registres de commerce et code du logiciel).
3. **Storage > logiciel** : déposez le fichier `web/prive/moteur.js` (le cœur du calcul de paie, servi seulement aux utilisateurs connectés). À refaire après chaque reconstruction du site.
4. **Authentication > URL Configuration** : *Site URL* = `https://rmpaie.ma` (votre domaine) ; ajoutez la même adresse dans *Redirect URLs*.
5. **Authentication > Providers > Email** : laissez « Confirm email » activé.
6. **Authentication > Emails** : traduisez en français les modèles « Confirm signup », « Invite user » et « Reset password ». Branchez un service d’envoi (SMTP de Resend, Brevo…) dans *SMTP Settings* : l’envoi par défaut de Supabase est limité à quelques e-mails par heure.
7. **Settings > API** : copiez *Project URL* et la clé *anon public* dans `web/public/config.js`.

### 2. Fonctions serveur
Installez la ligne de commande Supabase (`npm i -g supabase`), puis dans ce dossier :
```
supabase login
supabase link --project-ref VOTRE_REF
supabase secrets set SITE_URL=https://rmpaie.ma CMI_CLIENT_ID=... CMI_STORE_KEY=... CMI_GATEWAY_URL=https://testpayment.cmi.co.ma/fim/est3Dgate RESEND_API_KEY=... EMAIL_EXPEDITEUR="RM Paie <facturation@rmpaie.ma>" CRON_SECRET=une-longue-chaine-aleatoire
supabase functions deploy cmi-paiement
supabase functions deploy inviter
supabase functions deploy envoyer-bulletins
supabase functions deploy cmi-callback --no-verify-jwt
supabase functions deploy notifications --no-verify-jwt
```

### 3. Tâche quotidienne
Dans **Database > Extensions**, activez `pg_cron` et `pg_net`, puis exécutez (en remplaçant les valeurs) :
```sql
select cron.schedule('rmpaie-quotidien', '0 5 * * *', $$
  select net.http_post(
    url := 'https://VOTRE_REF.supabase.co/functions/v1/notifications',
    headers := '{"Content-Type":"application/json","x-cron-secret":"une-longue-chaine-aleatoire"}'::jsonb)
$$);
```
Elle émet les factures le 1er de chaque mois, suspend les comptes impayés depuis 30 jours et envoie les e-mails (fin d’essai à J-2, nouvelle facture, relance).

### 4. Le site
1. Renseignez `web/public/config.js`.
2. Déposez le contenu de `web/public/` sur un hébergeur de sites statiques : Netlify, Vercel ou Cloudflare Pages (glisser-déposer du dossier suffit).
3. Reliez votre nom de domaine (`rmpaie.ma`) chez l’hébergeur, HTTPS activé.

### 5. Devenir super-administrateur
Inscrivez-vous sur le site avec votre e-mail, puis dans **SQL Editor** :
```sql
update public.profils set super_admin = true
 where user_id = (select id from auth.users where email = 'votre.email@exemple.ma');
```
Reconnectez-vous : l’onglet **Administration** apparaît. Renseignez d’abord **Tarifs et émetteur** (ICE, IF, RC, RIB de la société qui facture).

### 6. Paiement CMI
1. Signez le contrat de paiement en ligne avec votre banque ou un prestataire agréé (CMI, PayZone…). Demandez le kit d’intégration « 3D Pay Hosting ».
2. Communiquez au CMI : l’adresse de rappel `https://VOTRE_REF.supabase.co/functions/v1/cmi-callback` et l’adresse du site.
3. Mettez l’identifiant marchand et la clé du magasin dans les secrets (étape 2), testez avec les cartes de test du CMI, puis remplacez `CMI_GATEWAY_URL` par l’adresse de production fournie par le CMI.
4. Vérifiez avec le kit du CMI la liste exacte des paramètres attendus : `cmi-paiement/index.ts` suit l’intégration standard (signature `ver3`, SHA-512) et s’adapte en quelques lignes.

### 7. Ton cabinet, gratuitement
Après avoir créé le compte de ton cabinet (RM Expertise) sur le site, ouvre **Administration > Clients > Fiche** et choisis la formule **Gratuit (sans paiement)**. Ton cabinet valide alors ses bulletins sans payer, pour tous ses clients.

### 8. Protection contre la copie
- Le cœur du calcul de paie n’est jamais publié : il est téléchargé depuis le stockage privé après connexion.
- Le reste du code est brouillé à la construction (`npm install` une fois dans `web/`, puis `python3 build.py`).
- `robots.txt`, la balise `noai` et l’en-tête `X-Robots-Tag` interdisent l’accès aux robots d’IA (GPTBot, ClaudeBot, Google-Extended, CCBot, Perplexity…).
- Mets le site derrière **Cloudflare** (gratuit) et active **Security > Bots > Block AI bots** et **Bot Fight Mode** : les robots qui ignorent robots.txt sont bloqués à l’entrée.
- Les CGU interdisent toute reproduction ou réutilisation, y compris par IA (loi n° 2-00). Pense à déposer la marque « RM Paie » à l’**OMPIC**.

### 9. Référencement, sécurité et audience
- Dans `web/build.py`, mettez votre domaine dans `SITE` puis relancez `python3 web/build.py` : le sitemap, robots.txt et les balises de partage (aperçu WhatsApp, Facebook, LinkedIn) l’utilisent.
- HTTPS forcé et en-têtes de sécurité : fichiers `_headers` (Netlify, Cloudflare Pages) et `vercel.json` (Vercel), déjà dans `public/`.
- Anti-spam : un champ piège et un délai minimum sont déjà dans l’inscription. Activez aussi le captcha dans Supabase (**Authentication > Attack Protection**, Cloudflare Turnstile, gratuit).
- Audience : ouvrez un compte Plausible (sans cookie, pas de consentement à demander) et mettez votre domaine dans `plausibleDomain` de `config.js`.
- Google : déclarez le site dans Google Search Console et envoyez `https://votre-domaine/sitemap.xml`. Vérifiez la vitesse avec PageSpeed Insights une fois en ligne.

## Bulletins et pièces jointes
- **Pièces jointes des salariés** (CIN, contrat signé, diplômes, RIB…) : bouton « 📎 Ajouter » dans Salariés ; PDF uniquement (pour limiter le stockage), 5 Mo par fichier, 20 Mo par salarié, stockage privé.
- **Bulletins** : « Tous les bulletins » propose un seul PDF ou un ZIP (un PDF par salarié), « Livre de paie » propose PDF ou CSV ; « Envoyer aux salariés » : on coche les salariés, puis « Envoyer par e-mail » ou « Envoyer par WhatsApp ». Chacun reçoit uniquement son propre bulletin en pièce jointe PDF. L’envoi n’est possible qu’une fois le mois validé.

### Envoi par WhatsApp (API officielle WhatsApp Business)
WhatsApp n’autorise l’envoi groupé de fichiers depuis un logiciel qu’avec son API officielle :
1. Créez un compte **Meta Business** (business.facebook.com), puis une application de type « Business » sur developers.facebook.com avec le produit **WhatsApp**.
2. Ajoutez un **numéro de téléphone dédié** (pas celui de votre WhatsApp habituel) et faites vérifier l’entreprise.
3. Dans **WhatsApp Manager > Modèles de messages**, créez un modèle catégorie **Utilitaire**, nom `bulletin_paie`, langue Français :
   - En-tête : **Document**
   - Corps : `Bonjour {{1}}, voici votre bulletin de paie de {{2}}, établi par {{3}}. Conservez-le précieusement.`
   Attendez son approbation (quelques minutes à 24 h).
4. Créez un **utilisateur système** avec un jeton permanent (droits `whatsapp_business_messaging`), puis :
   `supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=... WHATSAPP_TEMPLATE=bulletin_paie`
5. Coût : Meta facture chaque message « utilitaire » envoyé, selon sa grille tarifaire par pays (developers.facebook.com, rubrique WhatsApp > Pricing).
- Pour l’envoi par e-mail en volume, vérifiez votre domaine dans Resend (enregistrements DNS) afin que les bulletins n’arrivent pas en spam.

## Comment ça marche

- **Fiche société obligatoire** : à la première connexion, l’administrateur du compte doit renseigner toute la fiche (raison sociale, forme juridique, représentant, ICE, IF, RC, CNSS, adresse, téléphone, e-mail) et joindre le registre de commerce. Tant que ce n’est pas fait, la paie reste fermée, y compris côté base de données. Tu retrouves la fiche et la pièce dans Administration > Clients.
- **Identifiant** : l’adresse e-mail. Chaque société reçoit un numéro client `RMP-000001` (factures, support).
- **Essai** : 7 jours sans carte ; les validations de mois sont gratuites pendant l’essai.
- **Paiement à la validation** : ensuite, quand le client valide un mois, RM Paie calcule le montant (bulletins du mois × prix de la tranche, minimum mensuel, moins ce qui a déjà été payé ce mois-là) et l’envoie sur la page sécurisée du CMI pour saisir sa carte. Les bulletins ne sont validés qu’après la confirmation du CMI, et la facture acquittée apparaît dans « Mon compte ». La base refuse toute validation non payée.
- **Formule gratuite** : aucun paiement (ton cabinet, partenaires).
- **Factures** : numérotation continue `F2026-00001`, émises au paiement, jamais modifiées ; une erreur s’annule par un avoir `A2026-00001`.
- **Reprise de données** : les mois déjà validés d’une sauvegarde s’importent pendant l’essai (ou avec la formule gratuite) ; ensuite, la validation est payante.
- **Sécurité** : chaque société ne voit que ses données (Row Level Security dans la base) ; la clé CMI ne quitte jamais le serveur ; seule la confirmation signée du CMI marque une facture payée.
- **Reprise des données de la version claude.ai** : dans l’ancienne version, Paramètres > Exporter la sauvegarde ; dans la nouvelle, Paramètres > Importer une sauvegarde.

## Modifier le logiciel
Modifiez les fichiers de `web/src/`, puis lancez `python3 web/build.py` et redéployez `web/public/`.

## Avant la première vente
- [ ] Déclaration CNDP (traitement et transfert hors du Maroc)
- [ ] CGU/CGV et politique de confidentialité complétées et relues
- [ ] Émetteur des factures renseigné (ICE, IF, RC, TP, RIB)
- [ ] Contrat CMI signé et paiement testé de bout en bout
- [ ] Parcours complet testé : inscription, paie, facture, paiement, suspension, réactivation

## Paiement à l'ouverture des bulletins
Au clic sur Bulletins (et sur Déclarations, Paiement, Documents RH, Sortie), RM Paie calcule ce qui reste à payer pour le mois. Si un montant est dû, ces onglets sont verrouillés et un écran de paiement par carte (CMI) s'affiche. Ils se déverrouillent une fois le paiement confirmé. Pendant l'essai, pour la formule « gratuit » (votre cabinet) et pour un mois déjà validé, l'accès est direct.

## Essai gratuit unique
Le registre `essais` conserve l'adresse e-mail et l'ICE de chaque essai.
- **À l'inscription :** une nouvelle inscription avec la même adresse e-mail est refusée (`essai_disponible`).
- **À la fiche société :** si l'ICE a déjà bénéficié d'un essai, le compte est créé sans essai.

## Réglementation
`web/reglementation.py` génère `public/reglementation/` : une page d'accueil et un article par thème, chacun avec ses sources officielles. Ces pages sont ajoutées au sitemap et liées depuis l'en-tête, la page d'accueil et le pied de page.

Pour mettre à jour :
1. Modifiez `ARTICLES` et `MAJ` dans `web/reglementation.py`.
2. Lancez `python3 web/build.py`.

## Mots de passe complexes
Tous les comptes doivent avoir un mot de passe d'au moins 10 caractères. Il doit contenir une majuscule, une minuscule, un chiffre et un caractère spécial. Les mots courants sont refusés (motdepasse, azerty, 123456…), tout comme un mot de passe qui contient l'identifiant.

Cette règle est vérifiée dans le navigateur, avec une liste des critères qui se cochent au fil de la saisie, et sur le serveur via `supabase/config.toml`. Dans le tableau de bord Supabase, reportez le même réglage : Authentication > Policies > Password strength, avec 10 caractères minimum, et cochez « Lowercase, uppercase letters, digits and symbols ». Activez aussi « Leaked password protection » si votre plan le permet.

Les mots de passe générés pour les espaces clients des cabinets respectent la même règle.

## Import des salariés depuis Excel
L'import se trouve dans l'onglet Salariés, bouton « ⬆ Importer depuis Excel ». Le modèle à télécharger est `web/static/modele-import-salaries.xlsx` ; pour le régénérer, lancez `python3 web/tools/modele_import.py`.

- **Formats acceptés :** fichiers .xlsx, lus dans le navigateur avec `read-excel-file`, et fichiers .csv (séparateur ; ou ,).
- **Aperçu avant enregistrement :** chaque ligne est classée « Nouveau », « Mise à jour » (même matricule ou même CIN) ou « Erreur » (nom ou date d'embauche manquant, date invalide…). Des avertissements signalent un RIB de moins de 24 chiffres, un e-mail invalide ou un CDD sans date de fin.

## Double authentification (TOTP)
1. Dans Supabase, ouvrez **Authentication > Multi-Factor** et activez TOTP.
2. Appliquez la migration `20261119000000_securite.sql`. Une fois qu'un utilisateur a activé la double authentification, la base refuse toutes ses données tant que le code n'a pas été saisi (niveau `aal2`). Ce contrôle passe par `est_membre`, `est_admin_org` et `est_super_admin`, donc par toutes les règles RLS et les fonctions serveur.
3. Chaque utilisateur l'active dans l'onglet **Sécurité** (QR code, puis code de confirmation), avec la possibilité d'enregistrer un appareil de secours. L'administrateur y voit qui l'a activée.
4. Si un utilisateur perd son téléphone, le super-administrateur réinitialise sa double authentification dans **Sécurité**, ce qui appelle la fonction `mfa-reinitialiser`. Déployez-la avec `supabase functions deploy mfa-reinitialiser`.

## Export des données et résiliation
- **Export complet :** « Mon compte > Exporter toutes mes données (ZIP) » produit :
  - un fichier JSON complet ;
  - par dossier, les CSV des salariés, des bulletins validés et des variables mois par mois ;
  - les pièces jointes, le registre de commerce, les factures et les paiements.
- **Résiliation :** le compte passe en lecture seule pendant 90 jours. Un e-mail de rappel part à J-15. Le client peut annuler la résiliation tant que les données existent.
- **Suppression à J+90 :** la tâche quotidienne `notifications` supprime les fichiers via l'API de stockage, puis les données, avec `supprimer_compte`. Les factures sont conservées 10 ans.

## Suivi des erreurs
Les erreurs du navigateur et les exceptions des fonctions serveur (enveloppe `_shared/erreurs.ts`) sont enregistrées dans la table `erreurs`. Les occurrences d'une même erreur sont regroupées, avec un compteur.

Vous les consultez dans **Administration > Erreurs**, où vous les marquez « vue » ou « résolue ». Une erreur résolue qui se reproduit repasse en « nouvelle ».

Pour recevoir une alerte e-mail chaque heure :
1. Ajoutez le secret `ALERTE_EMAIL` (votre adresse).
2. Planifiez l'appel horaire :
```sql
select cron.schedule('rmpaie-erreurs', '7 * * * *', $$
  select net.http_post(url := 'https://VOTRE-PROJET.supabase.co/functions/v1/notifications',
    body := '{"tache":"erreurs"}'::jsonb,
    headers := '{"Content-Type":"application/json","x-cron-secret":"une-longue-chaine-aleatoire"}'::jsonb) $$);
```

## Paiement par carte (passerelle CMI) — mise en service
**Changement de contexte :** depuis le 1er novembre 2024, le CMI ne signe plus de contrat directement avec les commerçants. Le contrat d'acceptation se signe avec un acquéreur : l'établissement de paiement d'une banque ou un acteur indépendant. Le CMI reste la plateforme technique.

**Fonctions à déployer :**
```
supabase functions deploy cmi-paiement
supabase functions deploy cmi-callback --no-verify-jwt
supabase functions deploy cmi-retour --no-verify-jwt
supabase functions deploy cmi-diagnostic
supabase secrets set CMI_CLIENT_ID=... CMI_STORE_KEY=... SITE_URL=https://votre-domaine.ma
# production : supabase secrets set CMI_GATEWAY_URL=<adresse de production fournie par l'acquéreur>
```

**Fonctionnement :**
- **Paiement :** le client paie sur la page hébergée (3D Pay Hosting, 3-D Secure). La transaction est une pré-autorisation (PreAuth). Elle n'est encaissée que lorsque `cmi-callback` répond `ACTION=POSTAUTH`, après avoir vérifié :
  - la signature SHA-512 (ver3) ;
  - l'identifiant marchand ;
  - la devise ;
  - le montant attendu.

  Si le rappel échoue, rien n'est débité.
- **Retour du client :** la passerelle renvoie le navigateur en POST, ce que refusent les sites statiques. Les URL `okUrl` et `failUrl` pointent donc vers `cmi-retour`, qui redirige vers le site. Seul le rappel serveur marque un paiement comme reçu.
- **Diagnostic :** l'onglet **Administration > Paiement par carte** vérifie la configuration (aucune valeur secrète n'est affichée). Il donne les paramètres à communiquer à l'acquéreur et liste les derniers échanges avec la passerelle.
- **Mode test :** tant que l'adresse de passerelle est celle de test, une fenêtre prévient l'utilisateur qu'aucune somme réelle ne sera débitée.

## Hébergement au Maroc (auto-hébergé)
Tout RM Paie peut être installé sur un serveur situé au Maroc : site, base de données, fichiers, fonctions, sauvegardes. Le guide complet est dans `deploy/maroc/LISEZMOI.md`. En résumé :
```
cd deploy/maroc && cp config.exemple.env config.env && nano config.env && sudo sh installer.sh
```

**Composants installés :**
- Supabase auto-hébergé, en version figée (`self-hosted/v0.8.4`) ;
- Caddy, pour le HTTPS automatique ;
- le pare-feu ufw et fail2ban ;
- des sauvegardes chiffrées (age), copiées sur un second serveur au Maroc ;
- une surveillance avec alerte e-mail.

**Scripts dans `/opt/rmpaie/bin` :**
- `deployer.sh` met en ligne le site, les fonctions et le moteur ;
- `migrer.sh` applique les migrations et programme les tâches pg_cron ;
- `sauvegarde.sh`, `restaurer.sh`, `surveiller.sh` ;
- `mettre-a-jour.sh` (sauvegarde puis mise à jour) ;
- `creer-admin.sh` (crée le super-administrateur).

**Indépendance vis-à-vis de l'étranger :**
- **Polices :** elles sont servies par le site lui-même (`web/static/fonts`, licence OFL) ; plus aucun appel à Google Fonts.
- **E-mails :** ils partent par le SMTP de votre choix (`_shared/mail.ts` : SMTP si `SMTP_HOST` est défini, sinon Resend).
- **Mesure d'audience :** elle reste désactivée par défaut.
- **Base de données :** elle n'est jamais exposée sur Internet ; le pooler n'écoute que sur 127.0.0.1.

## Sécurité
L'audit du 21/11/2026 et ses corrections sont décrits dans `SECURITE.md`. La migration `20261121000001_durcissement.sql` applique le moindre privilège sur les fonctions, les quotas anti-abus et le journal des connexions. La politique CSP est dans `deploy/maroc/Caddyfile` (serveur au Maroc) et dans `web/static/_headers` / `vercel.json` (autres hébergeurs).
