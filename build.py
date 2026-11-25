"""Construit web/index.html à partir des sources (logiciel de paie + couche commerciale)."""
import re, pathlib, subprocess, shutil
import reglementation
SITE = "https://rmpaie.ma"  # votre nom de domaine : sert au sitemap, aux balises de partage et à robots.txt
S = pathlib.Path(__file__).parent / 'src'
shell = (S / 'shell.html').read_text()
app = (S / 'app.js').read_text()
ext = (S / 'ext.js').read_text()

def rep(s, a, b, regex=False):
    n = len(re.findall(a, s)) if regex else s.count(a)
    assert n >= 1, 'introuvable : ' + a[:60]
    return re.sub(a, b, s, count=1) if regex else s.replace(a, b, 1)

# app.js : vues supplémentaires (Mon compte, Administration)
app = rep(app, "simulateur: vSimulateur, parametres: vParametres }[S.view];", "simulateur: vSimulateur, parametres: vParametres }[S.view] || EXTRA_VIEWS[S.view];")
app = rep(app, "if (!S.dossierId && S.view !== 'simulateur' && S.view !== 'parametres' && S.view !== 'presentation') {", "if (!S.dossierId && !EXTRA_VIEWS[S.view] && S.view !== 'simulateur' && S.view !== 'parametres' && S.view !== 'presentation') {")
app = rep(app, r"Les données sont enregistrées \$\{Store\.mode === 'cloud' \? '[^']*' : '[^']*'\}\.", "Les données sont enregistrées sur nos serveurs sécurisés, accessibles uniquement à votre société.", regex=True)
# ext.js : démarrage remplacé par celui de saas.js, textes propres à claude.ai
ext = ext[:ext.index('/* ---------- Démarrage ---------- */')]
ext = rep(ext, r"<h3>Collaborateurs</h3><p class=\"small\">.*?</p></section>", "<h3>Collaborateurs</h3><p class=\"small\">Invitez vos collaborateurs par e-mail depuis « Mon compte » : ils accèdent aux mêmes dossiers.</p></section>", regex=True)
ext = rep(ext, r"\$\{Store\.mode === 'cloud' \? '' : '<p class=\"err small\">[^']*</p>'\}", "", regex=True)
ext = rep(ext, r"<p class=\"muted small\">Pour donner l’accès : .*?</p></section>", "<p class=\"muted small\">Transmettez au client son identifiant et son mot de passe par un autre canal (téléphone, WhatsApp). Il se connecte depuis la page d’accueil avec le bouton « Connexion ». Changer le mot de passe puis republier coupe l’ancien accès.</p></section>", regex=True)


# Page d'accueil : rubrique Réglementation (articles générés par reglementation.py)
REG_CARDS = ''.join(f'<a class="pz-reg" href="reglementation-{sl}.html"><small>{th}</small><b>{ti}</b></a>' for th, ti, sl in reglementation.THEMES_ACCUEIL[:6])
ext = rep(ext, """  <section class="pz-sec white" id="tarifs">""", f"""  <section class="pz-sec" id="reglementation"><div class="pz-w"><span class="pz-kick">RÉGLEMENTATION</span><h2>Les règles de la paie, expliquées et sourcées</h2><p class="muted">SMIG, CNSS, AMO, IR, échéances, contrat, congés : des articles classés par thème, vérifiés sur les textes officiels.</p>
   <div class="pz-regs">{REG_CARDS}</div><a class="btn primary" href="reglementation.html">Voir toute la réglementation</a></div></section>
  <section class="pz-sec white" id="tarifs">""")

# Page d'accueil : un seul appel à l'action, liens légaux dans le pied de page
ext = rep(ext, """<div class="row">${cta}<a class="btn primary lg" href="#contact">Démarrer l’essai gratuit</a><a class="btn ghost lg" href="#tarifs">Voir les tarifs</a></div>""",
  """<div class="row"><button class="btn gold lg" data-act="inscription">Essayer ${T.essai} jours gratuitement</button><a class="lnk lt" href="#tarifs">Voir les tarifs</a></div>""")
