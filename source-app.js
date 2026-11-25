/* ===== RM Paie — application ===== */
const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function fmt(n, d = 2) {
  n = Number(n) || 0; const neg = n < 0; const s = Math.abs(n).toFixed(d);
  let [i, f] = s.split('.'); i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + i + (d ? ',' + f : '');
}
const fmtCsv = n => (Number(n) || 0).toFixed(2).replace('.', ',');
function dFr(d) { if (!d) return ''; const x = new Date(d); if (isNaN(x)) return ''; return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear(); }
function periodLabel(p) { const [y, m] = p.split('-').map(Number); return MOIS[m - 1] + ' ' + y; }
function periodShift(p, k) { let [y, m] = p.split('-').map(Number); m += k; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + '-' + String(m).padStart(2, '0'); }
function todayPeriod() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

/* ---------- Stockage ---------- */
const Store = {
  mode: 'local', db: null, col: null, docs: {}, queue: {}, timers: {}, error: null,
  async init() {
    if (typeof window.claude === 'undefined' || !window.claude.use) return;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      this.user = user; this.rawDb = db;
      if (user && !(await user.canEdit())) { this.mode = 'memory'; S.client = true; return; }
      if (db) {
        this.db = db; this.col = db.collection('cabinet'); this.mode = 'cloud';
        const id = user ? await user.id() : null; if (id) this.privCol = db.collection('data/users/' + id);
      }
    } catch (e) { /* local */ }
  },
  async loadAll() {
    if (this.mode === 'memory') return;
    if (this.mode === 'cloud') {
      try {
        const snap = await Promise.race([this.col.limit(1000).get(), new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), 10000))]);
        snap.docs.forEach(d => { if (d.exists) this.docs[d.id] = clone(d.data()); });
        if (snap.empty && this.privCol) {
          try {
            const old = await this.privCol.limit(1000).get();
            if (!old.empty) { old.docs.forEach(d => { if (d.exists) this.put(d.id, clone(d.data())); }); this.migrated = old.size; }
          } catch (e) { }
        }
        return;
      } catch (e) { this.error = 'Les données en ligne ne répondent pas pour le moment. Travail en mode local sur cet appareil.'; this.mode = 'local'; }
    }
    try { const raw = localStorage.getItem('rmpaie-v1'); if (raw) Object.assign(this.docs, JSON.parse(raw)); } catch (e) { }
  },
  get(k) { return this.docs[k]; },
  keys(prefix) { return Object.keys(this.docs).filter(k => k.startsWith(prefix)); },
  put(k, obj) { this.docs[k] = obj; this.schedule(k); },
  del(k) {
    delete this.docs[k]; if (this.mode === 'memory') return;
    if (this.mode === 'cloud') this.chain(k, () => this.col.doc(k).delete()); else this.saveLocal();
  },
  schedule(k) { if (this.mode === 'memory') return; clearTimeout(this.timers[k]); this.timers[k] = setTimeout(() => this.flush(k), 700); },
  flush(k) {
    const o = this.docs[k]; if (!o) return;
    if (this.mode === 'cloud') this.chain(k, () => this.col.doc(k).set(clone(o)));
    else this.saveLocal();
  },
  chain(k, fn) {
    setSync('saving');
    this.queue[k] = (this.queue[k] || Promise.resolve()).then(fn).then(() => setSync('ok')).catch(e => {
      setSync('err', e && e.code === 'quota_exceeded' ? 'Espace de stockage plein : exportez une sauvegarde et supprimez d’anciens dossiers.' : 'Enregistrement impossible (' + (e && e.code || 'erreur') + '). Exportez une sauvegarde par précaution.');
    });
  },
  saveLocal() { try { localStorage.setItem('rmpaie-v1', JSON.stringify(this.docs)); setSync('ok'); } catch (e) { setSync('err', 'Stockage local indisponible : exportez une sauvegarde.'); } }
};
let syncState = 'ok', syncMsg = '';
function setSync(s, m) { syncState = s; syncMsg = m || ''; const el = $('#sync'); if (el) { el.className = 'sync ' + s; el.textContent = s === 'saving' ? 'Enregistrement…' : s === 'err' ? 'Erreur d’enregistrement' : (Store.mode === 'cloud' ? 'Enregistré en ligne' : 'Enregistré sur cet appareil'); el.title = m || ''; } if (s === 'err') toast(m, 'err'); }

/* ---------- État ---------- */
const S = { view: 'dashboard', dossierId: null, period: todayPeriod(), editEmp: null, bulletinEmp: null, pointageEmp: null };
function P() { return Object.assign({}, DEFAULT_PARAMS, Store.get('params') || {}); }
function dossiers() { return Store.keys('dos-').map(k => Store.get(k)).sort((a, b) => (a.raison || '').localeCompare(b.raison || '')); }
function D() { return S.dossierId ? Store.get('dos-' + S.dossierId) : null; }
function saveD(d) { Store.put('dos-' + d.id, d); }
function perKey(p = S.period, did = S.dossierId) { return 'per-' + did + '-' + p; }
function per(p = S.period) { return Store.get(perKey(p)) || { dossierId: S.dossierId, period: p, vars: {}, pointage: {}, validated: false, bulletins: {} }; }
function savePer(o) { Store.put(perKey(o.period), o); }

function empActif(e, p) {
  const [y, m] = p.split('-').map(Number); const deb = new Date(y, m - 1, 1), fin = new Date(y, m, 0);
  if (e.dateEmbauche && new Date(e.dateEmbauche) > fin) return false;
  if (e.dateSortie && new Date(e.dateSortie) < deb) return false;
  return true;
}
function employesPeriode(p = S.period) { const d = D(); return d ? (d.employees || []).filter(e => empActif(e, p)).sort((a, b) => (a.matricule || '').localeCompare(b.matricule || '', 'fr', { numeric: true })) : []; }
function joursHorsContrat(e, p, J) {
  const [y, m] = p.split('-').map(Number); const nb = new Date(y, m, 0).getDate();
  let start = 1, end = nb;
  if (e.dateEmbauche) { const a = new Date(e.dateEmbauche); if (a.getFullYear() === y && a.getMonth() === m - 1) start = a.getDate(); }
  if (e.dateSortie) { const b = new Date(e.dateSortie); if (b.getFullYear() === y && b.getMonth() === m - 1) end = b.getDate(); }
  const hors = nb - (end - start + 1); return hors > 0 ? Math.round(J * hors / nb) : 0;
}
function cumulAvant(empId, p) {
  const [y, m] = p.split('-').map(Number);
  for (let k = m - 1; k >= 1; k--) {
    const o = Store.get(perKey(y + '-' + String(k).padStart(2, '0')));
    if (o && o.validated && o.bulletins && o.bulletins[empId]) return o.bulletins[empId].cum;
  }
  return {};
}
function bulletinPrecedent(empId, p) {
  for (let k = 1; k <= 12; k++) { const o = Store.get(perKey(periodShift(p, -k))); if (o && o.validated && o.bulletins && o.bulletins[empId]) return o.bulletins[empId]; }
  return null;
}
function calcEmp(e, p = S.period) {
  const o = per(p);
  if (o.validated && o.bulletins[e.id]) return o.bulletins[e.id];
  const Pa = P(); const v = Object.assign({}, o.vars[e.id] || {});
  const hors = joursHorsContrat(e, p, Pa.joursMois);
  v.absJours = num(v.absJours) + hors;
  const cum = Object.assign({}, cumulAvant(e.id, p));
  if (!cum.n) cum.congesAcquis = num(e.congesReport);
  const r = calculerBulletin(e, v, cum, Pa, p); r.horsContrat = hors; return r;
}
function calcAll(p = S.period) { let l = employesPeriode(p); if (S.client) { const o = per(p); l = o.validated ? l.filter(e => o.bulletins[e.id]) : []; } return l.map(e => ({ e, r: calcEmp(e, p) })); }
function totaux(rows) {
  const t = {}; const keys = ['brut', 'sbi', 'exo', 'cnssSal', 'amoSal', 'cimrSal', 'mutSal', 'ir', 'avance', 'pret', 'net', 'prestPat', 'afPat', 'amoPat', 'tfpPat', 'cimrPat', 'mutPat', 'totalPat', 'cout', 'baseCnss', 'baseAmo', 'baseAf', 'fraisPro', 'sni', 'cnssTotal'];
  keys.forEach(k => t[k] = r2(rows.reduce((s, x) => s + (x.r[k] || 0), 0))); return t;
}

/* ---------- Contrôles & échéances ---------- */
function controles(p = S.period) {
  const out = []; const Pa = P();
  calcAll(p).forEach(({ e, r }) => {
    const nom = (e.nom || '') + ' ' + (e.prenom || '');
    if (e.cnss && !/^\d{9}$/.test(String(e.cnss).trim())) out.push({ lvl: 'warn', nom, msg: 'N° CNSS invalide (9 chiffres attendus pour le fichier e-BDS).' });
    const joursPayes = Math.max(1, Pa.joursMois - r.absJours);
    const tauxH = e.typeSalaire === 'horaire' ? num(e.tauxHoraire) : (r.base - r.absence) / (Pa.heuresLegales * joursPayes / Pa.joursMois);
    if (e.contrat !== 'ANAPEC' && tauxH < Pa.smigHoraire - 0.005) out.push({ lvl: 'err', nom, msg: 'Salaire sous le SMIG : ' + fmt(tauxH) + ' DH/h pour ' + fmt(Pa.smigHoraire) + ' DH/h minimum.' });
    if (!e.cnss) out.push({ lvl: 'warn', nom, msg: 'N° CNSS manquant.' });
    if (!e.cin) out.push({ lvl: 'warn', nom, msg: 'N° CIN manquant.' });
    if (e.modePaiement !== 'Espèces' && e.modePaiement !== 'Chèque') { const rib = String(e.rib || '').replace(/\s/g, ''); if (!/^\d{24}$/.test(rib)) out.push({ lvl: 'warn', nom, msg: 'RIB incomplet (24 chiffres attendus) pour un paiement par virement.' }); }
    const prev = bulletinPrecedent(e.id, p);
    if (prev && prev.net > 0 && Math.abs(r.net - prev.net) / prev.net > 0.3) out.push({ lvl: 'warn', nom, msg: 'Net très différent du mois précédent : ' + fmt(r.net) + ' contre ' + fmt(prev.net) + ' DH.' });
    if (r.net < 0) out.push({ lvl: 'err', nom, msg: 'Net à payer négatif : vérifiez avances et prêts.' });
  });
  return out;
}
function echeances(p = S.period) {
  const out = []; const now = new Date(); const Pa = P(); const d = D(); if (!d) return out;
  const nextP = periodShift(p, 1); const [ny, nm] = nextP.split('-').map(Number);
  const dCnss = new Date(ny, nm - 1, 10); const dIr = new Date(ny, nm, 0);
  out.push({ date: dCnss, msg: 'Déclaration et paiement CNSS de ' + periodLabel(p) + ' (avant le 10)' });
  out.push({ date: dIr, msg: 'Versement de l’IR retenu en ' + periodLabel(p) + ' (avant fin du mois suivant)' });
  const lim = new Date(now.getTime() + 45 * 864e5);
  (d.employees || []).filter(e => !e.dateSortie).forEach(e => {
    const nom = (e.nom || '') + ' ' + (e.prenom || '');
    if (e.contrat === 'CDD' && e.finContrat) { const f = new Date(e.finContrat); if (f <= lim) out.push({ date: f, msg: 'Fin de CDD — ' + nom }); }
    if (e.finEssai) { const f = new Date(e.finEssai); if (f >= new Date(now.getTime() - 864e5) && f <= lim) out.push({ date: f, msg: 'Fin de période d’essai — ' + nom }); }
    if (e.contrat === 'ANAPEC' && e.dateEmbauche) { const a = new Date(e.dateEmbauche); const f = new Date(a.getFullYear(), a.getMonth() + Pa.anapecMoisMax, a.getDate()); if (f <= new Date(now.getTime() + 60 * 864e5)) out.push({ date: f, msg: 'Fin d’exonération ANAPEC — ' + nom }); }
    if (e.dateEmbauche) {
      const a = new Date(e.dateEmbauche);
      Pa.ancTranches.forEach(t => { const f = new Date(a.getFullYear() + t.ans, a.getMonth(), a.getDate()); if (f >= new Date(now.getTime() - 31 * 864e5) && f <= lim) out.push({ date: f, msg: 'Ancienneté ' + t.ans + ' ans (prime à ' + t.taux + ' %) — ' + nom }); });
    }
  });
  return out.sort((a, b) => a.date - b.date);
}

