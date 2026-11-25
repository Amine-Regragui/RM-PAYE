"""Pages « Réglementation » : articles de paie marocaine classés par thème, chacun avec ses sources officielles.
Appelé par build.py. Pour mettre à jour : modifier ARTICLES et MAJ, puis relancer « python3 build.py »."""
import html, json, pathlib

MAJ = '19 novembre 2026'
MAJ_ISO = '2026-11-19'

# Sources officielles
CT = ('Code du travail, loi n° 65-99 — Bulletin officiel n° 5210 du 6 mai 2004 (texte publié par le ministère de la Justice)', 'https://cnclt.justice.gov.ma/wp-content/uploads/2023/06/Maroc-Code-travail-1.pdf')
CT_CONSO = ('Code du travail — version consolidée (portail Adala, ministère de la Justice)', 'https://adala.justice.gov.ma/api/uploads/2024/04/30/code%20du%20travail-1714463246806.pdf')
CNSS = ('Caisse nationale de sécurité sociale — cnss.ma (taux, DAMANCOM, majorations de retard)', 'https://www.cnss.ma')
DGI_IR = ('Direction générale des impôts — L’impôt sur le revenu (barème, revenus salariaux)', 'https://www.tax.gov.ma/wps/portal/DGI/Vos-impots-procedures/Impots-sur-le-revenu')
CGI = ('Code général des impôts 2026 (DGI) — articles 57, 59, 74, 79, 156 et 174', 'https://www.tax.gov.ma/wps/wcm/connect/08712531-1e81-4e28-a38b-2bd9edf8e09e/CGI+2026+FR.pdf?MOD=AJPERES')
NC737 = ('DGI — Note circulaire n° 737 relative aux mesures fiscales de la loi de finances 2026', 'https://www.tax.gov.ma/wps/wcm/connect/e48c5c9d-ae80-4b30-a1b3-80af7ec09be1/NC+737+LF+2026.pdf?MOD=AJPERES')
SGG = ('Secrétariat général du gouvernement — Bulletin officiel (décret n° 2.25.983, BO n° 7469)', 'https://www.sgg.gov.ma')
ANAPEC = ('ANAPEC — programme Idmaj (contrat de formation-insertion)', 'https://www.anapec.org')
SIMPL = ('DGI — services en ligne SIMPL-IR (télédéclaration et télépaiement)', 'https://www.tax.gov.ma')


def t(*rows, head=None):
    h = ''.join(f'<th>{c}</th>' for c in head) if head else ''
    return '<div class="tw"><table>' + (f'<thead><tr>{h}</tr></thead>' if h else '') + '<tbody>' + ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows) + '</tbody></table></div>'