ext = rep(ext, """<div class="pz-col pz-contact">${cta}${contactWa}""", """<div class="pz-col pz-contact"><button class="btn gold lg" data-act="inscription">Essayer ${T.essai} jours gratuitement</button>${contactWa}""")
ext = rep(ext, """<span>ICE 002759353000065 · RC 112993 · TP 45106705</span></div></footer>""",
  """<span>ICE 002759353000065 · RC 112993 · TP 45106705</span><p class="pz-secu">🔒 Paiement sécurisé par carte bancaire (3-D Secure) — RM Paie ne stocke aucun numéro de carte.</p><nav class="pz-legal"><a href="reglementation.html">Réglementation</a><a href="confidentialite.html">Confidentialité</a><a href="cgu.html">Conditions générales</a><a href="confidentialite.html#cookies">Cookies</a></nav></div></footer>""")

HEAD = f"""
<link rel="canonical" href="{SITE}/">
<meta name="theme-color" content="#13233a">
<link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta property="og:type" content="website"><meta property="og:site_name" content="RM Paie"><meta property="og:locale" content="fr_MA">
<meta property="og:title" content="RM Paie — Logiciel de paie marocaine en ligne">
<meta property="og:description" content="Bulletins justes, CNSS, AMO, IR, e-BDS DAMANCOM et SIMPL-IR prêts. Par un cabinet d’expertise comptable. Essai gratuit 7 jours.">
<meta property="og:url" content="{SITE}/"><meta property="og:image" content="{SITE}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow, noai, noimageai">
<meta name="copyright" content="© RM Expertise — reproduction interdite">"""
V = S / 'vendor'
js1 = (V / 'jspdf.umd.min.js').read_text(); js2 = (V / 'jspdf.plugin.autotable.min.js').read_text()
shell = rep(shell, '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>',
            # Bibliothèques PDF et ZIP (~800 Ko) chargées après l'affichage de la page, pour que l'accueil s'ouvre vite
            '<script defer src="differe.js"></script>')
shell = rep(shell, '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>',
            '<script src="vendor/supabase.js"></script>\n<script src="config.js"></script>')
shell = rep(shell, '<title>RM Paie — Logiciel de paie marocaine</title>', '<title>RM Paie — Logiciel de paie marocaine en ligne</title>\n<meta name="description" content="Logiciel de paie marocaine en ligne : bulletins, CNSS, AMO, IR, e-BDS DAMANCOM, SIMPL-IR, documents RH. Essai gratuit 7 jours.">' + HEAD)
css = (S / 'saas.css').read_text()
shell = rep(shell, '</style>', css + '</style>')
eng = (S / 'engine.js').read_text()
# Le cœur du calcul de paie n'est pas publié : il est téléchargé après connexion depuis le stockage privé « logiciel »
cut = eng.index('function tauxAnciennete')
eng_pub, eng_prive = eng[:cut], eng[cut:]
shell = rep(shell, '<script>/*ENGINE*/</script>', '')
shell = rep(shell, '<script>/*APP*/</script>', '<script src="app.js"></script>')
ar = (S / 'ar-saas.js').read_text()
shell = rep(shell, '<script>/*EXT*/</script>', '<script src="saas.js"></script>\n<script defer src="audience.js"></script>')
out = pathlib.Path(__file__).parent / 'public'
(out / 'vendor').mkdir(parents=True, exist_ok=True)
(out / 'vendor/jszip.min.js').write_text((V / 'jszip.min.js').read_text()); (out / 'vendor/jspdf.umd.min.js').write_text(js1); (out / 'vendor/jspdf.plugin.autotable.min.js').write_text(js2)
(out / 'vendor/supabase.js').write_text((V / 'supabase.js').read_text())
(out / 'vendor/read-excel-file.min.js').write_text((V / 'read-excel-file.min.js').read_text())
prive = pathlib.Path(__file__).parent / 'prive'; prive.mkdir(exist_ok=True)
brut = pathlib.Path(__file__).parent / 'build-tmp'; brut.mkdir(exist_ok=True)
(brut / 'app.js').write_text(eng_pub + '\n' + app + '\n' + ext + '\n' + ar)
(brut / 'saas.js').write_text((S / 'saas.js').read_text())
(brut / 'moteur.js').write_text(eng_prive)
BROUILLE = (pathlib.Path(__file__).parent / 'node_modules/javascript-obfuscator').exists() and shutil.which('node')
for nom, dest in [('app.js', out / 'app.js'), ('saas.js', out / 'saas.js'), ('moteur.js', prive / 'moteur.js')]:
    if BROUILLE: subprocess.run(['node', str(pathlib.Path(__file__).parent / 'obfuscate.mjs'), str(brut / nom), str(dest)], check=True)
    else: shutil.copy(brut / nom, dest)
