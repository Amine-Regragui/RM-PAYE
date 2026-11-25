# RM Paie — audit de sécurité du 21 novembre 2026

Audit du code (base de données, fonctions serveur, site, dépendances, serveur) suivi des corrections. Tout ce qui est marqué « corrigé » est en place dans ce dossier et vérifié par un test.

## Failles trouvées et corrigées

| # | Gravité | Constat | Correction |
|---|---|---|---|
| 1 | Élevée | La fonction de numérotation des factures était appelable par n'importe quel visiteur : on pouvait « brûler » des numéros et créer des trous dans la numérotation légale. | Fonction réservée au serveur. |
| 2 | Élevée | Un utilisateur connecté pouvait se servir de l'envoi de bulletins pour expédier n'importe quelle pièce jointe à n'importe qui, sans limite (courrier indésirable ou hameçonnage au nom de votre domaine). | Pièce jointe obligatoirement un vrai PDF, plafond de 1 000 envois par société et par 24 h, plafond de 20 invitations par 24 h. |
| 3 | Moyenne | Par défaut, toutes les fonctions de la base étaient exécutables par un visiteur non connecté (elles se protégeaient elles-mêmes, mais une future fonction oubliée aurait été ouverte). | Moindre privilège : 9 fonctions seulement restent accessibles sans connexion ; toute nouvelle fonction est fermée par défaut. |
| 4 | Moyenne | La tâche quotidienne (rappels, suppressions de comptes résiliés) pouvait être déclenchée par n'importe qui si le secret n'était pas configuré. | Refus par défaut sans secret. |
| 5 | Moyenne | Aucune politique de sécurité de contenu (CSP) : en cas de faille d'affichage, un script étranger aurait pu s'exécuter et lire les données de paie. | CSP stricte : seuls les scripts du site s'exécutent, les données ne partent que vers l'API, plus aucun script en ligne. |
| 6 | Moyenne | Exports CSV : un nom de salarié commençant par « = » pouvait s'exécuter comme formule à l'ouverture dans Excel. | Cellules à risque neutralisées. |
| 7 | Moyenne | Bibliothèque PDF ancienne (jsPDF 2.5.1, 2022) avec des failles publiées depuis. | jsPDF 4.2.1, jspdf-autotable 5.0.9, supabase-js 2.119.2 ; `npm audit` : 0 vulnérabilité. |
| 8 | Faible | Les fichiers envoyés (RC, pièces jointes) n'étaient contrôlés que sur leur extension. | Contrôle de la signature réelle du fichier (PDF, JPG, PNG). |
| 9 | Faible | Session sans limite d'inactivité : un poste laissé ouvert restait connecté. | Déconnexion après 30 minutes d'inactivité (avertissement 1 minute avant) ; côté serveur : session de 12 h au plus, 1 h d'inactivité, jetons à usage unique. |
| 10 | Faible | Certaines erreurs serveur renvoyaient leur détail technique au navigateur ; l'en-tête CORS pouvait valoir « * ». | Messages génériques (le détail va dans le journal des erreurs) ; CORS limité au site. |
| 11 | Faible | La base de données était publiée sur Internet par la configuration d'origine de Supabase (ports 5432 et 6543), en contournant le pare-feu. | Ports limités à la machine elle-même (corrigé lors de l'installation au Maroc). |

## Points vérifiés, sans faille

- **Cloisonnement des données :** toutes les tables ont la sécurité par ligne (RLS) ; une société ne lit que ses données ; les droits sont contrôlés par la base, pas par l'écran.
- **Fonctions privilégiées :** toutes fixent leur `search_path` ; nul ne peut s'attribuer le rôle super-administrateur.
- **Double authentification :** imposée par la base une fois activée.
- **Paiement :** signature, marchand, devise et montant vérifiés côté serveur ; aucun numéro de carte ne transite par RM Paie.
- **Secrets :** aucun secret dans le code public ; fichiers de configuration du serveur en lecture réservée à root ; sauvegardes chiffrées.
- **Affichage :** les données saisies sont échappées avant affichage (pas d'injection de code par un nom de salarié, y compris à l'import Excel).
- **Mots de passe :** 10 caractères minimum avec 4 types de caractères, contrôlés aussi par le serveur ; tentatives limitées.

## Ajouts

- **Journal des connexions :** chaque utilisateur voit ses 10 dernières connexions dans l'onglet Sécurité (date, appareil, double authentification).
- **Serveur :** connexion SSH par clé uniquement (appliquée si une clé est déjà autorisée), journaux Docker limités, réglages réseau prudents, en-têtes de sécurité sur l'API, taille des requêtes limitée à 25 Mo.
- **`/.well-known/security.txt` :** adresse de signalement d'une faille.
- **Conservation du journal :** 3 ans.

## Risques résiduels et décisions à prendre

1. **Console technique ouverte à toutes les adresses IP** (protégée par mot de passe seulement). Renseignez `STUDIO_IP_AUTORISEES` avec l'IP fixe du cabinet.
2. **Double authentification facultative.** Recommandation : l'activer sur votre compte super-administrateur dès le premier jour, et la rendre obligatoire pour les administrateurs des sociétés.
3. **Vérification de l'essai gratuit :** le formulaire d'inscription permet de savoir si une adresse e-mail a déjà utilisé l'essai. C'est le prix de la règle « un seul essai par adresse ».
4. **Espaces clients des cabinets :** leurs données sont chiffrées dans le navigateur avec le mot de passe de l'espace ; la base ne contient que du chiffré, lisible sans compte. La sécurité repose donc sur la force de ce mot de passe (14 caractères générés par défaut : ne le remplacez pas par un mot de passe simple).
5. **Test d'intrusion externe :** cet audit est une revue de code. Avant d'ouvrir au public, faites tester le serveur installé par un prestataire indépendant.
6. **Mises à jour :** une fois par trimestre (`mettre-a-jour.sh --supabase`), et sans attendre en cas d'alerte de sécurité sur Supabase, Caddy ou Docker.