ARTICLES = [
 dict(slug='smig-smag-salaire-minimum', seo="SMIG et SMAG 2026 au Maroc", theme='Salaires', titre='SMIG et SMAG 2026 : le salaire minimum au Maroc',
  resume='17,92 DH de l’heure depuis le 1er janvier 2026, 97,44 DH par jour en agriculture depuis le 1er avril 2026.',
  corps=f"""<p>Le salaire minimum légal est fixé par décret, en application des articles 356 à 361 du Code du travail. Pour 2026, c’est le <b>décret n° 2.25.983</b> (Bulletin officiel n° 7469), deuxième tranche de l’accord du dialogue social du 29 avril 2024.</p>
{t(('SMIG — activités non agricoles (industrie, commerce, services)', '<b>17,92 DH / heure</b>', 'depuis le 1er janvier 2026'), ('SMAG — activités agricoles', '<b>97,44 DH / jour</b>', 'depuis le 1er avril 2026'), ('Rappel 2025', '17,10 DH / heure · 93 DH / jour', 'décret n° 2.24.1122'), head=('Salaire minimum', 'Montant', 'Application'))}
<h2>Combien par mois ?</h2>
<p>Le décret fixe un taux <b>horaire</b>, pas un montant mensuel. En pratique, la paie retient l’une de ces deux bases pour un temps plein :</p>
<ul><li>191 heures par mois : 17,92 × 191 = <b>3 422,72 DH brut</b> (base la plus utilisée) ;</li><li>2 288 heures par an ÷ 12 (article 184) : 17,92 × 190,67 = 3 416,75 DH brut.</li></ul>
<p>Aucun salarié ne peut être payé moins que le SMIG pour ses heures de travail effectif, primes de rendement et avantages exclus du calcul selon les règles du Code du travail. Les minima conventionnels plus élevés, prévus par une convention collective, s’appliquent en priorité.</p>
<div class="rm">Dans RM Paie : le taux du SMIG est mis à jour à chaque décret. Un contrôle signale tout salarié dont le salaire horaire de base est inférieur au minimum.</div>""",
  sources=[SGG, CT]),

 dict(slug='cotisations-cnss-amo-taux', seo="Taux CNSS, AMO et TFP 2026", theme='Cotisations', titre='Cotisations CNSS, AMO et taxe de formation professionnelle : les taux',
  resume='Part salariale, part patronale, plafond de 6 000 DH, AMO et taxe de formation professionnelle.',
  corps=f"""<p>Les cotisations sont calculées sur le salaire brut imposable (salaire, primes, indemnités et avantages, hors exonérations prévues par les textes). Certaines sont plafonnées à <b>6 000 DH par mois</b>, les autres portent sur la totalité du salaire.</p>
{t(('Prestations sociales (retraite, maladie, maternité)', '4,48 %', '8,98 %', 'Plafonné à 6 000 DH'), ('Allocations familiales', '—', '6,40 %', 'Non plafonné'), ('Indemnité pour perte d’emploi (IPE)', '0,19 %', '0,38 %', 'Plafonné à 6 000 DH'), ('Assurance maladie obligatoire (AMO)', '2,26 %', '2,26 %', 'Non plafonné'), ('Participation AMO (solidarité)', '—', '1,85 %', 'Non plafonné'), ('Taxe de formation professionnelle (TFP)', '—', '1,60 %', 'Non plafonné'), head=('Cotisation', 'Salarié', 'Employeur', 'Assiette'))}
<p>Pour un salaire brut de 8 000 DH, la retenue salariale CNSS + AMO est donc : 6 000 × (4,48 % + 0,19 %) + 8&nbsp;000 × 2,26 % = 280,20 + 180,80 = <b>461,00 DH</b>.</p>
<h2>Majorations de retard</h2>
<p>Une déclaration ou un paiement hors délai entraîne des majorations : selon la CNSS, <b>3 % pour le premier mois de retard, puis 1 % par mois supplémentaire</b> pour le régime général, et 1 % par mois de retard pour l’AMO. Une page de la CNSS fait aussi état d’un taux réduit de 0,5 % applicable depuis le 1er avril 2025 : vérifiez le taux en vigueur sur cnss.ma ou auprès de votre agence avant tout calcul de régularisation.</p>
<div class="rm">Dans RM Paie : les taux et plafonds sont appliqués automatiquement, et le fichier e-BDS est prêt à déposer sur DAMANCOM.</div>""",
  sources=[CNSS]),

 dict(slug='impot-sur-le-revenu-salaires-bareme', seo="Barème IR 2026 sur salaires au Maroc", theme='Fiscalité', titre='IR sur salaires : barème, frais professionnels et charges de famille',
  resume='Le barème progressif de 0 % à 37 %, l’abattement de 35 % ou 25 %, et la réduction de 600 DH par personne à charge (loi de finances 2026).',
  corps=f"""<p>L’impôt sur le revenu est retenu à la source chaque mois par l’employeur (article 156 du CGI). Le salaire net imposable s’obtient en retirant du brut imposable les frais professionnels, les cotisations sociales salariales et, le cas échéant, les cotisations de retraite complémentaire et les intérêts de prêt logement déductibles.</p>
<h2>Barème annuel (article 73 du CGI)</h2>
{t(('0 à 40 000 DH', '0 %', '—'), ('40 001 à 60 000 DH', '10 %', '4 000 DH'), ('60 001 à 80 000 DH', '20 %', '10 000 DH'), ('80 001 à 100 000 DH', '30 %', '18 000 DH'), ('100 001 à 180 000 DH', '34 %', '22 000 DH'), ('Au-delà de 180 000 DH', '37 %', '27 400 DH'), head=('Revenu net imposable annuel', 'Taux', 'Somme à déduire'))}
<p>En paie mensuelle, on applique le même barème divisé par 12 (par exemple 0 % jusqu’à 3 333,33 DH par mois).</p>
<h2>Frais professionnels (article 59)</h2>
<ul><li>Revenu brut imposable annuel jusqu’à 78 000 DH : abattement de <b>35 %</b> ;</li><li>au-delà : abattement de <b>25 %</b>, plafonné à <b>35 000 DH par an</b> (2 916,67 DH par mois).</li></ul>
<h2>Charges de famille (article 74) — nouveau en 2026</h2>
<p>La loi de finances 2026 porte la réduction d’impôt à <b>600 DH par an et par personne à charge</b> (épouse ou époux, enfants dans les conditions prévues), dans la limite de 6 personnes, soit <b>3 600 DH par an au maximum</b> (50 DH par mois et par personne, 300 DH par mois au maximum). Elle était de 500 DH par personne en 2025.</p>
<div class="rm">Dans RM Paie : le barème, l’abattement et la réduction pour charges de famille sont appliqués selon la situation saisie dans la fiche du salarié.</div>""",
  sources=[DGI_IR, CGI, NC737]),

 dict(slug='echeances-declarations-cnss-ir', seo="Échéances CNSS et IR de la paie", theme='Déclarations', titre='Les échéances de la paie : CNSS, IR mensuel et déclaration annuelle',
  resume='DAMANCOM avant le 10, versement de l’IR retenu dans le mois suivant, déclaration des salaires avant le 1er mars.',
  corps=f"""{t(('Déclaration et paiement CNSS / AMO (e-BDS sur DAMANCOM)', '<b>Avant le 10</b> du mois suivant le mois de paie', 'CNSS'), ('Versement de l’IR retenu à la source', 'Dans le <b>mois suivant</b> celui du paiement des salaires (article 174 du CGI)', 'DGI — SIMPL-IR'), ('Déclaration annuelle des traitements et salaires', '<b>Avant le 1er mars</b> de l’année suivante (article 79 du CGI)', 'DGI — SIMPL-IR'), ('Liste des stagiaires exonérés (article 57-16°)', 'Dans le même délai que la déclaration annuelle (article 79-II)', 'DGI'), head=('Obligation', 'Date limite', 'Où'))}
<p>Les déclarations et paiements se font par voie électronique. Un retard entraîne des majorations côté CNSS (voir l’article sur les cotisations) et des pénalités et majorations côté fiscal prévues par le CGI.</p>
<div class="rm">Dans RM Paie : l’onglet Déclarations prépare l’e-BDS, l’état de l’IR du mois et, en fin d’année, l’état annuel des salaires.</div>""",
  sources=[CNSS, CGI, SIMPL]),

 dict(slug='periode-essai-cdd-cdi', seo="Période d’essai, CDD et CDI au Maroc", theme='Contrat de travail', titre='Période d’essai, CDD et CDI : ce que dit le Code du travail',
  resume='Durées d’essai par catégorie, renouvellement unique, cas de recours au CDD.',
  corps=f"""<h2>Période d’essai (articles 13 et 14)</h2>
{t(('Cadres et assimilés', '3 mois'), ('Employés', '1 mois et demi'), ('Ouvriers', '15 jours'), head=('CDI — catégorie', 'Durée maximale'))}
<p>La période d’essai du CDI peut être renouvelée <b>une seule fois</b>. Pour un CDD, elle est d’un jour par semaine de travail, dans la limite de deux semaines pour un contrat de moins de six mois et d’un mois au-delà. Le contrat, l’usage ou la convention collective peuvent prévoir des durées plus courtes.</p>
<h2>CDD (articles 16 et 17)</h2>
<p>Le contrat à durée déterminée est réservé aux cas prévus par la loi : remplacement d’un salarié absent, accroissement temporaire d’activité, travail saisonnier, ainsi que, pour une entreprise ou un établissement nouveau ou un nouveau produit, une durée maximale d’un an renouvelable une fois. Au-delà, le contrat devient un CDI.</p>
<div class="rm">Dans RM Paie : la fiche du salarié enregistre le type de contrat et ses dates ; les documents RH (contrat, attestation) sont générés à partir de ces données.</div>""",
  sources=[CT, CT_CONSO]),

 dict(slug='preavis-indemnite-licenciement', seo="Préavis et indemnité de licenciement", theme='Contrat de travail', titre='Préavis et indemnité de licenciement',
  resume='Durées de préavis du décret 2-04-469 et barème de l’indemnité en heures de salaire (article 53).',
  corps=f"""<h2>Préavis (article 43 et décret n° 2-04-469 du 29 décembre 2004)</h2>
<p>La rupture d’un CDI à l’initiative de l’une des parties oblige au respect d’un préavis, sauf faute grave. Il ne peut jamais être inférieur à 8 jours.</p>
{t(('Moins d’1 an', '1 mois', '8 jours'), ('De 1 à 5 ans', '2 mois', '1 mois'), ('Plus de 5 ans', '3 mois', '2 mois'), head=('Ancienneté', 'Cadres et assimilés', 'Employés et ouvriers'))}
<p>Pendant le préavis, le salarié dispose d’heures d’absence rémunérées pour chercher un emploi (articles 48 et 49). Le préavis non exécuté par la faute de l’une des parties est compensé par une indemnité égale au salaire de la période (article 51).</p>
<h2>Indemnité de licenciement (articles 52 et 53)</h2>
<p>Due au salarié en CDI licencié après au moins <b>six mois</b> de travail dans la même entreprise, hors faute grave. Elle se calcule en heures de salaire par année ou fraction d’année :</p>
{t(('Cinq premières années', '96 heures'), ('De la 6e à la 10e année', '144 heures'), ('De la 11e à la 15e année', '192 heures'), ('Au-delà de 15 ans', '240 heures'), head=('Tranche d’ancienneté', 'Par année de travail'))}
<p>Le salaire de référence est le salaire moyen perçu au cours des 52 semaines précédant la rupture. Sur le plan fiscal, les indemnités de licenciement et de départ volontaire sont exonérées d’IR dans la limite globale d’un million de dirhams (article 57-7° du CGI), et selon les conditions qu’il prévoit.</p>
<div class="rm">Dans RM Paie : l’onglet Sortie calcule le préavis, l’indemnité de licenciement et le solde de tout compte.</div>""",
  sources=[CT, CT_CONSO, CGI]),

 dict(slug='duree-travail-heures-supplementaires', seo="Heures supplémentaires au Maroc", theme='Temps de travail', titre='Durée du travail et heures supplémentaires',
  resume='44 heures par semaine, 2 288 heures par an, majorations de 25 %, 50 % et 100 %.',
  corps=f"""<p>La durée normale du travail est de <b>2 288 heures par an</b> ou <b>44 heures par semaine</b> dans les activités non agricoles, et de 2 496 heures par an dans les activités agricoles (article 184). Elle ne peut dépasser 10 heures par jour.</p>
<h2>Majoration des heures supplémentaires (article 201)</h2>
{t(('Entre 6 h et 21 h', '+ 25 %', '+ 50 %'), ('Entre 21 h et 6 h', '+ 50 %', '+ 100 %'), head=('Activités non agricoles', 'Jour ouvrable', 'Jour de repos hebdomadaire'))}
<p>Dans les activités agricoles, les plages sont de 5 h à 20 h et de 20 h à 5 h. La majoration s’applique même si un repos compensateur est accordé. Les heures supplémentaires sont payées en même temps que le salaire du mois (article 198).</p>
<div class="rm">Dans RM Paie : saisissez les heures du mois par taux de majoration dans les variables ; le taux horaire est calculé à partir du salaire de base.</div>""",
  sources=[CT, CT_CONSO]),

 dict(slug='conges-payes-jours', seo="Congés payés au Maroc : calcul", theme='Congés', titre='Congés payés : combien de jours et comment les calculer',
  resume='1,5 jour par mois après six mois de service, + 1,5 jour par période de 5 ans, plafond 30 jours.',
  corps=f"""<p>Tout salarié qui a au moins <b>six mois de service continu</b> dans la même entreprise a droit à un congé annuel payé de (article 231) :</p>
<ul><li><b>1,5 jour</b> de travail effectif par mois de service, soit 18 jours par an ;</li><li><b>2 jours</b> par mois pour les salariés de moins de 18 ans.</li></ul>
<p>La durée augmente d’<b>1,5 jour par période entière de cinq ans</b> de service, continue ou non, sans pouvoir dépasser <b>30 jours</b> de travail effectif (article 232).</p>
<p>Pendant le congé, le salarié perçoit une indemnité égale à la rémunération qu’il aurait perçue s’il avait travaillé, primes et avantages habituels inclus.</p>
<div class="rm">Dans RM Paie : les droits acquis et les jours pris sont suivis par salarié, et l’indemnité de congé est calculée lors de la saisie des absences.</div>""",
  sources=[CT, CT_CONSO]),

 dict(slug='prime-anciennete-taux', seo="Prime d’ancienneté : taux légaux", theme='Salaires', titre='Prime d’ancienneté : taux légaux de 5 % à 25 %',
  resume='Obligatoire après deux ans de service : 5 %, 10 %, 15 %, 20 % puis 25 % du salaire.',
  corps=f"""<p>Tout salarié bénéficie d’une prime d’ancienneté calculée sur le salaire effectivement versé (article 350) :</p>
{t(('Après 2 ans de service', '5 %'), ('Après 5 ans', '10 %'), ('Après 12 ans', '15 %'), ('Après 20 ans', '20 %'), ('Après 25 ans', '25 %'), head=('Ancienneté', 'Taux'))}
<p>La base de calcul (articles 350 à 353) comprend le salaire et ses accessoires ; certains éléments, comme les allocations familiales et les remboursements de frais, en sont exclus. Une convention collective ou le contrat peuvent prévoir des taux plus favorables.</p>
<div class="rm">Dans RM Paie : le taux est déterminé automatiquement à partir de la date d’embauche, et change le mois anniversaire.</div>""",
  sources=[CT, CT_CONSO]),

 dict(slug='stagiaires-idmaj-exoneration', seo="Stagiaires Idmaj : exonérations IR", theme='Particularités', titre='Stagiaires Idmaj et premier emploi : exonérations d’IR',
  resume='Indemnité de stage exonérée jusqu’à 6 000 DH par mois pendant 12 mois ; 24 mois d’exonération en cas d’embauche en CDI.',
  corps=f"""<p>L’article 57-16° du CGI exonère d’impôt sur le revenu l’<b>indemnité de stage mensuelle brute plafonnée à 6 000 DH</b> versée par les entreprises du secteur privé aux stagiaires inscrits à l’ANAPEC. Si l’indemnité dépasse le plafond, l’exonération est perdue pour la totalité.</p>
<h2>Ce qu’a changé la loi de finances 2025</h2>
<ul><li>l’exonération est ouverte à <b>tous les stagiaires</b>, diplômés ou non ;</li><li>la période exonérée passe de 24 à <b>12 mois</b>, et reste acquise dans cette limite en cas de changement d’employeur ;</li><li>si le stagiaire est recruté en <b>CDI</b>, son salaire mensuel brut est exonéré d’IR dans la limite de <b>10 000 DH</b> pendant <b>24 mois</b>.</li></ul>
<p>Le contrat de formation-insertion (programme Idmaj) bénéficie par ailleurs d’avantages sociaux propres (cotisations CNSS et TFP), gérés avec l’ANAPEC : vérifiez les conditions de votre convention de stage.</p>
<p>L’employeur déclare la liste des stagiaires exonérés en même temps que la déclaration annuelle des salaires (article 79-II).</p>
<div class="rm">Dans RM Paie : choisissez le type de contrat « Stage Idmaj » dans la fiche du salarié ; l’indemnité est traitée sans IR dans la limite du plafond.</div>""",
  sources=[CGI, DGI_IR, ANAPEC]),
]