if not BROUILLE: print('ATTENTION : code non brouillé (lancez « npm install » dans web/ puis reconstruisez)')
(out / 'index.html').write_text(shell)
cfg = out / 'config.js'
if not cfg.exists():
    cfg.write_text("// Renseignez les valeurs de votre projet Supabase (Settings > API)\nwindow.RMPAIE_CONFIG = {\n  supabaseUrl: 'https://VOTRE-PROJET.supabase.co',\n  supabaseAnonKey: 'VOTRE_CLE_ANON_PUBLIQUE',\n  // Mesure d'audience sans cookie (Plausible) : votre domaine, ex. 'rmpaie.ma' ; vide = désactivée\n  plausibleDomain: ''\n};\n")
# Fichiers du site : référencement, page 404, en-têtes de sécurité (HTTPS forcé), icônes, image de partage
IA = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'Google-Extended', 'CCBot', 'PerplexityBot', 'Perplexity-User',
      'Bytespider', 'Amazonbot', 'Applebot-Extended', 'meta-externalagent', 'FacebookBot', 'cohere-ai', 'Diffbot', 'YouBot', 'omgili', 'Timpibot', 'ImagesiftBot', 'DuckAssistBot', 'MistralAI-User']
(out / 'robots.txt').write_text('# Robots d’intelligence artificielle : accès interdit (copie, entraînement, extraction)\n' + ''.join(f'User-agent: {b}\n' for b in IA) + 'Disallow: /\n\n'
  + f"User-agent: *\nAllow: /$\nAllow: /cgu.html\nAllow: /confidentialite.html\nAllow: /guide-utilisation-rm-paie.pdf\nAllow: /prise-en-main.mp4\nAllow: /reglementation/\nDisallow: /modele-import-salaries.xlsx\nDisallow: /app.js\nDisallow: /saas.js\nDisallow: /vendor/\nSitemap: {SITE}/sitemap.xml\n")
REG = reglementation.generer(out, SITE)
(out / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + ''.join(f'  <url><loc>{SITE}/{u}</loc><changefreq>{f}</changefreq><priority>{p}</priority></url>\n' for u, f, p in [('', 'monthly', '1.0'), ('cgu.html', 'yearly', '0.3'), ('confidentialite.html', 'yearly', '0.3')] + [(u, 'monthly', '0.7') for u in REG]) + '</urlset>\n')
import base64
(out / 'modele-import-salaries.js').write_text('window.MODELE_IMPORT_XLSX="' + base64.b64encode((pathlib.Path(__file__).parent / 'static/modele-import-salaries.xlsx').read_bytes()).decode() + '";\n')
STATIC = pathlib.Path(__file__).parent / 'static'
for f in STATIC.iterdir():
    if f.is_dir(): shutil.copytree(f, out / f.name, dirs_exist_ok=True)
    else: (out / f.name).write_bytes(f.read_bytes())
print('ok', len(shell))