/* ---------- UI helpers ---------- */
function toast(m, kind = 'ok') { if (!m) return; const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = tr(m); $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200); }
function modal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.add('open'); translateDOM($('#modal-body')); }
function closeModal() { $('#modal').classList.remove('open'); $('#modal-body').innerHTML = ''; }
function field(label, name, val, opt = {}) {
  const type = opt.type || 'text'; const full = opt.full ? ' full' : '';
  if (type === 'select') return `<label class="f${full}"><span>${label}</span><select name="${name}">${opt.options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;
  if (type === 'checkbox') return `<label class="f chk${full}"><input type="checkbox" name="${name}" ${val ? 'checked' : ''}><span>${label}</span></label>`;
  if (type === 'textarea') return `<label class="f${full}"><span>${label}</span><textarea name="${name}" rows="${opt.rows || 4}">${esc(val)}</textarea></label>`;
  return `<label class="f${full}"><span>${label}</span><input type="${type}" name="${name}" value="${esc(val)}" ${opt.step ? 'step="' + opt.step + '"' : ''} ${opt.ph ? 'placeholder="' + esc(opt.ph) + '"' : ''} ${opt.inputmode ? 'inputmode="' + opt.inputmode + '"' : ''}></label>`;
}
function formData(el) { const o = {}; $$('input,select,textarea', el).forEach(i => { if (!i.name) return; o[i.name] = i.type === 'checkbox' ? i.checked : i.value; }); return o; }
function kpi(label, val, sub = '') { return `<div class="kpi"><div class="kl">${label}</div><div class="kv">${val}</div>${sub ? `<div class="ks">${sub}</div>` : ''}</div>`; }

/* ---------- Téléchargements ---------- */
let downloadsNS;
async function saveFile(filename, data) {
  try {
    if (downloadsNS === undefined) downloadsNS = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null;
    if (downloadsNS) { await downloadsNS.save({ filename, data }); toast('Fichier prêt : ' + filename); return; }
  } catch (e) { if (e && e.code === 'declined') return; if (e && e.code === 'rate_limited') { toast('Une demande de téléchargement est déjà ouverte.', 'warn'); return; } }
  try {
    const blob = data instanceof Blob ? data : new Blob([data]); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { toast('Le téléchargement n’est pas disponible dans cette vue. Ouvrez l’application dans claude.ai.', 'err'); }
}
// Les cellules qui commencent par = ou @ (ou par + ou - suivi d'autre chose qu'un nombre ou un téléphone) sont neutralisées par une apostrophe :
// un nom de salarié comme « =HYPERLINK(...) » ne doit jamais s'exécuter comme formule à l'ouverture dans Excel.
function csvSur(c) { const s = String(c ?? ''); return (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s.,]*$)/.test(s)) ? "'" + s : s; }
function csv(rows) { return '﻿' + rows.map(r => r.map(c => { const s = csvSur(c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n'); }
function slug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40); }

/* ---------- PDF ---------- */
function newPdf(orient = 'p') { const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: orient, unit: 'mm', format: 'a4' }); doc.setFont('helvetica'); return doc; }
function pdfHeader(doc, titre, sous) {
  const d = D(); const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(19, 35, 58); doc.rect(0, 0, W, 4, 'F');
  doc.setFontSize(13); doc.setTextColor(19, 35, 58); doc.setFont('helvetica', 'bold'); doc.text(d.raison || '', 14, 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80);
  const l2 = [d.adresse, d.ville].filter(Boolean).join(' — ');
  const l3 = ['ICE ' + (d.ice || '—'), 'IF ' + (d.if || '—'), 'RC ' + (d.rc || '—'), 'CNSS ' + (d.cnss || '—')].join('   ');
  doc.text(l2, 14, 19); doc.text(l3, 14, 23);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(14, 124, 102); doc.text(titre, W - 14, 14, { align: 'right' });
  if (sous) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80); doc.text(sous, W - 14, 19, { align: 'right' }); }
  doc.setTextColor(0); return 30;
}
function pdfFooter(doc) {
  const n = doc.getNumberOfPages(); const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(140); doc.text('Établi avec RM Paie — ' + cabinetNom(), 14, H - 7); doc.text(i + ' / ' + n, W - 14, H - 7, { align: 'right' }); }
}
const AT = { styles: { fontSize: 8, cellPadding: 1.6, lineColor: [220, 224, 230], lineWidth: 0.1 }, headStyles: { fillColor: [19, 35, 58], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [247, 248, 250] }, margin: { left: 14, right: 14 } };

function lignesBulletin(r) {
  const L = [];
  const add = (lib, base, taux, gain, ret, tp, pat) => L.push({ lib, base, taux, gain, ret, tp, pat });
  add('Salaire de base', r.typeHoraire ? r.heures : '', r.typeHoraire ? fmt(r.tauxHoraire) : '', r.base);
  if (r.absence) add('Absences / hors contrat (' + r.absJours + ' j)', '', '', -r.absence);
  if (r.primeAnc) add('Prime d’ancienneté (' + r.ancAns + ' ans)', fmt(r.base - r.absence), r.ancTaux + ' %', r.primeAnc);
  if (r.mtHs25) add('Heures sup. 25 %', r.hs25 + ' h', fmt(r.tauxHoraire * 1.25), r.mtHs25);
  if (r.mtHs50) add('Heures sup. 50 %', r.hs50 + ' h', fmt(r.tauxHoraire * 1.5), r.mtHs50);
  if (r.mtHs100) add('Heures sup. 100 %', r.hs100 + ' h', fmt(r.tauxHoraire * 2), r.mtHs100);
  if (r.primesFixes) add('Primes fixes', '', '', r.primesFixes);
  if (r.primeVar) add('Prime du mois', '', '', r.primeVar);
  if (r.autresImpos) add('Autres éléments imposables', '', '', r.autresImpos);
  if (r.transport) add('Indemnité de transport', '', '', r.transport);
  if (r.panier) add('Prime de panier', '', '', r.panier);
  if (r.autresExo) add('Indemnités non imposables', '', '', r.autresExo);
  L.push({ sep: 'SALAIRE BRUT', gain: r.brut });
  add(r.anapec ? 'CNSS prestations (ANAPEC exonéré)' : 'CNSS prestations sociales', fmt(r.baseCnss), fmt(P().tauxPrestSal) + ' %', null, r.cnssSal, fmt(P().tauxPrestPat) + ' %', r.prestPat);
  add('Allocations familiales', fmt(r.baseAf), '', null, null, '6,40 %', r.afPat);
  add('AMO', fmt(r.baseAmo), '2,26 %', null, r.amoSal, '4,11 %', r.amoPat);
  add('Taxe de formation professionnelle', fmt(r.baseAf), '', null, null, '1,60 %', r.tfpPat);
  if (r.cimrSal || r.cimrPat) add('CIMR', fmt(r.sbi), '', null, r.cimrSal, '', r.cimrPat);
  if (r.mutSal || r.mutPat) add('Mutuelle', '', '', null, r.mutSal, '', r.mutPat);
  if (r.etatPrisEnCharge) add('Charges patronales prises en charge par l’État', '', '', null, null, '', -r.etatPrisEnCharge);
  add('Frais professionnels (pour mémoire)', fmt(r.sbi), r.fpTaux + ' %', null, null);
  add('Impôt sur le revenu' + (r.regulIr && Math.abs(r.regulIr) >= 0.01 ? ' (dont régul. ' + fmt(r.regulIr) + ')' : ''), fmt(r.sni), '', null, r.ir);
  if (r.avance) add('Avance sur salaire', '', '', null, r.avance);
  if (r.pret) add('Remboursement de prêt', '', '', null, r.pret);
  return L;
}
function drawBulletin(doc, e, r) {
  let y = pdfHeader(doc, 'BULLETIN DE PAIE', 'Période : ' + periodLabel(r.period));
  const Pa = P();
  const info = [
    ['Matricule', e.matricule || '', 'N° CNSS', e.cnss || ''],
    ['Nom et prénom', (e.nom || '') + ' ' + (e.prenom || ''), 'CIN', e.cin || ''],
    ['Fonction', e.fonction || '', 'Date d’embauche', dFr(e.dateEmbauche)],
    ['Contrat', e.contrat || '', 'Ancienneté', r.ancAns + ' an(s)'],
    ['Situation', (e.situation || '') + ' — ' + r.personnes + ' déduction(s)', 'Paiement', (e.modePaiement || 'Virement') + (e.rib ? ' — ' + e.rib : '')]
  ];
  doc.autoTable({ ...AT, startY: y, body: info, theme: 'plain', styles: { fontSize: 8, cellPadding: 1.2 }, columnStyles: { 0: { fontStyle: 'bold', textColor: [90, 90, 90], cellWidth: 30 }, 2: { fontStyle: 'bold', textColor: [90, 90, 90], cellWidth: 30 } } });
  y = doc.lastAutoTable.finalY + 3;
  const body = lignesBulletin(Object.assign({ typeHoraire: e.typeSalaire === 'horaire' }, r)).map(l => l.sep
    ? [{ content: l.sep, styles: { fontStyle: 'bold', fillColor: [232, 242, 239] } }, { content: '', styles: { fillColor: [232, 242, 239] } }, { content: '', styles: { fillColor: [232, 242, 239] } }, { content: fmt(l.gain), styles: { fontStyle: 'bold', halign: 'right', fillColor: [232, 242, 239] } }, { content: '', styles: { fillColor: [232, 242, 239] } }, { content: '', styles: { fillColor: [232, 242, 239] } }, { content: '', styles: { fillColor: [232, 242, 239] } }]
    : [l.lib, l.base ?? '', l.taux ?? '', l.gain == null ? '' : fmt(l.gain), l.ret == null ? '' : fmt(l.ret), l.tp ?? '', l.pat == null ? '' : fmt(l.pat)]);
  doc.autoTable({ ...AT, startY: y, head: [['Rubrique', 'Base', 'Taux', 'Gains', 'Retenues', 'Taux pat.', 'Part patronale']], body, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } });
  y = doc.lastAutoTable.finalY + 3;
  doc.autoTable({ ...AT, startY: y, head: [['Brut imposable', 'Net imposable', 'Total retenues', 'Charges patronales', 'Coût employeur', 'NET À PAYER']], body: [[fmt(r.sbi), fmt(r.sni), fmt(r.totalRetSal + r.avance + r.pret), fmt(r.totalPat), fmt(r.cout), { content: fmt(r.net) + ' DH', styles: { fontStyle: 'bold', fontSize: 11, textColor: [14, 124, 102] } }]], styles: { ...AT.styles, halign: 'center' }, headStyles: { ...AT.headStyles, halign: 'center' } });
  y = doc.lastAutoTable.finalY + 3;
  const c = r.cum;
  doc.autoTable({ ...AT, startY: y, head: [['Cumuls ' + r.period.slice(0, 4), 'Brut imposable', 'Net imposable', 'IR', 'CNSS', 'AMO', 'Jours', 'Congés acquis', 'Congés pris', 'Solde congés']], body: [['Au ' + dFr(isoDate(finDeMois(r.period))), fmt(c.sbi), fmt(c.sni), fmt(c.ir), fmt(c.cnss), fmt(c.amo), c.jours, fmt(c.congesAcquis, 1), fmt(c.congesPris, 1), fmt(c.congesSolde, 1)]], styles: { ...AT.styles, fontSize: 7, halign: 'center' }, headStyles: { ...AT.headStyles, fontSize: 7, halign: 'center', fillColor: [90, 104, 125] } });
  y = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(7); doc.setTextColor(110);
  doc.text('Pour vous aider à faire valoir vos droits, conservez ce bulletin de paie sans limitation de durée. SMIG horaire en vigueur : ' + fmt(Pa.smigHoraire) + ' DH.', 14, y);
  doc.setTextColor(0);
}
function pdfBulletinBlob(e, r) { const doc = newPdf(); drawBulletin(doc, e, r); pdfFooter(doc); return doc.output('blob'); }
function pdfBulletins(list, filename) {
  const doc = newPdf();
  list.forEach(({ e, r }, i) => { if (i) doc.addPage(); drawBulletin(doc, e, r); });
  pdfFooter(doc); saveFile(filename, doc.output('blob'));
}

/* ---------- Rendu principal ---------- */
const VIEWS = [
  ['dashboard', 'Tableau de bord'], ['salaries', 'Salariés'], ['variables', 'Variables du mois'], ['bulletins', 'Bulletins'],
  ['declarations', 'Déclarations'], ['paiement', 'Paiement'], ['rh', 'Documents RH'], ['sortie', 'Sortie'],
  ['simulateur', 'Simulateur'], ['parametres', 'Paramètres']
];
function render() {
  const ds = dossiers();
  if (S.dossierId && !D()) S.dossierId = null;
  if (!S.dossierId && ds.length) S.dossierId = ds[0].id;
  $('#dossier-sel').innerHTML = ds.length ? ds.map(d => `<option value="${d.id}" ${d.id === S.dossierId ? 'selected' : ''}>${esc(d.raison)}</option>`).join('') + '<option value="__new">+ Nouveau dossier…</option>' : '<option value="">Aucun dossier</option><option value="__new">+ Nouveau dossier…</option>';
  $('#period-lbl').textContent = periodLabel(S.period);
  const o = S.dossierId ? per() : null;
  $('#period-state').textContent = o && o.validated ? 'Validé' : 'Brouillon'; $('#period-state').className = 'pill ' + (o && o.validated ? 'ok' : 'draft');
  if (S.client && !CLIENT_VIEWS.includes(S.view)) S.view = 'dashboard';
  document.body.classList.toggle('client', !!S.client);
  if (S.client) $('#dossier-sel').innerHTML = ds.map(d => `<option value="${d.id}">${esc(d.raison)}</option>`).join('');
  $('#nav').innerHTML = VIEWS.filter(([k]) => !S.client || CLIENT_VIEWS.includes(k)).map(([k, l]) => `<button data-act="nav" data-v="${k}" class="${S.view === k ? 'on' : ''}">${l}</button>`).join('');
  const main = $('#main');
  if (S.view === 'presentation') S.view = 'dashboard';
  document.body.classList.toggle('visitor', !S.auth);
  document.body.classList.toggle('locked', !S.auth);
  if (!S.auth) { $('#nav').innerHTML = ''; main.innerHTML = vPresentation(true); afterRender(); return; }
  if (!S.dossierId && S.view !== 'simulateur' && S.view !== 'parametres' && S.view !== 'presentation') { main.innerHTML = vAccueil(); afterRender(); return; }
  const fn = { dashboard: vDashboard, salaries: vSalaries, variables: vVariables, bulletins: vBulletins, declarations: vDeclarations, paiement: vPaiement, rh: vRH, sortie: vSortie, simulateur: vSimulateur, parametres: vParametres }[S.view];
  main.innerHTML = fn();
  if (S.view === 'simulateur') simCompute();
  if (S.view === 'sortie') sortieCompute();
  afterRender();
}
function vAccueil() {
  return `<section class="card hero"><h1>Bienvenue dans RM Paie</h1><p>Paie marocaine : bulletins avec cumuls et régularisation de l’IR, CNSS, AMO, IR, DTS, documents RH, solde de tout compte, pointage et paiement.</p>
  <div class="row"><button class="btn primary" data-act="newDossier">Créer un dossier</button><button class="btn" data-act="demo">Charger un dossier de démonstration</button></div>
  <p class="muted small">Chaque dossier correspond à une société. Les données sont enregistrées ${Store.mode === 'cloud' ? 'dans votre espace privé en ligne (visible de vous seul)' : 'sur cet appareil'}.</p></section>`;
}

/* ---- Tableau de bord ---- */
function vDashboard() {
  const rows = calcAll(); const t = totaux(rows); const o = per(); const ctrl = controles(); const ech = echeances();
  return `<div class="grid kpis">
    ${kpi('Effectif', rows.length, periodLabel(S.period))}${kpi('Masse salariale brute', fmt(t.brut) + ' DH')}${kpi('Net à payer', fmt(t.net) + ' DH')}
    ${kpi('CNSS + AMO à déclarer', fmt(t.cnssTotal) + ' DH', 'Avant le 10 du mois suivant')}${kpi('IR retenu', fmt(t.ir) + ' DH')}${kpi('Coût employeur', fmt(t.cout) + ' DH')}
  </div>
  <div class="cols">
   <section class="card adm"><h2>Contrôles avant validation</h2>${ctrl.length ? '<ul class="alerts">' + ctrl.map(c => `<li class="${c.lvl}"><b>${esc(c.nom)}</b> — ${esc(c.msg)}</li>`).join('') + '</ul>' : '<p class="okmsg">Aucune anomalie détectée pour ce mois.</p>'}
   <div class="row adm">${o.validated ? '<button class="btn" data-act="reopen">Rouvrir le mois</button>' : `<button class="btn primary" data-act="validate" ${rows.length ? '' : 'disabled'}>Valider ${periodLabel(S.period)}</button>`}<button class="btn" data-act="nav" data-v="variables">Saisir les variables</button></div></section>
   <section class="card"><h2>Échéances</h2><ul class="ech">${ech.map(x => { const late = x.date < new Date(new Date().toDateString()); return `<li class="${late ? 'late' : ''}"><span>${dFr(isoDate(x.date))}</span>${esc(x.msg)}</li>`; }).join('')}</ul></section>
  </div>`;
}

/* ---- Salariés ---- */
function vSalaries() {
  const d = D(); const list = (d.employees || []).slice().sort((a, b) => (a.matricule || '').localeCompare(b.matricule || '', 'fr', { numeric: true }));
  return `<section class="card"><div class="head"><h2>Salariés (${list.length})</h2><div class="row"><button class="btn" data-act="empImport">⬆ Importer depuis Excel</button><button class="btn primary" data-act="empNew">+ Ajouter un salarié</button></div></div>
  ${list.length ? `<div class="tw"><table><thead><tr><th>Mat.</th><th>Nom</th><th>Fonction</th><th>Contrat</th><th>Embauche</th><th class="n">Salaire de base</th><th>Statut</th><th></th></tr></thead><tbody>
  ${list.map(e => `<tr><td>${esc(e.matricule)}</td><td><b>${esc(e.nom)} ${esc(e.prenom)}</b><div class="muted small">CIN ${esc(e.cin || '—')} · CNSS ${esc(e.cnss || '—')}</div></td><td>${esc(e.fonction)}</td><td>${esc(e.contrat)}</td><td>${dFr(e.dateEmbauche)}</td><td class="n">${e.typeSalaire === 'horaire' ? fmt(e.tauxHoraire) + ' /h' : fmt(e.salaireBase)}</td><td>${e.dateSortie ? '<span class="pill">Sorti le ' + dFr(e.dateSortie) + '</span>' : '<span class="pill ok">Actif</span>'}</td><td class="nowrap"><button class="btn sm" data-act="empEdit" data-id="${e.id}">Modifier</button> <button class="btn sm" data-act="pjOuvrir" data-id="${e.id}" title="Pièces jointes du salarié">📎 Ajouter${(e.pj || []).length ? ' (' + e.pj.length + ')' : ''}</button></td></tr>`).join('')}
  </tbody></table></div>` : '<p class="muted">Aucun salarié. Ajoutez le premier.</p>'}</section>`;
}
function empForm(e) {
  e = e || { id: '', contrat: 'CDI', typeSalaire: 'mensuel', situation: 'Célibataire', modePaiement: 'Virement', enfants: 0 };
  const d = D(); const nextMat = String((d.employees || []).length + 1).padStart(3, '0');
  modal(`<h2>${e.id ? 'Modifier' : 'Nouveau'} salarié</h2><form id="empf" class="fg">
  <h3 class="full">Identité</h3>
  ${field('Matricule', 'matricule', e.matricule || nextMat)}${field('Nom', 'nom', e.nom)}${field('Prénom', 'prenom', e.prenom)}
  ${field('CIN', 'cin', e.cin)}${field('N° CNSS', 'cnss', e.cnss, { inputmode: 'numeric' })}${field('Date de naissance', 'dateNaissance', e.dateNaissance, { type: 'date' })}
  ${field('Adresse', 'adresse', e.adresse, { full: true })}
  ${field('E-mail (envoi des bulletins)', 'email', e.email, { type: 'email' })}${field('Téléphone WhatsApp', 'telephone', e.telephone, { type: 'tel', ph: '06 12 34 56 78' })}
  <h3 class="full">Contrat</h3>
  ${field('Fonction', 'fonction', e.fonction)}${field('Type de contrat', 'contrat', e.contrat, { type: 'select', options: [['CDI', 'CDI'], ['CDD', 'CDD'], ['ANAPEC', 'Stage ANAPEC (Idmaj)']] })}
  ${field('Date d’embauche', 'dateEmbauche', e.dateEmbauche, { type: 'date' })}${field('Fin de CDD', 'finContrat', e.finContrat, { type: 'date' })}${field('Fin période d’essai', 'finEssai', e.finEssai, { type: 'date' })}${field('Date de sortie', 'dateSortie', e.dateSortie, { type: 'date' })}
  <h3 class="full">Rémunération</h3>
  ${field('Type de salaire', 'typeSalaire', e.typeSalaire, { type: 'select', options: [['mensuel', 'Mensuel'], ['horaire', 'Horaire']] })}
  ${field('Salaire de base mensuel (DH)', 'salaireBase', e.salaireBase, { inputmode: 'decimal' })}${field('Taux horaire (DH)', 'tauxHoraire', e.tauxHoraire, { inputmode: 'decimal' })}${field('Heures / mois (horaire)', 'heures', e.heures || 191, { inputmode: 'decimal' })}
  ${field('Primes fixes imposables / mois', 'primesFixes', e.primesFixes, { inputmode: 'decimal' })}${field('Indemnité de transport / mois', 'transportFixe', e.transportFixe, { inputmode: 'decimal' })}${field('Prime de panier / mois', 'panierFixe', e.panierFixe, { inputmode: 'decimal' })}
  ${field('CIMR salarié (%)', 'cimrSal', e.cimrSal, { inputmode: 'decimal' })}${field('CIMR patronal (%)', 'cimrPat', e.cimrPat, { inputmode: 'decimal' })}${field('Mutuelle salarié (DH)', 'mutuelleSal', e.mutuelleSal, { inputmode: 'decimal' })}${field('Mutuelle patronale (DH)', 'mutuellePat', e.mutuellePat, { inputmode: 'decimal' })}
  ${field('Report congés au 1er janvier (jours)', 'congesReport', e.congesReport, { inputmode: 'decimal' })}
  ${field('Exonération IR post-Idmaj jusqu’au', 'irExoFin', e.irExoFin, { type: 'date' })}${field('Charges prises en charge par l’État jusqu’au', 'chargesEtatFin', e.chargesEtatFin, { type: 'date' })}
  <h3 class="full">Famille et paiement</h3>
  ${field('Situation familiale', 'situation', e.situation, { type: 'select', options: ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)'] })}${field('Conjoint à charge', 'conjointCharge', e.conjointCharge, { type: 'checkbox' })}${field('Enfants à charge', 'enfants', e.enfants, { inputmode: 'numeric' })}
  ${field('Mode de paiement', 'modePaiement', e.modePaiement, { type: 'select', options: ['Virement', 'Chèque', 'Espèces'] })}${field('Banque', 'banque', e.banque)}${field('RIB (24 chiffres)', 'rib', e.rib, { inputmode: 'numeric' })}
  </form><div class="row end">${e.id ? `<button class="btn danger" data-act="empDel" data-id="${e.id}">Supprimer</button>` : ''}<button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="empSave" data-id="${e.id}">Enregistrer</button></div>`);
}

/* ---- Variables ---- */
const VARS = [['absJours', 'Absences (j)'], ['congesPris', 'Congés pris (j)'], ['hs25', 'HS 25 % (h)'], ['hs50', 'HS 50 % (h)'], ['hs100', 'HS 100 % (h)'], ['prime', 'Prime du mois'], ['autresImpos', 'Autres imposables'], ['transport', 'Transport'], ['panier', 'Panier'], ['autresExo', 'Indemn. non imposables'], ['avance', 'Avance'], ['pret', 'Remb. prêt']];
function vVariables() {
  const o = per(); const list = employesPeriode(); const dis = o.validated ? 'disabled' : '';
  return `<section class="card"><div class="head"><h2>Variables — ${periodLabel(S.period)}</h2>${o.validated ? '<span class="pill ok">Mois validé : rouvrez-le pour modifier</span>' : ''}</div>
  ${list.length ? list.map(e => {
    const v = o.vars[e.id] || {}; const r = calcEmp(e); const hasPt = o.pointage && o.pointage[e.id] && Object.keys(o.pointage[e.id]).length;
    return `<div class="varcard"><div class="vh"><div><b>${esc(e.nom)} ${esc(e.prenom)}</b> <span class="muted small">${esc(e.matricule)} · ${esc(e.fonction || '')}</span>${r.horsContrat ? `<div class="muted small">${r.horsContrat} j hors contrat déduits automatiquement (entrée/sortie)</div>` : ''}</div>
    <div class="vnet">Net <b>${fmt(r.net)}</b></div></div>
    <div class="vg">${VARS.map(([k, l]) => { const ph = k === 'transport' ? (e.transportFixe || '') : k === 'panier' ? (e.panierFixe || '') : ''; const ro = hasPt && (k === 'absJours' || k === 'congesPris') ? 'readonly title="Calculé depuis le pointage"' : ''; return `<label><span>${l}</span><input data-var="${k}" data-emp="${e.id}" inputmode="decimal" value="${esc(v[k] ?? '')}" placeholder="${esc(ph)}" ${dis} ${ro}></label>`; }).join('')}</div>
    <div class="row"><label class="sitc"><span>Situation CNSS</span><select data-var="situationCnss" data-emp="${e.id}" ${dis}>${SITUATIONS.map(([c, l]) => `<option value="${c}" ${(v.situationCnss || '') === c ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button class="btn sm" data-act="pointage" data-id="${e.id}">Pointage jour par jour${hasPt ? ' ✓' : ''}</button><button class="btn sm" data-act="showBulletin" data-id="${e.id}">Voir le bulletin</button></div></div>`;
  }).join('') : '<p class="muted">Aucun salarié actif sur ce mois.</p>'}
  ${list.length && !o.validated ? `<div class="row end"><button class="btn primary" data-act="validate">Contrôler et valider le mois</button></div>` : ''}</section>`;
}
const PT_CODES = ['', 'A', 'C', 'M', 'F', 'R']; const PT_LBL = { '': 'Présent', A: 'Absence non payée', C: 'Congé payé', M: 'Maladie', F: 'Férié', R: 'Récupération' };
function pointageModal(empId) {
  S.pointageEmp = empId; const e = D().employees.find(x => x.id === empId); const o = per(); const pt = (o.pointage && o.pointage[empId]) || {};
  const [y, m] = S.period.split('-').map(Number); const nb = new Date(y, m, 0).getDate(); const first = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  let cells = '<div class="pth">' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('') + '</div><div class="ptg">' + '<span></span>'.repeat(first);
  for (let d = 1; d <= nb; d++) { const dow = (new Date(y, m - 1, d).getDay()); const c = pt[d] || ''; cells += `<button class="pt c${c || 'P'} ${dow === 0 ? 'sun' : ''}" data-act="ptCycle" data-d="${d}" ${o.validated ? 'disabled' : ''}><i>${d}</i><b>${c || (dow === 0 ? '' : 'P')}</b></button>`; }
  cells += '</div>';
  const cnt = c => Object.values(pt).filter(x => x === c).length;
  modal(`<h2>Pointage — ${esc(e.nom)} ${esc(e.prenom)}</h2><p class="muted small">${periodLabel(S.period)} · touchez un jour pour changer : P → A → C → M → F → R</p>${cells}
  <div class="legend">${PT_CODES.slice(1).map(c => `<span class="pt c${c}"><b>${c}</b></span> ${PT_LBL[c]} (${cnt(c)})`).join(' &nbsp; ')}</div>
  <p class="small">Absences déduites : <b>${cnt('A') + cnt('M')}</b> j · Congés pris : <b>${cnt('C')}</b> j</p>
  <div class="row end"><button class="btn primary" data-act="closeModalRender">Terminé</button></div>`);
}

/* ---- Bulletins ---- */
function vBulletins() {
  const rows = calcAll(); const t = totaux(rows);
  return `<section class="card"><div class="head"><h2>Bulletins — ${periodLabel(S.period)}</h2><div class="row"><button class="btn primary" data-act="choixBulletins" ${rows.length ? '' : 'disabled'}>Tous les bulletins ▾</button><button class="btn" data-act="envoiOuvrir" ${rows.length ? '' : 'disabled'}>Envoyer aux salariés</button><button class="btn" data-act="choixLivre">Livre de paie ▾</button><button class="btn" data-act="registrePdf">Registre du personnel</button></div></div>
  <div class="tw"><table><thead><tr><th>Salarié</th><th class="n">Brut</th><th class="n">CNSS+AMO</th><th class="n">IR</th><th class="n">Net</th><th class="n">Coût</th><th></th></tr></thead><tbody>
  ${rows.map(({ e, r }) => `<tr><td><b>${esc(e.nom)} ${esc(e.prenom)}</b></td><td class="n">${fmt(r.brut)}</td><td class="n">${fmt(r.cnssSal + r.amoSal)}</td><td class="n">${fmt(r.ir)}</td><td class="n"><b>${fmt(r.net)}</b></td><td class="n">${fmt(r.cout)}</td><td class="nowrap"><button class="btn sm" data-act="showBulletin" data-id="${e.id}">Voir</button> <button class="btn sm" data-act="pdfOne" data-id="${e.id}">PDF</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td>Total</td><td class="n">${fmt(t.brut)}</td><td class="n">${fmt(t.cnssSal + t.amoSal)}</td><td class="n">${fmt(t.ir)}</td><td class="n">${fmt(t.net)}</td><td class="n">${fmt(t.cout)}</td><td></td></tr></tfoot></table></div></section>`;
}
function bulletinModal(empId) {
  const e = D().employees.find(x => x.id === empId); const r = calcEmp(e);
  const L = lignesBulletin(Object.assign({ typeHoraire: e.typeSalaire === 'horaire' }, r));
  modal(`<div class="bul"><div class="bh"><div><b>${esc(D().raison)}</b><div class="muted small">ICE ${esc(D().ice || '—')} · CNSS ${esc(D().cnss || '—')}</div></div><div class="r"><b>Bulletin de paie</b><div class="muted small">${periodLabel(r.period)}</div></div></div>
  <div class="bi"><span>${esc(e.matricule)} — <b>${esc(e.nom)} ${esc(e.prenom)}</b></span><span>${esc(e.fonction || '')}</span><span>CNSS ${esc(e.cnss || '—')}</span><span>Ancienneté ${r.ancAns} an(s)</span><span>${r.personnes} déduction(s) famille</span></div>
  <div class="tw"><table class="bt"><thead><tr><th>Rubrique</th><th class="n">Base</th><th class="n">Taux</th><th class="n">Gains</th><th class="n">Retenues</th><th class="n">Part pat.</th></tr></thead><tbody>
  ${L.map(l => l.sep ? `<tr class="sep"><td>${l.sep}</td><td></td><td></td><td class="n">${fmt(l.gain)}</td><td></td><td></td></tr>` : `<tr><td>${esc(l.lib)}</td><td class="n">${esc(l.base ?? '')}</td><td class="n">${esc(l.taux ?? '')}</td><td class="n">${l.gain == null ? '' : fmt(l.gain)}</td><td class="n">${l.ret == null ? '' : fmt(l.ret)}</td><td class="n">${l.pat == null ? '' : fmt(l.pat)}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="bnet"><div>Brut imposable <b>${fmt(r.sbi)}</b></div><div>Net imposable <b>${fmt(r.sni)}</b></div><div>Charges patronales <b>${fmt(r.totalPat)}</b></div><div class="big">Net à payer <b>${fmt(r.net)} DH</b></div></div>
  <div class="muted small">Cumuls ${r.period.slice(0, 4)} : brut imposable ${fmt(r.cum.sbi)} · IR ${fmt(r.cum.ir)} · CNSS ${fmt(r.cum.cnss)} · AMO ${fmt(r.cum.amo)} · congés : ${fmt(r.cum.congesSolde, 1)} j restants</div></div>
  <div class="row end"><button class="btn" data-act="closeModal">Fermer</button><button class="btn primary" data-act="pdfOne" data-id="${e.id}">Télécharger le PDF</button></div>`);
}

/* ---- Déclarations ---- */
function vDeclarations() {
  const rows = calcAll(); const t = totaux(rows); const Pa = P(); const y = S.period.slice(0, 4);
  const prest = r2(t.cnssSal + t.prestPat);
  return `<section class="card"><div class="head"><h2>CNSS — ${periodLabel(S.period)}</h2><div class="row"><button class="btn" data-act="cnssPdf">Bordereaux CNSS / AMO (PDF)</button><button class="btn" data-act="bdsCsv">Données (CSV)</button></div></div>
  ${vBdsBlock()}
  <div class="grid kpis s">${kpi('Salaires déclarés', fmt(t.sbi))}${kpi('Base plafonnée', fmt(t.baseCnss))}${kpi('Prestations sociales (13,46 %)', fmt(prest))}${kpi('Allocations familiales', fmt(t.afPat))}${kpi('AMO (6,37 %)', fmt(t.amoSal + t.amoPat))}${kpi('TFP', fmt(t.tfpPat))}${kpi('Total à payer CNSS', '<b>' + fmt(t.cnssTotal) + '</b>')}</div>
  <div class="tw"><table><thead><tr><th>N° CNSS</th><th>Nom</th><th class="n">Jours</th><th class="n">Salaire réel</th><th class="n">Salaire plafonné</th></tr></thead><tbody>${rows.map(({ e, r }) => `<tr><td>${esc(e.cnss || '—')}</td><td>${esc(e.nom)} ${esc(e.prenom)}</td><td class="n">${r.joursDecl}</td><td class="n">${fmt(r.sbi)}</td><td class="n">${fmt(r.baseCnss)}</td></tr>`).join('')}</tbody></table></div>
</section>
  <section class="card"><div class="head"><h2>IR — état mensuel</h2><div class="row"><button class="btn primary" data-act="irPdf">État IR (PDF)</button><button class="btn" data-act="irCsv">État IR (CSV)</button></div></div>
  <div class="tw"><table><thead><tr><th>Salarié</th><th>CIN</th><th class="n">Brut imposable</th><th class="n">Frais pro.</th><th class="n">Cotisations</th><th class="n">Net imposable</th><th class="n">Déd.</th><th class="n">IR retenu</th></tr></thead><tbody>${rows.map(({ e, r }) => `<tr><td>${esc(e.nom)} ${esc(e.prenom)}</td><td>${esc(e.cin || '')}</td><td class="n">${fmt(r.sbi)}</td><td class="n">${fmt(r.fraisPro)}</td><td class="n">${fmt(r.cnssSal + r.amoSal + r.cimrSal + r.mutSal)}</td><td class="n">${fmt(r.sni)}</td><td class="n">${r.personnes}</td><td class="n"><b>${fmt(r.ir)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="7">Total IR à verser</td><td class="n">${fmt(t.ir)}</td></tr></tfoot></table></div></section>
  <section class="card"><div class="head"><h2>Déclaration annuelle des traitements et salaires ${y} (état 9421)</h2><div class="row"><button class="btn primary adm" data-act="dtsXml">Fichier XML SIMPL-IR</button><button class="btn adm" data-act="versementsIr">Versements IR</button><button class="btn" data-act="dtsCsv">Récapitulatif (CSV)</button><button class="btn" data-act="dtsPdf">Récapitulatif (PDF)</button></div></div>
  <p class="muted small">Cumuls de l’année tirés des mois validés. À reporter sur SIMPL-IR (dépôt avant fin février ${Number(y) + 1}). ${dtsRows(y).length} salarié(s) concerné(s).</p></section>`;
}
function dtsRows(y) {
  const d = D(); const out = [];
  (d.employees || []).forEach(e => {
    let last = null; for (let m = 12; m >= 1; m--) { const o = Store.get(perKey(y + '-' + String(m).padStart(2, '0'))); if (o && o.validated && o.bulletins[e.id]) { last = o.bulletins[e.id]; break; } }
    if (last) out.push({ e, c: last.cum, r: last });
  }); return out;
}

/* ---- Paiement ---- */
function ecriture(rows) {
  const t = totaux(rows); const lib = 'Paie ' + periodLabel(S.period);
  const L = [
    ['6171', 'Rémunérations du personnel', t.brut, 0], ['6174', 'Charges sociales', t.totalPat, 0],
    ['4441', 'Caisse nationale de sécurité sociale', 0, r2(t.cnssTotal)],
    ['4443', 'Caisses de retraite (CIMR)', 0, r2(t.cimrSal + t.cimrPat)], ['4445', 'Mutuelles', 0, r2(t.mutSal + t.mutPat)],
    ['4452', 'État, impôts, taxes et assimilés (IR)', 0, t.ir], ['3431', 'Avances et acomptes au personnel', 0, r2(t.avance + t.pret)],
    ['4432', 'Rémunérations dues au personnel', 0, t.net]
  ].filter(l => Math.abs(l[2]) > 0.001 || Math.abs(l[3]) > 0.001);
  return { L, lib, td: r2(L.reduce((s, l) => s + l[2], 0)), tc: r2(L.reduce((s, l) => s + l[3], 0)) };
}
function vPaiement() {
  const rows = calcAll(); const t = totaux(rows); const ec = ecriture(rows);
  const by = m => rows.filter(x => (x.e.modePaiement || 'Virement') === m);
  return `<section class="card"><div class="head"><h2>État des paiements — ${periodLabel(S.period)}</h2><div class="row"><button class="btn primary" data-act="virementPdf">Lettre de virement (PDF)</button><button class="btn" data-act="paiementCsv">État des paiements (CSV)</button></div></div>
  <div class="grid kpis s">${['Virement', 'Chèque', 'Espèces'].map(m => kpi(m, fmt(by(m).reduce((s, x) => s + x.r.net, 0)) + ' DH', by(m).length + ' salarié(s)')).join('')}</div>
  <div class="tw"><table><thead><tr><th>Salarié</th><th>Mode</th><th>Banque</th><th>RIB</th><th class="n">Net</th></tr></thead><tbody>${rows.map(({ e, r }) => `<tr><td>${esc(e.nom)} ${esc(e.prenom)}</td><td>${esc(e.modePaiement || 'Virement')}</td><td>${esc(e.banque || '')}</td><td class="mono">${esc(e.rib || '')}</td><td class="n"><b>${fmt(r.net)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4">Total</td><td class="n">${fmt(t.net)}</td></tr></tfoot></table></div></section>
  <section class="card"><div class="head"><h2>Écriture comptable de paie (journal OD)</h2><button class="btn" data-act="choixEcriture">Exporter ▾</button></div>
  <div class="tw"><table><thead><tr><th>Compte</th><th>Intitulé</th><th class="n">Débit</th><th class="n">Crédit</th></tr></thead><tbody>${ec.L.map(l => `<tr><td class="mono">${l[0]}</td><td>${l[1]}</td><td class="n">${l[2] ? fmt(l[2]) : ''}</td><td class="n">${l[3] ? fmt(l[3]) : ''}</td></tr>`).join('')}</tbody><tfoot><tr><td></td><td>Totaux ${Math.abs(ec.td - ec.tc) < 0.01 ? '(équilibrée)' : '<span class="err">écart ' + fmt(ec.td - ec.tc) + '</span>'}</td><td class="n">${fmt(ec.td)}</td><td class="n">${fmt(ec.tc)}</td></tr></tfoot></table></div>
  <p class="muted small">Plan comptable CGNC. Le crédit 4441 regroupe parts salariale et patronale CNSS, AMO et TFP.</p></section>`;
}

/* ---- Documents RH ---- */
const RH_DOCS = [['attTravail', 'Attestation de travail'], ['attSalaire', 'Attestation de salaire'], ['cdi', 'Contrat de travail CDI'], ['cdd', 'Contrat de travail CDD'], ['avenant', 'Avenant au contrat'], ['certificat', 'Certificat de travail']];
/* ---- Sortie ---- */
function vSortie() {
  const list = D().employees || [];
  return `<section class="card"><h2>Solde de tout compte</h2><form id="sortf" class="fg">
  ${field('Salarié', 'emp', list[0] && list[0].id, { type: 'select', options: list.map(e => [e.id, (e.nom || '') + ' ' + (e.prenom || '')]) })}
  ${field('Date de sortie', 'date', isoDate(new Date()), { type: 'date' })}
  ${field('Motif', 'motif', 'Démission', { type: 'select', options: ['Démission', 'Licenciement', 'Fin de CDD', 'Rupture d’un commun accord', 'Départ à la retraite'] })}
  ${field('Préavis non effectué à payer (mois)', 'preavis', '0', { inputmode: 'decimal' })}
  ${field('Congés restants (jours, vide = solde calculé)', 'conges', '', { inputmode: 'decimal' })}
  ${field('Salaire mensuel de référence (vide = base + ancienneté)', 'ref', '', { inputmode: 'decimal' })}
  ${field('Autres sommes dues', 'autres', '0', { inputmode: 'decimal' })}
  </form><div id="sortres"></div></section>`;
}
function sortieData() {
  const f = formData($('#sortf')); const e = D().employees.find(x => x.id === f.emp); if (!e) return null;
  const Pa = P(); const dateS = new Date(f.date); const ans = e.dateEmbauche ? (dateS - new Date(e.dateEmbauche)) / (365.25 * 864e5) : 0;
  const p = f.date.slice(0, 7); const r = calcEmp(e, p);
  const ref = num(f.ref) || r2((e.typeSalaire === 'horaire' ? num(e.tauxHoraire) * Pa.heuresLegales : num(e.salaireBase)) * (1 + r.ancTaux / 100) + num(e.primesFixes));
  const tauxH = ref / Pa.heuresLegales; const tauxJ = ref / Pa.joursMois;
  const conges = f.conges === '' ? Math.max(0, r2(r.cum.congesSolde)) : num(f.conges);
  const indConges = r2(conges * tauxJ); const indPreavis = r2(num(f.preavis) * ref);
  const lic = (f.motif === 'Licenciement' && ans >= 0.5) ? indemniteLicenciement(ans, tauxH) : { heures: 0, montant: 0 };
  const autres = num(f.autres);
  return { f, e, ans, ref, tauxH, conges, indConges, indPreavis, lic, autres, total: r2(indConges + indPreavis + lic.montant + autres) };
}
function sortieCompute() {
  const s = sortieData(); const el = $('#sortres'); if (!el) return; if (!s) { el.innerHTML = '<p class="muted">Ajoutez d’abord un salarié.</p>'; return; }
  el.innerHTML = `<div class="tw"><table><tbody>
  <tr><td>Ancienneté</td><td class="n">${fmt(s.ans, 2)} ans</td></tr><tr><td>Salaire de référence</td><td class="n">${fmt(s.ref)} DH (${fmt(s.tauxH)} DH/h)</td></tr>
  <tr><td>Indemnité compensatrice de congés (${fmt(s.conges, 1)} j)</td><td class="n">${fmt(s.indConges)}</td></tr>
  <tr><td>Indemnité compensatrice de préavis</td><td class="n">${fmt(s.indPreavis)}</td></tr>
  <tr><td>Indemnité légale de licenciement (${fmt(s.lic.heures, 0)} h — art. 53)</td><td class="n">${fmt(s.lic.montant)}</td></tr>
  <tr><td>Autres sommes</td><td class="n">${fmt(s.autres)}</td></tr></tbody><tfoot><tr><td>Total brut des indemnités de sortie</td><td class="n">${fmt(s.total)}</td></tr></tfoot></table></div>
  <p class="muted small">Congés et préavis sont imposables et soumis à cotisations ; l’indemnité légale de licenciement en est exonérée dans la limite légale. « Reporter sur la paie » les ajoute aux variables du mois de sortie et renseigne la date de sortie.</p>
  <div class="row end"><button class="btn" data-act="sortieReport">Reporter sur la paie</button><button class="btn" data-act="certifPdf">Certificat de travail (PDF)</button><button class="btn primary" data-act="stcPdf">Reçu pour solde de tout compte (PDF)</button></div>`;
}

/* ---- Simulateur ---- */
function vSimulateur() {
  return `<section class="card"><h2>Simulateur de salaire ${P().annee}</h2><p class="muted small">Brut → net, CNSS, AMO, IR et coût employeur, ou net → brut.</p><form id="simf" class="fg">
  ${field('Sens du calcul', 'sens', 'brut', { type: 'select', options: [['brut', 'Brut → Net'], ['net', 'Net → Brut']] })}${field('Montant mensuel (DH)', 'montant', '10000', { inputmode: 'decimal' })}
  ${field('Ancienneté (années)', 'anc', '0', { inputmode: 'numeric' })}${field('Personnes à charge (0 à 6)', 'pers', '0', { inputmode: 'numeric' })}
  ${field('CIMR salarié (%)', 'cimr', '0', { inputmode: 'decimal' })}${field('Indemnités non imposables', 'exo', '0', { inputmode: 'decimal' })}
  </form><div id="simres"></div></section>`;
}
function simCompute() {
  const f = formData($('#simf')); const Pa = P(); const p = Pa.annee + '-12';
  const d = new Date(Pa.annee, 11, 31); d.setFullYear(d.getFullYear() - num(f.anc)); const emb = isoDate(d);
  const pers = Math.min(6, Math.max(0, Math.floor(num(f.pers))));
  const emp = { id: 'sim', typeSalaire: 'mensuel', dateEmbauche: emb, enfants: pers, conjointCharge: false, cimrSal: num(f.cimr), cimrPat: num(f.cimr) * 1.3 };
  let base;
  if (f.sens === 'net') {
    let lo = 0, hi = num(f.montant) * 2 + 5000;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; const rr = calculerBulletin({ ...emp, salaireBase: mid }, { autresExo: f.exo }, {}, Pa, p); if (rr.net < num(f.montant)) lo = mid; else hi = mid; }
    base = r2(hi);
  } else base = num(f.montant) / (1 + tauxAncienneteUI(num(f.anc)) / 100);
  const r = calculerBulletin({ ...emp, salaireBase: base }, { autresExo: f.exo }, {}, Pa, p);
  $('#simres').innerHTML = `<div class="grid kpis s">${kpi('Salaire brut', fmt(r.brut))}${kpi('Net à payer', '<b>' + fmt(r.net) + '</b>')}${kpi('Coût employeur', fmt(r.cout))}</div>
  <div class="tw"><table><tbody>
  <tr><td>Salaire de base</td><td class="n">${fmt(r.base)}</td></tr><tr><td>Prime d’ancienneté (${r.ancTaux} %)</td><td class="n">${fmt(r.primeAnc)}</td></tr>
  <tr><td>Brut imposable</td><td class="n">${fmt(r.sbi)}</td></tr><tr><td>CNSS (4,48 % plafonné à ${fmt(Pa.plafondCNSS, 0)})</td><td class="n">-${fmt(r.cnssSal)}</td></tr>
  <tr><td>AMO (2,26 %)</td><td class="n">-${fmt(r.amoSal)}</td></tr>${r.cimrSal ? `<tr><td>CIMR</td><td class="n">-${fmt(r.cimrSal)}</td></tr>` : ''}
  <tr><td>Frais professionnels (${r.fpTaux} %)</td><td class="n">${fmt(r.fraisPro)}</td></tr><tr><td>Net imposable</td><td class="n">${fmt(r.sni)}</td></tr>
  <tr><td>IR (après ${r.personnes} déduction(s))</td><td class="n">-${fmt(r.ir)}</td></tr><tr><td><b>Net à payer</b></td><td class="n"><b>${fmt(r.net)}</b></td></tr>
  <tr><td>Charges patronales (CNSS, AF, AMO, TFP${r.cimrPat ? ', CIMR' : ''})</td><td class="n">${fmt(r.totalPat)}</td></tr></tbody></table></div>`;
}
function tauxAncienneteUI(ans) { let t = 0; for (const tr of P().ancTranches) if (ans >= tr.ans) t = tr.taux; return t; }

/* ---- Paramètres ---- */
function vParametres() {
  const d = D(); const Pa = P();
  return `${d ? `<section class="card"><h2>Société — ${esc(d.raison)}</h2><form id="dosf" class="fg">${dossierFields(d)}</form><div class="row end"><button class="btn danger" data-act="dosDel">Supprimer le dossier</button><button class="btn primary" data-act="dosSave">Enregistrer</button></div></section>` : ''}
  ${vParamsExtra()}
  <section class="card"><h2>Taux et barèmes ${Pa.annee}</h2><p class="muted small">Valeurs 2026 : SMIG 17,92 DH/h (décret 2.25.983), barème IR LF 2025, charges de famille 600 DH/personne (LF 2026), CNSS plafond 6 000 DH. Idmaj : AMO prise en charge par l’État, CNSS et TFP exonérées.</p>
  <form id="parf" class="fg">
  ${field('Année', 'annee', Pa.annee)}${field('SMIG horaire', 'smigHoraire', Pa.smigHoraire)}${field('Heures légales / mois', 'heuresLegales', Pa.heuresLegales)}${field('Jours / mois', 'joursMois', Pa.joursMois)}
  ${field('Plafond CNSS', 'plafondCNSS', Pa.plafondCNSS)}${field('Prestations sociales salarié %', 'tauxPrestSal', Pa.tauxPrestSal)}${field('Prestations sociales patronal %', 'tauxPrestPat', Pa.tauxPrestPat)}${field('Allocations familiales %', 'tauxAF', Pa.tauxAF)}
  ${field('AMO salarié %', 'tauxAmoSal', Pa.tauxAmoSal)}${field('AMO patronal %', 'tauxAmoPat', Pa.tauxAmoPat)}${field('TFP %', 'tauxTFP', Pa.tauxTFP)}${field('Charges de famille / pers. / an', 'famParPersonne', Pa.famParPersonne)}
  ${field('Frais pro. seuil annuel', 'fpSeuilAnnuel', Pa.fpSeuilAnnuel)}${field('Frais pro. taux ≤ seuil %', 'fpTauxBas', Pa.fpTauxBas)}${field('Frais pro. taux > seuil %', 'fpTauxHaut', Pa.fpTauxHaut)}${field('Frais pro. plafond annuel', 'fpPlafondAnnuel', Pa.fpPlafondAnnuel)}
  ${field('Transport exonéré max / mois', 'transportExoMax', Pa.transportExoMax)}${field('ANAPEC plafond exonéré', 'anapecPlafond', Pa.anapecPlafond)}${field('ANAPEC durée (mois)', 'anapecMoisMax', Pa.anapecMoisMax)}
  ${field('Plafond IR exonéré post-Idmaj', 'irExoPostPlafond', Pa.irExoPostPlafond)}${field('Plafond charges prises en charge par l’État', 'chargesEtatPlafond', Pa.chargesEtatPlafond)}
  ${field('ANAPEC : AMO due par l’employeur', 'anapecAmoDue', Pa.anapecAmoDue, { type: 'checkbox' })}${field('Régularisation de l’IR sur le cumul annuel', 'irRegul', Pa.irRegul, { type: 'checkbox' })}
  <h3 class="full">Barème IR annuel</h3>
  ${Pa.bareme.map((b, i) => `${field('Tranche ' + (i + 1) + ' jusqu’à', 'b' + i + 'j', b.jusqua ?? '', { ph: 'au-delà' })}${field('Taux %', 'b' + i + 't', b.taux)}${field('Somme à déduire', 'b' + i + 'd', b.deduire)}`).join('')}
  </form><div class="row end"><button class="btn" data-act="parReset">Revenir aux valeurs 2026</button><button class="btn primary" data-act="parSave">Enregistrer les taux</button></div></section>
  <section class="card"><h2>Sauvegarde</h2><p class="muted small">Exportez toutes vos données (dossiers, salariés, mois) dans un fichier, ou restaurez une sauvegarde.</p>
  <div class="row"><button class="btn" data-act="backup">Exporter la sauvegarde (JSON)</button><label class="btn">Importer une sauvegarde<input type="file" id="restore" accept=".json,application/json" hidden></label></div>
  <p class="muted small">Stockage : ${Store.mode === 'cloud' ? 'espace privé en ligne, lié à votre compte' : 'cet appareil uniquement'}.</p></section>`;
}
function dossierFields(d) {
  d = d || {};
  return `${field('Raison sociale', 'raison', d.raison)}${field('Forme juridique', 'forme', d.forme, { ph: 'SARL, SARLAU, SA…' })}${field('Gérant', 'gerant', d.gerant)}
  ${field('ICE', 'ice', d.ice, { inputmode: 'numeric' })}${field('IF', 'if', d.if, { inputmode: 'numeric' })}${field('RC', 'rc', d.rc)}${field('Taxe professionnelle', 'tp', d.tp)}${field('N° affiliation CNSS', 'cnss', d.cnss, { inputmode: 'numeric' })}
  ${field('Adresse', 'adresse', d.adresse, { full: true })}${field('Ville', 'ville', d.ville)}${field('Banque', 'banque', d.banque)}${field('RIB société', 'rib', d.rib, { inputmode: 'numeric' })}${field('Activité', 'activite', d.activite)}
  ${field('Code commune (Simpl-IR)', 'communeCode', d.communeCode)}${field('Téléphone', 'telephone', d.telephone)}${field('E-mail', 'email', d.email)}`;
}

/* ---------- Actions ---------- */
const ACT = {
  nav: t => { S.view = t.dataset.v; render(); window.scrollTo(0, 0); },
  closeModal: () => closeModal(),
  closeModalRender: () => { closeModal(); render(); },
  prevP: () => { S.period = periodShift(S.period, -1); render(); },
  nextP: () => { S.period = periodShift(S.period, 1); render(); },
  newDossier: () => modal(`<h2>Nouveau dossier</h2><form id="dosnf" class="fg">${dossierFields()}</form><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="dosCreate">Créer</button></div>`),
  dosCreate: () => { const f = formData($('#dosnf')); if (!f.raison.trim()) { toast('Indiquez la raison sociale.', 'warn'); return; } const d = Object.assign({ id: uid(), employees: [], createdAt: Date.now() }, f); saveD(d); S.dossierId = d.id; closeModal(); S.view = 'salaries'; render(); toast('Dossier créé.'); },
  dosSave: () => { const d = D(); Object.assign(d, formData($('#dosf'))); saveD(d); render(); toast('Société enregistrée.'); },
  dosDel: () => modal(`<h2>Supprimer « ${esc(D().raison)} » ?</h2><p>Le dossier, ses salariés et tous ses mois de paie seront supprimés. Exportez une sauvegarde avant si besoin.</p><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn danger" data-act="dosDelOk">Supprimer définitivement</button></div>`),
  dosDelOk: () => { const id = S.dossierId; Store.keys('per-' + id + '-').forEach(k => Store.del(k)); Store.del('dos-' + id); S.dossierId = null; closeModal(); S.view = 'dashboard'; render(); toast('Dossier supprimé.'); },
  empNew: () => empForm(null),
  empEdit: t => empForm(D().employees.find(e => e.id === t.dataset.id)),
  empSave: t => {
    const f = formData($('#empf')); if (!f.nom.trim()) { toast('Indiquez le nom.', 'warn'); return; }
    if (!f.dateEmbauche) { toast('Indiquez la date d’embauche.', 'warn'); return; }
    const d = D(); d.employees = d.employees || [];
    if (t.dataset.id) { const e = d.employees.find(x => x.id === t.dataset.id); Object.assign(e, f); } else d.employees.push(Object.assign({ id: uid() }, f));
    saveD(d); closeModal(); render(); toast('Salarié enregistré.');
  },
  empDel: t => modal(`<h2>Supprimer ce salarié ?</h2><p>Préférez renseigner une date de sortie pour garder l’historique. Les bulletins déjà validés restent dans les mois concernés.</p><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn danger" data-act="empDelOk" data-id="${t.dataset.id}">Supprimer</button></div>`),
  empDelOk: t => { const d = D(); d.employees = d.employees.filter(e => e.id !== t.dataset.id); saveD(d); closeModal(); render(); },
  pointage: t => pointageModal(t.dataset.id),
  ptCycle: t => {
    const o = per(); o.pointage = o.pointage || {}; const pt = o.pointage[S.pointageEmp] = o.pointage[S.pointageEmp] || {};
    const d = t.dataset.d; const cur = pt[d] || ''; const nx = PT_CODES[(PT_CODES.indexOf(cur) + 1) % PT_CODES.length];
    if (nx) pt[d] = nx; else delete pt[d];
    const vals = Object.values(pt); o.vars[S.pointageEmp] = o.vars[S.pointageEmp] || {};
    o.vars[S.pointageEmp].absJours = String(vals.filter(x => x === 'A' || x === 'M').length); o.vars[S.pointageEmp].congesPris = String(vals.filter(x => x === 'C').length);
    savePer(o); pointageModal(S.pointageEmp);
  },
  showBulletin: t => bulletinModal(t.dataset.id),
  pdfOne: t => { const e = D().employees.find(x => x.id === t.dataset.id); pdfBulletins([{ e, r: calcEmp(e) }], 'Bulletin_' + slug(e.nom + '_' + e.prenom) + '_' + S.period + '.pdf'); },
  pdfAll: () => pdfBulletins(calcAll(), 'Bulletins_' + slug(D().raison) + '_' + S.period + '.pdf'),
  validate: () => {
    const ctrl = controles(); const errs = ctrl.filter(c => c.lvl === 'err');
    modal(`<h2>Valider ${periodLabel(S.period)}</h2>${ctrl.length ? '<ul class="alerts">' + ctrl.map(c => `<li class="${c.lvl}"><b>${esc(c.nom)}</b> — ${esc(c.msg)}</li>`).join('') + '</ul>' : '<p class="okmsg">Tous les contrôles sont passés.</p>'}
    <p class="small">La validation fige les bulletins et alimente les cumuls annuels (IR, CNSS, congés) des mois suivants.</p>
    <div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="validateOk">${errs.length ? 'Valider malgré les anomalies' : 'Valider le mois'}</button></div>`);
  },
  validateOk: () => {
    const o = per(); const rows = calcAll(); o.bulletins = {}; rows.forEach(({ e, r }) => { o.bulletins[e.id] = Object.assign(r, { snap: { nom: e.nom, prenom: e.prenom, matricule: e.matricule } }); });
    o.validated = true; o.validatedAt = Date.now(); savePer(o); closeModal(); render(); toast(periodLabel(S.period) + ' validé.');
  },
  reopen: () => { const o = per(); o.validated = false; o.bulletins = {}; savePer(o); render(); toast('Mois rouvert : les bulletins seront recalculés.', 'warn'); },
  livreCsv: () => {
    const rows = calcAll(); const H = ['Matricule', 'Nom', 'Prénom', 'CIN', 'CNSS', 'Jours', 'Salaire de base', 'Absences', 'Prime ancienneté', 'Heures sup.', 'Primes', 'Indemnités exonérées', 'Brut', 'Brut imposable', 'CNSS salarié', 'AMO salarié', 'CIMR salarié', 'Mutuelle', 'Frais pro.', 'Net imposable', 'IR', 'Avance', 'Prêt', 'Net à payer', 'CNSS patronale', 'AF', 'AMO patronale', 'TFP', 'CIMR patronale', 'Coût employeur'];
    const B = rows.map(({ e, r }) => [e.matricule, e.nom, e.prenom, e.cin, e.cnss, r.joursDecl, r.base, r.absence, r.primeAnc, r.mtHs, r2(r.primesFixes + r.primeVar + r.autresImpos), r.exo, r.brut, r.sbi, r.cnssSal, r.amoSal, r.cimrSal, r.mutSal, r.fraisPro, r.sni, r.ir, r.avance, r.pret, r.net, r.prestPat, r.afPat, r.amoPat, r.tfpPat, r.cimrPat, r.cout].map((x, i) => i > 5 ? fmtCsv(x) : x));
    saveFile('Livre_de_paie_' + slug(D().raison) + '_' + S.period + '.csv', csv([H, ...B]));
  },
  livrePdf: () => {
    const rows = calcAll(); const t = totaux(rows); const doc = newPdf('l'); const y = pdfHeader(doc, 'LIVRE DE PAIE', periodLabel(S.period));
    doc.autoTable({ ...AT, startY: y, styles: { ...AT.styles, fontSize: 7 }, head: [['Mat.', 'Nom', 'Jrs', 'Base', 'Anc.', 'HS', 'Primes', 'Exo.', 'Brut', 'CNSS', 'AMO', 'CIMR', 'Net imp.', 'IR', 'Ret.', 'Net', 'Patronal', 'Coût']],
      body: rows.map(({ e, r }) => [e.matricule, e.nom + ' ' + e.prenom, r.joursDecl, fmt(r.base - r.absence), fmt(r.primeAnc), fmt(r.mtHs), fmt(r.primesFixes + r.primeVar + r.autresImpos), fmt(r.exo), fmt(r.brut), fmt(r.cnssSal), fmt(r.amoSal), fmt(r.cimrSal), fmt(r.sni), fmt(r.ir), fmt(r.avance + r.pret), fmt(r.net), fmt(r.totalPat), fmt(r.cout)]),
      foot: [['', 'TOTAL', '', '', '', '', '', fmt(t.exo), fmt(t.brut), fmt(t.cnssSal), fmt(t.amoSal), fmt(t.cimrSal), fmt(t.sni), fmt(t.ir), fmt(t.avance + t.pret), fmt(t.net), fmt(t.totalPat), fmt(t.cout)]], footStyles: { fillColor: [232, 242, 239], textColor: 0, fontStyle: 'bold' } });
    pdfFooter(doc); saveFile('Livre_de_paie_' + slug(D().raison) + '_' + S.period + '.pdf', doc.output('blob'));
  },
  registrePdf: () => {
    const d = D(); const doc = newPdf('l'); const y = pdfHeader(doc, 'REGISTRE DU PERSONNEL', 'Au ' + dFr(isoDate(new Date())));
    doc.autoTable({ ...AT, startY: y, head: [['Mat.', 'Nom et prénom', 'CIN', 'N° CNSS', 'Naissance', 'Fonction', 'Contrat', 'Embauche', 'Sortie']], body: (d.employees || []).map(e => [e.matricule, e.nom + ' ' + e.prenom, e.cin, e.cnss, dFr(e.dateNaissance), e.fonction, e.contrat, dFr(e.dateEmbauche), dFr(e.dateSortie)]) });
    pdfFooter(doc); saveFile('Registre_personnel_' + slug(d.raison) + '.pdf', doc.output('blob'));
  },
  bdsCsv: () => {
    const rows = calcAll(); const d = D();
    const H = ['N° affiliation', 'Période', 'N° immatriculation', 'Nom', 'Prénom', 'CIN', 'Jours déclarés', 'Salaire réel', 'Salaire plafonné', 'Allocations familiales (enfants)'];
    saveFile('eBDS_donnees_' + slug(d.raison) + '_' + S.period + '.csv', csv([H, ...rows.map(({ e, r }) => [d.cnss, S.period.replace('-', ''), e.cnss, e.nom, e.prenom, e.cin, r.joursDecl, fmtCsv(r.sbi), fmtCsv(r.baseCnss), e.enfants || 0])]));
  },
  cnssPdf: () => {
    const rows = calcAll(); const t = totaux(rows); const Pa = P(); const doc = newPdf(); let y = pdfHeader(doc, 'BORDEREAU CNSS / AMO', periodLabel(S.period));
    doc.autoTable({ ...AT, startY: y, head: [['N° CNSS', 'Nom et prénom', 'Jours', 'Salaire réel', 'Salaire plafonné']], body: rows.map(({ e, r }) => [e.cnss || '', e.nom + ' ' + e.prenom, r.joursDecl, fmt(r.sbi), fmt(r.baseCnss)]), foot: [['', 'Total', rows.reduce((s, x) => s + x.r.joursDecl, 0), fmt(t.sbi), fmt(t.baseCnss)]], footStyles: { fillColor: [232, 242, 239], textColor: 0, fontStyle: 'bold' }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
    y = doc.lastAutoTable.finalY + 6;
    doc.autoTable({ ...AT, startY: y, head: [['Branche', 'Assiette', 'Taux', 'Montant']], body: [
      ['Prestations sociales', fmt(t.baseCnss), fmt(Pa.tauxPrestSal + Pa.tauxPrestPat) + ' %', fmt(t.cnssSal + t.prestPat)], ['Allocations familiales', fmt(t.baseAf), fmt(Pa.tauxAF) + ' %', fmt(t.afPat)],
      ['Taxe de formation professionnelle', fmt(t.baseAf), fmt(Pa.tauxTFP) + ' %', fmt(t.tfpPat)], ['Assurance maladie obligatoire (AMO)', fmt(t.baseAmo), fmt(Pa.tauxAmoSal + Pa.tauxAmoPat) + ' %', fmt(t.amoSal + t.amoPat)]],
      foot: [['TOTAL À PAYER', '', '', fmt(t.cnssTotal)]], footStyles: { fillColor: [19, 35, 58], textColor: 255, fontStyle: 'bold' }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
    pdfFooter(doc); saveFile('Bordereau_CNSS_' + slug(D().raison) + '_' + S.period + '.pdf', doc.output('blob'));
  },
  irCsv: () => { const rows = calcAll(); saveFile('Etat_IR_' + slug(D().raison) + '_' + S.period + '.csv', csv([['Nom', 'Prénom', 'CIN', 'CNSS', 'Brut imposable', 'Frais professionnels', 'Cotisations', 'Net imposable', 'Personnes à charge', 'IR retenu'], ...rows.map(({ e, r }) => [e.nom, e.prenom, e.cin, e.cnss, fmtCsv(r.sbi), fmtCsv(r.fraisPro), fmtCsv(r.cnssSal + r.amoSal + r.cimrSal + r.mutSal), fmtCsv(r.sni), r.personnes, fmtCsv(r.ir)])])); },
  irPdf: () => {
    const rows = calcAll(); const t = totaux(rows); const doc = newPdf(); const y = pdfHeader(doc, 'ÉTAT IR MENSUEL', periodLabel(S.period));
    doc.autoTable({ ...AT, startY: y, head: [['Nom et prénom', 'CIN', 'Brut imposable', 'Frais pro.', 'Cotisations', 'Net imposable', 'Déd.', 'IR']], body: rows.map(({ e, r }) => [e.nom + ' ' + e.prenom, e.cin || '', fmt(r.sbi), fmt(r.fraisPro), fmt(r.cnssSal + r.amoSal + r.cimrSal + r.mutSal), fmt(r.sni), r.personnes, fmt(r.ir)]), foot: [['Total', '', fmt(t.sbi), fmt(t.fraisPro), fmt(t.cnssSal + t.amoSal + t.cimrSal + t.mutSal), fmt(t.sni), '', fmt(t.ir)]], footStyles: { fillColor: [232, 242, 239], textColor: 0, fontStyle: 'bold' } });
    pdfFooter(doc); saveFile('Etat_IR_' + slug(D().raison) + '_' + S.period + '.pdf', doc.output('blob'));
  },
  dtsCsv: () => {
    const y = S.period.slice(0, 4); const R = dtsRows(y);
    if (!R.length) { toast('Aucun mois validé sur ' + y + '.', 'warn'); return; }
    saveFile('DTS_9421_' + slug(D().raison) + '_' + y + '.csv', csv([['Nom', 'Prénom', 'CIN', 'N° CNSS', 'Date embauche', 'Date sortie', 'Mois payés', 'Jours', 'Brut imposable', 'Frais professionnels', 'Cotisations CNSS', 'Cotisations AMO', 'CIMR', 'Net imposable', 'Personnes à charge', 'IR retenu'], ...R.map(({ e, c, r }) => [e.nom, e.prenom, e.cin, e.cnss, dFr(e.dateEmbauche), dFr(e.dateSortie), c.n, c.jours, fmtCsv(c.sbi), fmtCsv(c.fp), fmtCsv(c.cnss), fmtCsv(c.amo), fmtCsv(c.cimr), fmtCsv(c.sni), r.personnes, fmtCsv(c.ir)])]));
  },
  dtsPdf: () => {
    const y = S.period.slice(0, 4); const R = dtsRows(y); if (!R.length) { toast('Aucun mois validé sur ' + y + '.', 'warn'); return; }
    const doc = newPdf('l'); const sy = pdfHeader(doc, 'RÉCAPITULATIF DTS ' + y, 'État 9421');
    doc.autoTable({ ...AT, startY: sy, head: [['Nom et prénom', 'CIN', 'CNSS', 'Mois', 'Jours', 'Brut imposable', 'Frais pro.', 'CNSS', 'AMO', 'CIMR', 'Net imposable', 'IR']], body: R.map(({ e, c }) => [e.nom + ' ' + e.prenom, e.cin, e.cnss, c.n, c.jours, fmt(c.sbi), fmt(c.fp), fmt(c.cnss), fmt(c.amo), fmt(c.cimr), fmt(c.sni), fmt(c.ir)]) });
    pdfFooter(doc); saveFile('DTS_9421_' + slug(D().raison) + '_' + y + '.pdf', doc.output('blob'));
  },
  paiementCsv: () => { const rows = calcAll(); saveFile('Paiements_' + slug(D().raison) + '_' + S.period + '.csv', csv([['Matricule', 'Nom', 'Prénom', 'Mode', 'Banque', 'RIB', 'Net à payer'], ...rows.map(({ e, r }) => [e.matricule, e.nom, e.prenom, e.modePaiement || 'Virement', e.banque, e.rib, fmtCsv(r.net)])])); },
  virementPdf: () => {
    const d = D(); const rows = calcAll().filter(x => (x.e.modePaiement || 'Virement') === 'Virement'); const tot = r2(rows.reduce((s, x) => s + x.r.net, 0));
    const doc = newPdf(); let y = pdfHeader(doc, 'ORDRE DE VIREMENT', periodLabel(S.period));
    doc.setFontSize(10); doc.text((d.ville || '') + ', le ' + dFr(isoDate(new Date())), 196, y + 2, { align: 'right' });
    doc.text('À l’attention de ' + (d.banque || 'notre banque'), 14, y + 10);
    const txt = 'Par la présente, nous vous prions de bien vouloir débiter notre compte n° ' + (d.rib || '____________________') + ' de la somme de ' + fmt(tot) + ' DH, et de virer les salaires du mois de ' + periodLabel(S.period) + ' aux bénéficiaires ci-dessous :';
    doc.text(doc.splitTextToSize(txt, 182), 14, y + 20);
    doc.autoTable({ ...AT, startY: y + 34, head: [['Bénéficiaire', 'Banque', 'RIB', 'Montant (DH)']], body: rows.map(({ e, r }) => [e.nom + ' ' + e.prenom, e.banque || '', e.rib || '', fmt(r.net)]), foot: [['Total', '', '', fmt(tot)]], footStyles: { fillColor: [232, 242, 239], textColor: 0, fontStyle: 'bold' }, columnStyles: { 3: { halign: 'right' } } });
    y = doc.lastAutoTable.finalY + 14; doc.text('Signature et cachet', 140, y);
    pdfFooter(doc); saveFile('Ordre_virement_' + slug(d.raison) + '_' + S.period + '.pdf', doc.output('blob'));
  },
  ecriturePdf: () => {
    const ec = ecriture(calcAll()); const dt = dFr(isoDate(finDeMois(S.period))); const doc = newPdf();
    const y = pdfHeader(doc, 'ÉCRITURE COMPTABLE DE PAIE', 'Journal OD · ' + periodLabel(S.period) + ' · au ' + dt);
    const td = ec.L.reduce((a, l) => a + (l[2] || 0), 0), tc = ec.L.reduce((a, l) => a + (l[3] || 0), 0);
    doc.autoTable({ ...AT, startY: y, head: [['Journal', 'Date', 'Compte', 'Libellé', 'Débit', 'Crédit']],
      body: ec.L.map(l => ['OD', dt, l[0], ec.lib + ' — ' + l[1], l[2] ? fmt(l[2]) : '', l[3] ? fmt(l[3]) : '']),
      foot: [['', '', '', Math.abs(td - tc) < 0.01 ? 'Totaux (équilibrée)' : 'Totaux (écart ' + fmt(td - tc) + ')', fmt(td), fmt(tc)]],
      footStyles: { fillColor: [232, 242, 239], textColor: 0, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 22 }, 2: { cellWidth: 18 }, 4: { halign: 'right', cellWidth: 26 }, 5: { halign: 'right', cellWidth: 26 } } });
    let y2 = doc.lastAutoTable.finalY + 6; doc.setFontSize(8); doc.setTextColor(90);
    doc.text(doc.splitTextToSize('Plan comptable CGNC. Le crédit 4441 regroupe parts salariale et patronale CNSS, AMO et TFP.', 180), 15, y2);
    pdfFooter(doc); saveFile('Ecriture_paie_' + slug(D().raison) + '_' + S.period + '.pdf', doc.output('blob'));
  },
  ecritureCsv: () => { const ec = ecriture(calcAll()); const dt = dFr(isoDate(finDeMois(S.period))); saveFile('Ecriture_paie_' + slug(D().raison) + '_' + S.period + '.csv', csv([['Journal', 'Date', 'Compte', 'Libellé', 'Débit', 'Crédit'], ...ec.L.map(l => ['OD', dt, l[0], ec.lib + ' — ' + l[1], l[2] ? fmtCsv(l[2]) : '', l[3] ? fmtCsv(l[3]) : ''])])); },
  rhPdf: () => rhPdf(formData($('#rhf'))),
  stcPdf: () => stcPdf(sortieData()),
  certifPdf: () => { const s = sortieData(); rhPdf({ emp: s.e.id, doc: 'certificat', signataire: D().gerant ? D().gerant + ', Gérant' : '', lieu: D().ville, dateSortie: s.f.date }); },
  sortieReport: () => {
    const s = sortieData(); const d = D(); const e = d.employees.find(x => x.id === s.e.id); e.dateSortie = s.f.date; saveD(d);
    const p = s.f.date.slice(0, 7); const o = Store.get(perKey(p)) || { dossierId: S.dossierId, period: p, vars: {}, pointage: {}, validated: false, bulletins: {} };
    if (o.validated) { toast('Le mois de sortie est déjà validé : rouvrez-le d’abord.', 'warn'); return; }
    const v = o.vars[e.id] = o.vars[e.id] || {};
    v.autresImpos = String(r2(num(v.autresImpos) + s.indConges + s.indPreavis + s.autres)); v.autresExo = String(r2(num(v.autresExo) + s.lic.montant));
    Store.put(perKey(p), o); S.period = p; S.view = 'variables'; render(); toast('Indemnités reportées sur ' + periodLabel(p) + '.');
  },
  parSave: () => {
    const f = formData($('#parf')); const Pa = P(); const o = {};
    Object.keys(DEFAULT_PARAMS).forEach(k => { if (k in f && typeof DEFAULT_PARAMS[k] === 'number') o[k] = num(f[k]); });
    o.anapecAmoDue = !!f.anapecAmoDue; o.irRegul = !!f.irRegul;
    o.bareme = Pa.bareme.map((b, i) => ({ jusqua: f['b' + i + 'j'] === '' ? null : num(f['b' + i + 'j']), taux: num(f['b' + i + 't']), deduire: num(f['b' + i + 'd']) }));
    o.ancTranches = Pa.ancTranches; Store.put('params', o); render(); toast('Taux enregistrés. Les mois validés ne sont pas recalculés.');
  },
  parReset: () => { Store.put('params', clone(DEFAULT_PARAMS)); render(); toast('Valeurs 2026 rétablies.'); },
  backup: () => saveFile('RM_Paie_sauvegarde_' + isoDate(new Date()) + '.json', JSON.stringify({ app: 'rm-paie', v: 1, at: Date.now(), docs: Store.docs }, null, 1)),
  demo: () => creerDemo()
};
document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t && !t.disabled && ACT[t.dataset.act]) { e.preventDefault(); ACT[t.dataset.act](t, e); } });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'dossier-sel') { if (t.value === '__new') { ACT.newDossier(); t.value = S.dossierId || ''; } else { S.dossierId = t.value; render(); } return; }
  if (t.id === 'restore') { const file = t.files[0]; if (!file) return; file.text().then(txt => { try { const j = JSON.parse(txt); if (j.app !== 'rm-paie' || !j.docs) throw 0; Object.entries(j.docs).forEach(([k, v]) => Store.put(k, v)); S.dossierId = null; render(); toast('Sauvegarde restaurée.'); } catch (er) { toast('Fichier de sauvegarde invalide.', 'err'); } }); return; }
  if (t.closest('#simf')) simCompute();
  if (t.closest('#sortf')) sortieCompute();
});
let varTimer;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.var) {
    const o = per(); o.vars[t.dataset.emp] = o.vars[t.dataset.emp] || {}; o.vars[t.dataset.emp][t.dataset.var] = t.value; savePer(o);
    clearTimeout(varTimer); varTimer = setTimeout(() => { const card = t.closest('.varcard'); const emp = D().employees.find(x => x.id === t.dataset.emp); if (card && emp) card.querySelector('.vnet b').textContent = fmt(calcEmp(emp).net); }, 250);
  }
  if (t.closest('#simf')) simCompute();
  if (t.closest('#sortf')) sortieCompute();
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ---------- Documents RH (PDF texte) ---------- */
function stcPdf(s) {
  if (!s) return; const d = D(); const e = s.e;
  const doc = newPdf(); let y = pdfHeader(doc, 'REÇU POUR SOLDE DE TOUT COMPTE', '') + 6;
  doc.setFontSize(10.5);
  const intro = 'Je soussigné(e) M./Mme ' + e.nom + ' ' + e.prenom + ', CIN n° ' + (e.cin || '—') + ', employé(e) en qualité de ' + (e.fonction || '—') + ' du ' + dFr(e.dateEmbauche) + ' au ' + dFr(s.f.date) + ' (motif : ' + s.f.motif + '), reconnais avoir reçu de la société ' + d.raison + ' la somme brute de ' + fmt(s.total) + ' DH, au titre de :';
  doc.text(doc.splitTextToSize(intro, 180), 15, y); y += 22;
  doc.autoTable({ ...AT, startY: y, head: [['Élément', 'Montant (DH)']], body: [['Indemnité compensatrice de congés payés (' + fmt(s.conges, 1) + ' j)', fmt(s.indConges)], ['Indemnité compensatrice de préavis', fmt(s.indPreavis)], ['Indemnité légale de licenciement (art. 53)', fmt(s.lic.montant)], ['Autres sommes', fmt(s.autres)]], foot: [['Total brut', fmt(s.total)]], footStyles: { fillColor: [232, 242, 239], textColor: 0, fontStyle: 'bold' }, columnStyles: { 1: { halign: 'right' } } });
  y = doc.lastAutoTable.finalY + 8;
  const t2 = 'Ce reçu, établi en deux exemplaires dont un m’a été remis, peut être dénoncé dans les soixante jours suivant sa signature, conformément à l’article 74 du Code du travail. Les sommes ci-dessus s’entendent avant retenues légales, figurant sur le dernier bulletin de paie.';
  doc.text(doc.splitTextToSize(t2, 180), 15, y); y += 22;
  doc.text((d.ville || '') + ', le ' + dFr(s.f.date), 195, y, { align: 'right' }); y += 10;
  doc.text('L’Employeur', 30, y); doc.text('Le Salarié — « Pour solde de tout compte »', 110, y);
  pdfFooter(doc); saveFile('Solde_de_tout_compte_' + slug(e.nom + '_' + e.prenom) + '.pdf', doc.output('blob'));
}

/* ---------- Démo (données fictives) ---------- */
function creerDemo() {
  const id = uid(); const y = Number(S.period.slice(0, 4));
  const d = { id, raison: 'Riad Atlas Démo SARL', forme: 'SARL', gerant: 'Karim Alaoui', ice: '001234567000089', if: '12345678', rc: '98765', tp: '45100001', cnss: '7654321', adresse: '12 Derb Sidi Ahmed, Médina', ville: 'Marrakech', banque: 'Banque Exemple', rib: '011450000012345678901234', activite: 'Maison d’hôtes', createdAt: Date.now(), employees: [
    { id: uid(), matricule: '001', nom: 'BENNANI', email: 'salma.bennani@exemple.ma', telephone: '0612345601', prenom: 'Salma', cin: 'EE123456', cnss: '112233445', dateNaissance: '1990-04-12', fonction: 'Responsable réception', contrat: 'CDI', dateEmbauche: (y - 6) + '-03-01', typeSalaire: 'mensuel', salaireBase: '9000', primesFixes: '500', transportFixe: '300', situation: 'Marié(e)', conjointCharge: false, enfants: '2', modePaiement: 'Virement', banque: 'Banque Exemple', rib: '011450000099887766554433', cimrSal: '3', cimrPat: '3.9' },
    { id: uid(), matricule: '002', nom: 'EL AMRANI', email: 'youssef.elamrani@exemple.ma', telephone: '0612345602', prenom: 'Youssef', cin: 'EE654321', cnss: '223344556', dateNaissance: '1995-09-30', fonction: 'Cuisinier', contrat: 'CDI', dateEmbauche: (y - 3) + '-06-15', typeSalaire: 'mensuel', salaireBase: '4800', panierFixe: '400', transportFixe: '250', situation: 'Célibataire', enfants: '0', modePaiement: 'Virement', banque: 'Banque Exemple', rib: '011450000011223344556677' },
    { id: uid(), matricule: '003', nom: 'OUAZZANI', email: 'fatima.ouazzani@exemple.ma', telephone: '0612345603', prenom: 'Fatima', cin: 'E987654', cnss: '334455667', dateNaissance: '1987-01-20', fonction: 'Femme de chambre', contrat: 'CDI', dateEmbauche: (y - 13) + '-01-10', typeSalaire: 'horaire', tauxHoraire: '18.50', heures: '191', situation: 'Marié(e)', conjointCharge: true, enfants: '3', modePaiement: 'Espèces' },
    { id: uid(), matricule: '004', nom: 'TAZI', email: 'omar.tazi@exemple.ma', telephone: '0612345604', prenom: 'Omar', cin: 'EE778899', cnss: '445566778', dateNaissance: '2001-11-02', fonction: 'Assistant commercial', contrat: 'ANAPEC', dateEmbauche: y + '-02-01', typeSalaire: 'mensuel', salaireBase: '3500', situation: 'Célibataire', enfants: '0', modePaiement: 'Virement', banque: 'Banque Exemple', rib: '0114500000' },
    { id: uid(), matricule: '005', nom: 'IDRISSI', email: 'nadia.idrissi@exemple.ma', telephone: '0612345605', prenom: 'Nadia', cin: 'EE445566', cnss: '', dateNaissance: '1998-07-07', fonction: 'Serveuse', contrat: 'CDD', dateEmbauche: y + '-05-01', finContrat: isoDate(new Date(Date.now() + 25 * 864e5)), typeSalaire: 'mensuel', salaireBase: '3300', situation: 'Célibataire', enfants: '0', modePaiement: 'Virement', banque: 'Banque Exemple', rib: '011450000055667788990011' }
  ] };
  saveD(d); S.dossierId = id;
  const o = { dossierId: id, period: S.period, vars: {}, pointage: {}, validated: false, bulletins: {} };
  o.vars[d.employees[0].id] = { prime: '1000', hs25: '4' }; o.vars[d.employees[1].id] = { absJours: '1', hs50: '6', avance: '500' };
  Store.put(perKey(S.period, id), o); S.view = 'dashboard'; render(); toast('Dossier de démonstration créé (données fictives).');
}