CSS = """*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#13233a;background:#f6f4ef;line-height:1.65}
a{color:#0f5e8c}.top{background:#0f2238;color:#fff}.top .w{display:flex;align-items:center;gap:16px;justify-content:space-between;padding:14px 20px}
.top a{color:#fff;text-decoration:none}.top b{font-size:18px}.top nav{display:flex;gap:14px;font-size:14px}.top nav a{opacity:.9}.top .cta{background:#c9962e;color:#0f2238;padding:7px 14px;border-radius:8px;font-weight:600}
.w{max-width:880px;margin:0 auto;padding:0 20px}main{padding:28px 0 40px}h1{font-size:30px;line-height:1.25;margin:6px 0 10px}h2{font-size:20px;margin:28px 0 8px}
.kick{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a6414;font-weight:700}.maj{color:#566275;font-size:14px}
.lead{font-size:18px;color:#33425a}.tw{overflow-x:auto;margin:14px 0}table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden;font-size:15px}
th,td{padding:9px 12px;border-bottom:1px solid #e6e1d6;text-align:left;vertical-align:top}th{background:#0f2238;color:#fff;font-weight:600}
.rm{background:#fff;border-left:4px solid #c9962e;padding:12px 16px;border-radius:8px;margin:22px 0}
.src{background:#fff;border-radius:10px;padding:14px 18px;margin-top:26px}.src h2{margin-top:0;font-size:17px}.src li{margin:4px 0}
.avert{font-size:13px;color:#566275;margin-top:18px}.crumb{font-size:14px}.crumb a{text-decoration:none}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-top:18px}
.card{display:block;background:#fff;border-radius:12px;padding:16px 18px;text-decoration:none;color:inherit;border:1px solid #e6e1d6}
.card:hover{border-color:#c9962e}.card b{display:block;font-size:16px;margin:4px 0 6px;color:#13233a}.card span{font-size:14px;color:#566275}
.theme{margin-top:30px}footer{background:#0f2238;color:#cdd6e2;font-size:13px;padding:18px 0}footer a{color:#e0b04c}
@media(max-width:640px){h1{font-size:24px}.top nav a.hide{display:none}}"""


