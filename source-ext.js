/* ===== Extensions : e-BDS, SIMPL-IR, cabinet, espace client, arabe ===== */
const SITUATIONS = [['', 'Normale'], ['SO', 'SO — Sortant'], ['DE', 'DE — Décédé'], ['IT', 'IT — Maternité'], ['IL', 'IL — Maladie'], ['AT', 'AT — Accident du travail'], ['CS', 'CS — Congé sans solde'], ['MS', 'MS — Maintenu sans salaire'], ['MP', 'MP — Maladie professionnelle']];
const BDS_RANG = { SO: 1, DE: 2, IT: 3, IL: 4, AT: 5, CS: 6, MS: 7, MP: 8 };
const CLIENT_VIEWS = ['dashboard', 'bulletins', 'declarations', 'paiement'];
const DEFAULT_SIMPL = { tauxFp35: 'TPP.35.2023', tauxFp25: 'TPP.25.2023', exoTransport: 'IND_TRANSPORT', exoPanier: 'PRIME_PANIER', exoAutres: 'AUTRES_EXO', exoIdmaj: 'IND_STAGE', moyenDefaut: 'SIR' };
function cabinetInfo() { return Object.assign({ nom: 'RM Expertise', ville: 'Marrakech', telephone: '', email: '' }, Store.get('cabinet-info') || {}); }
function cabinetNom() { return cabinetInfo().nom || 'RM Expertise'; }
function simplCodes() { return Object.assign({}, DEFAULT_SIMPL, Store.get('simpl-codes') || {}); }

/* ---------- Format fixe e-BDS ---------- */
const asciiUp = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' ').toUpperCase();
const fA = (s, n) => asciiUp(s).slice(0, n).padEnd(n, ' ');
const fN = (v, n) => { const x = String(Math.max(0, Math.round(Number(v) || 0))); if (x.length > n) throw new Error('Valeur trop longue pour ' + n + ' chiffres : ' + x); return x.padStart(n, '0'); };
const cents = v => Math.round((Number(v) || 0) * 100);
function parsePreetabli(txt) {
  const lines = String(txt).split(/\r?\n/).map(l => l.replace(/\r$/, '')).filter(l => l.length >= 3);
  const out = { A00: null, A01: null, A02: [], A03: null };
  lines.forEach(l => {
    const t = l.slice(0, 3);
    if (t === 'A00') out.A00 = l; else if (t === 'A01') out.A01 = l; else if (t === 'A03') out.A03 = l;
    else if (t === 'A02') out.A02.push({ raw: l, aff: l.slice(3, 10), per: l.slice(10, 16), num: l.slice(16, 25), nom: l.slice(25, 85), enf: l.slice(85, 87), afP: l.slice(87, 93), afD: l.slice(93, 99), afN: l.slice(99, 105) });
  });
  if (!out.A00 || !out.A01) throw new Error('Fichier préétabli non reconnu (enregistrements A00/A01 absents).');
  out.identif = out.A00.slice(3, 17); out.aff = out.A01.slice(3, 10); out.periode = out.A01.slice(10, 16); out.raison = out.A01.slice(16, 56).trim();
  return out;
}
function genererBDS() {
  const o = per(); if (!o.preetabli) throw new Error('Importez d’abord le fichier préétabli du mois.');
  const pre = parsePreetabli(o.preetabli); const Pa = P(); const warns = [];
  const periode = S.period.replace('-', '');
  if (pre.periode !== periode) warns.push('Le préétabli porte sur la période ' + pre.periode + ' et la paie sur ' + periode + '.');
  const rows = calcAll(); const byNum = {};
  rows.forEach(x => { if (x.e.contrat === 'ANAPEC') warns.push((x.e.nom + ' ' + x.e.prenom) + ' : stagiaire Idmaj déclaré avec son indemnité ; vérifiez son traitement sur DAMANCOM (cotisations prises en charge).'); });
  rows.forEach(x => { const n = String(x.e.cnss || '').replace(/\D/g, ''); if (n.length === 9) byNum[n] = x; else warns.push((x.e.nom + ' ' + x.e.prenom) + ' : pas de n° CNSS valide, non déclaré dans le fichier (immatriculation à faire).'); });
  const aff = pre.aff, L = [];
  L.push('B00' + pre.identif.padEnd(14, '0').slice(0, 14) + 'B0' + ' '.repeat(241));
  L.push('B01' + pre.A01.slice(3).padEnd(257, ' ').slice(0, 257));
  const t3 = { nb: 0, enf: 0, afP: 0, afD: 0, afN: 0, num: 0, afR: 0, j: 0, reel: 0, plaf: 0, ctr: 0 }; const vus = new Set();
  pre.A02.forEach(a => {
    const x = byNum[a.num]; vus.add(a.num);
    const v = x ? ((o.vars || {})[x.e.id] || {}) : {};
    let sit = x ? (v.situationCnss || '') : 'SO';
    const jours = x && !sit ? Math.min(Pa.joursMois, x.r.joursDecl) : (x ? Math.min(Pa.joursMois, x.r.joursDecl) : 0);
    const reel = x ? cents(x.r.sbi) : 0; const plaf = x ? cents(Math.min(x.r.sbi, Pa.plafondCNSS)) : 0; const afR = 0;
    const ctr = Number(a.num) + afR + jours + reel + plaf + (BDS_RANG[sit] || 0);
    L.push('B02' + aff + periode + a.num + a.nom.padEnd(60).slice(0, 60) + a.enf + a.afP + a.afD + a.afN + fN(afR, 6) + fN(jours, 2) + fN(reel, 13) + fN(plaf, 9) + fA(sit, 2) + fN(ctr, 19) + ' '.repeat(104));
    t3.nb++; t3.enf += Number(a.enf) || 0; t3.afP += Number(a.afP) || 0; t3.afD += Number(a.afD) || 0; t3.afN += Number(a.afN) || 0; t3.num += Number(a.num); t3.afR += afR; t3.j += jours; t3.reel += reel; t3.plaf += plaf; t3.ctr += ctr;
    if (!x) warns.push('Assuré ' + a.num + ' (' + a.nom.trim() + ') présent dans le préétabli mais pas dans la paie : déclaré « SO » à 0 jour.');
  });
  L.push('B03' + aff + periode + fN(t3.nb, 6) + fN(t3.enf, 6) + fN(t3.afP, 12) + fN(t3.afD, 12) + fN(t3.afN, 12) + fN(t3.num, 15) + fN(t3.afR, 12) + fN(t3.j, 6) + fN(t3.reel, 15) + fN(t3.plaf, 13) + fN(t3.ctr, 19) + ' '.repeat(116));
  const t5 = { nb: 0, num: 0, j: 0, reel: 0, plaf: 0, ctr: 0 };
  Object.entries(byNum).filter(([n]) => !vus.has(n)).forEach(([n, x]) => {
    const jours = Math.min(Pa.joursMois, x.r.joursDecl), reel = cents(x.r.sbi), plaf = cents(Math.min(x.r.sbi, Pa.plafondCNSS));
    const ctr = Number(n) + jours + reel + plaf;
    L.push('B04' + aff + periode + n + fA((x.e.nom || '') + ' ' + (x.e.prenom || ''), 60) + fA(x.e.cin, 8) + fN(jours, 2) + fN(reel, 13) + fN(plaf, 9) + fN(ctr, 19) + ' '.repeat(124));
    t5.nb++; t5.num += Number(n); t5.j += jours; t5.reel += reel; t5.plaf += plaf; t5.ctr += ctr;
  });
  const tot = (t) => fN(t.nb, 6) + fN(t.num, 15) + fN(t.j, 6) + fN(t.reel, 15) + fN(t.plaf, 13) + fN(t.ctr, 19) + ' '.repeat(170);
  L.push('B05' + aff + periode + tot(t5));
  L.push('B06' + aff + periode + tot({ nb: t3.nb + t5.nb, num: t3.num + t5.num, j: t3.j + t5.j, reel: t3.reel + t5.reel, plaf: t3.plaf + t5.plaf, ctr: t3.ctr + t5.ctr }));
  L.forEach((l, i) => { if (l.length !== 260) throw new Error('Ligne ' + (i + 1) + ' : longueur ' + l.length + ' au lieu de 260.'); });
  return { txt: L.join('\n') + '\n', name: 'DS_' + aff + '_' + periode + '.txt', warns, nb: t3.nb + t5.nb, entrants: t5.nb, total: (t3.reel + t5.reel) / 100 };
}
function vBdsBlock() {
  const o = per(); let info = '<span class="muted small">Aucun préétabli importé pour ce mois.</span>';
  if (o.preetabli) { try { const p = parsePreetabli(o.preetabli); info = `<span class="small">Préétabli importé : <b>${esc(p.raison)}</b> · affilié ${esc(p.aff)} · période ${esc(p.periode)} · ${p.A02.length} assuré(s)</span>`; } catch (e) { info = '<span class="err small">' + esc(e.message) + '</span>'; } }
  return `<div class="bds adm"><div><b>Télédéclaration DAMANCOM (e-BDS)</b><div>${info}</div></div>
  <div class="row"><label class="btn">Importer le préétabli (.txt)<input type="file" id="preetabli" accept=".txt,text/plain" hidden></label><button class="btn primary" data-act="bdsGen" ${o.preetabli ? '' : 'disabled'}>Générer le fichier e-BDS</button></div>
  <p class="muted small">Téléchargez le préétabli du mois sur DAMANCOM, importez-le ici, puis déposez le fichier DS_… généré en mode EDI. Salariés absents de la paie : déclarés « SO ». Nouveaux salariés immatriculés : déclarés en entrants (B04). Situation particulière (maladie, maternité…) : à choisir dans « Variables du mois ».</p></div>`;
}

