# Sommaire

Tous les fichiers de RM Paie sont à la racine, sans sous-dossier.

## Le site (fonctionne tel quel, en mode démonstration)

`index.html` est la page d'accueil. Les fichiers suivants composent le site :

- `.nojekyll`
- `404.html`
- `LICENCE-Manrope-OFL.txt`
- `LICENCE-NotoKufiArabic-OFL.txt`
- `app.js`
- `apple-touch-icon.png`
- `audience.js`
- `backend.js`
- `cgu.html`
- `chunk-BD5WXLQO.js`
- `chunk-KLBW4PNS.js`
- `chunk-N66TTF7B.js`
- `chunk-UCFNZJLR.js`
- `chunk-UYHX356B.js`
- `chunk-VQDTEBLE.js`
- `chunk-XZUEO4BZ.js`
- `chunk-Y6PULSM7.js`
- `chunk-ZSOCVAT7.js`
- `confidentialite.html`
- `demo-ui.js`
- `differe.js`
- `favicon-32.png`
- `favicon.svg`
- `fonts.css`
- `guide-utilisation-rm-paie.pdf`
- `index.html`
- `initdb.js`
- `initdb.wasm`
- `jspdf.plugin.autotable.min.js`
- `jspdf.umd.min.js`
- `jszip.min.js`
- `manrope-latin-400-normal.woff2`
- `manrope-latin-500-normal.woff2`
- `manrope-latin-600-normal.woff2`
- `manrope-latin-700-normal.woff2`
- `manrope-latin-800-normal.woff2`
- `mock.js`
- `modele-import-salaries.js`
- `modele-import-salaries.xlsx`
- `moteur.js`
- `noto-kufi-arabic-arabic-400-normal.woff2`
- `noto-kufi-arabic-arabic-600-normal.woff2`
- `noto-kufi-arabic-arabic-700-normal.woff2`
- `og.png`
- `pglite-fs-base.js`
- `pglite-fs-memfs-frontend.js`
- `pglite-fs-memfs2opfs.js`
- `pglite-fs-nodefs.js`
- `pglite-fs-opfs-ahp.js`
- `pglite-fs.wasm`
- `pglite-index.js`
- `pglite.js`
- `pglite.wasm`
- `prise-en-main.jpg`
- `prise-en-main.mp4`
- `qrcode.js`
- `read-excel-file.min.js`
- `reglementation-conges-payes-jours.html`
- `reglementation-cotisations-cnss-amo-taux.html`
- `reglementation-duree-travail-heures-supplementaires.html`
- `reglementation-echeances-declarations-cnss-ir.html`
- `reglementation-impot-sur-le-revenu-salaires-bareme.html`
- `reglementation-periode-essai-cdd-cdi.html`
- `reglementation-preavis-indemnite-licenciement.html`
- `reglementation-prime-anciennete-taux.html`
- `reglementation-smig-smag-salaire-minimum.html`
- `reglementation-stagiaires-idmaj-exoneration.html`
- `reglementation.html`
- `robots.txt`
- `saas.js`
- `schema.txt`
- `seed.txt`
- `sitemap.xml`
- `templating.js`

## Le reste du projet (code source, serveur, base de données, documents)