def page(titre, desc, canon, corps, site, ld=None, pref='../'):
    e = html.escape
    ld_tag = f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>' if ld else ''
    return f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titre)} | RM Paie</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{site}/{canon}">
<meta property="og:type" content="article"><meta property="og:site_name" content="RM Paie"><meta property="og:title" content="{e(titre)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{site}/{canon}"><meta property="og:image" content="{site}/og.png">
<meta name="robots" content="index, follow, noai, noimageai"><link rel="icon" href="{pref}favicon.svg" type="image/svg+xml">{ld_tag}<style>{CSS}</style></head><body>
<header class="top"><div class="w"><a href="{pref}index.html"><b>RM Paie</b></a><nav><a href="{pref}reglementation/index.html">Réglementation</a><a class="hide" href="{pref}index.html#tarifs">Tarifs</a><a class="cta" href="{pref}index.html#essai">Essai gratuit</a></nav></div></header>
<main><div class="w">{corps}</div></main>
<script src="{pref}config.js"></script><script src="{pref}audience.js"></script>
<footer><div class="w">© RM Paie — un service de RM Expertise, cabinet d’expertise comptable, Marrakech · <a href="{pref}cgu.html">Conditions générales</a> · <a href="{pref}confidentialite.html">Confidentialité</a></div></footer></body></html>"""


AVERT = f'<p class="avert">Articles d’information générale, rédigés à partir des textes officiels cités et à jour au {MAJ}. Ils ne remplacent pas la lecture des textes ni un conseil adapté à votre situation. Une convention collective, le contrat ou le règlement intérieur peuvent prévoir des dispositions plus favorables au salarié.</p>'


def generer(out: pathlib.Path, site: str):
    d = out / 'reglementation'; d.mkdir(parents=True, exist_ok=True)
    for a in ARTICLES:
        src = ''.join(f'<li><a href="{html.escape(u)}" rel="noopener" target="_blank">{html.escape(n)}</a></li>' for n, u in a['sources'])
        corps = (f'<p class="crumb"><a href="index.html">← Toute la réglementation</a></p><span class="kick">{a["theme"]}</span><h1>{a["titre"]}</h1>'
                 f'<p class="maj">À jour au {MAJ} · vérifié sur les sources officielles</p><p class="lead">{a["resume"]}</p>{a["corps"]}'
                 f'<div class="src"><h2>Sources officielles</h2><ul>{src}</ul></div>{AVERT}')
        ld = {'@context': 'https://schema.org', '@type': 'Article', 'headline': a['titre'], 'description': a['resume'], 'dateModified': MAJ_ISO, 'inLanguage': 'fr-MA',
              'author': {'@type': 'Organization', 'name': 'RM Expertise'}, 'publisher': {'@type': 'Organization', 'name': 'RM Paie'}, 'mainEntityOfPage': f'{site}/reglementation/{a["slug"]}.html'}
        (d / f'{a["slug"]}.html').write_text(page(a.get('seo', a['titre']), a['resume'], f'reglementation/{a["slug"]}.html', corps, site, ld))
    themes = []
    for a in ARTICLES:
        if a['theme'] not in themes: themes.append(a['theme'])
    blocs = ''.join(f'<section class="theme"><h2>{th}</h2><div class="grid">' + ''.join(
        f'<a class="card" href="{a["slug"]}.html"><b>{a["titre"]}</b><span>{a["resume"]}</span></a>' for a in ARTICLES if a['theme'] == th) + '</div></section>' for th in themes)
    corps = (f'<span class="kick">Réglementation</span><h1>La paie marocaine, thème par thème</h1><p class="maj">À jour au {MAJ}</p>'
             f'<p class="lead">SMIG, cotisations CNSS et AMO, impôt sur le revenu, échéances, contrat de travail, congés, heures supplémentaires et cas particuliers : l’essentiel des règles, avec pour chaque article les textes officiels (Code du travail, Code général des impôts, CNSS, Bulletin officiel).</p>'
             f'{blocs}{AVERT}')
    (d / 'index.html').write_text(page('Réglementation de la paie au Maroc 2026', 'Les règles de la paie marocaine classées par thème, avec leurs sources officielles : SMIG, CNSS, AMO, IR, échéances, contrat, congés.', 'reglementation/', corps, site))
    return ['reglementation/'] + [f'reglementation/{a["slug"]}.html' for a in ARTICLES]


THEMES_ACCUEIL = [(a['theme'], a['titre'], a['slug']) for a in ARTICLES]