/* ---------- ZIP (stockage sans compression) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(); const parts = [], central = []; let off = 0;
  const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  files.forEach(f => {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
  });
  const csz = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)]);
}

/* ---------- XML SIMPL-IR (déclaration des traitements et salaires, ex-état 9421) ---------- */
const xe = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const x2 = v => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
function tag(n, v) { return v === '' || v == null ? `<${n}/>` : `<${n}>${xe(v)}</${n}>`; }
function sitFam(e) { const s = (e.situation || '').toLowerCase(); return s.startsWith('mari') ? 'M' : s.startsWith('divor') ? 'D' : s.startsWith('veu') ? 'V' : 'C'; }
function genererDTS(y) {
  const d = D(); const C = simplCodes(); const R = dtsRows(y); const warns = [];
  if (!R.length) throw new Error('Aucun mois validé sur ' + y + '.');
  if (!d.if) warns.push('Identifiant fiscal (IF) de la société manquant.');
  if (!d.communeCode) warns.push('Code commune Simpl-IR manquant (Paramètres > Société).');
  const pp = R.filter(x => x.e.contrat !== 'ANAPEC'), stg = R.filter(x => x.e.contrat === 'ANAPEC');
  const T = { bi: 0, ni: 0, ded: 0, ir: 0, sb: 0, si: 0, sr: 0, sn: 0 };
  const ppXml = pp.map(({ e, c, r }) => {
    const exo = r2((c.exo || 0) + (c.anapecExo || 0)); const cot = r2((c.cnss || 0) + (c.amo || 0) + (c.cimr || 0) + (c.mut || 0));
    const bi = r2((c.sbi || 0) - (c.anapecExo || 0)); const ded = r2((c.fp || 0) + cot);
    T.bi += bi; T.ni += c.sni; T.ded += ded; T.ir += c.ir;
    if (!e.cin) warns.push(e.nom + ' ' + e.prenom + ' : CIN manquante.');
    const exoList = [];
    if (exo > 0) exoList.push(`<ElementExonerePP>${tag('montantExonere', x2(exo))}<refNatureElementExonere>${tag('code', C.exoAutres)}</refNatureElementExonere></ElementExonerePP>`);
    return '<PersonnelPermanent>' + [tag('nom', e.nom), tag('prenom', e.prenom), tag('adressePersonnelle', e.adresse), tag('numCNI', e.cin), tag('numCE', ''), tag('numPPR', ''), tag('numCNSS', e.cnss), tag('ifu', ''),
      tag('salaireBaseAnnuel', x2(c.base)), tag('mtBrutTraitementSalaire', x2(c.brut)), tag('periode', c.jours), tag('mtExonere', x2(exo)), tag('mtEcheances', x2(0)), tag('nbrReductions', r.personnes),
      tag('mtIndemnite', x2(0)), tag('mtAvantages', x2(0)), tag('mtRevenuBrutImposable', x2(bi)), tag('mtFraisProfess', x2(c.fp)), tag('mtCotisationAssur', x2(cot)), tag('mtAutresRetenues', x2(0)),
      tag('mtRevenuNetImposable', x2(c.sni)), tag('mtTotalDeduction', x2(ded)), tag('irPreleve', x2(c.ir)), tag('casSportif', 'false'), tag('numMatriculeClt', e.matricule), tag('datePermis', ''), tag('dateAutorisation', ''),
      `<refSituationFamiliale>${tag('code', sitFam(e))}</refSituationFamiliale>`, `<refTaux>${tag('code', r.fpTaux === 35 ? C.tauxFp35 : C.tauxFp25)}</refTaux>`,
      exoList.length ? `<listElementsExonere>${exoList.join('')}</listElementsExonere>` : '<listElementsExonere/>'].join('') + '</PersonnelPermanent>';
  });
  const stgXml = stg.map(({ e, c }) => {
    const ret = r2((c.cnss || 0) + (c.amo || 0)); T.sb += c.brut; T.si += 0; T.sr += ret; T.sn += c.sni;
    return '<Stagiaire>' + [tag('nom', e.nom), tag('prenom', e.prenom), tag('adressePersonnelle', e.adresse), tag('numCNI', e.cin), tag('numCE', ''), tag('numCNSS', e.cnss), tag('ifu', ''),
      tag('mtBrutTraitementSalaire', x2(c.brut)), tag('mtBrutIndemnites', x2(0)), tag('mtRetenues', x2(ret)), tag('mtRevenuNetImposable', x2(c.sni)), tag('periode', c.jours)].join('') + '</Stagiaire>';
  });
  const vers = [];
  for (let m = 1; m <= 12; m++) {
    const p = y + '-' + String(m).padStart(2, '0'); const o = Store.get(perKey(p)); if (!o || !o.validated) continue;
    const ir = r2(Object.values(o.bulletins || {}).reduce((s, b) => s + (b.ir || 0), 0)); const pay = o.irPaiement || {};
    const dLast = pay.date || isoDate(new Date(Number(y), m + 1, 0));
    if (!pay.date) warns.push('Versement IR de ' + periodLabel(p) + ' : date de paiement non saisie (fin du mois suivant retenue).');
    vers.push(`<VersementTraitementSalaire>${tag('mois', m)}${tag('totalVersement', x2(ir))}${tag('dateDerniereVersment', dLast)}<listDetailPaiement><DetailPaiementTraitementSalaire>${tag('reference', pay.ref || '')}${tag('totalVerse', x2(ir))}${tag('principal', x2(ir))}${tag('penalite', x2(0))}${tag('majorations', x2(0))}${tag('dateVersement', dLast)}<refMoyenPaiement>${tag('code', pay.moyen || C.moyenDefaut)}</refMoyenPaiement>${tag('numQuittance', pay.quittance || '')}</DetailPaiementTraitementSalaire></listDetailPaiement></VersementTraitementSalaire>`);
  }
  const head = [tag('identifiantFiscal', d.if), tag('nom', ''), tag('prenom', ''), tag('raisonSociale', d.raison), tag('exerciceFiscalDu', y + '-01-01'), tag('exerciceFiscalAu', y + '-12-31'), tag('annee', y),
    `<commune>${tag('code', d.communeCode)}</commune>`, tag('adresse', [d.adresse, d.ville].filter(Boolean).join(' ')), tag('numeroCIN', ''), tag('numeroCNSS', d.cnss), tag('numeroCE', ''), tag('numeroRC', d.rc), tag('identifiantTP', d.tp),
    tag('numeroFax', ''), tag('numeroTelephone', d.telephone), tag('email', d.email), tag('effectifTotal', pp.length + stg.length), tag('nbrPersoPermanent', pp.length), tag('nbrPersoOccasionnel', 0), tag('nbrStagiaires', stg.length),
    tag('totalMtRevenuBrutImposablePP', x2(T.bi)), tag('totalMtRevenuNetImposablePP', x2(T.ni)), tag('totalMtTotalDeductionPP', x2(T.ded)), tag('totalMtIrPrelevePP', x2(T.ir)),
    tag('totalMtBrutSommesPO', x2(0)), tag('totalIrPrelevePO', x2(0)), tag('totalMtBrutTraitSalaireSTG', x2(T.sb)), tag('totalMtBrutIndemnitesSTG', x2(T.si)), tag('totalMtRetenuesSTG', x2(T.sr)), tag('totalMtRevenuNetImpSTG', x2(T.sn)),
    tag('totalSommePayeRTS', x2(0)), tag('totalmtAnuuelRevenuSalarial', x2(0)), tag('totalmtAbondement', x2(0)), tag('montantPermanent', x2(T.ir)), tag('montantOccasionnel', x2(0)), tag('montantStagiaire', x2(0)), tag('referenceDeclaration', '')].join('\n');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<TraitementEtSalaire xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="traitementSalaire.xsd">\n' + head + '\n' +
    (ppXml.length ? '<listPersonnelPermanent>\n' + ppXml.join('\n') + '\n</listPersonnelPermanent>' : '<listPersonnelPermanent/>') + '\n' +
    '<listPersonnelExonere5725/>\n<listPersonnelExonere/>\n<listPersonnelOccasionnel/>\n<listSalariesCFC/>\n' +
    (stgXml.length ? '<listStagiaires>\n' + stgXml.join('\n') + '\n</listStagiaires>' : '<listStagiaires/>') + '\n' +
    '<listBeneficiaires/>\n<listBeneficiairesPlanEpargne/>\n<listDoctorants/>\n' +
    (vers.length ? '<listVersements>\n' + vers.join('\n') + '\n</listVersements>' : '<listVersements/>') + '\n</TraitementEtSalaire>\n';
  return { xml, warns, name: 'DTS_' + slug(d.if || d.raison) + '_' + y + '.xml', nbPP: pp.length, nbStg: stg.length };
}
function versementsModal() {
  const y = S.period.slice(0, 4); const C = simplCodes(); let rows = '';
  for (let m = 1; m <= 12; m++) {
    const p = y + '-' + String(m).padStart(2, '0'); const o = Store.get(perKey(p)); if (!o || !o.validated) continue;
    const ir = r2(Object.values(o.bulletins || {}).reduce((s, b) => s + (b.ir || 0), 0)); const pay = o.irPaiement || {};
    rows += `<tr data-p="${p}"><td>${periodLabel(p)}</td><td class="n">${fmt(ir)}</td><td><input type="date" data-k="date" value="${esc(pay.date || '')}"></td><td><input data-k="ref" value="${esc(pay.ref || '')}" placeholder="Référence"></td><td><select data-k="moyen">${[['SIR', 'Télépaiement (SIR)'], ['CH', 'Chèque'], ['ES', 'Espèces']].map(([c, l]) => `<option value="${c}" ${(pay.moyen || C.moyenDefaut) === c ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><input data-k="quittance" value="${esc(pay.quittance || '')}" placeholder="N° quittance"></td></tr>`;
  }
  modal(`<h2>Versements IR ${y}</h2><p class="muted small">Date, référence et moyen de chaque versement mensuel, repris dans la rubrique « versements » du fichier SIMPL-IR.</p>
  ${rows ? `<div class="tw"><table class="vers"><thead><tr><th>Mois</th><th class="n">IR</th><th>Date</th><th>Référence</th><th>Moyen</th><th>Quittance</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Aucun mois validé.</p>'}
  <div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="versementsSave">Enregistrer</button></div>`);
}

/* ---------- Paramètres complémentaires ---------- */
function vParamsExtra() {
  const ci = cabinetInfo(); const C = simplCodes(); const d = D(); const esp = d && d.espace;
  return `${vTarifsParams()}<section class="card"><h2>Cabinet</h2><form id="cabf" class="fg">
  ${field('Nom du cabinet (affiché aux clients et sur les PDF)', 'nom', ci.nom)}${field('Ville', 'ville', ci.ville)}${field('Téléphone', 'telephone', ci.telephone)}${field('E-mail', 'email', ci.email)}
  </form><div class="row end"><button class="btn primary" data-act="cabSave">Enregistrer</button></div>
  <h3>Collaborateurs</h3><p class="small">Les dossiers, salariés et mois de paie sont dans un espace cabinet commun. Pour travailler à plusieurs, partagez cette application (bouton Partager de claude.ai) en donnant le rôle <b>Éditeur</b> à chaque collaborateur : il voit et modifie les mêmes dossiers. Ne donnez jamais ce rôle à un client. Une personne invitée hors de votre organisation garde ce rôle tant que l’application n’est pas partagée par lien public.</p></section>
  ${vUtilisateurs()}
  ${d ? `<section class="card"><h2>Espace client — ${esc(d.raison)}</h2>
  <p class="small">Le client se connecte avec un identifiant et un mot de passe pour consulter ses bulletins, états CNSS et IR, livre de paie et paiements des mois validés, au nom de ${esc(ci.nom)}. Il ne voit aucun autre dossier. Les données publiées sont chiffrées avec son mot de passe : sans lui, elles sont illisibles.</p>
  <form id="espf" class="fg">${field('Identifiant du client', 'ident', esp ? esp.ident : slug(d.raison).toLowerCase().replace(/_/g, '-').slice(0, 24))}${field('Mot de passe', 'pwd', esp ? esp.pwd : genPwd())}</form>
  ${esp ? `<p class="muted small">Espace actif. Dernière publication : ${esp.publishedAt ? dFr(isoDate(new Date(esp.publishedAt))) + ' à ' + new Date(esp.publishedAt).toTimeString().slice(0, 5) : '—'}. Republiez après chaque validation de mois.</p>` : ''}
  <div class="row"><button class="btn primary" data-act="espacePub" ${Store.mode === 'cloud' ? '' : 'disabled'}>${esp ? 'Republier les données' : 'Créer l’espace client'}</button>${esp ? '<button class="btn" data-act="copyCode">Copier les identifiants</button><button class="btn danger" data-act="espaceDel">Supprimer l’espace</button>' : ''}</div>
  ${Store.mode === 'cloud' ? '' : '<p class="err small">Disponible uniquement dans l’application en ligne sur claude.ai.</p>'}
  <p class="muted small">Pour donner l’accès : partagez cette application avec le client en <b>Lecteur</b> (invitation par e-mail), puis transmettez-lui son identifiant et son mot de passe par un autre canal (téléphone, WhatsApp). Changer le mot de passe puis republier coupe l’ancien accès.</p></section>` : ''}
  <section class="card"><h2>Codes Simpl-IR</h2><p class="muted small">Codes des référentiels DGI utilisés dans le fichier XML. Vérifiez-les dans les référentiels publiés par la DGI et corrigez-les ici si un dépôt est rejeté.</p><form id="simplf" class="fg">
  ${field('Taux frais pro. 35 %', 'tauxFp35', C.tauxFp35)}${field('Taux frais pro. 25 %', 'tauxFp25', C.tauxFp25)}${field('Nature des éléments exonérés', 'exoAutres', C.exoAutres)}${field('Moyen de paiement par défaut', 'moyenDefaut', C.moyenDefaut, { type: 'select', options: [['SIR', 'SIR — télépaiement'], ['CH', 'CH — chèque'], ['ES', 'ES — espèces']] })}
  </form><div class="row end"><button class="btn" data-act="simplReset">Valeurs par défaut</button><button class="btn primary" data-act="simplSave">Enregistrer</button></div></section>`;
}

/* ---------- Espace client chiffré ---------- */
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() { const b = crypto.getRandomValues(new Uint8Array(20)); let s = ''; for (let i = 0; i < 20; i++) { s += CODE_ALPHA[b[i] % 32]; if (i % 5 === 4 && i < 19) s += '-'; } return s; }
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function sha256hex(s) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
const normIdent = x => String(x || '').trim().toLowerCase();
async function espaceId(ident) { return 'u' + (await sha256hex('rmpaie-espace-id:' + normIdent(ident))).slice(0, 40); }
async function espaceKey(ident, pwd, id) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normIdent(ident) + '\u0000' + String(pwd)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new TextEncoder().encode('rmpaie:' + id), iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function genPwd() {
  const G = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%&*?-+'], T = G.join(''), r = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const c = G.map(g => g[r(g.length)]); while (c.length < 14) c.push(T[r(T.length)]);
  for (let i = c.length - 1; i > 0; i--) { const j = r(i + 1); [c[i], c[j]] = [c[j], c[i]]; } return c.join('');
}
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function gz(u8, inverse) {
  if (typeof CompressionStream === 'undefined') return { data: u8, gz: false };
  const st = new Blob([u8]).stream().pipeThrough(inverse ? new DecompressionStream('gzip') : new CompressionStream('gzip'));
  return { data: new Uint8Array(await new Response(st).arrayBuffer()), gz: true };
}
async function espacePublier() {
  const d = D(); const db = Store.db; if (!db) throw new Error('Stockage en ligne indisponible.');
  const f = formData($('#espf')); const ident = normIdent(f.ident), pwd = String(f.pwd || '');
  if (!/^[a-z0-9._-]{3,40}$/.test(ident)) throw new Error('Identifiant : 3 à 40 caractères, lettres, chiffres, point, tiret.');
  { const m = mdpFaible(pwd, ident); if (m) throw new Error(m); }
  if (dossiers().some(x => x.id !== d.id && x.espace && x.espace.ident === ident)) throw new Error('Cet identifiant est déjà utilisé par un autre dossier.');
  const esp = d.espace || {}; const id = await espaceId(ident);
  if (esp.ident && esp.ident !== ident) { try { await espaceSupprimer(); } catch (e) { } }
  const limite = periodShift(todayPeriod(), -24); const docs = {}; const dd = clone(d); delete dd.espace; docs['dos-' + d.id] = dd;
  Store.keys('per-' + d.id + '-').forEach(k => { const o = Store.get(k); if (o.validated && o.period >= limite) { const c = clone(o); delete c.preetabli; delete c.pointage; docs[k] = c; } });
  const payload = { v: 1, cabinet: cabinetInfo(), params: P(), dossierId: d.id, docs, at: Date.now() };
  const z = await gz(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await espaceKey(ident, pwd, id); const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, z.data)));
  const CH = 180000; const n = Math.ceil(ct.length / CH); const col = db.collection('espaces');
  const old = esp.chunks || 0;
  for (let i = 0; i < n; i++) await col.doc(id + '-' + i).set({ d: ct.slice(i * CH, (i + 1) * CH) });
  await col.doc(id).set({ v: 1, n, iv: b64(iv), gz: z.gz, at: Date.now() });
  for (let i = n; i < old; i++) { try { await col.doc(id + '-' + i).delete(); } catch (e) { } }
  d.espace = { ident, pwd, publishedAt: Date.now(), chunks: n }; saveD(d);
  return Object.keys(docs).length - 1;
}
async function espaceSupprimer() {
  const d = D(); const esp = d.espace; if (!esp || !esp.ident) { if (d.espace) { delete d.espace; saveD(d); } return; } const id = await espaceId(esp.ident); const col = Store.db.collection('espaces');
  for (let i = 0; i < (esp.chunks || 1); i++) { try { await col.doc(id + '-' + i).delete(); } catch (e) { } }
  await col.doc(id).delete(); delete d.espace; saveD(d);
}
async function espaceOuvrir(ident, pwd) {
  const db = Store.rawDb; if (!db) throw new Error('Connexion indisponible. Ouvrez ce lien depuis claude.ai en étant connecté.');
  const id = await espaceId(ident); const col = db.collection('espaces');
  const head = await col.doc(id).get(); if (!head.exists) throw new Error('Identifiant ou mot de passe incorrect.');
  const h = head.data(); let ct = '';
  for (let i = 0; i < h.n; i++) { const c = await col.doc(id + '-' + i).get(); if (!c.exists) throw new Error('Espace incomplet : demandez une nouvelle publication au cabinet.'); ct += c.data().d; }
  const key = await espaceKey(ident, pwd, id); let plain;
  try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(h.iv) }, key, unb64(ct))); } catch (e) { throw new Error('Identifiant ou mot de passe incorrect.'); }
  if (h.gz) plain = (await gz(plain, true)).data;
  const payload = JSON.parse(new TextDecoder().decode(plain));
  Store.docs = {}; Object.entries(payload.docs).forEach(([k, v]) => Store.docs[k] = v);
  Store.docs['params'] = payload.params; Store.docs['cabinet-info'] = payload.cabinet;
  S.dossierId = payload.dossierId;
  const ps = Object.keys(payload.docs).filter(k => k.startsWith('per-')).map(k => payload.docs[k].period).sort();
  if (ps.length) S.period = ps[ps.length - 1];
  S.view = 'dashboard'; S.auth = { type: 'client', ident: normIdent(ident) };
}
function vClientLogin() {
  const setup = !S.client && !utilisateurs().length;
  return `<div class="login"><div class="lb">${esc(cabinetNom())}</div><h1>${setup ? 'Première connexion' : 'Connexion'}</h1>
  <p class="muted">${setup ? 'Créez l’identifiant et le mot de passe administrateur du cabinet. Ils vous seront demandés à chaque ouverture.' : S.client ? 'Saisissez l’identifiant et le mot de passe transmis par votre cabinet.' : 'Accédez à votre espace de travail.'}</p>
  <form id="loginf" class="fg">${field('Identifiant', 'ident', '', { full: true })}${field('Mot de passe', 'pwd', '', { type: 'password', full: true })}${setup ? field('Confirmez le mot de passe', 'pwd2', '', { type: 'password', full: true }) : ''}</form>
  <div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="clientLogin" data-setup="${setup ? 1 : ''}">${setup ? 'Créer et entrer' : 'Se connecter'}</button></div><p id="loginerr" class="err small"></p></div>`;
}
/* ---------- Actions supplémentaires ---------- */
Object.assign(ACT, {
  bdsGen: () => {
    try {
      const g = genererBDS(); saveFile(g.name, g.txt);
      if (g.warns.length) modal(`<h2>Fichier ${esc(g.name)}</h2><p>${g.nb} assuré(s) déclaré(s), dont ${g.entrants} entrant(s), pour ${fmt(g.total)} DH de salaires.</p><ul class="alerts">${g.warns.map(w => `<li class="warn">${esc(w)}</li>`).join('')}</ul><div class="row end"><button class="btn primary" data-act="closeModal">Compris</button></div>`);
    } catch (e) { toast(e.message, 'err'); }
  },
  dtsXml: () => {
    try {
      const y = S.period.slice(0, 4); const g = genererDTS(y);
      saveFile(g.name.replace(/\.xml$/, '') + '.zip', makeZip([{ name: g.name, data: g.xml }]));
      modal(`<h2>Déclaration des traitements et salaires ${y}</h2><p>${g.nbPP} salarié(s) permanent(s) et ${g.nbStg} stagiaire(s). Le fichier XML est livré dans une archive .zip : décompressez-la puis déposez le XML sur Simpl-IR en mode EDI.</p>
      ${g.warns.length ? '<ul class="alerts">' + g.warns.map(w => `<li class="warn">${esc(w)}</li>`).join('') + '</ul>' : ''}
      <p class="muted small">Structure conforme à l’exemple DGI (cahier des charges EDI DTS). La DGI ne publie pas de schéma de validation : faites un premier dépôt test et, en cas de rejet, corrigez les codes dans Paramètres > Codes Simpl-IR.</p>
      <div class="row end"><button class="btn primary" data-act="closeModal">Compris</button></div>`);
    } catch (e) { toast(e.message, 'err'); }
  },
  versementsIr: () => versementsModal(),
  versementsSave: () => {
    $$('#modal-body tr[data-p]').forEach(tr => { const o = Store.get(perKey(tr.dataset.p)); if (!o) return; o.irPaiement = {}; $$('[data-k]', tr).forEach(i => o.irPaiement[i.dataset.k] = i.value); Store.put(perKey(tr.dataset.p), o); });
    closeModal(); toast('Versements enregistrés.');
  },
  cabSave: () => { Store.put('cabinet-info', formData($('#cabf'))); render(); toast('Cabinet enregistré.'); },
  simplSave: () => { Store.put('simpl-codes', formData($('#simplf'))); toast('Codes enregistrés.'); },
  simplReset: () => { Store.put('simpl-codes', clone(DEFAULT_SIMPL)); render(); },
  espacePub: async t => {
    t.disabled = true; t.textContent = 'Publication…';
    try { const n = await espacePublier(); render(); toast('Espace client publié : ' + n + ' mois validé(s).'); } catch (e) { toast('Publication impossible : ' + (e.message || e.code), 'err'); t.disabled = false; }
  },
  espaceDel: () => modal(`<h2>Supprimer l’espace client ?</h2><p>Le code actuel ne fonctionnera plus. Vous pourrez créer un nouvel espace avec un nouveau code.</p><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn danger" data-act="espaceDelOk">Supprimer</button></div>`),
  espaceDelOk: async () => { try { await espaceSupprimer(); closeModal(); render(); toast('Espace client supprimé.'); } catch (e) { toast('Suppression impossible.', 'err'); } },
  copyCode: async () => { const e = D().espace; try { await navigator.clipboard.writeText('Espace paie ' + cabinetNom() + '\nIdentifiant : ' + e.ident + '\nMot de passe : ' + e.pwd); toast('Identifiants copiés.'); } catch (e) { toast('Copie impossible : recopiez le code affiché.', 'warn'); } },
  clientLogin: async t => {
    const f = formData($('#loginf')); const err = $('#loginerr'); err.textContent = '';
    if (!f.ident.trim() || !f.pwd) { err.textContent = tr('Saisissez l’identifiant et le mot de passe.'); return; }
    const lbl = t.textContent; t.disabled = true; t.textContent = tr('Connexion…');
    try {
      if (S.client) await espaceOuvrir(f.ident, f.pwd);
      else if (t.dataset.setup) await creerAdmin(f.ident, f.pwd, f.pwd2);
      else await connexionCabinet(f.ident, f.pwd);
      closeModal(); render();
    } catch (e) { err.textContent = tr(e.message); t.disabled = false; t.textContent = lbl; }
  },
  lang: () => { LANG = LANG === 'ar' ? 'fr' : 'ar'; try { localStorage.setItem('rmpaie-lang', LANG); } catch (e) { } applyLangAttrs(); render(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'preetabli') {
    const f = t.files[0]; if (!f) return;
    f.arrayBuffer().then(buf => {
      const txt = new TextDecoder('latin1').decode(buf);
      try { const p = parsePreetabli(txt); const o = per(); o.preetabli = txt; savePer(o); render(); toast('Préétabli importé : ' + p.A02.length + ' assuré(s).'); }
      catch (er) { toast(er.message, 'err'); }
    });
  }
  if (t.dataset && t.dataset.var === 'situationCnss') { const o = per(); o.vars[t.dataset.emp] = o.vars[t.dataset.emp] || {}; o.vars[t.dataset.emp].situationCnss = t.value; savePer(o); }
});

/* ---------- Version arabe (interface) ---------- */
let LANG = 'fr';
const AR = {
  'Tableau de bord': 'لوحة القيادة', 'Salariés': 'الأجراء', 'Variables du mois': 'متغيرات الشهر', 'Bulletins': 'أوراق الأداء', 'Déclarations': 'التصريحات', 'Paiement': 'الأداء', 'Documents RH': 'وثائق الموارد البشرية', 'Sortie': 'مغادرة الأجير', 'Simulateur': 'المحاكي', 'Paramètres': 'الإعدادات',
  'Brouillon': 'مسودة', 'Validé': 'مصادق عليه', 'Enregistré en ligne': 'محفوظ عبر الإنترنت', 'Enregistré sur cet appareil': 'محفوظ على هذا الجهاز', 'Enregistrement…': 'جارٍ الحفظ…', 'Erreur d’enregistrement': 'خطأ في الحفظ', 'Espace client (lecture seule)': 'فضاء الزبون (قراءة فقط)',
  'PAIE MAROCAINE · RM EXPERTISE': 'الأداء بالمغرب · RM EXPERTISE',
  'Effectif': 'عدد الأجراء', 'Masse salariale brute': 'الكتلة الأجرية الإجمالية', 'Net à payer': 'الصافي المستحق', 'NET À PAYER': 'الصافي المستحق', 'CNSS + AMO à déclarer': 'الضمان الاجتماعي والتأمين عن المرض للتصريح', 'Avant le 10 du mois suivant': 'قبل 10 من الشهر الموالي', 'IR retenu': 'الضريبة على الدخل المقتطعة', 'Coût employeur': 'كلفة المشغل',
  'Contrôles avant validation': 'المراقبة قبل المصادقة', 'Aucune anomalie détectée pour ce mois.': 'لم يتم رصد أي خلل هذا الشهر.', 'Rouvrir le mois': 'إعادة فتح الشهر', 'Saisir les variables': 'إدخال المتغيرات', 'Échéances': 'الآجال',
  '+ Ajouter un salarié': '+ إضافة أجير', 'Modifier': 'تعديل', 'Actif': 'نشيط', 'Aucun salarié. Ajoutez le premier.': 'لا يوجد أجراء. أضف الأول.', 'Mat.': 'الرقم', 'Nom': 'الاسم', 'Prénom': 'النسب', 'Fonction': 'الوظيفة', 'Contrat': 'العقد', 'Embauche': 'التشغيل', 'Salaire de base': 'الأجر الأساسي', 'Statut': 'الوضعية', 'Salarié': 'الأجير',
  'Brut': 'الإجمالي', 'CNSS+AMO': 'الضمان + التأمين عن المرض', 'IR': 'الضريبة على الدخل', 'Net': 'الصافي', 'Coût': 'الكلفة', 'Total': 'المجموع', 'Voir': 'عرض', 'Totaux': 'المجاميع',
  'Absences (j)': 'الغياب (يوم)', 'Congés pris (j)': 'العطل المأخوذة (يوم)', 'HS 25 % (h)': 'ساعات إضافية 25%', 'HS 50 % (h)': 'ساعات إضافية 50%', 'HS 100 % (h)': 'ساعات إضافية 100%', 'Prime du mois': 'منحة الشهر', 'Autres imposables': 'عناصر أخرى خاضعة', 'Transport': 'النقل', 'Panier': 'منحة السلة', 'Indemn. non imposables': 'تعويضات معفاة', 'Avance': 'تسبيق', 'Remb. prêt': 'سداد قرض',
  'Pointage jour par jour': 'التنقيط اليومي', 'Voir le bulletin': 'عرض ورقة الأداء', 'Contrôler et valider le mois': 'مراقبة الشهر والمصادقة عليه', 'Situation CNSS': 'الوضعية لدى الضمان الاجتماعي', 'Normale': 'عادية', 'Aucun salarié actif sur ce mois.': 'لا يوجد أجير نشيط هذا الشهر.',
  'Tous les bulletins (PDF)': 'جميع أوراق الأداء (PDF)', 'Livre de paie (PDF)': 'سجل الأداء (PDF)', 'Livre de paie (CSV)': 'سجل الأداء (CSV)', 'Registre du personnel': 'سجل المستخدمين', 'Télécharger le PDF': 'تحميل PDF', 'Fermer': 'إغلاق', 'Bulletin de paie': 'ورقة الأداء',
  'Bordereaux CNSS / AMO (PDF)': 'جداول الضمان الاجتماعي (PDF)', 'Données (CSV)': 'المعطيات (CSV)', 'Salaires déclarés': 'الأجور المصرح بها', 'Base plafonnée': 'الأساس المسقف', 'Prestations sociales (13,46 %)': 'التعويضات الاجتماعية (13,46%)', 'Allocations familiales': 'التعويضات العائلية', 'AMO (6,37 %)': 'التأمين الإجباري عن المرض (6,37%)', 'TFP': 'رسم التكوين المهني', 'Total à payer CNSS': 'المجموع الواجب أداؤه',
  'N° CNSS': 'رقم الضمان الاجتماعي', 'Jours': 'الأيام', 'Salaire réel': 'الأجر الحقيقي', 'Salaire plafonné': 'الأجر المسقف', 'IR — état mensuel': 'الضريبة على الدخل — البيان الشهري', 'État IR (PDF)': 'بيان الضريبة (PDF)', 'État IR (CSV)': 'بيان الضريبة (CSV)', 'CIN': 'ب.و.ت', 'Brut imposable': 'الإجمالي الخاضع', 'Frais pro.': 'المصاريف المهنية', 'Cotisations': 'الاشتراكات', 'Net imposable': 'الصافي الخاضع', 'Déd.': 'الخصوم', 'Total IR à verser': 'مجموع الضريبة الواجب دفعها',
  'Fichier XML SIMPL-IR': 'ملف XML لمنصة SIMPL-IR', 'Versements IR': 'دفعات الضريبة على الدخل', 'Récapitulatif (CSV)': 'الملخص (CSV)', 'Récapitulatif (PDF)': 'الملخص (PDF)', 'Télédéclaration DAMANCOM (e-BDS)': 'التصريح الإلكتروني DAMANCOM (e-BDS)', 'Importer le préétabli (.txt)': 'استيراد الملف المعد مسبقا (.txt)', 'Générer le fichier e-BDS': 'إنشاء ملف e-BDS', 'Aucun préétabli importé pour ce mois.': 'لم يتم استيراد أي ملف معد مسبقا لهذا الشهر.',
  'Lettre de virement (PDF)': 'أمر بالتحويل (PDF)', 'État des paiements (CSV)': 'بيان الأداءات (CSV)', 'Virement': 'تحويل', 'Chèque': 'شيك', 'Espèces': 'نقدا', 'Mode': 'الطريقة', 'Banque': 'البنك', 'RIB': 'رقم الحساب', 'Écriture comptable de paie (journal OD)': 'القيد المحاسبي للأجور', 'Exporter (CSV)': 'تصدير (CSV)', 'Compte': 'الحساب', 'Intitulé': 'البيان', 'Débit': 'مدين', 'Crédit': 'دائن',
  'Générer le PDF': 'إنشاء PDF', 'Document': 'الوثيقة', 'Signataire (nom et qualité)': 'الموقع (الاسم والصفة)', 'Fait à': 'حرر في', 'Attestation de travail': 'شهادة العمل', 'Attestation de salaire': 'شهادة الأجر', 'Contrat de travail CDI': 'عقد شغل غير محدد المدة', 'Contrat de travail CDD': 'عقد شغل محدد المدة', 'Avenant au contrat': 'ملحق العقد', 'Certificat de travail': 'شهادة الشغل',
  'Solde de tout compte': 'تصفية كل حساب', 'Date de sortie': 'تاريخ المغادرة', 'Motif': 'السبب', 'Démission': 'استقالة', 'Licenciement': 'فصل', 'Fin de CDD': 'انتهاء العقد محدد المدة', 'Reporter sur la paie': 'ترحيل إلى الأجر', 'Certificat de travail (PDF)': 'شهادة الشغل (PDF)', 'Reçu pour solde de tout compte (PDF)': 'توصيل تصفية كل حساب (PDF)', 'Ancienneté': 'الأقدمية', 'Autres sommes': 'مبالغ أخرى',
  'Sens du calcul': 'اتجاه الحساب', 'Brut → Net': 'من الإجمالي إلى الصافي', 'Net → Brut': 'من الصافي إلى الإجمالي', 'Montant mensuel (DH)': 'المبلغ الشهري (درهم)', 'Ancienneté (années)': 'الأقدمية (سنوات)', 'Personnes à charge (0 à 6)': 'الأشخاص المتكفل بهم (0-6)', 'CIMR salarié (%)': 'CIMR الأجير (%)', 'Indemnités non imposables': 'تعويضات معفاة', 'Salaire brut': 'الأجر الإجمالي',
  'Enregistrer': 'حفظ', 'Annuler': 'إلغاء', 'Supprimer': 'حذف', 'Terminé': 'تم', 'Compris': 'مفهوم', 'Créer': 'إنشاء', 'Sauvegarde': 'النسخ الاحتياطي', 'Exporter la sauvegarde (JSON)': 'تصدير النسخة الاحتياطية', 'Importer une sauvegarde': 'استيراد نسخة احتياطية', 'Cabinet': 'المكتب', 'Collaborateurs': 'المتعاونون', 'Codes Simpl-IR': 'رموز Simpl-IR', 'Valeurs par défaut': 'القيم الافتراضية', 'Enregistrer les taux': 'حفظ النسب', 'Revenir aux valeurs 2026': 'العودة إلى قيم 2026',
  'Espace client': 'فضاء الزبون', 'Code d’accès': 'رمز الولوج', 'Ouvrir mon espace': 'فتح فضائي', 'Ouverture…': 'جارٍ الفتح…', 'Code incomplet.': 'الرمز غير مكتمل.', 'Code d’accès incorrect.': 'رمز الولوج غير صحيح.', 'Code d’accès inconnu ou espace supprimé.': 'رمز غير معروف أو فضاء محذوف.', 'Copier': 'نسخ', 'Créer l’espace client': 'إنشاء فضاء الزبون', 'Republier les données': 'إعادة نشر المعطيات', 'Supprimer l’espace': 'حذف الفضاء',
  'Saisissez le code d’accès transmis par votre cabinet pour consulter vos bulletins de paie et vos déclarations.': 'أدخل رمز الولوج الذي سلمه لك مكتبك للاطلاع على أوراق الأداء والتصريحات.',
  'Bienvenue dans RM Paie': 'مرحبا بكم في RM Paie', 'Créer un dossier': 'إنشاء ملف', 'Charger un dossier de démonstration': 'تحميل ملف تجريبي', 'Nouveau dossier': 'ملف جديد', '+ Nouveau dossier…': '+ ملف جديد…', 'Aucun dossier': 'لا يوجد ملف', 'Chargement de vos dossiers…': 'جارٍ تحميل ملفاتكم…',
  'Identité': 'الهوية', 'Rémunération': 'الأجرة', 'Famille et paiement': 'الأسرة والأداء', 'Nouveau salarié': 'أجير جديد', 'Modifier salarié': 'تعديل الأجير', 'Mois': 'الشهر', 'Date': 'التاريخ', 'Référence': 'المرجع', 'Moyen': 'الوسيلة', 'Quittance': 'الوصل',
  'Rubrique': 'البند', 'Base': 'الأساس', 'Taux': 'النسبة', 'Gains': 'المستحقات', 'Retenues': 'الاقتطاعات', 'Part pat.': 'حصة المشغل', 'SALAIRE BRUT': 'الأجر الإجمالي', 'Charges patronales': 'تكاليف المشغل'
};
const AR_MOIS = { 'Janvier': 'يناير', 'Février': 'فبراير', 'Mars': 'مارس', 'Avril': 'أبريل', 'Mai': 'ماي', 'Juin': 'يونيو', 'Juillet': 'يوليوز', 'Août': 'غشت', 'Septembre': 'شتنبر', 'Octobre': 'أكتوبر', 'Novembre': 'نونبر', 'Décembre': 'دجنبر' };
const AR_RX = [
  [/^Valider (.+)$/, 'المصادقة على $1'], [/^Variables — (.+)$/, 'متغيرات $1'], [/^Bulletins — (.+)$/, 'أوراق الأداء — $1'], [/^CNSS — (.+)$/, 'الضمان الاجتماعي — $1'],
  [/^État des paiements — (.+)$/, 'بيان الأداءات — $1'], [/^Salariés \((\d+)\)$/, 'الأجراء ($1)'], [/^Simulateur de salaire (\d+)$/, 'محاكي الأجر $1'], [/^Taux et barèmes (\d+)$/, 'النسب والجداول $1'],
  [/^Société — (.+)$/, 'الشركة — $1'], [/^Espace client — (.+)$/, 'فضاء الزبون — $1'], [/^Pointage — (.+)$/, 'التنقيط — $1'], [/^Déclaration annuelle des traitements et salaires (\d+) \(état 9421\)$/, 'التصريح السنوي بالأجور $1 (9421)'],
  [/^(\d+) salarié\(s\)$/, '$1 أجير']
];
function tr(s) {
  if (LANG !== 'ar' || !s) return s;
  const t = String(s).trim(); if (AR[t]) return String(s).replace(t, AR[t]);
  for (const [rx, rep] of AR_RX) if (rx.test(t)) return String(s).replace(t, t.replace(rx, rep)).replace(/(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)/g, m => AR_MOIS[m]);
  return String(s).replace(/\b(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)(?= \d{4})/g, m => AR_MOIS[m]);
}
function translateDOM(root) {
  if (LANG !== 'ar' || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(n => { if (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) return; const v = n.nodeValue; if (!v.trim()) return; const t = tr(v); if (t !== v) n.nodeValue = t; });
  $$('[placeholder],[title]', root).forEach(el => { ['placeholder', 'title'].forEach(a => { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }); });
}
function applyLangAttrs() {
  document.documentElement.lang = LANG; document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  const b = $('#langbtn'); if (b) b.textContent = LANG === 'ar' ? 'Français' : 'العربية';
}
function initLang() {
  try { LANG = localStorage.getItem('rmpaie-lang') === 'ar' ? 'ar' : 'fr'; } catch (e) { }
  const b = document.createElement('button'); b.id = 'langbtn'; b.className = 'langbtn'; b.dataset.act = 'lang'; $('.ctl').appendChild(b); applyLangAttrs();
}
function afterRender() {
  if (S.view === 'rh') rhMajChamps();
  majBoutonAuth(); const sel0 = $('#dossier-sel'); if (sel0) sel0.style.display = S.auth ? '' : 'none';
  if (S.client) { const el = $('#sync'); if (el) el.textContent = 'Espace client (lecture seule)'; const sel = $('#dossier-sel'); if (sel && !S.dossierId) sel.style.display = 'none'; else if (sel) sel.style.display = ''; }
  translateDOM(document.querySelector('header')); translateDOM($('#main'));
}

/* ---------- Page de présentation et tarifs ---------- */
const DEFAULT_TARIFS = { t1: 25, t2: 22, t3: 18, t4: 15, minimum: 99, cabinet: 15, cabinetMin: 490, carte: 39, essai: 7, moisOfferts: 2, offre: 'Offre de lancement : 3 mois offerts sur l’abonnement annuel souscrit avant le 31 mars 2027.', whatsapp: '', email: 'contact@rmpaie.ma' };
let PUB = null; const PZ = { n: 10, annuel: false };
function tarifs() { return Object.assign({}, DEFAULT_TARIFS, PUB || Store.get('public-tarifs') || {}); }
async function chargerTarifs() { try { if (Store.rawDb) { const d = await Store.rawDb.doc('public/tarifs').get(); if (d.exists) PUB = clone(d.data()); } } catch (e) { } }
function pzCalc() {
  const T = tarifs(); const n = PZ.n;
  const tr = [[20, T.t1, '1 à 20'], [50, T.t2, '21 à 50'], [200, T.t3, '51 à 200'], [Infinity, T.t4, '201 et +']];
  const t = tr.find(x => n <= x[0]); const brut = Math.max(num(T.minimum), n * t[1]); const mois = PZ.annuel ? brut * (12 - num(T.moisOfferts)) / 12 : brut;
  return { tr, t, brut, mois, f: v => fmt(v, 0) };
}
function pzHtml() {
  const T = tarifs(); const c = pzCalc();
  return `<div class="pz-price"><span class="pz-big">${c.f(c.mois)} DH</span><span>HT / mois${PZ.annuel ? ', facturé ' + c.f(c.brut * (12 - num(T.moisOfferts))) + ' DH HT par an' : ''}</span></div>
  <div class="muted">${PZ.n} salarié${PZ.n > 1 ? 's' : ''} × ${c.t[1]} DH${PZ.n * c.t[1] < num(T.minimum) ? ' (minimum ' + T.minimum + ' DH appliqué)' : ''} · soit ${c.f(c.mois * 1.2)} DH TTC par mois</div>
  <div class="pz-tr">${c.tr.map(x => `<div class="${x === c.t ? 'on' : ''}"><small>${x[2]}</small><b>${x[1]} DH</b><small>/ salarié / mois</small></div>`).join('')}</div>`;
}
const ICO = p => `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0e7c66" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
function vPresentation(visiteur) {
  const T = tarifs(); const ci = cabinetInfo();
  const contactWa = T.whatsapp ? `<a class="btn primary lg" href="https://wa.me/${esc(String(T.whatsapp).replace(/\D/g, ''))}">WhatsApp · ${esc(T.whatsapp)}</a>` : '';
  const contactMail = T.email ? `<a class="btn ghost lg" href="mailto:${esc(T.email)}">${esc(T.email)}</a><span class="small" style="color:#c9d4e3">${esc(T.email)}</span>` : '';
  const cta = visiteur ? `<button class="btn gold lg" data-act="login">Connexion à mon espace</button>` : '';
  const F = [
    [ICO('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>'), 'Bulletins justes', 'Ancienneté, heures supplémentaires, primes, indemnités exonérées dans leurs plafonds, CIMR, mutuelle. IR régularisé sur le cumul annuel. Bulletins PDF et livre de paie.'],
    [ICO('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>'), 'Fichiers officiels prêts', 'Fichier e-BDS au format DAMANCOM généré depuis votre préétabli, XML des traitements et salaires pour SIMPL-IR, états IR et bordereaux CNSS / AMO.'],
    [ICO('<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>'), 'Contrôles avant validation', 'Alerte si un salaire passe sous le SMIG, si un n° CNSS, une CIN ou un RIB manque, ou si un net s’écarte trop du mois précédent.'],
    [ICO('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'), 'Échéances rappelées', 'CNSS avant le 10, versement de l’IR, fins de CDD et de période d’essai, fin d’exonération ANAPEC, paliers d’ancienneté.'],
    [ICO('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 11h5M18.5 8.5v5"/>'), 'Stagiaires ANAPEC (Idmaj)', 'Exonérations d’IR, de CNSS et de TFP appliquées automatiquement, AMO prise en charge par l’État, prolongations après l’embauche en CDI.'],
    [ICO('<path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6"/><path d="M8 14h8M8 18h8"/>'), 'Documents RH et sorties', 'Contrats CDI et CDD, avenants, attestations de travail et de salaire, certificat de travail, solde de tout compte avec indemnité de licenciement.'],
    [ICO('<path d="M3 10h18"/><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h4"/>'), 'Pointage et paiement', 'Pointage jour par jour, ordre de virement, état des paiements et écriture comptable de paie au plan comptable CGNC.'],
    [ICO('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'), 'Partout, en français et en arabe', 'Sur ordinateur et téléphone, sans installation. Interface disponible en arabe.'],
    [ICO('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'), 'Simulateur de salaire', 'Du brut au net ou du net au brut, avec le coût employeur.']
  ];
  const Q = [
    ['Les taux 2026 sont-ils à jour ?', 'Oui : SMIG à 17,92 DH de l’heure, barème de l’IR, frais professionnels, déduction de 600 DH par personne à charge, plafond CNSS de 6 000 DH. Les taux sont mis à jour à chaque changement légal, sans action de votre part.'],
    ['Le logiciel dépose-t-il à ma place sur DAMANCOM et SIMPL ?', 'Non. RM Paie prépare les fichiers au bon format (e-BDS pour DAMANCOM, XML pour SIMPL-IR) ; vous les déposez avec vos propres accès.'],
    ['Comment est calculé le prix ?', 'Au nombre de salariés payés dans le mois, avec un prix dégressif par tranche. Pas de frais de mise en route.'],
    ['Puis-je reprendre mes salariés et mes cumuls de l’année ?', 'Oui. Nous reprenons les salariés, les cumuls et les soldes de congés pour que la régularisation de l’IR reste juste.'],
    ['Mes données sont-elles confidentielles ?', 'Chaque cabinet et chaque entreprise dispose d’un espace cloisonné. Les espaces clients sont chiffrés et ne s’ouvrent qu’avec leur code d’accès.'],
    ['Que se passe-t-il si j’arrête ?', 'Vous résiliez quand vous voulez. Vos bulletins et déclarations restent consultables et exportables pendant 3 mois.']
  ];
  return `<div class="pres">
  <section class="pz-hero"><div class="pz-w pz-row">
   <div class="pz-col"><span class="pz-tag">Paie marocaine 2026 · SMIG, barème IR et CNSS à jour</span>
    <h1>Vos bulletins de paie justes, vos déclarations CNSS prêtes en quelques clics.</h1>
    <p class="pz-lead">Bulletins avec cumuls et régularisation de l’IR, fichier e-BDS pour DAMANCOM, XML pour SIMPL-IR, documents RH et espace client. Conçu par un cabinet d’expertise comptable qui fait de la paie tous les mois.</p>
    <div class="row">${cta}<a class="btn primary lg" href="#contact">Démarrer l’essai gratuit</a><a class="btn ghost lg" href="#tarifs">Voir les tarifs</a></div>
    <span class="small" style="color:#9fb0c6">${T.essai} jours d’essai · sans carte bancaire · sans engagement</span></div>
   <div class="pz-card">
    <div class="pz-bh"><div><b>Riad Atlas SARL</b><small>Exemple · données fictives</small></div><div class="r"><b>Bulletin de paie</b><small>Novembre 2026</small></div></div>
    <div class="pz-l"><span>Salaire de base</span><span>10 000,00</span></div><div class="pz-l"><span>CNSS 4,48 % (plafond 6 000)</span><span class="neg">−268,80</span></div>
    <div class="pz-l"><span>AMO 2,26 %</span><span class="neg">−226,00</span></div><div class="pz-l"><span>IR (3 personnes à charge)</span><span class="neg">−451,56</span></div>
    <div class="pz-net"><span>Net à payer</span><span>9 053,64 DH</span></div><div class="pz-l small muted"><span>Coût employeur</span><span>11 749,80 DH</span></div>
    <div class="row"><span class="pill ok">Contrôles OK</span><span class="pill draft">CNSS avant le 10/12</span><span class="pill blue">e-BDS prêt</span></div></div>
  </div></section>
  <section class="pz-sec"><div class="pz-w"><h2>Vous vous reconnaissez ?</h2><div class="pz-g4">
   ${[['Un fichier Excel fragile', 'Une formule cassée et c’est tout le mois qui est faux.'], ['Un doute sur l’IR', 'Frais professionnels, charges de famille, régularisation : chaque mois on revérifie à la main.'], ['La CNSS le 9 au soir', 'Le bordereau se prépare dans l’urgence et les pénalités guettent.'], ['Des demandes urgentes', 'Attestation de salaire pour la banque, solde de tout compte : toujours pour hier.']].map(([a, b]) => `<div class="pz-box"><b>${a}</b><span>${b}</span></div>`).join('')}
  </div></div></section>
  <section class="pz-sec" id="fonctions"><div class="pz-w"><span class="pz-kick">CE QUE FAIT RM PAIE</span><h2>Tout le cycle de paie, du pointage au dépôt des déclarations</h2>
   <div class="pz-g3">${F.map(([i, a, b]) => `<div class="pz-box">${i}<b>${a}</b><span>${b}</span></div>`).join('')}</div></div></section>
  <section class="pz-sec white"><div class="pz-w"><h2>Pour qui ?</h2><div class="pz-g2">
   <div class="pz-who"><b>Entreprises et PME</b><span>Commerces, riads, restaurants, BTP, services : de 1 à plusieurs centaines de salariés. Vous saisissez les variables du mois, RM Paie fait le reste.</span><small>Bulletins · CNSS · IR · documents RH · paiement des salaires</small></div>
   <div class="pz-who dark"><b>Cabinets comptables</b><span>Tous vos dossiers clients dans un espace cabinet, partagé avec vos collaborateurs. Chaque client consulte ses bulletins et déclarations dans un espace à votre nom, protégé par un code d’accès.</span><small>Multi-dossiers · collaborateurs · espace client à votre marque</small></div>
  </div></div></section>
  <section class="pz-sec"><div class="pz-w"><h2>Comment ça marche</h2><div class="pz-g4">
   ${[['Créez la société', 'ICE, IF, RC et affiliation CNSS, une seule fois.'], ['Ajoutez les salariés', 'Contrat, salaire, famille, RIB. Nous pouvons reprendre votre fichier existant.'], ['Saisissez le mois', 'Absences, heures sup., primes, avances. Les contrôles signalent les anomalies.'], ['Validez et déposez', 'Bulletins, virement, e-BDS et IR prêts. Les cumuls de l’année se mettent à jour.']].map(([a, b], i) => `<div class="pz-step"><i>${i + 1}</i><b>${a}</b><span>${b}</span></div>`).join('')}
  </div></div></section>
  <section class="pz-sec white" id="prise-en-main"><div class="pz-w"><span class="pz-kick">PRISE EN MAIN</span><h2>Découvrez le logiciel en 2 minutes</h2>
   <div class="pz-video"><video controls preload="none" playsinline poster="prise-en-main.jpg" aria-label="Vidéo de prise en main de RM Paie"><source src="prise-en-main.mp4" type="video/mp4"></video>
    <div class="pz-guide"><b class="pz-h3">Guide d’utilisation</b><p class="muted">Toutes les étapes, captures d’écran à l’appui : connexion, fiche société, salariés, variables, validation, bulletins, envoi aux salariés, déclarations CNSS et IR, documents RH.</p>
     <a class="btn primary" href="guide-utilisation-rm-paie.pdf" download>Télécharger le guide (PDF)</a><small class="muted">18 pages · 1,9 Mo</small></div></div>
  </div></section>
  <section class="pz-sec white" id="tarifs"><div class="pz-w"><span class="pz-kick">TARIFS</span><h2>Un prix clair, par salarié, sans engagement</h2><p class="muted">Prix hors taxes, TVA 20 % en sus. Mises à jour légales, support et sauvegardes inclus dans toutes les formules.</p>
   <div class="pz-prices">
    <div class="pz-ent"><div class="head"><b class="pz-h3">Entreprise</b><div class="pz-seg"><button data-act="pzMode" data-a="0" class="${PZ.annuel ? '' : 'on'}">Mensuel</button><button data-act="pzMode" data-a="1" class="${PZ.annuel ? 'on' : ''}">Annuel · ${T.moisOfferts} mois offerts</button></div></div>
     <label for="pz-n" class="pz-lab">Nombre de salariés : <b id="pz-nv">${PZ.n}</b></label><input id="pz-n" type="range" min="1" max="300" value="${PZ.n}">
     <div id="pz-out">${pzHtml()}</div>
     <small class="muted">Le prix de la tranche s’applique à tous les salariés. Minimum ${T.minimum} DH HT par mois. Salarié facturé = salarié payé dans le mois.</small>
     <button class="btn primary lg" data-act="inscription">Essayer ${T.essai} jours gratuitement</button></div>
    <div class="pz-side">
     <div class="pz-who dark"><b class="pz-h3">Cabinet</b><div class="pz-price"><span class="pz-mid">${T.cabinet} DH</span><span>HT / salarié géré / mois</span></div><span>Minimum ${T.cabinetMin} DH HT par mois. Dossiers et collaborateurs illimités, espace client à votre nom, reprise de vos dossiers offerte.</span><a class="btn gold" href="#contact">Demander une démo</a></div>
     <div class="pz-box"><b class="pz-h3">À la carte</b><div class="pz-price"><span class="pz-mid">${T.carte} DH</span><span>HT / bulletin validé</span></div><span>Sans abonnement, pour les très petites structures ou la paie occasionnelle. Déclarations et documents RH inclus.</span></div>
    </div></div>
   ${T.offre ? `<div class="pz-offre"><b>${esc(T.offre)}</b><span>Résiliable à tout moment · données exportables · consultables 3 mois après l’arrêt</span></div>` : ''}
  </div></section>
  <section class="pz-sec"><div class="pz-w pz-row"><div class="pz-col"><span class="pz-kick">QUI EST DERRIÈRE RM PAIE</span><h2>Un cabinet d’expertise comptable, pas seulement un éditeur</h2>
   <p class="muted">RM Paie est conçu par ${esc(ci.nom || 'RM Expertise')}, cabinet d’expertise comptable et de commissariat aux comptes installé à Marrakech depuis 2019, membre de l’Ordre des Experts-Comptables. Les règles de paie sont suivies par des professionnels qui les appliquent pour leurs propres clients, et mises à jour à chaque loi de finances.</p></div>
   <div class="pz-g2 pz-col">${[['20+ ans', 'd’expérience en expertise comptable'], ['800+', 'clients accompagnés en France et au Maroc'], ['Support', 'humain par WhatsApp et e-mail'], ['FR · ع', 'interface en français et en arabe']].map(([a, b]) => `<div class="pz-box"><b class="pz-mid">${a}</b><span>${b}</span></div>`).join('')}</div></div></section>
  <section class="pz-sec white" id="questions"><div class="pz-w narrow"><h2>Questions fréquentes</h2>${Q.map(([a, b]) => `<details class="pz-faq"><summary>${a}</summary><p>${b}</p></details>`).join('')}</div></section>
  <section class="pz-hero" id="contact"><div class="pz-w pz-row"><div class="pz-col"><h2 style="color:#fff">Votre prochaine paie, sans Excel</h2><p class="pz-lead">${T.essai} jours d’essai gratuit. Nous créons votre espace et reprenons vos salariés avec vous.</p></div>
   <div class="pz-col pz-contact">${cta}${contactWa}${contactMail}${!contactWa && !contactMail ? (visiteur ? '' : '<span class="small" style="color:#e0b04c">Renseignez le WhatsApp et l’e-mail de contact dans Paramètres › Page de présentation.</span>') : ''}</div></div></section>
  <footer class="pz-foot"><div class="pz-w pz-row"><span><b>RM Paie</b> est un service de ${esc(ci.nom || 'RM Expertise')}, Marrakech</span><span>ICE 002759353000065 · RC 112993 · TP 45106705</span></div></footer>
  </div>`;
}
function vTarifsParams() {
  const T = tarifs();
  return `<section class="card"><h2>Page de présentation et tarifs</h2><p class="muted small">Prix et contacts affichés sur la page publique (visiteurs et clients). Montants en DH HT.</p><form id="tarf" class="fg">
  ${field('Entreprise 1–20 / salarié', 't1', T.t1)}${field('Entreprise 21–50', 't2', T.t2)}${field('Entreprise 51–200', 't3', T.t3)}${field('Entreprise 201 et +', 't4', T.t4)}
  ${field('Minimum mensuel', 'minimum', T.minimum)}${field('Mois offerts (annuel)', 'moisOfferts', T.moisOfferts)}${field('Cabinet / salarié géré', 'cabinet', T.cabinet)}${field('Cabinet minimum mensuel', 'cabinetMin', T.cabinetMin)}
  ${field('À la carte / bulletin', 'carte', T.carte)}${field('Jours d’essai', 'essai', T.essai)}${field('WhatsApp', 'whatsapp', T.whatsapp, { ph: '+212 6…' })}${field('E-mail de contact', 'email', T.email)}
  ${field('Bandeau d’offre (vide = masqué)', 'offre', T.offre, { full: true })}
  </form><div class="row end"><button class="btn primary" data-act="tarifsSave">Enregistrer</button></div></section>`;
}
Object.assign(ACT, {
  pzMode: t => { PZ.annuel = t.dataset.a === '1'; $$('.pz-seg button').forEach(b => b.classList.toggle('on', b.dataset.a === t.dataset.a)); $('#pz-out').innerHTML = pzHtml(); translateDOM($('#pz-out')); },
  ouvrirEspace: () => modal(vClientLogin()),
  tarifsSave: async () => {
    const f = formData($('#tarf')); const o = {}; Object.keys(DEFAULT_TARIFS).forEach(k => o[k] = typeof DEFAULT_TARIFS[k] === 'number' ? num(f[k]) : (f[k] || ''));
    PUB = o; Store.put('public-tarifs', o);
    if (Store.mode === 'cloud' && Store.rawDb) { try { await Store.rawDb.doc('public/tarifs').set(o); toast('Tarifs publiés sur la page de présentation.'); } catch (e) { toast('Publication des tarifs impossible.', 'err'); } }
    else toast('Tarifs enregistrés.');
  }
});
document.addEventListener('input', e => { if (e.target.id === 'pz-n') { PZ.n = Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 1)); $('#pz-nv').textContent = PZ.n; $('#pz-out').innerHTML = pzHtml(); translateDOM($('#pz-out')); } });

/* ---------- Connexion : identifiant et mot de passe ---------- */
function utilisateurs() { return ((Store.get('utilisateurs') || {}).list) || []; }
async function hashPwd(pwd, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pwd)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('rmpaie-user:' + salt), iterations: 150000, hash: 'SHA-256' }, base, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/* ---------- Mots de passe : complexité exigée pour tous les comptes ---------- */
const MDP_REGLES = [['10 caractères minimum', p => p.length >= 10], ['une majuscule', p => /[A-Z]/.test(p)], ['une minuscule', p => /[a-z]/.test(p)], ['un chiffre', p => /[0-9]/.test(p)], ['un caractère spécial (!@#$%…)', p => /[^A-Za-z0-9]/.test(p)]];
const MDP_COURANTS = ['motdepasse', 'password', 'azerty', 'qwerty', '123456', 'rmpaie', 'admin', 'bienvenue', 'maroc'];
function mdpFaible(p, ident) {
  p = String(p || ''); const manque = MDP_REGLES.filter(([, ok]) => !ok(p)).map(([l]) => tr(l));
  if (manque.length) return tr('Mot de passe trop simple. Il faut : ') + manque.join(', ') + '.';
  const bas = p.toLowerCase(), id = String(ident || '').toLowerCase().split('@')[0];
  if (MDP_COURANTS.some(m => bas.includes(m))) return tr('Mot de passe trop courant : évitez les mots comme « motdepasse », « azerty » ou « 123456 ».');
  if (id.length >= 4 && bas.includes(id)) return tr('Le mot de passe ne doit pas contenir votre identifiant.');
  return '';
}
function mdpAide(inp) {
  let box = inp.closest('label') && inp.closest('label').querySelector('.pwdreq');
  if (!box) { box = document.createElement('span'); box.className = 'pwdreq'; (inp.closest('label') || inp.parentNode).appendChild(box); }
  const p = inp.value; box.innerHTML = MDP_REGLES.map(([l, ok]) => `<i class="${ok(p) ? 'ok' : ''}">${ok(p) ? '✓' : '○'} ${esc(tr(l))}</i>`).join('');
}
const MDP_CHAMPS = 'input[type=password][name=p1], #inscf input[type=password][name=pwd], #espf input[name=pwd]';
['input', 'focusin'].forEach(n => document.addEventListener(n, ev => { const t = ev.target; if (t && t.matches && t.matches(MDP_CHAMPS)) mdpAide(t); }));
async function nouvelUtilisateur(ident, pwd, nom, role) {
  ident = normIdent(ident);
  if (!/^[a-z0-9._@-]{3,60}$/.test(ident)) throw new Error('Identifiant : 3 à 60 caractères (lettres, chiffres, . _ - @).');
  { const m = mdpFaible(pwd, ident); if (m) throw new Error(m); }
  if (utilisateurs().some(u => u.identifiant === ident)) throw new Error('Cet identifiant existe déjà.');
  const salt = uid() + uid(); return { id: uid(), identifiant: ident, nom: nom || '', role: role || 'collaborateur', salt, hash: await hashPwd(pwd, salt), createdAt: Date.now() };
}
async function creerAdmin(ident, pwd, pwd2) {
  if (pwd !== pwd2) throw new Error('Les deux mots de passe ne correspondent pas.');
  const u = await nouvelUtilisateur(ident, pwd, '', 'administrateur');
  Store.put('utilisateurs', { list: [u] }); ouvrirSession(u);
}
async function connexionCabinet(ident, pwd) {
  const u = utilisateurs().find(x => x.identifiant === normIdent(ident));
  if (!u || (await hashPwd(pwd, u.salt)) !== u.hash) throw new Error('Identifiant ou mot de passe incorrect.');
  ouvrirSession(u);
}
function ouvrirSession(u) { S.auth = { type: 'cabinet', ident: u.identifiant, role: u.role }; S.view = 'dashboard'; try { sessionStorage.setItem('rmpaie-session', u.identifiant); } catch (e) { } }
function restaurerSession() {
  if (S.client) return; let id = null; try { id = sessionStorage.getItem('rmpaie-session'); } catch (e) { }
  const u = id && utilisateurs().find(x => x.identifiant === id); if (u) S.auth = { type: 'cabinet', ident: u.identifiant, role: u.role };
}
function deconnexion() {
  try { sessionStorage.removeItem('rmpaie-session'); } catch (e) { }
  if (S.client) { Store.docs = {}; S.dossierId = null; }
  S.auth = null; S.view = 'dashboard'; closeModal(); render(); window.scrollTo(0, 0);
}
function vUtilisateurs() {
  const L = utilisateurs(); const me = S.auth && S.auth.ident; const admin = S.auth && S.auth.role === 'administrateur';
  return `<section class="card"><h2>Utilisateurs du cabinet</h2>
  <p class="small">Identifiants qui ouvrent l’espace de travail. Chaque collaborateur doit aussi être invité comme <b>Éditeur</b> de l’application sur claude.ai : c’est ce rôle qui donne accès aux données, l’identifiant ajoute un verrou à l’ouverture.</p>
  <div class="tw"><table><thead><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th></th></tr></thead><tbody>
  ${L.map(u => `<tr><td class="mono">${esc(u.identifiant)}${u.identifiant === me ? ' <span class="pill ok">vous</span>' : ''}</td><td>${esc(u.nom)}</td><td>${esc(u.role)}</td><td class="nowrap">${u.identifiant === me ? '<button class="btn sm" data-act="pwdMoi">Changer mon mot de passe</button>' : (admin ? `<button class="btn sm danger" data-act="userDel" data-id="${u.id}">Retirer</button>` : '')}</td></tr>`).join('')}
  </tbody></table></div>
  ${admin ? '<div class="row end"><button class="btn primary" data-act="userNew">+ Ajouter un utilisateur</button></div>' : ''}</section>`;
}
Object.assign(ACT, {
  login: () => modal(vClientLogin()),
  logout: () => deconnexion(),
  userNew: () => modal(`<h2>Nouvel utilisateur</h2><form id="userf" class="fg">${field('Identifiant', 'ident', '')}${field('Nom', 'nom', '')}${field('Rôle', 'role', 'collaborateur', { type: 'select', options: [['collaborateur', 'Collaborateur'], ['administrateur', 'Administrateur']] })}${field('Mot de passe provisoire', 'pwd', genPwd())}</form>
    <p class="muted small">Transmettez l’identifiant et le mot de passe au collaborateur ; il pourra le changer dans Paramètres.</p><p id="usererr" class="err small"></p>
    <div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="userSave">Créer</button></div>`),
  userSave: async () => {
    const f = formData($('#userf'));
    try { const u = await nouvelUtilisateur(f.ident, f.pwd, f.nom, f.role); Store.put('utilisateurs', { list: [...utilisateurs(), u] }); closeModal(); render(); toast('Utilisateur créé.'); }
    catch (e) { $('#usererr').textContent = tr(e.message); }
  },
  userDel: t => { const L = utilisateurs().filter(u => u.id !== t.dataset.id); if (!L.some(u => u.role === 'administrateur')) { toast('Il doit rester au moins un administrateur.', 'warn'); return; } Store.put('utilisateurs', { list: L }); render(); toast('Utilisateur retiré.'); },
  pwdMoi: () => modal(`<h2>Changer mon mot de passe</h2><form id="pwdf" class="fg">${field('Mot de passe actuel', 'old', '', { type: 'password', full: true })}${field('Nouveau mot de passe', 'p1', '', { type: 'password', full: true })}${field('Confirmation', 'p2', '', { type: 'password', full: true })}</form><p id="pwderr" class="err small"></p>
    <div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="pwdSave">Enregistrer</button></div>`),
  pwdSave: async () => {
    const f = formData($('#pwdf')); const err = $('#pwderr'); const L = utilisateurs(); const u = L.find(x => x.identifiant === S.auth.ident);
    if (!u || (await hashPwd(f.old, u.salt)) !== u.hash) { err.textContent = tr('Mot de passe actuel incorrect.'); return; }
    { const m = mdpFaible(f.p1, S.auth && S.auth.ident); if (m) { err.textContent = m; return; } }
    if (f.p1 !== f.p2) { err.textContent = tr('Les deux mots de passe ne correspondent pas.'); return; }
    u.salt = uid() + uid(); u.hash = await hashPwd(f.p1, u.salt); Store.put('utilisateurs', { list: L }); closeModal(); toast('Mot de passe modifié.');
  }
});
function majBoutonAuth() {
  let b = $('#authbtn');
  if (!b) { b = document.createElement('button'); b.id = 'authbtn'; b.className = 'authbtn'; $('.ctl').appendChild(b); }
  b.dataset.act = S.auth ? 'logout' : 'login';
  b.textContent = S.auth ? tr('Déconnexion') + ' · ' + S.auth.ident : tr('Connexion');
}
Object.assign(AR, { 'Connexion': 'تسجيل الدخول', 'Déconnexion': 'تسجيل الخروج', 'Identifiant': 'اسم المستخدم', 'Mot de passe': 'كلمة المرور', 'Se connecter': 'دخول', 'Première connexion': 'أول دخول', 'Créer et entrer': 'إنشاء ودخول', 'Confirmez le mot de passe': 'تأكيد كلمة المرور', 'Accédez à votre espace de travail.': 'ادخل إلى فضاء عملك.', 'Saisissez l’identifiant et le mot de passe transmis par votre cabinet.': 'أدخل اسم المستخدم وكلمة المرور اللذين سلمهما لك مكتبك.', 'Identifiant ou mot de passe incorrect.': 'اسم المستخدم أو كلمة المرور غير صحيحة.', 'Connexion à mon espace': 'الدخول إلى فضائي', 'Saisissez l’identifiant et le mot de passe.': 'أدخل اسم المستخدم وكلمة المرور.', 'Connexion…': 'جارٍ الدخول…' });

/* ---------- Documents RH détaillés (Code du travail, loi n° 65-99) ---------- */
const RH_LISTE = [
  ['cdi', 'Contrat de travail à durée indéterminée (CDI)'], ['cdd', 'Contrat de travail à durée déterminée (CDD)'], ['avenant', 'Avenant au contrat de travail'],
  ['essaiRenouv', 'Renouvellement de la période d’essai'], ['attTravail', 'Attestation de travail'], ['attSalaire', 'Attestation de salaire'],
  ['certificat', 'Certificat de travail'], ['convocation', 'Convocation à un entretien préalable'], ['sanction', 'Notification de sanction disciplinaire']
];
const RH_CHAMPS = {
  contrat: ['cdi', 'cdd'], cdd: ['cdd'], essaiR: ['essaiRenouv'], avenant: ['avenant'], disc: ['convocation', 'sanction'], sanction: ['sanction'], convoc: ['convocation'], cert: ['certificat']
};
const MOTIFS_CDD = [
  ['remplacement', 'Remplacement d’un salarié dont le contrat est suspendu (art. 16)'],
  ['accroissement', 'Accroissement temporaire de l’activité de l’entreprise (art. 16)'],
  ['saisonnier', 'Travail à caractère saisonnier (art. 16)'],
  ['ouverture', 'Ouverture d’une entreprise ou d’un nouvel établissement (art. 17)'],
  ['produit', 'Lancement d’un nouveau produit pour la première fois (art. 17)']
];
const CATEGORIES = [['cadre', 'Cadre et assimilé'], ['employe', 'Employé'], ['ouvrier', 'Ouvrier']];
const SANCTIONS = [['avertissement', 'Avertissement'], ['blame', 'Blâme'], ['blame2', 'Deuxième blâme'], ['miseapied', 'Mise à pied (8 jours au plus)'], ['blame3', 'Troisième blâme'], ['transfert', 'Transfert à un autre service ou établissement']];

/* Montant en toutes lettres */
function enLettres(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const D = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
  function c99(x) {
    if (x <= 16) return U[x]; if (x < 20) return 'dix-' + U[x - 10];
    const d = Math.floor(x / 10), u = x % 10;
    if (d === 7) return 'soixante' + (u === 1 ? '-et-' : '-') + c99(10 + u);
    if (d === 8) return 'quatre-vingt' + (u ? '-' + U[u] : 's');
    if (d === 9) return 'quatre-vingt-' + c99(10 + u);
    return D[d] + (u === 1 ? '-et-un' : u ? '-' + U[u] : '');
  }
  function c999(x) {
    const c = Math.floor(x / 100), r = x % 100; let s = '';
    if (c) s = (c > 1 ? U[c] + '-cent' + (r ? '' : 's') : 'cent');
    if (r) s += (s ? '-' : '') + c99(r); return s || 'zéro';
  }
  if (n === 0) return 'zéro';
  const parts = []; const mi = Math.floor(n / 1e6), th = Math.floor((n % 1e6) / 1000), r = n % 1000;
  if (mi) parts.push(c999(mi) + (mi > 1 ? '-millions' : '-million'));
  if (th) parts.push(th === 1 ? 'mille' : c999(th).replace(/(cent|vingt)s$/, '$1') + '-mille');
  if (r) parts.push(c999(r));
  return parts.join('-');
}
function montantLettres(v) {
  const x = Math.round((Number(v) || 0) * 100); const dh = Math.floor(x / 100), ct = x % 100;
  return enLettres(dh) + ' dirhams' + (ct ? ' et ' + enLettres(ct) + ' centimes' : '');
}

/* Délais légaux */
function preavisTexte(cat) {
  return cat === 'cadre'
    ? 'un (1) mois pour une ancienneté inférieure à un an, deux (2) mois de un à cinq ans et trois (3) mois au-delà de cinq ans'
    : 'huit (8) jours pour une ancienneté inférieure à un an, un (1) mois de un à cinq ans et deux (2) mois au-delà de cinq ans';
}
function essaiCDI(cat) { return cat === 'cadre' ? 'trois (3) mois' : cat === 'employe' ? 'un mois et demi' : 'quinze (15) jours'; }
function essaiCDD(debut, fin) {
  if (!debut || !fin) return 'une journée par semaine de travail, dans la limite de deux semaines';
  const j = (new Date(fin) - new Date(debut)) / 864e5 + 1; const sem = Math.floor(j / 7);
  if (j > 182) return 'un (1) mois';
  const jours = Math.min(14, Math.max(1, sem));
  return jours + ' jour' + (jours > 1 ? 's' : '');
}

/* Formulaire */
function vRH() {
  const d = D(); const list = d.employees || []; const e0 = list[0] || {};
  const g = (k, html) => `<div class="rhg full" data-g="${k}"><div class="fg">${html}</div></div>`;
  return `<section class="card"><h2>Documents RH</h2>
  <p class="muted small">Documents rédigés selon la loi n° 65-99 portant Code du travail et ses textes d’application. Les champs se remplissent depuis la fiche du salarié ; complétez ce qui manque, puis générez le PDF.</p>
  <form id="rhf" class="fg">
  ${field('Document', 'doc', 'cdi', { type: 'select', options: RH_LISTE, full: true })}
  ${field('Salarié', 'emp', e0.id, { type: 'select', options: list.map(e => [e.id, (e.nom || '') + ' ' + (e.prenom || '')]) })}
  ${field('Civilité', 'civilite', e0.civilite || 'M.', { type: 'select', options: ['M.', 'Mme'] })}
  ${field('Nationalité', 'nationalite', e0.nationalite || 'marocaine')}
  ${field('Catégorie professionnelle', 'categorie', e0.categorie || 'employe', { type: 'select', options: CATEGORIES })}
  ${field('Représentant de l’employeur', 'signataire', d.gerant || '', { ph: 'Nom et prénom' })}${field('Qualité', 'qualite', 'Gérant')}
  ${field('Fait à', 'lieu', d.ville)}${field('Date du document', 'dateDoc', isoDate(new Date()), { type: 'date' })}
  ${g('contrat', `<h3 class="full">Contrat</h3>
    ${field('Date d’effet', 'dateEffet', e0.dateEmbauche || '', { type: 'date' })}${field('Lieu de travail', 'lieuTravail', [d.adresse, d.ville].filter(Boolean).join(', '))}
    ${field('Supérieur hiérarchique', 'superieur', '', { ph: 'Ex. le Gérant' })}${field('Horaire hebdomadaire (heures)', 'horaire', '44')}
    ${field('Paiement du salaire', 'paiementJour', 'au plus tard le dernier jour ouvrable du mois')}${field('Durée de la période d’essai', 'essai', '', { ph: 'Vide = durée légale maximale' })}
    ${field('Période d’essai renouvelable une fois', 'essaiRenouv', true, { type: 'checkbox' })}${field('Convention collective applicable', 'convention', '', { ph: 'Vide = aucune' })}
    ${field('Missions principales', 'missions', '', { type: 'textarea', full: true, rows: 3 })}
    ${field('Clause de confidentialité', 'cConf', true, { type: 'checkbox' })}${field('Clause d’exclusivité', 'cExcl', true, { type: 'checkbox' })}${field('Clause de mobilité', 'cMob', false, { type: 'checkbox' })}`)}
  ${g('cdd', `<h3 class="full">CDD</h3>
    ${field('Motif de recours', 'motif', 'accroissement', { type: 'select', options: MOTIFS_CDD, full: true })}
    ${field('Date de fin', 'dateFin', e0.finContrat || '', { type: 'date' })}${field('Salarié remplacé (si remplacement)', 'remplace', '')}
    ${field('Renouvelable une fois', 'cddRenouv', false, { type: 'checkbox' })}`)}
  ${g('essaiR', `<h3 class="full">Renouvellement</h3>${field('Durée du renouvellement', 'dureeRenouv', '')}${field('Date de fin de la période initiale', 'finEssaiInit', e0.finEssai || '', { type: 'date' })}`)}
  ${g('avenant', `<h3 class="full">Avenant</h3>${field('Date d’effet de l’avenant', 'dateAvenant', '', { type: 'date' })}
    ${field('Nouvelle fonction (vide = inchangée)', 'nvFonction', '')}${field('Nouveau salaire mensuel brut (vide = inchangé)', 'nvSalaire', '', { inputmode: 'decimal' })}
    ${field('Autres modifications', 'objet', '', { type: 'textarea', full: true, rows: 3 })}`)}
  ${g('cert', `<h3 class="full">Certificat</h3>${field('Date de sortie', 'dateSortie', e0.dateSortie || '', { type: 'date' })}${field('Postes successivement occupés (un par ligne, vide = fonction actuelle)', 'postes', '', { type: 'textarea', full: true, rows: 2 })}`)}
  ${g('disc', `<h3 class="full">Discipline</h3>${field('Date des faits', 'dateFaits', '', { type: 'date' })}${field('Faits reprochés (précis et datés)', 'faits', '', { type: 'textarea', full: true, rows: 3 })}`)}
  ${g('convoc', `${field('Date de l’entretien', 'dateEntretien', '', { type: 'date' })}${field('Heure', 'heureEntretien', '10:00', { type: 'time' })}${field('Lieu de l’entretien', 'lieuEntretien', d.adresse || '')}`)}
  ${g('sanction', `${field('Sanction', 'sanction', 'avertissement', { type: 'select', options: SANCTIONS })}${field('Dates de mise à pied (si mise à pied)', 'mapDates', '', { ph: 'Ex. du 3 au 5 mars 2027' })}${field('Date de l’entretien préalable tenu', 'dateEntretienTenu', '', { type: 'date' })}`)}
  ${field('Clauses ou mentions particulières', 'texte', '', { type: 'textarea', full: true, rows: 2 })}
  </form><div class="row end"><button class="btn primary" data-act="rhPdf" ${list.length ? '' : 'disabled'}>Générer le PDF</button></div>
  <p class="muted small">Ces modèles reprennent les règles légales en vigueur. Relisez-les et adaptez-les à chaque situation (convention collective, règlement intérieur) avant signature ; en cas de litige ou de situation particulière, faites-les valider par un juriste.</p></section>`;
}
function rhMajChamps() {
  const f = $('#rhf'); if (!f) return; const doc = f.querySelector('[name=doc]').value;
  $$('.rhg', f).forEach(el => { el.style.display = (RH_CHAMPS[el.dataset.g] || []).includes(doc) ? '' : 'none'; });
}
function rhRemplirSalarie() {
  const f = $('#rhf'); if (!f) return; const e = D().employees.find(x => x.id === f.querySelector('[name=emp]').value); if (!e) return;
  const set = (n, v) => { const i = f.querySelector(`[name=${n}]`); if (i && v != null) { if (i.type === 'checkbox') i.checked = !!v; else i.value = v; } };
  set('civilite', e.civilite || 'M.'); set('nationalite', e.nationalite || 'marocaine'); set('categorie', e.categorie || 'employe');
  set('dateEffet', e.dateEmbauche || ''); set('dateFin', e.finContrat || ''); set('finEssaiInit', e.finEssai || ''); set('dateSortie', e.dateSortie || '');
}
document.addEventListener('change', ev => {
  if (!ev.target.closest || !ev.target.closest('#rhf')) return;
  if (ev.target.name === 'doc') rhMajChamps();
  if (ev.target.name === 'emp') rhRemplirSalarie();
});

/* Mise en page PDF */
function RhDoc(titre, sousTitre) {
  const doc = newPdf(); const W = 210, M = 20, TW = W - 2 * M, BOTTOM = 270, LH = 4.9;
  let y = pdfHeader(doc, '', '') + 4;
  const ensure = h => { if (y + h > BOTTOM) { doc.addPage(); y = 22; } };
  const self = {
    doc,
    titre() {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(19, 35, 58);
      doc.splitTextToSize(titre, TW).forEach(l => { doc.text(l, W / 2, y, { align: 'center' }); y += 6.5; });
      if (sousTitre) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(90); doc.text(sousTitre, W / 2, y, { align: 'center' }); y += 5; }
      doc.setDrawColor(14, 124, 102); doc.setLineWidth(0.6); doc.line(W / 2 - 25, y, W / 2 + 25, y); y += 7; doc.setTextColor(0); return self;
    },
    p(txt, o = {}) {
      if (!txt) return self;
      doc.setFont('helvetica', o.bold ? 'bold' : o.italic ? 'italic' : 'normal'); doc.setFontSize(o.size || 10);
      const x = M + (o.indent || 0), w = TW - (o.indent || 0);
      const lines = doc.splitTextToSize(String(txt), w);
      lines.forEach((l, i) => {
        ensure(LH);
        if (o.center) doc.text(l, W / 2, y, { align: 'center' });
        else if (i < lines.length - 1 && !o.noJustify) doc.text(l, x, y, { align: 'justify', maxWidth: w });
        else doc.text(l, x, y);
        y += LH;
      });
      y += o.after ?? 2.2; return self;
    },
    li(items) { (items || []).filter(Boolean).forEach(t => { ensure(LH); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('–', M + 3, y); self.p(t, { indent: 8, after: 1 }); }); y += 1.5; return self; },
    h(txt) { ensure(14); y += 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(14, 100, 84); doc.text(txt, M, y); doc.setTextColor(0); y += 5.5; return self; },
    space(h) { y += h; return self; },
    table(head, body, columnStyles) { ensure(24); doc.autoTable({ ...AT, startY: y, margin: { left: M, right: M }, head, body, columnStyles }); y = doc.lastAutoTable.finalY + 5; return self; },
    partie(label, lignes) {
      ensure(8 + lignes.length * LH); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(label, M, y); y += LH + 0.5;
      lignes.filter(Boolean).forEach(l => self.p(l, { after: 0.6 })); y += 2.5; return self;
    },
    signatures(gauche, droite, lieuDate, mention) {
      ensure(48); y += 4; doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      if (lieuDate) { doc.text(lieuDate, W - M, y, { align: 'right' }); y += 6; }
      if (mention) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.splitTextToSize(mention, TW).forEach(l => { doc.text(l, M, y); y += 4.3; }); y += 2; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      if (droite) { doc.text(gauche, M, y); doc.text(droite, W / 2 + 8, y); }
      else doc.text(gauche, W - M, y, { align: 'right' });
      y += 5; doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(110);
      if (droite) { doc.text('Signature et cachet', M, y); doc.text('Signature précédée de « Lu et approuvé »', W / 2 + 8, y); }
      else doc.text('Signature et cachet', W - M, y, { align: 'right' });
      doc.setTextColor(0); y += 28; return self;
    },
    fin(fichier, paraphes) {
      const n = doc.getNumberOfPages(); const H = doc.internal.pageSize.getHeight();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(130);
        if (paraphes && n > 1) doc.text('Paraphes :  Employeur ________     Salarié ________', W - M, H - 12, { align: 'right' });
        doc.text('Établi avec RM Paie — ' + cabinetNom(), M, H - 7); doc.text('Page ' + i + ' / ' + n, W - M, H - 7, { align: 'right' });
      }
      saveFile(fichier, doc.output('blob'));
    }
  };
  return self;
}

/* Génération */
function rhPdf(f) {
  const d = D(); const e = d.employees.find(x => x.id === f.emp); if (!e) return; const Pa = P();
  f = Object.assign({ civilite: e.civilite || 'M.', nationalite: e.nationalite || 'marocaine', categorie: e.categorie || 'employe', qualite: 'Gérant', lieu: d.ville, dateDoc: isoDate(new Date()) }, f);
  // mémorise sur la fiche
  let chg = false; ['civilite', 'nationalite', 'categorie'].forEach(k => { if (f[k] && e[k] !== f[k]) { e[k] = f[k]; chg = true; } }); if (chg) saveD(d);
  const sal = f.civilite === 'Mme' ? 'la Salariée' : 'le Salarié'; const aSal = f.civilite === 'Mme' ? 'à la Salariée' : 'au Salarié'; const deSal = f.civilite === 'Mme' ? 'de la Salariée' : 'du Salarié'; const Sal = f.civilite === 'Mme' ? 'La Salariée' : 'Le Salarié';
  const ne = f.civilite === 'Mme' ? 'née' : 'né'; const nom = f.civilite + ' ' + (e.prenom || '') + ' ' + (e.nom || '');
  const rep = (f.signataire || d.gerant || '[représentant]') + ', agissant en qualité de ' + (f.qualite || 'Gérant');
  const employeur = `${d.raison || ''}${d.forme && !String(d.raison || '').toUpperCase().includes(String(d.forme).toUpperCase()) ? ', ' + d.forme : ''}, dont le siège est situé ${[d.adresse, d.ville].filter(Boolean).join(', ') || '[adresse]'}, immatriculée au registre du commerce sous le n° ${d.rc || '[RC]'}, identifiant fiscal n° ${d.if || '[IF]'}, ICE n° ${d.ice || '[ICE]'}, affiliée à la CNSS sous le n° ${d.cnss || '[n° CNSS]'}`;
  const salarie = `${nom}, ${ne}${e.dateNaissance ? ' le ' + dFr(e.dateNaissance) : ''}, de nationalité ${f.nationalite}, titulaire de la carte nationale d’identité n° ${e.cin || '[CIN]'}, demeurant ${e.adresse || '[adresse]'}${e.cnss ? ', immatriculé' + (f.civilite === 'Mme' ? 'e' : '') + ' à la CNSS sous le n° ' + e.cnss : ''}`;
  const catLib = (CATEGORIES.find(c => c[0] === f.categorie) || [, 'employé'])[1].toLowerCase();
  const fonction = e.fonction || '[fonction]'; const lieuDate = 'Fait à ' + (f.lieu || d.ville || '') + ', le ' + dFr(f.dateDoc);
  const base = e.typeSalaire === 'horaire' ? num(e.tauxHoraire) : num(e.salaireBase);
  const salTxt = e.typeSalaire === 'horaire'
    ? `un salaire horaire brut de ${fmt(base)} DH (${montantLettres(base)})`
    : `un salaire mensuel brut de ${fmt(base)} DH (${montantLettres(base)})`;
  const elements = [num(e.primesFixes) && `une prime fixe mensuelle de ${fmt(e.primesFixes)} DH brut`, num(e.transportFixe) && `une indemnité de transport de ${fmt(e.transportFixe)} DH par mois`, num(e.panierFixe) && `une prime de panier de ${fmt(e.panierFixe)} DH par mois`].filter(Boolean);
  const ref = 'Régi par la loi n° 65-99 relative au Code du travail (dahir n° 1-03-194 du 11 septembre 2003)';
  let R;

  if (f.doc === 'cdi' || f.doc === 'cdd') {
    const cdd = f.doc === 'cdd'; const motif = MOTIFS_CDD.find(m => m[0] === f.motif) || MOTIFS_CDD[1];
    const debut = f.dateEffet || e.dateEmbauche; const finC = f.dateFin || e.finContrat;
    R = RhDoc(cdd ? 'CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE' : 'CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE', ref).titre();
    R.p('ENTRE LES SOUSSIGNÉS :', { bold: true });
    R.p(`${employeur}, représentée par ${rep}, dûment habilité${f.civilite ? '' : ''} aux fins des présentes,`);
    R.p('ci-après dénommée « l’Employeur »,', { italic: true, after: 3 });
    R.p('D’UNE PART,', { bold: true, center: true });
    R.p('ET :', { bold: true }); R.p(salarie + ',');
    R.p(`ci-après dénommé${f.civilite === 'Mme' ? 'e' : ''} « ${sal.replace(/^la |^le /, '').replace(/^\w/, c => c.toUpperCase())} »,`, { italic: true, after: 3 });
    R.p('D’AUTRE PART,', { bold: true, center: true });
    R.p('IL A ÉTÉ PRÉALABLEMENT EXPOSÉ CE QUI SUIT :', { bold: true });
    R.p(cdd
      ? `L’Employeur doit faire face à la situation suivante : ${motif[1].replace(/ \(art\. \d+\)/, '').toLowerCase()}${f.motif === 'remplacement' && f.remplace ? ', en remplacement de ' + f.remplace + ' dont le contrat de travail est suspendu' : ''}. Cette situation, qui ne permet pas de conclure une relation de travail à durée indéterminée, entre dans les cas de recours limitativement prévus par l’article ${f.motif === 'ouverture' || f.motif === 'produit' ? '17' : '16'} du Code du travail. Les parties se sont rapprochées et ont arrêté les conditions du présent contrat.`
      : `L’Employeur souhaite s’adjoindre les services d’un${f.civilite === 'Mme' ? 'e' : ''} ${fonction.toLowerCase()}. ${Sal} a déclaré disposer des compétences et de l’expérience requises et être libre de tout engagement envers un autre employeur. Les parties se sont rapprochées et ont arrêté ce qui suit.`);
    R.p('EN CONSÉQUENCE, IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :', { bold: true, after: 3 });
    let n = 0; const art = t => R.h('Article ' + (++n) + ' – ' + t);

    art('Objet et engagement');
    R.p(`L’Employeur engage ${sal}, qui accepte, en qualité de ${fonction}, dans la catégorie professionnelle des ${catLib}s${f.convention ? ', telle que définie par la ' + f.convention : ''}, à compter du ${dFr(debut) || '[date]'}.`);
    R.p(`${Sal} déclare n’être lié${f.civilite === 'Mme' ? 'e' : ''} à aucun autre employeur par un contrat en cours ou par une clause l’empêchant de souscrire au présent engagement, et certifie l’exactitude des renseignements et documents fournis lors de son embauche. Toute déclaration inexacte sur ces points pourra entraîner la rupture du contrat.`);
    R.p(`Le présent contrat est régi par la loi n° 65-99 relative au Code du travail et ses textes d’application${f.convention ? ', par la ' + f.convention : ''}, par le règlement intérieur de l’entreprise dont ${sal} reconnaît avoir pris connaissance, ainsi que par les stipulations ci-après.`);

    art(cdd ? 'Motif et durée du contrat' : 'Durée du contrat');
    if (cdd) {
      R.p(`Le présent contrat est conclu pour une durée déterminée, en application de l’article ${f.motif === 'ouverture' || f.motif === 'produit' ? '17' : '16'} du Code du travail, au motif suivant : ${motif[1].replace(/ \(art\. \d+\)/, '').toLowerCase()}${f.motif === 'remplacement' && f.remplace ? ' (' + f.remplace + ')' : ''}.`);
      R.p(f.motif === 'remplacement' && !finC
        ? `Il prend effet le ${dFr(debut)} et prendra fin au retour du salarié remplacé ou à la rupture définitive de son contrat de travail.`
        : `Il prend effet le ${dFr(debut) || '[date de début]'} et prendra fin de plein droit le ${dFr(finC) || '[date de fin]'}, sans qu’il soit besoin d’un préavis, conformément à l’article 33 du Code du travail.`);
      if (f.motif === 'ouverture' || f.motif === 'produit') R.p('Conformément à l’article 17 du Code du travail, la durée du contrat ne peut excéder une année ; il ne peut être renouvelé qu’une seule fois. Au-delà, la relation de travail devient à durée indéterminée.');
      if (f.cddRenouv) R.p('Le contrat pourra être renouvelé une seule fois, par avenant écrit signé des deux parties avant son terme, dans les limites prévues par la loi.');
      R.p(`Si la relation de travail se poursuit au-delà du terme ou du renouvellement autorisé, le contrat devient un contrat à durée indéterminée.`);
    } else {
      R.p(`Le présent contrat est conclu pour une durée indéterminée. Il prend effet le ${dFr(debut) || '[date]'}, sous réserve de la période d’essai prévue à l’article suivant et des résultats de la visite médicale d’embauche.`);
    }

    art('Période d’essai');
    if (cdd) {
      R.p(`Le présent contrat ne deviendra définitif qu’à l’issue d’une période d’essai de ${f.essai || essaiCDD(debut, finC)}, calculée à raison d’une journée par semaine de travail dans la limite de deux semaines pour un contrat inférieur à six mois et d’un mois pour un contrat d’une durée supérieure, conformément à l’article 14 du Code du travail. Cette période n’est pas renouvelable.`);
    } else {
      R.p(`Le présent contrat ne deviendra définitif qu’à l’issue d’une période d’essai de ${f.essai || essaiCDI(f.categorie)} de travail effectif, durée maximale fixée par l’article 14 du Code du travail pour la catégorie des ${catLib}s.${f.essaiRenouv ? ' Cette période pourra être renouvelée une seule fois, pour une durée au plus égale, d’un commun accord constaté par écrit avant son expiration.' : ''}`);
    }
    R.p('Pendant la période d’essai, chacune des parties peut rompre le contrat sans indemnité (article 13 du Code du travail). Toutefois, lorsque ' + sal + ' a accompli au moins une semaine de travail, la rupture non motivée par une faute grave ne peut intervenir qu’en respectant un délai de préavis de huit jours pour un salarié payé au mois, ou de deux jours pour un salarié payé à la journée, à la semaine ou à la quinzaine.');

    art('Fonctions et attributions');
    R.p(`${Sal} exercera les fonctions de ${fonction}${f.superieur ? ', sous l’autorité de ' + f.superieur : ', sous l’autorité de la direction'}.${f.missions ? ' Ses missions principales sont les suivantes :' : ' Il' + (f.civilite === 'Mme' ? 'le' : '') + ' accomplira l’ensemble des tâches relevant de sa qualification et de ses fonctions, conformément aux directives de sa hiérarchie.'}`);
    if (f.missions) R.li(String(f.missions).split(/\n+/).map(s => s.replace(/^[-•–]\s*/, '').trim()).filter(Boolean));
    R.p('Cette énumération n’est pas limitative. L’Employeur pourra adapter les attributions ' + deSal + ' aux besoins de l’entreprise, dans le respect de sa qualification et sans modification de son niveau de responsabilité ni de sa rémunération.');

    art('Lieu de travail');
    R.p(`${Sal} exercera ses fonctions à ${f.lieuTravail || '[lieu de travail]'}.${f.cMob ? ' Compte tenu de la nature de ses fonctions, ' + sal + ' accepte par avance toute affectation dans un autre établissement de l’entreprise situé dans la même ville ou la même région, sans que ce changement constitue une modification de son contrat. Toute mutation lui sera notifiée par écrit en respectant un délai de prévenance raisonnable.' : ' Des déplacements ponctuels liés aux fonctions pourront lui être demandés ; les frais engagés seront remboursés sur justificatifs.'}`);

    art('Durée et horaires de travail');
    R.p(`La durée du travail est fixée à ${f.horaire || 44} heures par semaine, dans la limite de la durée légale de 2 288 heures par an, soit 44 heures par semaine, prévue par l’article 184 du Code du travail. La répartition des horaires est fixée par l’Employeur selon l’horaire collectif affiché dans l’entreprise.`);
    R.p('Les heures supplémentaires ne peuvent être effectuées qu’à la demande expresse de l’Employeur. Elles donnent lieu, conformément à l’article 201 du Code du travail, à une majoration de 25 % lorsqu’elles sont effectuées entre 6 heures et 21 heures et de 50 % entre 21 heures et 6 heures ; ces taux sont portés respectivement à 50 % et 100 % lorsqu’elles sont effectuées le jour du repos hebdomadaire.');
    R.p(`${Sal} bénéficie d’un repos hebdomadaire d’au moins vingt-quatre heures consécutives et des jours fériés payés prévus par la réglementation.`);

    art('Rémunération');
    R.p(`En contrepartie de son travail, ${sal} percevra ${salTxt}, pour l’horaire défini à l’article précédent. Cette rémunération ne peut en aucun cas être inférieure au salaire minimum légal (SMIG), fixé à ${fmt(Pa.smigHoraire)} DH de l’heure à la date des présentes.`);
    if (elements.length) { R.p(`S’y ajoutent :`, { after: 1 }); R.li(elements); }
    R.p(`${Sal} bénéficiera de la prime d’ancienneté prévue par l’article 350 du Code du travail, égale à 5 % du salaire après deux ans de service, 10 % après cinq ans, 15 % après douze ans, 20 % après vingt ans et 25 % après vingt-cinq ans.`);
    R.p(`Le salaire est payé mensuellement, ${f.paiementJour || 'au plus tard le dernier jour ouvrable du mois'}, par ${e.modePaiement === 'Espèces' ? 'remise en espèces contre émargement' : e.modePaiement === 'Chèque' ? 'chèque' : 'virement bancaire' + (e.rib ? ' sur le compte n° ' + e.rib : '')}. Il est soumis aux retenues légales (cotisations CNSS et AMO, impôt sur le revenu) et donne lieu à la remise d’un bulletin de paie.`);

    art('Protection sociale');
    R.p(`${Sal} est affilié${f.civilite === 'Mme' ? 'e' : ''} à la Caisse nationale de sécurité sociale (CNSS), conformément au dahir portant loi n° 1-72-184 du 27 juillet 1972 relatif au régime de sécurité sociale, et bénéficie de l’assurance maladie obligatoire de base instituée par la loi n° 65-00.${num(e.cimrSal) ? ' Il' + (f.civilite === 'Mme' ? 'le' : '') + ' est également affilié' + (f.civilite === 'Mme' ? 'e' : '') + ' au régime de retraite complémentaire de la CIMR, au taux salarial de ' + fmt(e.cimrSal) + ' %.' : ''}${num(e.mutuelleSal) || num(e.mutuellePat) ? ' Il' + (f.civilite === 'Mme' ? 'le' : '') + ' bénéficie en outre de la couverture complémentaire santé souscrite par l’Employeur.' : ''}`);

    art('Congés et absences');
    R.p(`${Sal} a droit à un congé annuel payé d’un jour et demi de travail effectif par mois de service, augmenté d’un jour et demi par période entière de cinq années de service, sans que la durée totale puisse excéder trente jours de travail effectif, conformément aux articles 231 et suivants du Code du travail. Les dates de congé sont fixées par l’Employeur en tenant compte des nécessités du service et, dans la mesure du possible, des souhaits ${deSal}.`);
    R.p(`${Sal} bénéficie des congés pour événements familiaux prévus par l’article 274 du Code du travail. Toute absence doit être autorisée au préalable ou, en cas d’empêchement, notifiée à l’Employeur dans les plus brefs délais ; en cas de maladie, ${sal} doit en aviser l’Employeur et produire un certificat médical dans les quarante-huit heures, sauf cas de force majeure.`);

    art('Obligations professionnelles');
    R.p(`${Sal} s’engage à exécuter son travail avec diligence et loyauté, à respecter les instructions de sa hiérarchie, le règlement intérieur, les règles d’hygiène et de sécurité, et à prendre soin du matériel et des documents qui lui sont confiés. Il${f.civilite === 'Mme' ? 'le' : ''} s’engage à informer l’Employeur de tout changement dans sa situation personnelle (adresse, situation familiale) ayant une incidence sur la gestion de son contrat.`);
    if (f.cConf) R.p(`Confidentialité. ${Sal} est tenu${f.civilite === 'Mme' ? 'e' : ''} à une obligation de discrétion absolue sur l’ensemble des informations, documents, méthodes, données clients et affaires de l’entreprise dont il${f.civilite === 'Mme' ? 'le' : ''} aura connaissance dans l’exercice de ses fonctions, pendant toute la durée du contrat et après sa cessation. La divulgation d’un secret professionnel ayant causé un préjudice à l’entreprise constitue une faute grave au sens de l’article 39 du Code du travail. À la fin du contrat, ${sal} restituera tous les documents, fichiers et matériels appartenant à l’Employeur.`);
    if (f.cExcl) R.p(`Exclusivité. Pendant la durée du contrat, ${sal} s’engage à consacrer son activité professionnelle à l’Employeur et à n’exercer aucune activité concurrente, pour son compte ou pour le compte d’un tiers, sans l’autorisation préalable et écrite de l’Employeur.`);

    art('Protection des données personnelles');
    R.p(`Les données personnelles ${deSal} sont traitées par l’Employeur pour les seuls besoins de la gestion du personnel, de la paie et des obligations déclaratives (CNSS, administration fiscale). Conformément à la loi n° 09-08 relative à la protection des personnes physiques à l’égard du traitement des données à caractère personnel, ${sal} dispose d’un droit d’accès, de rectification et d’opposition qu’il${f.civilite === 'Mme' ? 'le' : ''} peut exercer auprès de l’Employeur.`);

    art('Discipline');
    R.p(`Tout manquement ${deSal} à ses obligations pourra donner lieu à l’une des sanctions disciplinaires prévues par l’article 37 du Code du travail, appliquées de manière graduelle : avertissement, blâme, deuxième blâme ou mise à pied d’une durée n’excédant pas huit jours, troisième blâme ou transfert à un autre service ou établissement, puis licenciement. Les fautes graves énumérées à l’article 39 du Code du travail peuvent justifier un licenciement sans préavis ni indemnités, dans le respect de la procédure prévue aux articles 62 à 65 du Code du travail (audition préalable du salarié, qui peut se faire assister).`);

    art('Cessation du contrat');
    if (cdd) {
      R.p(`Le contrat prend fin à l’arrivée de son terme ou à l’achèvement du travail qui en fait l’objet (article 33 du Code du travail). Sa rupture avant terme par l’une des parties, non motivée par une faute grave de l’autre partie ou par un cas de force majeure, ouvre droit au profit de l’autre partie à des dommages-intérêts équivalant au montant des salaires correspondant à la période restant à courir jusqu’au terme du contrat.`);
    } else {
      R.p(`À l’issue de la période d’essai, chacune des parties peut mettre fin au contrat dans les conditions prévues par le Code du travail, sous réserve de respecter, sauf faute grave ou force majeure, le délai de préavis prévu par l’article 43 du Code du travail et par le décret n° 2-04-469 du 29 décembre 2004, soit, pour la catégorie des ${catLib}s : ${preavisTexte(f.categorie)}. Le préavis court à compter du lendemain de la notification de la rupture.`);
      R.p(`La démission doit être notifiée par écrit, la signature ${deSal} étant légalisée par l’autorité compétente (article 34 du Code du travail). Pendant le préavis, ${sal} bénéficie d’autorisations d’absence pour rechercher un nouvel emploi dans les conditions prévues par la réglementation.`);
      R.p(`Le licenciement ne peut intervenir que pour un motif valable lié à l’aptitude ou à la conduite ${deSal}, ou fondé sur les nécessités de fonctionnement de l’entreprise, et dans le respect de la procédure légale. Il ouvre droit, après six mois de travail effectif et hors faute grave, à l’indemnité de licenciement prévue par les articles 52 et 53 du Code du travail.`);
    }
    R.p(`À la cessation du contrat, l’Employeur remettra ${aSal} un certificat de travail dans un délai maximum de huit jours (article 72 du Code du travail) et établira le reçu pour solde de tout compte (articles 73 et suivants). Les congés acquis et non pris donneront lieu à une indemnité compensatrice.`);

    if (f.texte) { art('Clauses particulières'); R.p(f.texte); }

    art('Dispositions finales');
    R.p(`Pour tout ce qui n’est pas prévu au présent contrat, les parties se réfèrent aux dispositions du Code du travail et de ses textes d’application${f.convention ? ', à la ' + f.convention : ''} et au règlement intérieur de l’entreprise. Toute modification du présent contrat fera l’objet d’un avenant écrit.`);
    R.p(`Tout différend relatif à l’exécution ou à la rupture du présent contrat sera, à défaut de règlement amiable${cdd ? '' : ' ou de conciliation devant l’inspection du travail'}, soumis au tribunal compétent du lieu d’exécution du travail.`);
    R.p(`Le présent contrat est établi en deux exemplaires originaux, dont un remis à chacune des parties. Conformément à l’article 15 du Code du travail, la signature des deux parties est légalisée par l’autorité compétente.`);
    R.signatures('L’Employeur', Sal, lieuDate, `${sal.replace(/^\w/, c => c.toUpperCase())} reconnaît avoir reçu un exemplaire du présent contrat et pris connaissance du règlement intérieur de l’entreprise.`);
    R.fin((cdd ? 'Contrat_CDD_' : 'Contrat_CDI_') + slug(e.nom + '_' + e.prenom) + '.pdf', true);
    return;
  }

  if (f.doc === 'avenant') {
    R = RhDoc('AVENANT AU CONTRAT DE TRAVAIL', ref).titre();
    R.p('ENTRE LES SOUSSIGNÉS :', { bold: true }); R.p(`${employeur}, représentée par ${rep}, ci-après « l’Employeur »,`);
    R.p('ET :', { bold: true }); R.p(`${salarie}, employé${f.civilite === 'Mme' ? 'e' : ''} depuis le ${dFr(e.dateEmbauche)} en qualité de ${fonction}, ci-après « ${Sal.replace(/^L[ae] /, '')} »,`);
    R.p('IL A ÉTÉ CONVENU CE QUI SUIT :', { bold: true, after: 3 });
    let n = 0; const art = t => R.h('Article ' + (++n) + ' – ' + t);
    art('Objet');
    R.p(`Le présent avenant modifie, d’un commun accord, le contrat de travail liant les parties, à compter du ${dFr(f.dateAvenant) || '[date d’effet]'}.`);
    if (f.nvFonction) { art('Fonctions'); R.p(`${Sal} exercera désormais les fonctions de ${f.nvFonction}.`); }
    if (f.nvSalaire) { art('Rémunération'); R.p(`La rémunération ${deSal} est portée à ${fmt(f.nvSalaire)} DH brut par mois (${montantLettres(f.nvSalaire)}), au lieu de ${fmt(base)} DH.`); }
    if (f.objet || f.texte) { art('Autres modifications'); R.p(f.objet || ''); R.p(f.texte || ''); }
    art('Maintien des autres clauses');
    R.p('Les autres clauses du contrat de travail demeurent inchangées et continuent de produire leurs effets. L’ancienneté ' + deSal + ' est intégralement maintenue.');
    art('Dispositions finales'); R.p('Le présent avenant est établi en deux exemplaires originaux, signatures légalisées (article 15 du Code du travail).');
    R.signatures('L’Employeur', Sal, lieuDate); R.fin('Avenant_' + slug(e.nom + '_' + e.prenom) + '.pdf', true); return;
  }

  if (f.doc === 'essaiRenouv') {
    R = RhDoc('RENOUVELLEMENT DE LA PÉRIODE D’ESSAI', 'Article 14 du Code du travail').titre();
    R.p(`Entre ${employeur}, représentée par ${rep},`); R.p(`et ${nom}, employé${f.civilite === 'Mme' ? 'e' : ''} en qualité de ${fonction} depuis le ${dFr(e.dateEmbauche)} dans le cadre d’un contrat à durée indéterminée,`);
    R.p('il est convenu ce qui suit :', { after: 3 });
    R.p(`La période d’essai prévue au contrat de travail, qui expire le ${dFr(f.finEssaiInit) || '[date]'}, est renouvelée une seule fois, d’un commun accord, pour une durée de ${f.dureeRenouv || essaiCDI(f.categorie)}, conformément à l’article 14 du Code du travail. La durée totale de l’essai n’excède pas le double de la durée maximale légale applicable à la catégorie des ${catLib}s.`);
    R.p('Pendant cette période, chacune des parties conserve la faculté de rompre le contrat dans les conditions prévues par l’article 13 du Code du travail. Les autres clauses du contrat demeurent inchangées.');
    R.p('Le présent accord, établi en deux exemplaires, est signé avant l’expiration de la période d’essai initiale.');
    R.signatures('L’Employeur', Sal, lieuDate); R.fin('Renouvellement_essai_' + slug(e.nom + '_' + e.prenom) + '.pdf'); return;
  }

  if (f.doc === 'attTravail') {
    R = RhDoc('ATTESTATION DE TRAVAIL').titre();
    R.p(`Nous soussignés, ${employeur}, représentée par ${rep},`);
    R.p('attestons par la présente que :', { after: 3 });
    R.p(`${salarie},`);
    R.p(e.dateSortie
      ? `a été employé${f.civilite === 'Mme' ? 'e' : ''} au sein de notre société du ${dFr(e.dateEmbauche)} au ${dFr(e.dateSortie)}, en qualité de ${fonction}, dans le cadre d’un contrat à durée ${e.contrat === 'CDD' ? 'déterminée' : 'indéterminée'}.`
      : `est employé${f.civilite === 'Mme' ? 'e' : ''} au sein de notre société depuis le ${dFr(e.dateEmbauche)}, en qualité de ${fonction}, dans le cadre d’un contrat à durée ${e.contrat === 'CDD' ? 'déterminée' + (e.finContrat ? ' expirant le ' + dFr(e.finContrat) : '') : 'indéterminée'}, et fait toujours partie de notre effectif à la date des présentes.`);
    if (f.texte) R.p(f.texte);
    R.p(`La présente attestation est délivrée à l’intéressé${f.civilite === 'Mme' ? 'e' : ''}, sur sa demande, pour servir et valoir ce que de droit.`);
    R.signatures(f.signataire ? f.signataire + ', ' + f.qualite : 'Pour la société', null, lieuDate); R.fin('Attestation_travail_' + slug(e.nom + '_' + e.prenom) + '.pdf'); return;
  }

  if (f.doc === 'attSalaire') {
    const r = calcEmp(e); const derniers = [];
    for (let k = 1; k <= 12 && derniers.length < 3; k++) { const o = Store.get(perKey(periodShift(S.period, -k + 1))); if (o && o.validated && o.bulletins[e.id]) derniers.push(o.bulletins[e.id]); }
    R = RhDoc('ATTESTATION DE SALAIRE').titre();
    R.p(`Nous soussignés, ${employeur}, représentée par ${rep},`);
    R.p(`attestons que ${salarie}, est employé${f.civilite === 'Mme' ? 'e' : ''} au sein de notre société depuis le ${dFr(e.dateEmbauche)}, en qualité de ${fonction}, dans le cadre d’un contrat à durée ${e.contrat === 'CDD' ? 'déterminée' : 'indéterminée'}${e.dateSortie ? ' (sortie le ' + dFr(e.dateSortie) + ')' : ''}.`, { after: 3 });
    R.p(`Sa rémunération s’établit comme suit :`, { after: 1 });
    R.li([`salaire de base : ${fmt(r.base)} DH brut par mois`, `salaire brut mensuel : ${fmt(r.brut)} DH (${montantLettres(r.brut)})`, `salaire net mensuel : ${fmt(r.net)} DH (${montantLettres(r.net)})`, `cumul du salaire brut imposable ${r.period.slice(0, 4)} : ${fmt(r.cum.sbi)} DH`]);
    if (derniers.length) {
      R.p('Détail des derniers mois de paie :', { after: 1 });
      R.table([['Mois', 'Salaire brut', 'Retenues', 'Salaire net']], derniers.map(b => [periodLabel(b.period), fmt(b.brut), fmt(b.brut - b.net), fmt(b.net)]), { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } });
    }
    R.p(`L’intéressé${f.civilite === 'Mme' ? 'e' : ''} est régulièrement déclaré${f.civilite === 'Mme' ? 'e' : ''} à la CNSS${e.cnss ? ' sous le n° ' + e.cnss : ''}.`);
    R.p(`La présente attestation est délivrée à l’intéressé${f.civilite === 'Mme' ? 'e' : ''}, sur sa demande, pour servir et valoir ce que de droit.`);
    R.signatures(f.signataire ? f.signataire + ', ' + f.qualite : 'Pour la société', null, lieuDate); R.fin('Attestation_salaire_' + slug(e.nom + '_' + e.prenom) + '.pdf'); return;
  }

  if (f.doc === 'certificat') {
    const sortie = f.dateSortie || e.dateSortie || isoDate(new Date()); const postes = String(f.postes || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    R = RhDoc('CERTIFICAT DE TRAVAIL', 'Article 72 du Code du travail').titre();
    R.p(`Nous soussignés, ${employeur}, représentée par ${rep},`);
    R.p(`certifions avoir employé ${salarie},`, { after: 3 });
    R.p(`du ${dFr(e.dateEmbauche)} (date d’entrée) au ${dFr(sortie)} (date de sortie),`);
    if (postes.length > 1) { R.p('en qualité de :', { after: 1 }); R.li(postes); }
    else R.p(`en qualité de ${postes[0] || fonction}.`);
    R.p(`${Sal} nous quitte libre de tout engagement.`);
    R.p('Le présent certificat est délivré conformément à l’article 72 du Code du travail, pour servir et valoir ce que de droit.');
    R.signatures(f.signataire ? f.signataire + ', ' + f.qualite : 'Pour la société', null, lieuDate); R.fin('Certificat_travail_' + slug(e.nom + '_' + e.prenom) + '.pdf'); return;
  }

  if (f.doc === 'convocation') {
    R = RhDoc('CONVOCATION À UN ENTRETIEN PRÉALABLE', 'Article 62 du Code du travail').titre();
    R.p(`${lieuDate}`, { noJustify: true });
    R.p(`À l’attention de ${nom}, ${fonction}`, { bold: true });
    R.p('Remise en main propre contre décharge ou par lettre recommandée avec accusé de réception', { italic: true, after: 4 });
    R.p(`${f.civilite === 'Mme' ? 'Madame' : 'Monsieur'},`);
    R.p(`Nous avons constaté les faits suivants, survenus le ${dFr(f.dateFaits) || '[date]'} :`, { after: 1 });
    R.p(f.faits || '[description précise des faits]', { indent: 6 });
    R.p(`Ces faits étant susceptibles de justifier une sanction disciplinaire, nous vous convoquons, en application de l’article 62 du Code du travail, à un entretien qui se tiendra le ${dFr(f.dateEntretien) || '[date]'} à ${f.heureEntretien || '[heure]'}, à l’adresse suivante : ${f.lieuEntretien || '[lieu]'}.`);
    R.p('Au cours de cet entretien, vous pourrez présenter vos explications et vous faire assister par un délégué des salariés ou par le représentant syndical de votre choix dans l’entreprise. Un procès-verbal sera établi à l’issue de l’entretien et signé par les deux parties.');
    R.p(`Nous vous prions d’agréer, ${f.civilite === 'Mme' ? 'Madame' : 'Monsieur'}, l’expression de nos salutations distinguées.`);
    R.signatures(f.signataire ? f.signataire + ', ' + f.qualite : 'Pour la société', null, null, 'Reçu en main propre le ____________ — signature du salarié : ____________');
    R.fin('Convocation_' + slug(e.nom + '_' + e.prenom) + '.pdf'); return;
  }

  if (f.doc === 'sanction') {
    const sLib = (SANCTIONS.find(s => s[0] === f.sanction) || SANCTIONS[0])[1];
    R = RhDoc('NOTIFICATION DE SANCTION DISCIPLINAIRE', 'Article 37 du Code du travail').titre();
    R.p(`${lieuDate}`, { noJustify: true });
    R.p(`À l’attention de ${nom}, ${fonction}`, { bold: true });
    R.p('Remise en main propre contre décharge ou par lettre recommandée avec accusé de réception', { italic: true, after: 4 });
    R.p(`Objet : ${sLib.toLowerCase()}`, { bold: true });
    R.p(`${f.civilite === 'Mme' ? 'Madame' : 'Monsieur'},`);
    R.p(`Le ${dFr(f.dateFaits) || '[date]'}, les faits suivants ont été constatés :`, { after: 1 });
    R.p(f.faits || '[description précise des faits]', { indent: 6 });
    if (f.dateEntretienTenu) R.p(`Lors de l’entretien du ${dFr(f.dateEntretienTenu)}, tenu conformément à l’article 62 du Code du travail, les explications que vous avez fournies ne nous ont pas permis de modifier notre appréciation des faits.`);
    R.p(`Ces agissements constituent un manquement à vos obligations professionnelles. En conséquence, et en application de l’article 37 du Code du travail, nous vous notifions par la présente ${f.sanction === 'miseapied' ? 'une mise à pied disciplinaire, non rémunérée, d’une durée n’excédant pas huit jours' + (f.mapDates ? ', ' + f.mapDates : '') : f.sanction === 'transfert' ? 'votre transfert à un autre service ou établissement de l’entreprise' : 'un ' + sLib.toLowerCase()}.`);
    R.p('Les sanctions disciplinaires sont appliquées de manière graduelle. Nous vous demandons de veiller à ce que de tels faits ne se reproduisent pas ; à défaut, nous serions amenés à envisager une sanction plus lourde. Une copie de la présente est versée à votre dossier individuel. Vous pouvez faire valoir vos observations par écrit.');
    if (f.texte) R.p(f.texte);
    R.p(`Nous vous prions d’agréer, ${f.civilite === 'Mme' ? 'Madame' : 'Monsieur'}, l’expression de nos salutations distinguées.`);
    R.signatures(f.signataire ? f.signataire + ', ' + f.qualite : 'Pour la société', null, null, 'Reçu en main propre le ____________ — signature du salarié : ____________');
    R.fin('Sanction_' + slug(e.nom + '_' + e.prenom) + '.pdf'); return;
  }
}

/* ---------- Démarrage ---------- */
(async function boot() {
  $('#main').innerHTML = '<section class="card"><p class="muted">Chargement de vos dossiers…</p></section>';
  $('#prevP').dataset.act = 'prevP'; $('#nextP').dataset.act = 'nextP';
  initLang();
  await Store.init(); await Store.loadAll(); await chargerTarifs(); restaurerSession();
  if (Store.error) toast(Store.error, 'warn');
  if (Store.migrated) toast(Store.migrated + ' élément(s) déplacé(s) dans l’espace cabinet partagé.');
  setSync('ok'); render();
})();