| Fichier | Origine dans le projet classé |
|---|---|
| `01_Guide-utilisation.pdf` | `PDF/01_Guide-utilisation.pdf` |
| `02_Notice-technique.pdf` | `PDF/02_Notice-technique.pdf` |
| `03_Audit-de-securite.pdf` | `PDF/03_Audit-de-securite.pdf` |
| `04_Guide-installation-serveur-Maroc.pdf` | `PDF/04_Guide-installation-serveur-Maroc.pdf` |
| `05_Dossier-paiement-CMI.pdf` | `PDF/05_Dossier-paiement-CMI.pdf` |
| `06_Conditions-generales.pdf` | `PDF/06_Conditions-generales.pdf` |
| `07_Politique-de-confidentialite.pdf` | `PDF/07_Politique-de-confidentialite.pdf` |
| `20261115000000_rm_paie.sql` | `supabase/migrations/20261115000000_rm_paie.sql` |
| `20261115000001_justificatifs.sql` | `supabase/migrations/20261115000001_justificatifs.sql` |
| `20261119000000_securite.sql` | `supabase/migrations/20261119000000_securite.sql` |
| `20261121000000_audience.sql` | `supabase/migrations/20261121000000_audience.sql` |
| `20261121000001_durcissement.sql` | `supabase/migrations/20261121000001_durcissement.sql` |
| `Caddyfile` | `deploy/maroc/Caddyfile` |
| `GUIDE-INSTALLATION-MAROC.md` | `deploy/maroc/LISEZMOI.md` |
| `_headers` | `web/static/_headers` |
| `build.py` | `web/build.py` |
| `config.exemple.env` | `deploy/maroc/config.exemple.env` |
| `config.toml` | `supabase/config.toml` |
| `creer-admin.sh` | `deploy/maroc/creer-admin.sh` |
| `deployer.sh` | `deploy/maroc/deployer.sh` |
| `docker-compose.rmpaie.yml` | `deploy/maroc/docker-compose.rmpaie.yml` |
| `fonction-cmi-callback.ts` | `supabase/functions/cmi-callback/index.ts` |
| `fonction-cmi-diagnostic.ts` | `supabase/functions/cmi-diagnostic/index.ts` |
| `fonction-cmi-paiement.ts` | `supabase/functions/cmi-paiement/index.ts` |
| `fonction-cmi-retour.ts` | `supabase/functions/cmi-retour/index.ts` |
| `fonction-commun-cmi.ts` | `supabase/functions/_shared/cmi.ts` |
| `fonction-commun-erreurs.ts` | `supabase/functions/_shared/erreurs.ts` |
| `fonction-commun-mail.ts` | `supabase/functions/_shared/mail.ts` |
| `fonction-envoyer-bulletins.ts` | `supabase/functions/envoyer-bulletins/index.ts` |
| `fonction-inviter.ts` | `supabase/functions/inviter/index.ts` |
| `fonction-mfa-reinitialiser.ts` | `supabase/functions/mfa-reinitialiser/index.ts` |
| `fonction-notifications.ts` | `supabase/functions/notifications/index.ts` |
| `installer.sh` | `deploy/maroc/installer.sh` |
| `lib.sh` | `deploy/maroc/lib.sh` |
| `mettre-a-jour.sh` | `deploy/maroc/mettre-a-jour.sh` |
| `migrer.sh` | `deploy/maroc/migrer.sh` |
| `modele_import.py` | `web/tools/modele_import.py` |
| `obfuscate.mjs` | `web/obfuscate.mjs` |
| `package.json` | `web/package.json` |
| `reglementation.py` | `web/reglementation.py` |
| `restaurer.sh` | `deploy/maroc/restaurer.sh` |
| `sauvegarde.sh` | `deploy/maroc/sauvegarde.sh` |
| `security.txt` | `web/static/.well-known/security.txt` |
| `source-app.js` | `web/src/app.js` |
| `source-ar-saas.js` | `web/src/ar-saas.js` |
| `source-demo-backend.js` | `demo/backend.js` |
| `source-demo-mock.js` | `demo/mock.js` |
| `source-demo-seed.sql` | `demo/seed.sql` |
| `source-demo-ui.js` | `demo/demo-ui.js` |
| `source-engine.js` | `web/src/engine.js` |
| `source-ext.js` | `web/src/ext.js` |
| `source-saas.css` | `web/src/saas.css` |
| `source-saas.js` | `web/src/saas.js` |
| `source-shell.html` | `web/src/shell.html` |
| `surveiller.sh` | `deploy/maroc/surveiller.sh` |
| `vercel.json` | `web/static/vercel.json` |
