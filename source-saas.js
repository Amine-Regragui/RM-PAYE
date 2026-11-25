/* =====================================================================
   RM Paie — couche commerciale : comptes Supabase, Mon compte, back-office
   ===================================================================== */
const CFG = window.RMPAIE_CONFIG || {};
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
const SAAS = { session: null, ctx: null, org: null, superAdmin: false };
window.EXTRA_VIEWS = window.EXTRA_VIEWS || {};

/* ---------- Adaptateur : l'API de stockage du logiciel → tables Supabase ---------- */
const errCode = e => { const x = new Error(e && e.message || 'erreur'); x.code = e && (e.code === '42501' || /row-level security/i.test(e.message || '')) ? 'not_granted' : 'unavailable'; return x; };
const snapDoc = (id, data) => ({ id, exists: data != null, data: () => data, metadata: {} });
function colCabinet() {
  const q = {
    limit: () => q,
    get: async () => {
      if (!SAAS.org) return { docs: [], empty: true, size: 0 };
      const rows = []; let from = 0;
      for (;;) {
        const { data, error } = await sb.from('documents').select('cle, data').eq('org_id', SAAS.org.id).range(from, from + 999);
        if (error) throw errCode(error); rows.push(...data); if (data.length < 1000) break; from += 1000;
      }
      const docs = rows.map(r => snapDoc(r.cle, r.data)); return { docs, empty: !docs.length, size: docs.length };
    },
    doc: k => ({
      id: k,
      get: async () => { const { data } = await sb.from('documents').select('data').eq('org_id', SAAS.org.id).eq('cle', k).maybeSingle(); return snapDoc(k, data ? data.data : null); },
      set: async d => { const { error } = await sb.from('documents').upsert({ org_id: SAAS.org.id, cle: k, data: d, maj_le: new Date().toISOString() }); if (error) throw errCode(error); },
      delete: async () => { const { error } = await sb.from('documents').delete().eq('org_id', SAAS.org.id).eq('cle', k); if (error) throw errCode(error); }
    })
  };
  return q;
}
function colEspaces() {
  return {
    doc: id => ({
      get: async () => { const { data, error } = await sb.rpc('lire_espace', { p_id: id }); if (error) throw errCode(error); return snapDoc(id, data); },
      set: async d => { const { error } = await sb.from('espaces').upsert({ id, org_id: SAAS.org.id, data: d, maj_le: new Date().toISOString() }); if (error) throw errCode(error); },
      delete: async () => { const { error } = await sb.from('espaces').delete().eq('id', id); if (error) throw errCode(error); }
    })
  };
}
const DBA = {
  collection: p => p === 'cabinet' ? colCabinet() : p === 'espaces' ? colEspaces() : { limit() { return this; }, get: async () => ({ docs: [], empty: true, size: 0 }), doc: () => ({ get: async () => snapDoc('', null), set: async () => { }, delete: async () => { } }) },
  doc: p => {
    if (p === 'public/tarifs') return {
      get: async () => { const { data } = await sb.from('parametres').select('valeur').eq('cle', 'tarifs').maybeSingle(); return snapDoc('tarifs', data ? data.valeur : null); },
      set: async v => { const { error } = await sb.from('parametres').update({ valeur: v, maj_le: new Date().toISOString() }).eq('cle', 'tarifs'); if (error) throw errCode(error); }
    };
    return { get: async () => snapDoc('', null), set: async () => { } };
  }
};
const USR = {
  canEdit: async () => !!(SAAS.org || SAAS.superAdmin), isOwner: async () => !!SAAS.org,
  id: async () => SAAS.session ? SAAS.session.user.id : null, can: async () => null
};
const _claudeHote = window.claude;
window.claude = { use: async n => n === 'db' ? DBA : n === 'user' ? USR : (_claudeHote && _claudeHote.use ? _claudeHote.use(n) : null) };

/* ---------- Connexion, inscription, mot de passe ---------- */
function vClientLogin() {
  return `<div class="login"><div class="lb">RM Paie</div><h1>Connexion</h1>
    <form id="loginf" class="fg">${field('Identifiant', 'ident', '', { full: true })}${field('Mot de passe', 'pwd', '', { type: 'password', full: true })}</form>
    <label class="small chk"><input type="checkbox" id="voirpwd"> <span>Afficher le mot de passe</span></label>
    <div class="row end"><button class="btn primary" data-act="clientLogin">Se connecter</button></div>
    <p class="small"><button class="lnk" data-act="mdpOublie">Mot de passe oublié ?</button></p><p id="loginerr" class="err small"></p></div>`;
}
function vInscription() {
  return `<div class="login"><div class="lb">RM Paie</div><h1>Inscription</h1><ol class="etapes"><li class="on">Votre compte</li><li>Fiche de la société</li></ol><p class="muted">Essai gratuit ${tarifs().essai} jours, sans carte bancaire. Après la création du compte, vous renseignez la fiche de la société (forme juridique, IF, RC, CNSS, adresse) et joignez le registre de commerce.</p>
  <form id="inscf" class="fg">
   <label class="hp" aria-hidden="true">Ne pas remplir <input name="site_web" tabindex="-1" autocomplete="off"></label>
   ${field('Raison sociale', 'raison_sociale', '', { full: true })}
   ${field('Vous êtes', 'type', 'entreprise', { type: 'select', options: [['entreprise', 'Une entreprise'], ['cabinet', 'Un cabinet comptable']] })}${field('ICE', 'ice', '', { inputmode: 'numeric' })}
   ${field('Nom et prénom', 'nom', '')}${field('Téléphone', 'telephone', '', { type: 'tel', ph: '+212 6…' })}
   ${field('Adresse e-mail (identifiant de connexion)', 'email', '', { type: 'email', full: true })}
   ${field('Mot de passe', 'pwd', '', { type: 'password' })}${field('Confirmation', 'pwd2', '', { type: 'password' })}
   <label class="f chk full"><input type="checkbox" name="cgu"><span>J’accepte les <a href="cgu.html" target="_blank">conditions générales</a> et la <a href="confidentialite.html" target="_blank">politique de confidentialité</a>.</span></label>
  </form><p id="inscerr" class="err small"></p>
  <div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="inscrire">Créer mon compte</button></div></div>`;
}
function majBoutonAuth() {
  let b = $('#authbtn'); if (!b) { b = document.createElement('button'); b.id = 'authbtn'; b.className = 'authbtn'; $('.ctl').appendChild(b); }
  let i = $('#inscbtn'); if (!i) { i = document.createElement('button'); i.id = 'inscbtn'; i.className = 'langbtn'; i.dataset.act = 'inscription'; $('.ctl').insertBefore(i, b); }
  const visiteur = !S.auth && !(typeof SAAS !== 'undefined' && SAAS.session);
  i.className = 'langbtn inscbtn'; i.textContent = tr('Inscription'); i.title = tr('Créer un compte et renseigner la fiche de votre société');
  i.style.display = visiteur ? '' : 'none';
  const T = tarifs(), mail = T.email || 'contact@rmpaie.ma';
  let c = $('#ctcbtn'); if (!c) { c = document.createElement('button'); c.id = 'ctcbtn'; c.className = 'langbtn ctc'; c.dataset.act = 'contactOuvrir'; $('.ctl').insertBefore(c, $('#langbtn') || i); }
  c.innerHTML = '<span aria-hidden="true">☎</span><span class="lbl">' + esc(tr('Contact')) + '</span>'; c.title = tr('Contact');
  let m = $('#mailbtn'); if (!m) { m = document.createElement('a'); m.id = 'mailbtn'; m.className = 'langbtn ctc'; $('.ctl').insertBefore(m, c.nextSibling); }
  m.href = 'mailto:' + mail + '?subject=' + encodeURIComponent('Demande d’information — RM Paie');
  m.innerHTML = '<span aria-hidden="true">✉</span><span class="lbl">' + esc(tr('Nous écrire')) + '</span>'; m.title = tr('Envoyer un e-mail à ') + mail;
  let g = $('#regbtn'); if (!g) { g = document.createElement('a'); g.id = 'regbtn'; g.className = 'langbtn ctc'; g.href = 'reglementation.html'; $('.ctl').insertBefore(g, c); }
  g.innerHTML = '<span aria-hidden="true">§</span><span class="lbl">' + esc(tr('Réglementation')) + '</span>'; g.title = tr('Réglementation de la paie, avec les sources officielles');
  b.dataset.act = S.auth ? 'logout' : 'login';
  b.textContent = S.auth ? tr('Déconnexion') + ' · ' + S.auth.ident : tr('Connexion');
}
function restaurerSession() { }
function vUtilisateurs() { return ''; }
function vTarifsParams() { return ''; }
async function deconnexion() {
  if (S.client && !SAAS.session) { Store.docs = {}; S.dossierId = null; S.auth = null; closeModal(); render(); return; }
  await sb.auth.signOut(); relancer();
}
const ecritureOuverte = () => !SAAS.org || ['essai', 'actif'].includes(SAAS.org.statut);

Object.assign(ACT, {
  login: () => modal(vClientLogin('pro')),
  loginTab: t => modal(vClientLogin(t.dataset.m)),
  inscription: () => { window.__inscOuverte = Date.now(); modal(vInscription()); },
  logout: () => deconnexion(),
  clientLogin: async t => {
    const form = $('#loginf'); const f = formData(form); const err = $('#loginerr'); err.textContent = '';
    const lbl = t.textContent; t.disabled = true; t.textContent = tr('Connexion…');
    try {
      if (!f.ident.trim() || !f.pwd) throw new Error('Saisissez l’identifiant et le mot de passe.');
      if (!f.ident.includes('@')) {
        S.client = true; Store.mode = 'memory'; await espaceOuvrir(f.ident, f.pwd); closeModal(); render();
      } else {
        const lent = setTimeout(() => { err.textContent = tr('Chargement en cours, merci de patienter quelques secondes…'); }, 4000);
        const { error } = await sb.auth.signInWithPassword({ email: f.ident.trim().toLowerCase(), password: f.pwd }).finally(() => { clearTimeout(lent); err.textContent = ''; });
        if (error) throw new Error(/confirm/i.test(error.message) ? 'Confirmez d’abord votre adresse e-mail (lien reçu par e-mail).' : /démonstration/i.test(error.message) ? error.message : 'Identifiant ou mot de passe incorrect. Vérifiez les majuscules et les caractères spéciaux.');
        relancer();
      }
    } catch (e) { err.textContent = tr(e.message); t.disabled = false; t.textContent = lbl; }
  },
  inscrire: async t => {
    const f = formData($('#inscf')); const err = $('#inscerr'); err.textContent = '';
    const fail = m => { err.textContent = m; };
    if (f.site_web || Date.now() - (window.__inscOuverte || 0) < 3000) return fail('Merci de patienter quelques secondes puis de réessayer.');
    if (!f.raison_sociale.trim()) return fail('Indiquez la raison sociale.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return fail('Adresse e-mail invalide.');
    if (!f.telephone.trim()) return fail('Indiquez un numéro de téléphone.');
    { const m = mdpFaible(f.pwd, f.email); if (m) return fail(m); }
    if (f.pwd !== f.pwd2) return fail('Les deux mots de passe ne correspondent pas.');
    if (!f.cgu) return fail('Acceptez les conditions générales pour continuer.');
    t.disabled = true;
    const ess = await sb.rpc('essai_disponible', { p_email: f.email.trim() });
    if (!ess.error && ess.data === false) { t.disabled = false; return fail(tr('L’essai gratuit a déjà été utilisé avec cette adresse e-mail : il n’est accordé qu’une seule fois. Connectez-vous à votre compte, ou contactez-nous pour souscrire un abonnement.')); }
    const { data, error } = await sb.auth.signUp({ email: f.email.trim(), password: f.pwd, options: { emailRedirectTo: location.origin + location.pathname, data: { raison_sociale: f.raison_sociale.trim(), type: f.type, ice: f.ice.trim(), nom: f.nom.trim(), telephone: f.telephone.trim() } } });
    t.disabled = false;
    if (error) return fail(/registered|exists/i.test(error.message) ? 'Un compte existe déjà avec cette adresse : connectez-vous.' : error.message);
    if (data.session) { relancer(); return; }
    modal(`<div class="login"><h1>Vérifiez vos e-mails</h1><p>Un lien de confirmation a été envoyé à <b>${esc(f.email)}</b>. Cliquez dessus pour activer votre compte : votre essai gratuit de ${tarifs().essai} jours démarre aussitôt.</p><div class="row end"><button class="btn primary" data-act="closeModal">Compris</button></div></div>`);
  },
  mdpOublie: async () => {
    const email = (formData($('#loginf')).ident || '').trim(); const err = $('#loginerr');
    if (!email) { err.textContent = tr('Saisissez d’abord votre identifiant (adresse e-mail).'); return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    err.className = 'okmsg small'; err.textContent = tr('Si un compte existe, un e-mail de réinitialisation vient d’être envoyé.');
  },
  nouveauMdp: async () => {
    const f = formData($('#mdpf')); const err = $('#mdperr');
    { const m = mdpFaible(f.p1, SAAS.session && SAAS.session.user && SAAS.session.user.email); if (m) { err.textContent = m; return; } }
    if (f.p1 !== f.p2) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
    const { error } = await sb.auth.updateUser({ password: f.p1 }); if (error) { err.textContent = error.message; return; }
    toast('Mot de passe modifié.'); relancer();
  },
  changerOrg: t => { try { localStorage.setItem('rmpaie-org', t.value || t.dataset.id); } catch (e) { } SAAS.orgChoisie = t.value || t.dataset.id; relancer(); }
});
sb.auth.onAuthStateChange(ev => {
  if (ev === 'PASSWORD_RECOVERY') modal(`<div class="login"><h1>Nouveau mot de passe</h1><form id="mdpf" class="fg">${field('Nouveau mot de passe', 'p1', '', { type: 'password', full: true })}${field('Confirmation', 'p2', '', { type: 'password', full: true })}</form><p id="mdperr" class="err small"></p><div class="row end"><button class="btn primary" data-act="nouveauMdp">Enregistrer</button></div></div>`);
});

/* ---------- Factures en PDF ---------- */
function facturePdf(f) {
  const doc = newPdf(); const W = 210, M = 16; const E = f.emetteur || {}, C = f.client || {};
  doc.setFillColor(19, 35, 58); doc.rect(0, 0, W, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(19, 35, 58); doc.text(E.raison || 'RM Expertise', M, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80);
  [E.adresse, ['ICE ' + (E.ice || '—'), E.if ? 'IF ' + E.if : '', E.rc ? 'RC ' + E.rc : '', E.tp ? 'TP ' + E.tp : ''].filter(Boolean).join('  ·  '), [E.telephone, E.email].filter(Boolean).join('  ·  ')].filter(Boolean).forEach((l, i) => doc.text(l, M, 24 + i * 4.2));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(14, 124, 102); doc.text(f.type === 'avoir' ? 'AVOIR' : 'FACTURE', W - M, 18, { align: 'right' });
  doc.setFontSize(10); doc.setTextColor(19, 35, 58); doc.text('N° ' + f.numero, W - M, 25, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60);
  doc.text('Date : ' + dFr(f.date_emission), W - M, 31, { align: 'right' }); if (f.type !== 'avoir') doc.text('Échéance : ' + dFr(f.echeance), W - M, 36, { align: 'right' });
  doc.setDrawColor(220); doc.setFillColor(247, 248, 250); doc.roundedRect(W / 2, 44, W / 2 - M, 34, 2, 2, 'FD');
  doc.setTextColor(19, 35, 58); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(C.raison_sociale || '', W / 2 + 5, 51);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70);
  [[C.adresse, C.ville].filter(Boolean).join(', '), 'ICE ' + (C.ice || '—') + (C.identifiant_fiscal ? '  ·  IF ' + C.identifiant_fiscal : ''), 'N° client ' + (C.numero_client || ''), C.email || ''].filter(Boolean).forEach((l, i) => doc.text(doc.splitTextToSize(l, W / 2 - M - 10)[0], W / 2 + 5, 57 + i * 4.6));
  if (f.periode) { doc.setFontSize(9); doc.setTextColor(60); doc.text('Période : ' + periodLabel(f.periode), M, 51); }
  doc.autoTable({ ...AT, startY: 86, margin: { left: M, right: M }, head: [['Désignation', 'Quantité', 'Prix unitaire HT', 'Montant HT']],
    body: (f.lignes || []).map(l => [l.libelle, String(l.quantite), fmt(l.prix_unitaire), fmt(l.montant)]), columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
  let y = doc.lastAutoTable.finalY + 4;
  doc.autoTable({ ...AT, startY: y, margin: { left: W / 2 + 10, right: M }, theme: 'plain', styles: { fontSize: 9.5, cellPadding: 1.8 },
    body: [['Total HT', fmt(f.total_ht) + ' DH'], ['TVA ' + fmt(f.taux_tva, 0) + ' %', fmt(f.total_tva) + ' DH'], [{ content: 'Total TTC', styles: { fontStyle: 'bold' } }, { content: fmt(f.total_ttc) + ' DH', styles: { fontStyle: 'bold', textColor: [14, 124, 102] } }]], columnStyles: { 1: { halign: 'right' } } });
  y = doc.lastAutoTable.finalY + 8; doc.setFontSize(8.5); doc.setTextColor(70); doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize('Arrêtée la présente ' + (f.type === 'avoir' ? 'note d’avoir' : 'facture') + ' à la somme de ' + montantLettres(Math.abs(f.total_ttc)) + ' TTC.', W - 2 * M), M, y); y += 9;
  if (f.statut === 'payee' && f.type !== 'avoir') { doc.setFont('helvetica', 'bold'); doc.setTextColor(14, 124, 102); doc.text('ACQUITTÉE le ' + dFr(f.payee_le), M, y); y += 7; }
  else if (f.type !== 'avoir') { doc.setTextColor(70); doc.text('Règlement : carte bancaire depuis votre espace « Mon compte »' + (E.rib ? ', ou virement au RIB ' + E.rib + (E.banque ? ' (' + E.banque + ')' : '') : '') + '.', M, y); y += 7; }
  if (f.statut === 'annulee') { doc.setFont('helvetica', 'bold'); doc.setTextColor(192, 57, 43); doc.text('ANNULÉE PAR AVOIR', M, y); }
  const H = doc.internal.pageSize.getHeight(); doc.setFontSize(7); doc.setTextColor(140); doc.setFont('helvetica', 'normal');
  doc.text([E.raison, E.adresse, 'ICE ' + (E.ice || '')].filter(Boolean).join(' — '), W / 2, H - 8, { align: 'center' });
  saveFile((f.type === 'avoir' ? 'Avoir_' : 'Facture_') + f.numero + '.pdf', doc.output('blob'));
}
const STATUT_FACT = { emise: ['À régler', 'draft'], payee: ['Payée', 'ok'], annulee: ['Annulée', ''] };
const pillStatut = (f) => { const late = f.statut === 'emise' && f.type === 'facture' && new Date(f.echeance) < new Date(new Date().toDateString()); const [l, c] = late ? ['En retard', 'late'] : (STATUT_FACT[f.statut] || [f.statut, '']); return `<span class="pill ${c}">${l}</span>`; };
const STATUT_ORG = { essai: 'Essai', actif: 'Actif', suspendu: 'Suspendu', resilie: 'Résilié' };
const FORMULES = [['entreprise', 'Entreprise'], ['cabinet', 'Cabinet'], ['carte', 'À la carte'], ['gratuit', 'Gratuit (sans paiement)']];

/* ---------- Mon compte ---------- */
EXTRA_VIEWS.compte = () => { setTimeout(chargerCompte, 0); return '<div id="compte"><section class="card"><p class="muted">Chargement de votre compte…</p></section></div>'; };
let FACTS = {};
async function chargerCompte() {
  const box = $('#compte'); if (!box || !SAAS.org) return; const id = SAAS.org.id;
  const [o, est, fa, pa, me] = await Promise.all([
    sb.from('organisations').select('*').eq('id', id).single(), sb.rpc('estimation', { p_org: id }),
    sb.from('factures').select('*').eq('org_id', id).order('date_emission', { ascending: false }),
    sb.from('paiements').select('*, factures(numero)').eq('org_id', id).eq('statut', 'reussi').order('confirme_le', { ascending: false }), sb.rpc('membres_org', { p_org: id })]);
  if (o.error) { box.innerHTML = '<section class="card"><p class="err">Compte inaccessible.</p></section>'; return; }
  const org = o.data; const e = est.data || {}; const T = tarifs(); FACTS = {}; (fa.data || []).forEach(f => FACTS[f.id] = f);
  const restant = Math.ceil((new Date(org.essai_fin) - new Date()) / 864e5);
  const estHT = e.calcul ? Number(e.calcul.ht) : 0;
  const autres = (SAAS.ctx.organisations || []).length > 1 ? `<label class="f"><span>Changer de compte</span><select data-act-change="changerOrg">${SAAS.ctx.organisations.map(x => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.raison_sociale)} (${esc(x.numero_client)})</option>`).join('')}</select></label>` : '';
  box.innerHTML = `
  <div class="grid kpis">${kpi('N° client', esc(org.numero_client))}${kpi('Formule', (FORMULES.find(f => f[0] === org.formule) || [, org.formule])[1])}${kpi('Statut', STATUT_ORG[org.statut] || org.statut, org.statut === 'essai' ? (restant >= 0 ? restant + ' jour(s) d’essai restant(s)' : 'Essai terminé') : '')}${kpi('Bulletins ce mois', e.bulletins ?? 0)}${kpi('Estimation du mois', fmt(estHT) + ' DH HT', fmt(estHT * (1 + (e.tva || 20) / 100)) + ' DH TTC')}</div>
  ${autres ? `<section class="card">${autres}</section>` : ''}
  <section class="card"><h2>Factures</h2>${(fa.data || []).length ? `<div class="tw"><table><thead><tr><th>N°</th><th>Période</th><th>Date</th><th>Échéance</th><th class="n">TTC</th><th>Statut</th><th></th></tr></thead><tbody>
   ${fa.data.map(f => `<tr><td class="mono">${esc(f.numero)}</td><td>${f.periode ? periodLabel(f.periode) : (f.type === 'avoir' ? 'Avoir' : '')}</td><td>${dFr(f.date_emission)}</td><td>${f.type === 'facture' ? dFr(f.echeance) : ''}</td><td class="n">${fmt(f.total_ttc)}</td><td>${pillStatut(f)}</td><td class="nowrap"><button class="btn sm" data-act="factPdf" data-id="${f.id}">PDF</button>${f.statut === 'emise' && f.type === 'facture' ? ` <button class="btn sm primary" data-act="payer" data-id="${f.id}">Payer par carte</button>` : ''}</td></tr>`).join('')}
   </tbody></table></div>` : `<p class="muted">Aucune facture pour l’instant. ${org.formule === 'gratuit' ? 'Votre compte est gratuit : aucune facture.' : 'Une facture acquittée est émise à chaque validation de mois payée par carte.'}</p>`}</section>
  <section class="card"><h2>Paiements</h2>${(pa.data || []).length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Facture</th><th>Moyen</th><th>Référence</th><th class="n">Montant</th></tr></thead><tbody>
   ${pa.data.map(p => `<tr><td>${dFr(p.confirme_le)}</td><td class="mono">${esc(p.factures ? p.factures.numero : '')}</td><td>${{ carte: 'Carte bancaire', virement: 'Virement', cheque: 'Chèque', especes: 'Espèces' }[p.moyen] || p.moyen}</td><td class="mono">${esc(p.transaction || p.reference || '')}</td><td class="n">${fmt(p.montant)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucun paiement enregistré.</p>'}</section>
  <section class="card"><h2>Fiche société</h2>${vFicheForm(org)}<div class="row end"><button class="btn primary" data-act="ficheSave">Enregistrer</button></div></section>
  <section class="card"><h2>Utilisateurs</h2><p class="muted small">Chaque personne se connecte avec sa propre adresse e-mail. Un collaborateur accède à la paie, pas aux factures.</p>
   <div class="tw"><table><thead><tr><th>E-mail</th><th>Nom</th><th>Rôle</th><th>Dernière connexion</th><th></th></tr></thead><tbody>
   ${(me.data || []).map(m => `<tr><td>${esc(m.email)}${m.invitation ? ' <span class="pill draft">invitation envoyée</span>' : ''}</td><td>${esc(m.nom || '')}</td><td>${m.role === 'admin' ? 'Administrateur' : 'Collaborateur'}</td><td>${m.derniere_connexion ? dFr(m.derniere_connexion) : ''}</td><td>${m.user_id && m.user_id !== SAAS.session.user.id ? `<button class="btn sm danger" data-act="membreDel" data-id="${m.user_id}">Retirer</button>` : (m.invitation ? `<button class="btn sm danger" data-act="invitDel" data-email="${esc(m.email)}">Annuler</button>` : '')}</td></tr>`).join('')}
   </tbody></table></div>
   <form id="invf" class="fg" style="margin-top:12px">${field('Inviter (adresse e-mail)', 'email', '', { type: 'email' })}${field('Rôle', 'role', 'collaborateur', { type: 'select', options: [['collaborateur', 'Collaborateur'], ['admin', 'Administrateur']] })}</form>
   <div class="row end"><button class="btn primary" data-act="inviter">Envoyer l’invitation</button></div></section>
  <section class="card" id="donnees"><h2>Vos données et résiliation</h2>
   <p class="small">Vos données vous appartiennent. L’export complet contient tous vos dossiers, salariés, mois de paie, bulletins validés (en tableaux), factures et pièces jointes, dans des formats ouverts (CSV lisible par Excel, JSON réimportable).</p>
   ${org.statut === 'resilie' ? `<div class="warnbox">Abonnement résilié le ${dFr(String(org.resilie_le || '').slice(0, 10))}. Vos données restent consultables et exportables jusqu’au <b>${org.suppression_prevue ? dFr(org.suppression_prevue) : '—'}</b>, puis seront définitivement supprimées. Un rappel vous sera envoyé 15 jours avant. Les factures sont conservées 10 ans (obligation légale).</div>` : '<p class="small muted">Vous pouvez résilier à tout moment, sans frais. Le compte passe alors en lecture seule pendant 90 jours (consultation et export), puis les données sont supprimées.</p>'}
   <div class="row"><button class="btn primary" data-act="exportComplet">⬇ Exporter toutes mes données (ZIP)</button>${org.statut !== 'resilie' ? '<button class="btn danger" data-act="resilier">Résilier l’abonnement</button>' : '<button class="btn" data-act="annulerResiliation">Annuler la résiliation</button>'}</div></section>`;
  afterRender();
}
Object.assign(ACT, {
  factPdf: t => { const f = FACTS[t.dataset.id] || ADM.factures.find(x => x.id === t.dataset.id); if (f) facturePdf(f); },
  payer: async t => {
    t.disabled = true; t.textContent = tr('Redirection…');
    const { data, error } = await sb.functions.invoke('cmi-paiement', { body: { facture_id: t.dataset.id } });
    if (data && data.demo) { toast('Démonstration : paiement par carte accepté, facture acquittée.'); chargerCompte(); return; }
    if (error || !data || data.erreur) { toast((data && data.erreur) || 'Paiement indisponible pour le moment. Réessayez ou réglez par virement.', 'err'); t.disabled = false; t.textContent = tr('Payer par carte'); return; }
    const form = document.createElement('form'); form.method = 'POST'; form.action = data.url;
    Object.entries(data.fields).forEach(([k, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; form.appendChild(i); });
    document.body.appendChild(form); form.submit();
  },
  coordSave: async () => { const { error } = await sb.rpc('maj_coordonnees', { p_org: SAAS.org.id, p: formData($('#coordf')) }); toast(error ? error.message : 'Coordonnées enregistrées.', error ? 'err' : 'ok'); },
  inviter: async () => {
    const f = formData($('#invf')); if (!f.email.trim()) return;
    let r = await sb.functions.invoke('inviter', { body: { org_id: SAAS.org.id, email: f.email.trim(), role: f.role } });
    if (r.error) { const r2 = await sb.rpc('inviter', { p_org: SAAS.org.id, p_email: f.email.trim(), p_role: f.role }); if (r2.error) { toast(r2.error.message, 'err'); return; } toast('Invitation enregistrée : la personne doit créer son compte avec cette adresse e-mail.'); }
    else toast(r.data && r.data.email_envoye ? 'Invitation envoyée par e-mail.' : 'Utilisateur ajouté au compte.');
    chargerCompte();
  },
  membreDel: async t => { const { error } = await sb.from('membres').delete().eq('org_id', SAAS.org.id).eq('user_id', t.dataset.id); toast(error ? error.message : 'Accès retiré.', error ? 'err' : 'ok'); chargerCompte(); },
  invitDel: async t => { await sb.from('invitations').delete().eq('org_id', SAAS.org.id).eq('email', t.dataset.email); chargerCompte(); },
  resilier: () => modal(`<h2>Résilier l’abonnement ?</h2><p>Le compte passera en lecture seule. Vos données resteront consultables et exportables pendant 90 jours, puis seront définitivement supprimées. Les factures déjà émises restent dues.</p><p class="small"><b>Conseil :</b> téléchargez d’abord l’export complet de vos données.</p><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn danger" data-act="resilierOk">Résilier</button></div>`),
  resilierOk: async () => { const { error } = await sb.rpc('resilier', { p_org: SAAS.org.id }); closeModal(); if (error) toast(error.message, 'err'); else relancer(); },
  annulerResiliation: async () => { const { error } = await sb.rpc('annuler_resiliation', { p_org: SAAS.org.id }); if (error) toast(error.message, 'err'); else { toast('Résiliation annulée : votre compte est de nouveau actif.'); relancer(); } },
  exportComplet: async t => exportComplet(t)
});
document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.actChange && ACT[t.dataset.actChange]) ACT[t.dataset.actChange](t); });

/* ---------- Back-office (super-administrateur) ---------- */
const ADM = { onglet: 'bord', clients: [], factures: [], filtre: '', statut: '' };
EXTRA_VIEWS.admin = () => { setTimeout(chargerAdmin, 0); return `<div class="pz-seg admtabs">${[['bord', 'Tableau de bord'], ['clients', 'Clients'], ['factures', 'Factures'], ['tarifs', 'Tarifs et émetteur'], ['audience', 'Audience'], ['paiement', 'Paiement par carte'], ['erreurs', 'Erreurs']].map(([k, l]) => `<button data-act="admTab" data-o="${k}" class="${ADM.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="adm"><section class="card"><p class="muted">Chargement…</p></section></div>`; };
async function chargerAdmin() {
  const box = $('#adm'); if (!box) return;
  if (ADM.onglet === 'erreurs') return chargerErreurs(box);
  if (ADM.onglet === 'paiement') return chargerPaiementCarte(box);
  if (ADM.onglet === 'audience') return chargerAudience(box);
  if (ADM.onglet === 'bord') {
    const { data: k, error } = await sb.rpc('admin_kpis'); if (error) { box.innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
    const c = k.clients || {}; const h = k.historique || []; const maxB = Math.max(1, ...h.map(x => Number(x.facture_ht) || 0), ...h.map(x => Number(x.encaisse) || 0));
    box.innerHTML = `<div class="grid kpis">${kpi('Clients actifs', c.actif || 0)}${kpi('En essai', c.essai || 0, (k.essais_fin_7j || 0) + ' finissent sous 3 jours')}${kpi('Suspendus', c.suspendu || 0)}${kpi('Résiliés', c.resilie || 0)}
      ${kpi('Revenu mensuel récurrent', fmt(k.mrr_ht) + ' DH HT', 'Factures du mois dernier')}${kpi('Encaissé ce mois', fmt(k.encaisse_mois) + ' DH')}${kpi('Impayés', fmt(k.impayes ? k.impayes.montant : 0) + ' DH', (k.impayes ? k.impayes.nombre : 0) + ' facture(s), dont ' + (k.impayes_echus || 0) + ' échue(s)')}${kpi('Bulletins ce mois', k.bulletins_mois || 0)}</div>
      <section class="card"><h2>12 derniers mois</h2><div class="bars">${h.map(x => `<div class="bcol"><div class="bpair"><i style="height:${Math.round((x.facture_ht || 0) / maxB * 120)}px" title="Facturé HT ${fmt(x.facture_ht)}"></i><i class="b2" style="height:${Math.round((x.encaisse || 0) / maxB * 120)}px" title="Encaissé ${fmt(x.encaisse)}"></i></div><small>${x.mois.slice(5)}/${x.mois.slice(2, 4)}</small></div>`).join('')}</div>
      <div class="legend"><span class="lg1"></span> Facturé HT &nbsp; <span class="lg2"></span> Encaissé</div>
      <div class="tw"><table><thead><tr><th>Mois</th><th class="n">Inscriptions</th><th class="n">Bulletins</th><th class="n">Facturé HT</th><th class="n">Encaissé</th></tr></thead><tbody>${h.slice().reverse().map(x => `<tr><td>${periodLabel(x.mois)}</td><td class="n">${x.inscriptions}</td><td class="n">${x.bulletins}</td><td class="n">${fmt(x.facture_ht)}</td><td class="n">${fmt(x.encaisse)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card"><h2>Facturation</h2><p class="small muted">Les factures sont émises automatiquement le 1er de chaque mois. Ce bouton les émet tout de suite pour le mois précédent (sans doublon).</p><div class="row"><button class="btn" data-act="admFacturer">Émettre les factures de ${periodLabel(periodShift(todayPeriod(), -1))}</button><button class="btn" data-act="admStatuts">Mettre à jour les statuts</button></div></section>`;
  } else if (ADM.onglet === 'clients') {
    const { data, error } = await sb.rpc('admin_clients'); if (error) { box.innerHTML = `<p class="err">${esc(error.message)}</p>`; return; } ADM.clients = data || [];
    const q = ADM.filtre.toLowerCase(); const L = ADM.clients.filter(c => (!ADM.statut || c.statut === ADM.statut) && (!q || [c.raison_sociale, c.numero_client, c.email, c.ice, c.telephone, c.ville].join(' ').toLowerCase().includes(q)));
    box.innerHTML = `<section class="card"><div class="head"><h2>Clients (${L.length})</h2><div class="row"><input id="admq" placeholder="Rechercher…" value="${esc(ADM.filtre)}" class="srch"><select id="adms" class="srch"><option value="">Tous les statuts</option>${Object.entries(STATUT_ORG).map(([k, l]) => `<option value="${k}" ${ADM.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn" data-act="admCsv">Exporter (CSV)</button></div></div>
      <div class="tw"><table><thead><tr><th>N°</th><th>Client</th><th>Contact</th><th>Formule</th><th>Statut</th><th class="n">Bulletins mois</th><th class="n">Encaissé</th><th class="n">Impayé</th><th>Inscrit le</th><th></th></tr></thead><tbody>
      ${L.map(c => `<tr><td class="mono">${esc(c.numero_client)}</td><td><b>${esc(c.raison_sociale)}</b><div class="muted small">${esc(c.ville || '')} ${c.ice ? '· ICE ' + esc(c.ice) : ''}</div></td><td class="small">${esc(c.email || '')}<br>${esc(c.telephone || '')}</td><td>${(FORMULES.find(f => f[0] === c.formule) || [, c.formule])[1]}</td><td><span class="pill ${c.statut === 'actif' ? 'ok' : c.statut === 'suspendu' ? 'late' : 'draft'}">${STATUT_ORG[c.statut]}</span>${c.statut === 'essai' ? `<div class="muted small">jusqu’au ${dFr(c.essai_fin)}</div>` : ''}${c.fiche_complete ? '' : '<div><span class="pill late">fiche incomplète</span></div>'}</td><td class="n">${c.bulletins_mois}</td><td class="n">${fmt(c.ca_total)}</td><td class="n">${Number(c.impaye) ? '<b class="err">' + fmt(c.impaye) + '</b>' : '—'}</td><td>${dFr(c.cree_le)}</td><td><button class="btn sm" data-act="admFiche" data-id="${c.id}">Fiche</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted">Aucun client.</td></tr>'}
      </tbody></table></div></section>`;
  } else if (ADM.onglet === 'factures') {
    const { data } = await sb.from('factures').select('*, organisations(raison_sociale, numero_client)').order('cree_le', { ascending: false }).limit(1000); ADM.factures = data || [];
    box.innerHTML = `<section class="card"><div class="head"><h2>Factures (${ADM.factures.length})</h2><button class="btn" data-act="admFactCsv">Exporter pour la comptabilité (CSV)</button></div>
      <div class="tw"><table><thead><tr><th>N°</th><th>Client</th><th>Période</th><th>Émise le</th><th class="n">HT</th><th class="n">TTC</th><th>Statut</th><th></th></tr></thead><tbody>
      ${ADM.factures.map(f => `<tr><td class="mono">${esc(f.numero)}</td><td>${esc(f.organisations ? f.organisations.raison_sociale : '')}<div class="muted small">${esc(f.organisations ? f.organisations.numero_client : '')}</div></td><td>${f.periode ? periodLabel(f.periode) : 'Avoir'}</td><td>${dFr(f.date_emission)}</td><td class="n">${fmt(f.total_ht)}</td><td class="n">${fmt(f.total_ttc)}</td><td>${pillStatut(f)}</td><td class="nowrap"><button class="btn sm" data-act="factPdf" data-id="${f.id}">PDF</button>${f.statut === 'emise' && f.type === 'facture' ? ` <button class="btn sm" data-act="admVirement" data-id="${f.id}">Paiement reçu</button> <button class="btn sm danger" data-act="admAvoir" data-id="${f.id}">Avoir</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Aucune facture.</td></tr>'}
      </tbody></table></div></section>`;
  } else {
    const { data } = await sb.from('parametres').select('*'); const P2 = {}; (data || []).forEach(r => P2[r.cle] = r.valeur); const T = Object.assign({}, DEFAULT_TARIFS, P2.tarifs || {}), E = P2.emetteur || {};
    box.innerHTML = `<section class="card"><h2>Tarifs (site public et facturation)</h2><form id="admtarf" class="fg">
      ${field('Entreprise 1–20 / salarié', 't1', T.t1)}${field('Entreprise 21–50', 't2', T.t2)}${field('Entreprise 51–200', 't3', T.t3)}${field('Entreprise 201 et +', 't4', T.t4)}
      ${field('Minimum mensuel Entreprise', 'minimum', T.minimum)}${field('Cabinet / salarié', 'cabinet', T.cabinet)}${field('Minimum mensuel Cabinet', 'cabinetMin', T.cabinetMin)}${field('À la carte / bulletin', 'carte', T.carte)}
      ${field('TVA %', 'tva', T.tva ?? 20)}${field('Jours d’essai', 'essai', T.essai)}${field('Délai de paiement (jours)', 'delaiPaiement', T.delaiPaiement ?? 15)}${field('Suspension après (jours)', 'delaiSuspension', T.delaiSuspension ?? 30)}
      ${field('Mois offerts (annuel, affichage)', 'moisOfferts', T.moisOfferts)}${field('WhatsApp', 'whatsapp', T.whatsapp)}${field('E-mail de contact', 'email', T.email)}${field('Bandeau d’offre', 'offre', T.offre, { full: true })}
      </form><div class="row end"><button class="btn primary" data-act="admTarifsSave">Enregistrer</button></div></section>
      <section class="card"><h2>Émetteur des factures</h2><form id="admemf" class="fg">
      ${field('Raison sociale', 'raison', E.raison)}${field('Adresse', 'adresse', E.adresse, { full: true })}${field('ICE', 'ice', E.ice)}${field('IF', 'if', E.if)}${field('RC', 'rc', E.rc)}${field('TP', 'tp', E.tp)}
      ${field('Banque', 'banque', E.banque)}${field('RIB (pour les virements)', 'rib', E.rib)}${field('Téléphone', 'telephone', E.telephone)}${field('E-mail', 'email', E.email)}
      </form><div class="row end"><button class="btn primary" data-act="admEmSave">Enregistrer</button></div></section>`;
  }
  afterRender();
}
async function admFiche(id) {
  const c = ADM.clients.find(x => x.id === id); if (!c) return;
  const [fa, pa, me, co, og] = await Promise.all([sb.from('factures').select('*').eq('org_id', id).order('date_emission', { ascending: false }), sb.from('paiements').select('*').eq('org_id', id).order('cree_le', { ascending: false }),
    sb.rpc('membres_org', { p_org: id }), sb.from('consommation').select('periode, nb_bulletins').eq('org_id', id), sb.from('organisations').select('*').eq('id', id).single()]);
  const o = og.data || {};
  const parMois = {}; (co.data || []).forEach(r => parMois[r.periode] = (parMois[r.periode] || 0) + r.nb_bulletins);
  (fa.data || []).forEach(f => FACTS[f.id] = f);
  modal(`<h2>${esc(c.raison_sociale)} <span class="muted small">${esc(c.numero_client)}</span></h2>
  <div class="grid kpis s">${kpi('Statut', STATUT_ORG[c.statut])}${kpi('Utilisateurs', c.nb_utilisateurs)}${kpi('Bulletins (total)', c.bulletins_total)}${kpi('Encaissé', fmt(c.ca_total) + ' DH')}${kpi('Dernière connexion', c.derniere_connexion ? dFr(c.derniere_connexion) : '—')}</div>
  <form id="admorgf" class="fg">${field('Statut', 'statut', c.statut, { type: 'select', options: Object.entries(STATUT_ORG) })}${field('Formule', 'formule', c.formule, { type: 'select', options: FORMULES })}${field('Fin d’essai', 'essai_fin', c.essai_fin, { type: 'date' })}${field('Notes internes', 'notes_admin', '', { type: 'textarea', full: true, rows: 2 })}</form>
  <div class="row end"><button class="btn primary" data-act="admOrgSave" data-id="${id}">Enregistrer</button></div>
  <h3>Fiche société ${o.fiche_complete_le ? '<span class="pill ok">complète</span>' : '<span class="pill late">incomplète</span>'}</h3>
  <div class="tw"><table><tbody>${[['Raison sociale', o.raison_sociale], ['Forme juridique', o.forme_juridique], ['Représentant légal', o.representant], ['ICE', o.ice], ['IF', o.identifiant_fiscal], ['RC', o.rc], ['CNSS', o.cnss], ['Adresse', [o.adresse, o.ville].filter(Boolean).join(', ')], ['Téléphone', o.telephone], ['E-mail', o.email_facturation]].map(([k, v]) => `<tr><td class="muted">${k}</td><td>${esc(v || '—')}</td></tr>`).join('')}
  <tr><td class="muted">Registre de commerce</td><td>${o.rc_fichier ? `<button class="btn sm" data-act="rcVoir" data-p="${esc(o.rc_fichier)}" data-n="${esc(o.rc_fichier_nom || 'registre-commerce')}">Télécharger</button>` : '<span class="err">non fourni</span>'}</td></tr></tbody></table></div>
  <h3>Utilisateurs</h3><ul class="small">${(me.data || []).map(m => `<li>${esc(m.email)} — ${m.role}${m.invitation ? ' (invitation)' : ''}${m.derniere_connexion ? ' · vu le ' + dFr(m.derniere_connexion) : ''}</li>`).join('')}</ul>
  <h3>Consommation</h3><p class="small">${Object.keys(parMois).sort().reverse().slice(0, 12).map(k => periodLabel(k) + ' : <b>' + parMois[k] + '</b>').join(' · ') || 'Aucun mois validé.'}</p>
  <h3>Factures</h3><div class="tw"><table><tbody>${(fa.data || []).map(f => `<tr><td class="mono">${esc(f.numero)}</td><td>${f.periode ? periodLabel(f.periode) : 'Avoir'}</td><td class="n">${fmt(f.total_ttc)}</td><td>${pillStatut(f)}</td><td><button class="btn sm" data-act="factPdf" data-id="${f.id}">PDF</button></td></tr>`).join('') || '<tr><td class="muted">Aucune.</td></tr>'}</tbody></table></div>
  <h3>Paiements</h3><div class="tw"><table><tbody>${(pa.data || []).map(p => `<tr><td>${dFr(p.cree_le)}</td><td>${p.moyen}</td><td>${p.statut}</td><td class="mono">${esc(p.reference || '')}</td><td class="n">${fmt(p.montant)}</td></tr>`).join('') || '<tr><td class="muted">Aucun.</td></tr>'}</tbody></table></div>
  <div class="row end"><button class="btn" data-act="closeModal">Fermer</button></div>`);
}
Object.assign(ACT, {
  admTab: t => { ADM.onglet = t.dataset.o; $$('.admtabs button').forEach(b => b.classList.toggle('on', b === t)); chargerAdmin(); },
  admFiche: t => admFiche(t.dataset.id),
  admOrgSave: async t => { const f = formData($('#admorgf')); if (!f.notes_admin) delete f.notes_admin; const { error } = await sb.rpc('admin_maj_org', { p_org: t.dataset.id, p: f }); toast(error ? error.message : 'Client mis à jour.', error ? 'err' : 'ok'); if (!error) { closeModal(); chargerAdmin(); } },
  admFacturer: async () => { const { data, error } = await sb.rpc('generer_factures'); toast(error ? error.message : data + ' facture(s) émise(s).', error ? 'err' : 'ok'); chargerAdmin(); },
  admStatuts: async () => { const { data, error } = await sb.rpc('maj_statuts'); toast(error ? error.message : data + ' compte(s) suspendu(s).', error ? 'err' : 'ok'); chargerAdmin(); },
  admVirement: t => { const f = ADM.factures.find(x => x.id === t.dataset.id); modal(`<h2>Paiement reçu — ${esc(f.numero)}</h2><p>${fmt(f.total_ttc)} DH TTC</p><form id="virf" class="fg">${field('Moyen', 'moyen', 'virement', { type: 'select', options: [['virement', 'Virement'], ['cheque', 'Chèque'], ['especes', 'Espèces']] })}${field('Référence (n° de virement ou de chèque)', 'ref', '')}</form><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="admVirOk" data-id="${f.id}">Enregistrer</button></div>`); },
  admVirOk: async t => { const f = ADM.factures.find(x => x.id === t.dataset.id); const v = formData($('#virf')); const { error } = await sb.rpc('enregistrer_paiement', { p_facture: f.id, p_montant: Number(f.total_ttc), p_moyen: v.moyen, p_reference: v.ref || (v.moyen + '-' + f.numero), p_transaction: null, p_details: null }); closeModal(); toast(error ? error.message : 'Paiement enregistré, facture acquittée.', error ? 'err' : 'ok'); chargerAdmin(); },
  admAvoir: t => modal(`<h2>Annuler la facture par un avoir ?</h2><form id="avf" class="fg">${field('Motif', 'motif', '', { full: true })}</form><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn danger" data-act="admAvoirOk" data-id="${t.dataset.id}">Émettre l’avoir</button></div>`),
  admAvoirOk: async t => { const { data, error } = await sb.rpc('emettre_avoir', { p_facture: t.dataset.id, p_motif: formData($('#avf')).motif }); closeModal(); toast(error ? error.message : 'Avoir ' + data + ' émis.', error ? 'err' : 'ok'); chargerAdmin(); },
  admTarifsSave: async () => { const f = formData($('#admtarf')); const o = {}; Object.keys(f).forEach(k => o[k] = ['offre', 'whatsapp', 'email'].includes(k) ? f[k] : num(f[k])); const { error } = await sb.from('parametres').update({ valeur: o, maj_le: new Date().toISOString() }).eq('cle', 'tarifs'); PUB = o; toast(error ? error.message : 'Tarifs enregistrés.', error ? 'err' : 'ok'); },
  admEmSave: async () => { const { error } = await sb.from('parametres').upsert({ cle: 'emetteur', valeur: formData($('#admemf')), maj_le: new Date().toISOString() }); toast(error ? error.message : 'Émetteur enregistré.', error ? 'err' : 'ok'); },
  admCsv: () => saveFile('clients_rmpaie_' + isoDate(new Date()) + '.csv', csv([['N° client', 'Raison sociale', 'Type', 'Formule', 'Statut', 'Fin essai', 'ICE', 'Ville', 'Téléphone', 'E-mail', 'Inscrit le', 'Utilisateurs', 'Bulletins mois', 'Bulletins total', 'Encaissé', 'Impayé'], ...ADM.clients.map(c => [c.numero_client, c.raison_sociale, c.type, c.formule, c.statut, c.essai_fin, c.ice, c.ville, c.telephone, c.email, dFr(c.cree_le), c.nb_utilisateurs, c.bulletins_mois, c.bulletins_total, fmtCsv(c.ca_total), fmtCsv(c.impaye)])])),
  admFactCsv: () => saveFile('factures_rmpaie_' + isoDate(new Date()) + '.csv', csv([['Numéro', 'Type', 'Date', 'Échéance', 'N° client', 'Client', 'ICE client', 'Période', 'HT', 'TVA', 'TTC', 'Statut', 'Payée le'], ...ADM.factures.map(f => [f.numero, f.type, dFr(f.date_emission), dFr(f.echeance), f.client.numero_client, f.client.raison_sociale, f.client.ice, f.periode, fmtCsv(f.total_ht), fmtCsv(f.total_tva), fmtCsv(f.total_ttc), f.statut, f.payee_le ? dFr(f.payee_le) : ''])]))
});
document.addEventListener('input', e => { if (e.target.id === 'admq') { ADM.filtre = e.target.value; clearTimeout(ADM.t); ADM.t = setTimeout(() => { chargerAdmin().then(() => { const q = $('#admq'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 300); } });
document.addEventListener('change', e => { if (e.target.id === 'adms') { ADM.statut = e.target.value; chargerAdmin(); } });

/* ---------- Bandeau d'état du compte et verrou d'écriture ---------- */
const _afterRender = afterRender;
afterRender = function () {
  _afterRender();
  document.body.classList.toggle('fichemode', !!S.auth && S.view === 'fiche');
  document.body.classList.toggle('admview', !!S.auth && (S.view === 'admin' || S.view === 'compte' || S.view === 'fiche'));
  const main = $('#main'); if (!main || !S.auth || !SAAS.org || $('#acctbanner')) return;
  const o = SAAS.org; let msg = '';
  if (o.statut === 'essai') { const j = Math.ceil((new Date(o.essai_fin) - new Date()) / 864e5); if (j <= 10) msg = `Essai gratuit : ${Math.max(0, j)} jour(s) restant(s).`; }
  if (o.statut === 'suspendu') msg = 'Compte en lecture seule : une facture est impayée. Réglez-la dans « Mon compte » pour retrouver l’accès complet.';
  if (o.statut === 'resilie') msg = 'Abonnement résilié : vos données restent consultables et exportables pendant 3 mois.';
  if (!msg) return; const b = document.createElement('div'); b.id = 'acctbanner'; b.className = 'acctbanner ' + o.statut; b.innerHTML = esc(msg) + (o.statut !== 'essai' && o.role === 'admin' ? ' <button class="btn sm" data-act="nav" data-v="compte">Mon compte</button>' : ''); main.prepend(b);
};
['validate', 'validateOk', 'empSave', 'dosCreate', 'demo'].forEach(k => { const f = ACT[k]; ACT[k] = (...a) => { if (!ecritureOuverte()) { toast('Compte en lecture seule : réglez la facture en attente dans « Mon compte ».', 'warn'); return; } return f(...a); }; });


/* ---------- Fiche société obligatoire (avec registre de commerce) ---------- */
const FORMES = ['SARL', 'SARL AU', 'SA', 'SAS', 'SNC', 'Entreprise individuelle', 'Auto-entrepreneur', 'Association', 'Autre'];
function vFicheForm(o) {
  o = o || {};
  return `<form id="fichef" class="fg">
   ${field('Raison sociale *', 'raison_sociale', o.raison_sociale, { full: true })}
   ${field('Forme juridique *', 'forme_juridique', o.forme_juridique || '', { type: 'select', options: [['', 'Choisir…'], ...FORMES] })}${field('Gérant / représentant légal *', 'representant', o.representant)}
   ${field('ICE (15 chiffres) *', 'ice', o.ice, { inputmode: 'numeric' })}${field('Identifiant fiscal (IF) *', 'identifiant_fiscal', o.identifiant_fiscal, { inputmode: 'numeric' })}
   ${field('Registre de commerce (n° et ville) *', 'rc', o.rc, { ph: '12345 Marrakech' })}${field('N° d’affiliation CNSS *', 'cnss', o.cnss, { inputmode: 'numeric' })}
   ${field('Adresse du siège *', 'adresse', o.adresse, { full: true })}
   ${field('Ville *', 'ville', o.ville)}${field('Téléphone *', 'telephone', o.telephone, { type: 'tel', ph: '+212 6…' })}
   ${field('E-mail de facturation *', 'email_facturation', o.email_facturation, { type: 'email', full: true })}
   <label class="f full"><span>Registre de commerce — modèle J ou extrait de moins de 3 mois (PDF, JPG ou PNG, 5 Mo max) *</span><input type="file" name="rcfile" accept="application/pdf,image/jpeg,image/png"></label>
   ${o.rc_fichier ? `<p class="small full">Pièce déposée : <button type="button" class="lnk" data-act="rcVoir" data-p="${esc(o.rc_fichier)}" data-n="${esc(o.rc_fichier_nom || 'registre-commerce')}">${esc(o.rc_fichier_nom || 'registre de commerce')}</button> — choisissez un fichier pour la remplacer.</p>` : ''}
  </form><p id="ficheerr" class="err small"></p>`;
}
async function chargerFiche() {
  const box = $('#fichebox'); if (!box || !SAAS.org) return;
  if (SAAS.org.role !== 'admin') { box.innerHTML = '<section class="card"><h2>Fiche société à compléter</h2><p>L’administrateur du compte doit d’abord compléter la fiche de la société et joindre le registre de commerce. L’accès à la paie s’ouvrira ensuite.</p></section>'; return; }
  const { data: o } = await sb.from('organisations').select('*').eq('id', SAAS.org.id).single();
  box.innerHTML = `<section class="card"><ol class="etapes"><li class="fait">Votre compte</li><li class="on">Fiche de la société</li></ol><h2>Fiche de votre société</h2><p class="muted">Avant d’accéder au logiciel, renseignez toutes les informations de la société et joignez son registre de commerce. Les champs marqués * sont obligatoires.</p>
   ${vFicheForm(o)}<div class="row end"><button class="btn primary" data-act="ficheSave">Valider et accéder au logiciel</button></div></section>`;
}
EXTRA_VIEWS.fiche = () => { setTimeout(chargerFiche, 0); return '<div id="fichebox"><section class="card"><p class="muted">Chargement…</p></section></div>'; };
Object.assign(ACT, {
  ficheSave: async t => {
    const form = $('#fichef'); const f = formData(form); delete f.rcfile; const err = $('#ficheerr'); err.textContent = '';
    const file = form.querySelector('[name=rcfile]').files[0];
    const lbl = t.textContent; t.disabled = true; t.textContent = 'Enregistrement…';
    try {
      if (file && !(await typeReel(file))) throw new Error('Le registre de commerce doit être un vrai fichier PDF, JPG ou PNG.');
      const manque = ['raison_sociale', 'forme_juridique', 'representant', 'ice', 'identifiant_fiscal', 'rc', 'cnss', 'adresse', 'ville', 'telephone', 'email_facturation'].filter(k => !String(f[k] || '').trim());
      if (manque.length) { manque.forEach(k => form.querySelector(`[name=${k}]`).closest('.f').classList.add('bad')); throw new Error('Complétez tous les champs obligatoires (*).'); }
      if (!/^\d{15}$/.test(f.ice.trim())) throw new Error('L’ICE doit comporter 15 chiffres.');
      if (file) {
        if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) throw new Error('Le registre de commerce doit être un PDF, un JPG ou un PNG.');
        if (file.size > 5 * 1024 * 1024) throw new Error('Le fichier dépasse 5 Mo.');
        const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
        const chemin = `${SAAS.org.id}/registre-commerce-${Date.now()}.${ext}`;
        const up = await sb.storage.from('justificatifs').upload(chemin, file, { contentType: file.type });
        if (up.error) throw new Error('Envoi du fichier impossible : ' + up.error.message);
        f.rc_fichier = chemin; f.rc_fichier_nom = file.name;
      }
      const premiere = !SAAS.org.fiche_complete;
      const { error } = await sb.rpc('completer_fiche', { p_org: SAAS.org.id, p: f });
      if (error) throw new Error(error.message.replace(/^.*?:\s*(?=champs|l'|l’|joignez|adresse|numéro|pièce)/i, '').replace(/^./, c => c.toUpperCase()));
      if (premiere) { toast('Fiche enregistrée : bienvenue dans RM Paie.'); SAAS.orgChoisie = SAAS.org.id; relancer(); }
      else { toast('Fiche société enregistrée.'); chargerCompte(); }
    } catch (e) { err.textContent = tr(e.message); t.disabled = false; t.textContent = lbl; }
  },
  rcVoir: async t => {
    const { data, error } = await sb.storage.from('justificatifs').download(t.dataset.p);
    if (error || !data) { toast('Pièce introuvable.', 'err'); return; }
    saveFile(t.dataset.n, data);
  }
});


/* ---------- Paiement par carte : demandé à l'ouverture des bulletins ---------- */
// Bulletins, déclarations, paiement des salaires, documents RH et sortie ne s'ouvrent qu'une fois le mois payé
// (sauf pendant l'essai gratuit et pour la formule gratuite). La validation du mois exige aussi le paiement (contrôlé par la base).
const VUES_PAYANTES = ['bulletins', 'declarations', 'paiement', 'rh', 'sortie'];
const validerSansPaiement = ACT.validateOk;
const ENATTENTE = 'rmpaie-validation-en-attente';
const ACCES = {};   // cache : société|dossier|mois|nombre de bulletins -> payé
function cartePayer(data) {
  if (data.test && !data.confirme) return modal(`<h2>Paiement en mode test</h2><p>La passerelle est configurée en <b>mode test</b> : aucune somme réelle ne sera débitée. Utilisez une carte de test fournie par votre acquéreur.</p><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" id="cmitest">Continuer vers la page de paiement</button></div>`), setTimeout(() => { const b = $('#cmitest'); if (b) b.onclick = () => cartePayer(Object.assign({}, data, { confirme: true })); }, 0);
  const form = document.createElement('form'); form.method = 'POST'; form.action = data.url;
  Object.entries(data.fields).forEach(([k, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; form.appendChild(i); });
  document.body.appendChild(form); form.submit();
}
const cleAcces = nb => [SAAS.org && SAAS.org.id, S.dossierId, S.period, nb].join('|');
// { ok, devis, nb } : le mois sélectionné est-il réglé ?
async function etatPaiement() {
  if (!SAAS.org || !D()) return { ok: true };
  const nb = calcAll().length; if (!nb) return { ok: true, nb };
  if (per().validated) return { ok: true, nb };   // un mois validé a été payé (ou validé pendant l'essai) : la base l'a contrôlé
  if (ACCES[cleAcces(nb)]) return { ok: true, nb };
  const { data: d, error } = await sb.rpc('devis_validation', { p_org: SAAS.org.id, p_periode: S.period, p_doc: perKey(), p_nb: nb });
  if (error || !d) return { ok: false, nb, erreur: error ? error.message : 'Vérification impossible' };
  const ok = Number(d.a_payer_ttc) <= 0; if (ok) ACCES[cleAcces(nb)] = true;
  return { ok, devis: d, nb };
}
function tableMontant(d) {
  return `<div class="tw"><table><tbody>
    <tr><td>Bulletins du mois (tous dossiers)</td><td class="n">${d.nb_total}</td></tr>
    <tr><td>Montant du mois HT</td><td class="n">${fmt(d.total_ht)} DH</td></tr>
    ${Number(d.deja_paye_ht) > 0 ? `<tr><td>Déjà réglé ce mois-ci</td><td class="n">−${fmt(d.deja_paye_ht)} DH</td></tr>` : ''}
    <tr><td>À payer HT</td><td class="n">${fmt(d.a_payer_ht)} DH</td></tr>
    <tr><td>TVA ${d.taux_tva} %</td><td class="n">${fmt(d.a_payer_tva)} DH</td></tr>
    <tr><td><b>Total TTC</b></td><td class="n"><b>${fmt(d.a_payer_ttc)} DH</b></td></tr></tbody></table></div>
    <p class="small muted">Vous saisissez votre carte bancaire sur la page sécurisée du CMI (3-D Secure). RM Paie ne voit ni ne conserve votre numéro de carte. La facture acquittée apparaît ensuite dans « Mon compte ».</p>`;
}
function ecranPaiement(etat) {
  const d = etat.devis;
  if (!d) return `<section class="card"><h2>Vérification du paiement impossible</h2><p class="muted">${esc(etat.erreur || '')}</p><button class="btn" data-act="nav" data-v="dashboard">Retour au tableau de bord</button></section>`;
  return `<section class="card paywall"><h2>🔒 Bulletins de ${periodLabel(S.period)}</h2>
    <p>Pour ouvrir les bulletins, les déclarations, le paiement des salaires et les documents RH de ce mois, réglez les ${etat.nb} bulletin(s) de ce dossier.</p>
    ${tableMontant(d)}
    <div class="row"><button class="btn primary" data-act="payerValidation" data-nb="${etat.nb}" data-vue="${S.view}">Payer ${fmt(d.a_payer_ttc)} DH par carte</button><button class="btn" data-act="nav" data-v="variables">Revenir aux variables du mois</button></div></section>`;
}
// Contrôle à chaque affichage d'une page payante (changement d'onglet, de mois ou de dossier)
(function () {
  const prec = afterRender;
  afterRender = function () {
    prec();
    if (!VUES_PAYANTES.includes(S.view) || !SAAS.org || S.client) return;
    const main = $('#main'); const vue = S.view, cle = cleAcces(D() ? calcAll().length : 0);
    if (ACCES[cle] || (D() && per().validated)) return;
    main.classList.add('verif'); main.setAttribute('aria-busy', 'true');
    etatPaiement().then(e => {
      main.classList.remove('verif'); main.removeAttribute('aria-busy');
      if (S.view !== vue || e.ok) return;
      main.innerHTML = ecranPaiement(e); translateDOM(main);
    });
  };
})();
Object.assign(ACT, {
  validateOk: async t => {
    if (!SAAS.org) return validerSansPaiement(t);
    const e = await etatPaiement();
    if (e.ok) return validerSansPaiement(t);
    modal(`<h2>Paiement des bulletins</h2><p>Validation de <b>${periodLabel(S.period)}</b> : <b>${e.nb}</b> bulletin(s).</p>
      ${e.devis ? tableMontant(e.devis) : `<p class="err">${esc(e.erreur || '')}</p>`}
      <div class="row end"><button class="btn" data-act="closeModal">Annuler</button>${e.devis ? `<button class="btn primary" data-act="payerValidation" data-nb="${e.nb}" data-valider="1">Payer ${fmt(e.devis.a_payer_ttc)} DH par carte</button>` : ''}</div>`);
  },
  payerValidation: async t => {
    t.disabled = true; const lbl = t.textContent; t.textContent = tr('Redirection vers le paiement sécurisé…');
    const echec = m => { toast(m, 'err'); t.disabled = false; t.textContent = lbl; };
    const { data: id, error } = await sb.rpc('creer_commande_validation', { p_org: SAAS.org.id, p_periode: S.period, p_doc: perKey(), p_nb: Number(t.dataset.nb) });
    if (error) return echec(error.message);
    const att = { commande: id, org: SAAS.org.id, dossier: S.dossierId, periode: S.period, vue: t.dataset.vue || 'bulletins', valider: !!t.dataset.valider };
    try { localStorage.setItem(ENATTENTE, JSON.stringify(att)); } catch (e) { }
    const r = await sb.functions.invoke('cmi-paiement', { body: { commande_id: id } });
    if (r.data && r.data.demo) { closeModal(); toast('Démonstration : paiement accepté.'); return finaliserPaiement(id, att); }
    if (r.error || !r.data || r.data.erreur) return echec((r.data && r.data.erreur) || 'Paiement indisponible pour le moment. Réessayez dans quelques minutes.');
    cartePayer(r.data);
  }
});
// Au retour du CMI (ou en démonstration) : attend la confirmation du paiement puis ouvre le mois
async function finaliserPaiement(id, att) {
  if (!att) { try { att = JSON.parse(localStorage.getItem(ENATTENTE) || 'null'); } catch (e) { } }
  if (!att || att.commande !== id) return;
  for (let i = 0; i < 15; i++) {
    const { data: c } = await sb.from('commandes').select('statut').eq('id', id).maybeSingle();
    if (c && c.statut === 'payee') {
      try { localStorage.removeItem(ENATTENTE); } catch (e) { }
      Object.keys(ACCES).forEach(k => delete ACCES[k]);
      S.dossierId = att.dossier; S.period = att.periode;
      if (att.valider) { S.view = 'dashboard'; validerSansPaiement(); }
      S.view = att.vue || 'bulletins'; render();
      toast('Paiement reçu : ' + periodLabel(att.periode) + ' est débloqué. La facture acquittée est dans « Mon compte ».');
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  toast('Paiement en cours de confirmation : rouvrez l’onglet Bulletins dans un instant, sans payer une seconde fois.', 'warn');
}
const finaliserValidation = finaliserPaiement;

/* ---------- Pièces jointes des salariés (stockage privé, taille limitée) ---------- */
const PJ_MAX = 5 * 1024 * 1024, PJ_TOTAL = 20 * 1024 * 1024;
const PJ_TYPES = { 'application/pdf': 'PDF' };   // PDF uniquement, pour limiter le volume de stockage
const PJ_CATS = ['CIN', 'Contrat signé', 'Diplôme', 'RIB', 'Attestation', 'Certificat médical', 'Autre'];
const taille = n => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' Ko' : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
function pjModal(id) {
  const e = (D().employees || []).find(x => x.id === id); if (!e) return;
  const L = e.pj || []; const total = L.reduce((a, x) => a + (x.taille || 0), 0);
  modal(`<h2>Pièces jointes — ${esc(e.nom)} ${esc(e.prenom || '')}</h2>
    <div class="tw"><table><thead><tr><th>Document</th><th>Type</th><th>Taille</th><th>Ajouté le</th><th></th></tr></thead><tbody>
    ${L.map((x, i) => `<tr><td><b>${esc(x.nom)}</b>${x.categorie ? `<div class="muted small">${esc(x.categorie)}</div>` : ''}</td><td>${PJ_TYPES[x.type] || ''}</td><td>${taille(x.taille || 0)}</td><td>${dFr(x.date)}</td>
      <td class="nowrap"><button class="btn sm" data-act="pjVoir" data-e="${id}" data-i="${i}">Ouvrir</button> <button class="btn sm danger" data-act="pjSuppr" data-e="${id}" data-i="${i}">Supprimer</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucune pièce jointe pour ce salarié.</td></tr>'}
    </tbody></table></div>
    <p class="small muted">Espace utilisé : ${taille(total)} sur ${taille(PJ_TOTAL)} · PDF uniquement, 5 Mo maximum par fichier.</p>
    <form id="pjf" class="fg">${field('Nature du document', 'categorie', 'Autre', { type: 'select', options: PJ_CATS })}
      <label class="f"><span>Fichier(s)</span><input type="file" name="fichiers" multiple accept=".pdf,application/pdf"></label></form>
    <p id="pjerr" class="err small"></p>
    <div class="row end"><button class="btn" data-act="closeModal">Fermer</button><button class="btn primary" data-act="pjAjouter" data-e="${id}">Ajouter</button></div>`);
}
Object.assign(ACT, {
  pjOuvrir: t => pjModal(t.dataset.id),
  pjAjouter: async t => {
    const d = D(); const e = d.employees.find(x => x.id === t.dataset.e); const err = $('#pjerr'); err.textContent = '';
    const files = [...$('#pjf [name=fichiers]').files]; const cat = $('#pjf [name=categorie]').value;
    if (!files.length) { err.textContent = tr('Choisissez au moins un fichier.'); return; }
    let total = (e.pj || []).reduce((a, x) => a + (x.taille || 0), 0);
    for (const f of files) {
      if (!PJ_TYPES[f.type] && !/\.pdf$/i.test(f.name)) { err.textContent = tr(f.name + ' : seuls les fichiers PDF sont acceptés.'); return; }
      if (f.size > PJ_MAX) { err.textContent = tr(f.name + ' dépasse 5 Mo.'); return; }
      if (await typeReel(f) !== 'pdf') { err.textContent = tr(f.name + ' : ce fichier n’est pas un vrai PDF.'); return; }
      total += f.size; if (total > PJ_TOTAL) { err.textContent = tr('Limite de 20 Mo par salarié atteinte : supprimez des pièces ou réduisez les fichiers.'); return; }
    }
    t.disabled = true; t.textContent = tr('Envoi…');
    e.pj = e.pj || [];
    for (const f of files) {
      const nomSur = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
      const chemin = `${SAAS.org.id}/salaries/${S.dossierId}/${e.id}/${Date.now()}-${nomSur}`;
      const up = await sb.storage.from('justificatifs').upload(chemin, f, { contentType: 'application/pdf' });
      if (up.error) { err.textContent = tr('Envoi impossible : ') + up.error.message; t.disabled = false; t.textContent = tr('Ajouter'); return; }
      e.pj.push({ chemin, nom: f.name, type: 'application/pdf', taille: f.size, categorie: cat, date: new Date().toISOString().slice(0, 10) });
    }
    saveD(d); toast(files.length > 1 ? files.length + ' pièces ajoutées.' : 'Pièce ajoutée.'); pjModal(e.id); render();
  },
  pjVoir: async t => {
    const e = D().employees.find(x => x.id === t.dataset.e); const x = e.pj[+t.dataset.i];
    const { data, error } = await sb.storage.from('justificatifs').download(x.chemin);
    if (error || !data) { toast('Pièce introuvable.', 'err'); return; }
    saveFile(x.nom, data);
  },
  pjSuppr: async t => {
    const d = D(); const e = d.employees.find(x => x.id === t.dataset.e); const x = e.pj[+t.dataset.i];
    if (!confirm(tr('Supprimer définitivement ce document ?') + '\n' + x.nom)) return;
    await sb.storage.from('justificatifs').remove([x.chemin]);
    e.pj.splice(+t.dataset.i, 1); saveD(d); toast('Pièce supprimée.'); pjModal(e.id); render();
  }
});

/* ---------- Bulletins : tout télécharger (ZIP), envoi par e-mail et WhatsApp ---------- */
const nomBulletin = e => 'Bulletin_' + slug(e.nom + '_' + (e.prenom || '')) + '_' + S.period + '.pdf';
function telInternational(t) {
  let n = String(t || '').replace(/\D/g, ''); if (!n) return '';
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0') && n.length === 10) n = '212' + n.slice(1);
  if (n.length === 9 && /^[5-7]/.test(n)) n = '212' + n;
  return n.length >= 11 ? n : '';
}
const blobBase64 = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(b); });
function envoiModal() {
  const rows = calcAll(); const valide = !!per().validated;
  const nbMail = rows.filter(({ e }) => e.email).length, nbWa = rows.filter(({ e }) => telInternational(e.telephone)).length;
  modal(`<h2>Envoyer les bulletins — ${periodLabel(S.period)}</h2>
    ${valide ? '' : '<p class="warnbox">Ce mois n’est pas encore validé : les bulletins envoyés seraient provisoires. Validez le mois avant de les envoyer.</p>'}
    <div class="tw"><table><thead><tr><th><input type="checkbox" id="envTous" checked aria-label="Tout sélectionner"></th><th>Salarié</th><th>E-mail</th><th>WhatsApp</th></tr></thead><tbody>
    ${rows.map(({ e }) => { const tel = telInternational(e.telephone); const ok = e.email || tel;
      return `<tr><td><input type="checkbox" class="envSel" value="${e.id}" ${ok ? 'checked' : 'disabled'}></td><td><b>${esc(e.nom)} ${esc(e.prenom || '')}</b></td>
      <td class="small">${e.email ? esc(e.email) : '<span class="muted">non renseigné</span>'}</td>
      <td class="small">${tel ? '+' + tel : '<span class="muted">non renseigné</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="small muted">Chaque salarié reçoit uniquement son propre bulletin, en pièce jointe PDF, par e-mail ou par WhatsApp. Ajoutez e-mails et numéros dans la fiche de chaque salarié (Salariés > Modifier).</p>
    <div class="row end"><button class="btn" data-act="closeModal">Fermer</button>
      <button class="btn" data-act="envoyer" data-canal="whatsapp" ${valide && nbWa ? '' : 'disabled'}>Envoyer par WhatsApp</button>
      <button class="btn primary" data-act="envoyer" data-canal="email" ${valide && nbMail ? '' : 'disabled'}>Envoyer par e-mail</button></div>`);
  const tous = $('#envTous'); if (tous) tous.onchange = () => document.querySelectorAll('.envSel:not(:disabled)').forEach(c => { c.checked = tous.checked; });
}
Object.assign(ACT, {
  zipAll: async t => {
    if (!window.JSZip) { toast('Préparation du fichier impossible : rechargez la page.', 'err'); return; }
    t.disabled = true; const lbl = t.textContent; t.textContent = tr('Préparation…');
    const zip = new JSZip(); calcAll().forEach(({ e, r }) => zip.file(nomBulletin(e), pdfBulletinBlob(e, r)));
    const blob = await zip.generateAsync({ type: 'blob' });
    saveFile('Bulletins_' + slug(D().raison) + '_' + S.period + '.zip', blob); t.disabled = false; t.textContent = lbl;
  },
  envoiOuvrir: () => envoiModal(),
  contactOuvrir: () => {
    const T = tarifs(), mail = T.email || 'contact@rmpaie.ma', wa = String(T.whatsapp || '').replace(/\D/g, '');
    modal(`<h2>Nous contacter</h2><p class="muted">Une question sur le logiciel, une démonstration, la reprise de vos salariés ? Notre cabinet vous répond du lundi au vendredi.</p>
      <div class="choix">
        ${wa ? `<a class="btn primary" href="https://wa.me/${wa}?text=${encodeURIComponent('Bonjour, je souhaite des informations sur RM Paie.')}" target="_blank" rel="noopener"><b>WhatsApp</b><small>+${wa}</small></a>` : ''}
        <a class="btn ${wa ? '' : 'primary'}" href="mailto:${esc(mail)}?subject=${encodeURIComponent('Demande d’information — RM Paie')}"><b>E-mail</b><small>${esc(mail)}</small></a>
        ${wa ? `<a class="btn" href="tel:+${wa}"><b>Téléphone</b><small>+${wa}</small></a>` : ''}
      </div>
      <p class="small muted">RM Expertise — cabinet d’expertise comptable, Marrakech.</p>
      <div class="row end"><button class="btn" data-act="closeModal">Fermer</button></div>`);
  },
  choixBulletins: () => modal(`<h2>Tous les bulletins — ${periodLabel(S.period)}</h2><p class="muted">Choisissez le format :</p>
    <div class="choix"><button class="btn primary" data-act="choixOk" data-a="pdfAll"><b>PDF</b><small>un seul fichier, tous les bulletins à la suite</small></button>
    <button class="btn" data-act="choixOk" data-a="zipAll"><b>ZIP</b><small>un PDF séparé par salarié</small></button></div>
    <div class="row end"><button class="btn" data-act="closeModal">Annuler</button></div>`),
  choixLivre: () => modal(`<h2>Livre de paie — ${periodLabel(S.period)}</h2><p class="muted">Choisissez le format :</p>
    <div class="choix"><button class="btn primary" data-act="choixOk" data-a="livrePdf"><b>PDF</b><small>à imprimer ou archiver</small></button>
    <button class="btn" data-act="choixOk" data-a="livreCsv"><b>CSV</b><small>pour Excel ou le logiciel comptable</small></button></div>
    <div class="row end"><button class="btn" data-act="closeModal">Annuler</button></div>`),
  choixEcriture: () => modal(`<h2>Écriture comptable de paie — ${periodLabel(S.period)}</h2><p class="muted">Choisissez le format :</p>
    <div class="choix"><button class="btn primary" data-act="choixOk" data-a="ecriturePdf"><b>PDF</b><small>à imprimer ou archiver</small></button>
    <button class="btn" data-act="choixOk" data-a="ecritureCsv"><b>CSV</b><small>pour Excel ou le logiciel comptable</small></button></div>
    <div class="row end"><button class="btn" data-act="closeModal">Annuler</button></div>`),
  choixOk: t => { const a = t.dataset.a; closeModal(); ACT[a](t); },
  envoyer: async t => {
    const canal = t.dataset.canal, wa = canal === 'whatsapp';
    const ids = [...document.querySelectorAll('.envSel:checked')].map(c => c.value);
    const cibles = calcAll().filter(x => ids.includes(x.e.id) && (wa ? telInternational(x.e.telephone) : x.e.email));
    if (!cibles.length) { toast(wa ? 'Aucun salarié sélectionné n’a de numéro WhatsApp.' : 'Aucun salarié sélectionné n’a d’e-mail.', 'warn'); return; }
    const lbl = t.textContent; document.querySelectorAll('[data-act=envoyer]').forEach(b => { b.disabled = true; }); t.textContent = tr('Envoi en cours…');
    let envoyes = 0; const echecs = [];
    for (let i = 0; i < cibles.length; i += 25) {   // par lots, pour rester sous la taille maximale d'une requête
      const envois = [];
      for (const { e, r } of cibles.slice(i, i + 25))
        envois.push({ email: e.email || '', telephone: telInternational(e.telephone), nom: (e.prenom ? e.prenom + ' ' : '') + e.nom, fichier: nomBulletin(e), pdf: await blobBase64(pdfBulletinBlob(e, r)) });
      const { data, error } = await sb.functions.invoke('envoyer-bulletins', { body: { canal, org_id: SAAS.org.id, societe: D().raison, periode: S.period, libelle: periodLabel(S.period), envois } });
      if (error || !data || data.erreur) { toast((data && data.erreur) || 'Envoi impossible pour le moment. Réessayez dans quelques minutes.', 'err'); document.querySelectorAll('[data-act=envoyer]').forEach(b => { b.disabled = false; }); t.textContent = lbl; return; }
      envoyes += data.envoyes; echecs.push(...(data.echecs || []));
    }
    closeModal();
    toast(envoyes + (wa ? ' bulletin(s) envoyé(s) par WhatsApp.' : ' bulletin(s) envoyé(s) par e-mail.') + (echecs.length ? ' Échec pour : ' + echecs.join(', ') : ''), echecs.length ? 'warn' : 'ok');
  }
});

/* ---------- Cookies (information) et mesure d’audience sans cookie ---------- */
function bandeauCookies() {
  try { if (localStorage.getItem('rmpaie-cookies')) return; } catch (e) { return; }
  if (document.getElementById('ckbar')) return;
  const d = document.createElement('div'); d.id = 'ckbar'; d.dataset.lang = LANG; d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Cookies');
  d.innerHTML = '<p>RM Paie n’utilise aucun cookie publicitaire : seulement ce qui est nécessaire à votre connexion. <a href="confidentialite.html#cookies">En savoir plus</a></p><button class="btn gold" data-act="ckOk">J’ai compris</button>';
  document.body.appendChild(d); translateDOM(d);
}
ACT.ckOk = () => { try { localStorage.setItem('rmpaie-cookies', '1'); } catch (e) { } const b = document.getElementById('ckbar'); if (b) b.remove(); };
(function audience() {
  const dom = (window.RMPAIE_CONFIG || {}).plausibleDomain; if (!dom) return;
  const s = document.createElement('script'); s.defer = true; s.dataset.domain = dom; s.src = 'https://plausible.io/js/script.js'; document.head.appendChild(s);
})();

/* ---------- Démarrage ---------- */
// Le moteur de calcul n'est servi qu'aux utilisateurs connectés (stockage privé « logiciel »)
async function chargerMoteur() {
  if (typeof calculerBulletin === 'function') return true;
  const { data, error } = await sb.storage.from('logiciel').download('moteur.js');
  if (error || !data) { toast('Chargement du logiciel impossible : réessayez dans un instant.', 'err'); return false; }
  const url = URL.createObjectURL(new Blob([await data.text()], { type: 'text/javascript' }));
  await new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = url; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); }).catch(() => { });
  return typeof calculerBulletin === 'function';
}
const BASE_VIEWS = VIEWS.slice();
function relancer() {
  closeModal(); Object.assign(SAAS, { session: null, ctx: null, org: null, superAdmin: false });
  VIEWS.splice(0, VIEWS.length, ...BASE_VIEWS); Object.assign(Store, { docs: {}, mode: 'local', db: null, col: null, rawDb: null, privCol: null });
  Object.assign(S, { client: false, auth: null, dossierId: null, view: 'dashboard' }); demarrer(); window.scrollTo(0, 0);
}
let _premier = true;
async function demarrer() {
  $('#main').innerHTML = '<section class="card"><p class="muted">Chargement…</p></section>';
  $('#prevP').dataset.act = 'prevP'; $('#nextP').dataset.act = 'nextP';
  if (_premier) { initLang(); _premier = false; }
  try {
    const { data } = await sb.auth.getSession(); SAAS.session = data.session;
    if (SAAS.session && sb.auth.mfa) {
      const { data: a } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (a && a.nextLevel === 'aal2' && a.currentLevel !== 'aal2') { mfaEcran(); return; }
    }
    if (SAAS.session) {
      const r = await sb.rpc('entrer'); if (r.error) throw r.error; SAAS.ctx = r.data; SAAS.superAdmin = !!r.data.super_admin;
      const orgs = r.data.organisations || []; let pref = SAAS.orgChoisie || null; try { pref = pref || localStorage.getItem('rmpaie-org'); } catch (e) { }
      SAAS.org = orgs.find(o => o.id === pref) || orgs[0] || null;
    }
  } catch (e) { toast('Connexion au serveur impossible : réessayez dans un instant.', 'err'); }
  if (SAAS.session) await chargerMoteur();
  const ficheAFaire = SAAS.org && !SAAS.org.fiche_complete;
  if (ficheAFaire) { VIEWS.splice(0, VIEWS.length, ['fiche', 'Fiche société']); S.view = 'fiche'; }
  else if (SAAS.org && SAAS.org.role === 'admin') VIEWS.push(['compte', 'Mon compte']);
  if (SAAS.superAdmin && !ficheAFaire) { if (!SAAS.org) VIEWS.splice(0, VIEWS.length); VIEWS.push(['admin', 'Administration']); }
  if (SAAS.session && !ficheAFaire) VIEWS.push(['securite', 'Sécurité']);
  if (SAAS.session) { sb.rpc('journal_connexion', { p_agent: navigator.userAgent }).then(() => { }, () => { }); veilleInactivite(); }
  await Store.init(); await Store.loadAll(); await chargerTarifs();
  if (SAAS.session && (SAAS.org || SAAS.superAdmin)) S.auth = { type: 'cabinet', ident: SAAS.session.user.email, role: SAAS.org ? SAAS.org.role : 'admin' };
  if (SAAS.session && !SAAS.org && !SAAS.superAdmin) toast('Votre compte n’est rattaché à aucune société. Demandez une invitation à votre administrateur.', 'warn');
  if (SAAS.superAdmin && !SAAS.org) S.view = 'admin';
  const qs = new URLSearchParams(location.search);
  if (qs.get('paiement') && S.auth && qs.get('commande')) {
    const id = qs.get('commande'); history.replaceState(null, '', location.pathname);
    if (qs.get('paiement') === 'ok') { toast('Paiement transmis : déblocage du mois en cours…'); setTimeout(() => finaliserValidation(id), 0); }
    else toast('Le paiement n’a pas abouti : le mois n’est pas validé. Vous pouvez réessayer.', 'err');
  } else if (qs.get('paiement') && S.auth) { S.view = 'compte'; toast(qs.get('paiement') === 'ok' ? 'Paiement transmis. La facture passe à « Payée » dès la confirmation du CMI (quelques secondes).' : 'Le paiement n’a pas abouti. Vous pouvez réessayer.', qs.get('paiement') === 'ok' ? 'ok' : 'err'); history.replaceState(null, '', location.pathname); }
  setSync('ok'); render(); bandeauCookies();
}
demarrer();

/* Lien « Essai gratuit » depuis une autre page (ex. réglementation) : ouvre directement l'inscription */
(function essaiDepuisLien() {
  if (location.hash !== '#essai') return; let n = 0;
  const t = setInterval(() => { n++; if (n > 120) return clearInterval(t);
    if (typeof SAAS !== 'undefined' && SAAS.session) return clearInterval(t);
    if ($('#authbtn') && $('.pz-hero')) { clearInterval(t); history.replaceState(null, '', location.pathname); ACT.inscription(); } }, 250);
})();

/* ---------- Import des salariés depuis Excel ou CSV ---------- */
function chargerScript(src) {
  return new Promise((ok, ko) => { if (document.querySelector(`script[data-src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = ok; s.onerror = () => ko(new Error('Chargement impossible : ' + src)); document.head.appendChild(s); });
}
const IMP_COLS = [['matricule', 'Matricule'], ['nom', 'Nom'], ['prenom', 'Prénom'], ['cin', 'CIN'], ['cnss', 'N° CNSS|CNSS|Numero CNSS|Immatriculation CNSS'], ['dateNaissance', 'Date de naissance|Naissance'],
  ['dateEmbauche', 'Date d’embauche|Date d\'embauche|Embauche|Date entree'], ['fonction', 'Fonction|Poste'], ['contrat', 'Type de contrat|Contrat'], ['finContrat', 'Fin de CDD|Fin de contrat'],
  ['typeSalaire', 'Type de salaire'], ['salaireBase', 'Salaire de base mensuel|Salaire de base|Salaire base|Salaire'], ['tauxHoraire', 'Taux horaire'], ['heures', 'Heures par mois|Heures'],
  ['situation', 'Situation familiale|Situation'], ['conjointCharge', 'Conjoint à charge|Conjoint'], ['enfants', 'Enfants à charge|Enfants|Nombre d\'enfants'], ['modePaiement', 'Mode de paiement|Paiement'],
  ['banque', 'Banque'], ['rib', 'RIB (24 chiffres)|RIB'], ['email', 'E-mail|Email|Mail'], ['telephone', 'Téléphone|Telephone|Tel|GSM'], ['adresse', 'Adresse']];
const impNorm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'*()]/g, ' ').replace(/[^a-z0-9°]+/gi, ' ').trim().toLowerCase().replace(/°/g, '');
const IMP_INDEX = {}; IMP_COLS.forEach(([k, l]) => l.split('|').forEach(a => IMP_INDEX[impNorm(a)] = k));
function impDate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  const s = String(v).trim(); let m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
  if (m) { const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? d.toISOString().slice(0, 10) : null; }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? s.slice(0, 10) : null;
}
const impNum = v => { if (v === null || v === undefined || v === '') return ''; if (typeof v === 'number') return String(v); const n = Number(String(v).replace(/\s|dh|mad/gi, '').replace(',', '.')); return isNaN(n) ? null : String(n); };
function impLigne(brut, n) {
  const e = {}, err = [], av = [];
  for (const [k, v] of Object.entries(brut)) e[k] = v instanceof Date ? v : (v == null ? '' : (typeof v === 'number' ? v : String(v).trim()));
  const txt = k => (e[k] === undefined || e[k] === '' ? '' : String(e[k]));
  const o = { matricule: txt('matricule'), nom: txt('nom').toUpperCase(), prenom: txt('prenom'), cin: txt('cin').toUpperCase().replace(/\s/g, ''), cnss: txt('cnss').replace(/\s/g, ''),
    fonction: txt('fonction'), banque: txt('banque'), email: txt('email'), telephone: txt('telephone'), adresse: txt('adresse'), rib: txt('rib').replace(/\s/g, '') };
  if (!o.nom) err.push('nom manquant');
  for (const k of ['dateNaissance', 'dateEmbauche', 'finContrat']) { const d = impDate(e[k]); if (d === null) err.push(`date invalide (${k === 'dateEmbauche' ? 'embauche' : k === 'finContrat' ? 'fin de CDD' : 'naissance'})`); else if (d) o[k] = d; }
  if (!o.dateEmbauche) { if (!err.some(x => x.includes('embauche'))) err.push('date d’embauche manquante'); }
  for (const k of ['salaireBase', 'tauxHoraire', 'heures', 'enfants']) { const x = impNum(e[k]); if (x === null) err.push(`nombre invalide (${k})`); else if (x !== '') o[k] = x; }
  const c = impNorm(txt('contrat')); o.contrat = !c || c === 'cdi' ? 'CDI' : c === 'cdd' ? 'CDD' : /anapec|idmaj|stage/.test(c) ? 'ANAPEC' : (err.push('type de contrat inconnu (CDI, CDD ou ANAPEC)'), 'CDI');
  const t = impNorm(txt('typeSalaire')); o.typeSalaire = /horaire/.test(t) ? 'horaire' : 'mensuel';
  const s = impNorm(txt('situation')); o.situation = /mari/.test(s) ? 'Marié(e)' : /divor/.test(s) ? 'Divorcé(e)' : /veu/.test(s) ? 'Veuf(ve)' : 'Célibataire';
  o.conjointCharge = /^(oui|o|yes|1|x|vrai)$/.test(impNorm(txt('conjointCharge')));
  const mp = impNorm(txt('modePaiement')); o.modePaiement = /cheq/.test(mp) ? 'Chèque' : /esp/.test(mp) ? 'Espèces' : 'Virement';
  if (o.typeSalaire === 'mensuel' && !o.salaireBase) av.push('salaire de base vide');
  if (o.typeSalaire === 'horaire' && !o.tauxHoraire) av.push('taux horaire vide');
  if (o.rib && !/^\d{24}$/.test(o.rib)) av.push('RIB : 24 chiffres attendus');
  if (o.cnss && !/^\d{6,10}$/.test(o.cnss)) av.push('n° CNSS inhabituel');
  if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) av.push('e-mail invalide');
  if (o.contrat === 'CDD' && !o.finContrat) av.push('fin de CDD non renseignée');
  Object.keys(o).forEach(k => { if (o[k] === '') delete o[k]; });
  return { n, o, err, av };
}
function impCsv(texte) {
  const l0 = texte.split(/\r?\n/)[0] || ''; const sep = (l0.match(/;/g) || []).length >= (l0.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i];
    if (q) { if (ch === '"' && texte[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texte[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
let IMP = null;
async function impLire(file) {
  let rows;
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    const buf = await file.arrayBuffer(); let txt = new TextDecoder('utf-8').decode(buf); if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
    rows = impCsv(txt.replace(/^﻿/, ''));
  } else {
    await chargerScript('read-excel-file.min.js'); const r = await window.readXlsxFile(file); rows = Array.isArray(r) ? r : (r.rows || (r[0] && r[0].data) || []);
    if (rows.length && rows[0] && rows[0].data) rows = rows[0].data;
  }
  rows = rows.filter(r => r && r.some(c => c !== null && c !== ''));
  if (rows.length < 2) throw new Error('Le fichier ne contient aucune ligne de salarié.');
  const tete = rows[0].map(h => IMP_INDEX[impNorm(h)] || null);
  if (!tete.includes('nom')) throw new Error('Colonne « Nom » introuvable. Utilisez le modèle RM Paie ou gardez les titres de colonnes de la ligne 1.');
  const ignorees = rows[0].filter((h, i) => h && !tete[i]);
  const lignes = rows.slice(1).map((r, i) => { const b = {}; tete.forEach((k, j) => { if (k) b[k] = r[j]; }); return impLigne(b, i + 2); });
  lignes.forEach(l => { if (l.o.cin === 'BE123456' && l.o.nom === 'ALAOUI') l.err.push('ligne d’exemple du modèle : supprimez-la'); });
  const d = D(); const ex = d.employees || [];
  lignes.forEach(l => { const m = ex.find(e => (l.o.matricule && e.matricule === l.o.matricule) || (l.o.cin && e.cin && e.cin.toUpperCase() === l.o.cin)); l.maj = m ? m.id : null; });
  const vus = {}; lignes.forEach(l => { const k = l.o.cin || ''; if (k) { if (vus[k]) l.err.push('CIN en double dans le fichier (ligne ' + vus[k] + ')'); else vus[k] = l.n; } });
  return { lignes, ignorees, nom: file.name };
}
function impApercu() {
  const L = IMP.lignes, ok = L.filter(l => !l.err.length), ko = L.filter(l => l.err.length);
  const nouv = ok.filter(l => !l.maj).length, maj = ok.length - nouv;
  modal(`<h2>Import des salariés — aperçu</h2><p class="muted small">${esc(IMP.nom)} · ${L.length} ligne(s) lue(s)${IMP.ignorees.length ? ' · colonnes ignorées : ' + esc(IMP.ignorees.join(', ')) : ''}</p>
   <div class="grid kpis">${kpi('Nouveaux', nouv)}${kpi('Mis à jour', maj, 'même matricule ou CIN')}${kpi('En erreur', ko.length, ko.length ? 'non importés' : '')}</div>
   <div class="tw" style="max-height:340px;overflow:auto"><table><thead><tr><th>Ligne</th><th>Salarié</th><th>Embauche</th><th class="n">Salaire</th><th>Contrôle</th></tr></thead><tbody>
   ${L.map(l => `<tr><td>${l.n}</td><td><b>${esc(l.o.nom || '—')} ${esc(l.o.prenom || '')}</b><div class="muted small">${esc(l.o.matricule || '')} ${l.o.cin ? '· CIN ' + esc(l.o.cin) : ''}</div></td><td>${l.o.dateEmbauche ? dFr(l.o.dateEmbauche) : ''}</td><td class="n">${l.o.typeSalaire === 'horaire' ? (l.o.tauxHoraire ? fmt(l.o.tauxHoraire) + ' /h' : '') : (l.o.salaireBase ? fmt(l.o.salaireBase) : '')}</td>
    <td>${l.err.length ? `<span class="pill late">Erreur</span> <span class="small">${esc(l.err.join(' ; '))}</span>` : `${l.maj ? '<span class="pill draft">Mise à jour</span>' : '<span class="pill ok">Nouveau</span>'}${l.av.length ? ` <span class="small warnc">${esc(l.av.join(' ; '))}</span>` : ''}`}</td></tr>`).join('')}
   </tbody></table></div>
   ${ko.length ? '<p class="small err">Les lignes en erreur ne seront pas importées. Corrigez le fichier et relancez l’import pour les ajouter.</p>' : ''}
   <div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="impValider" ${ok.length ? '' : 'disabled'}>Importer ${ok.length} salarié(s)</button></div>`);
}
Object.assign(ACT, {
  empImport: () => modal(`<h2>Importer des salariés depuis Excel</h2>
   <ol class="small"><li>Téléchargez le modèle et remplissez une ligne par salarié (nom et date d’embauche obligatoires).</li><li>Déposez le fichier rempli (Excel .xlsx ou CSV).</li><li>Vérifiez l’aperçu : rien n’est enregistré avant votre validation.</li></ol>
   <div class="row"><button class="btn" data-act="impModele">Télécharger le modèle Excel</button></div>
   <label class="f full" style="margin-top:12px"><span>Fichier à importer (.xlsx ou .csv)</span><input type="file" id="impfile" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"></label>
   <p id="imperr" class="err small"></p><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn primary" data-act="impLire">Lire le fichier</button></div>`),
  impModele: async () => {
    const nom = 'Modele_import_salaries_RM_Paie.xlsx'; let blob = null;
    try { const r = await fetch('modele-import-salaries.xlsx'); if (r.ok && /sheet|octet|zip/.test(r.headers.get('content-type') || '')) blob = await r.blob(); } catch (e) { }
    if (!blob) { await chargerScript('modele-import-salaries.js'); blob = new Blob([Uint8Array.from(atob(window.MODELE_IMPORT_XLSX), c => c.charCodeAt(0))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); }
    saveFile(nom, blob);
  },
  impLire: async t => {
    const f = $('#impfile') && $('#impfile').files[0]; const err = $('#imperr'); if (!f) { err.textContent = tr('Choisissez un fichier.'); return; }
    if (f.size > 5 * 1024 * 1024) { err.textContent = tr('Fichier trop volumineux (5 Mo maximum).'); return; }
    t.disabled = true; t.textContent = tr('Lecture…');
    try { IMP = await impLire(f); impApercu(); } catch (e) { err.textContent = e.message; t.disabled = false; t.textContent = tr('Lire le fichier'); }
  },
  impValider: () => {
    const d = D(); d.employees = d.employees || []; let n = 0, m = 0;
    IMP.lignes.filter(l => !l.err.length).forEach(l => {
      if (l.maj) { Object.assign(d.employees.find(e => e.id === l.maj), l.o); m++; }
      else { if (!l.o.matricule) l.o.matricule = String(d.employees.length + 1).padStart(3, '0'); d.employees.push(Object.assign({ id: uid(), heures: '191', enfants: '0' }, l.o)); n++; }
    });
    saveD(d); IMP = null; closeModal(); render(); toast(`${n} salarié(s) ajouté(s), ${m} mis à jour.`);
  }
});


/* ---------- Double authentification (application d'authentification, code à 6 chiffres) ---------- */
function mfaEcran() {
  VIEWS.splice(0, VIEWS.length, ['mfa', 'Vérification']); S.view = 'mfa';
  S.auth = { type: 'cabinet', ident: SAAS.session.user.email, role: 'collaborateur' }; setSync('ok'); render();
  setTimeout(() => { const i = $('#mfacode'); if (i) i.focus(); }, 50);
}
EXTRA_VIEWS.mfa = () => `<section class="card mfa"><h2>🔒 Double authentification</h2>
  <p>Ouvrez votre application d’authentification (Google Authenticator, Microsoft Authenticator…) et saisissez le code à 6 chiffres affiché pour <b>RM Paie</b>.</p>
  <form id="mfaf" class="fg"><label class="f"><span>Code à 6 chiffres</span><input id="mfacode" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*"></label></form>
  <p id="mfaerr" class="err small"></p>
  <div class="row"><button class="btn primary" data-act="mfaVerifier">Valider</button><button class="btn" data-act="logout">Se déconnecter</button></div>
  <p class="small muted">Téléphone perdu ? Utilisez votre second appareil s’il est enregistré, sinon écrivez-nous depuis l’adresse e-mail du compte : nous réinitialiserons la double authentification après vérification de votre identité.</p></section>`;
async function mfaFacteurs() { const { data } = await sb.auth.mfa.listFactors(); return { actifs: (data && data.totp) || [], tous: (data && data.all) || [] }; }
let MFA_ENROL = null;
EXTRA_VIEWS.securite = () => { setTimeout(chargerSecurite, 0); return '<div id="secu"><section class="card"><p class="muted">Chargement…</p></section></div>'; };
async function chargerSecurite() {
  const box = $('#secu'); if (!box) return;
  const { actifs } = await mfaFacteurs(); const admin = SAAS.org && SAAS.org.role === 'admin';
  const { data: cx } = await sb.rpc('mes_connexions');
  const appareil = a => { a = a || ''; const nav = /Edg\//.test(a) ? 'Edge' : /Chrome\//.test(a) ? 'Chrome' : /Firefox\//.test(a) ? 'Firefox' : /Safari\//.test(a) ? 'Safari' : 'Navigateur'; const os = /iPhone|iPad/.test(a) ? 'iPhone/iPad' : /Android/.test(a) ? 'Android' : /Windows/.test(a) ? 'Windows' : /Mac OS/.test(a) ? 'Mac' : /Linux/.test(a) ? 'Linux' : ''; return nav + (os ? ' · ' + os : ''); };
  const connexions = `<section class="card"><h2>Vos dernières connexions</h2>${(cx || []).length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Appareil</th><th>Double authentification</th></tr></thead><tbody>${cx.map(c => `<tr><td class="nowrap">${new Date(c.cree_le).toLocaleString('fr-FR')}</td><td>${esc(appareil(c.agent))}</td><td>${c.double_auth ? '<span class="pill ok">Oui</span>' : '<span class="pill draft">Non</span>'}</td></tr>`).join('')}</tbody></table></div><p class="small muted">Une connexion que vous ne reconnaissez pas ? Changez immédiatement votre mot de passe et activez la double authentification.</p>` : '<p class="muted small">Aucune connexion enregistrée pour le moment.</p>'}
    <p class="small muted">Par sécurité, vous êtes déconnecté automatiquement après ${INACTIVITE_MIN} minutes sans activité.</p></section>`;
  let membres = '';
  if (admin) {
    const [m, f] = await Promise.all([sb.rpc('membres_org', { p_org: SAAS.org.id }), sb.rpc('mfa_membres', { p_org: SAAS.org.id })]);
    const act = {}; (f.data || []).forEach(x => act[x.user_id] = x.active);
    const L = (m.data || []).filter(x => x.user_id);
    membres = `<section class="card"><h2>Utilisateurs de ${esc(SAAS.org.raison_sociale)}</h2><div class="tw"><table><thead><tr><th>E-mail</th><th>Rôle</th><th>Double authentification</th></tr></thead><tbody>
      ${L.map(x => `<tr><td>${esc(x.email)}</td><td>${x.role === 'admin' ? 'Administrateur' : 'Collaborateur'}</td><td>${act[x.user_id] ? '<span class="pill ok">Activée</span>' : '<span class="pill late">Non activée</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Chaque utilisateur l’active lui-même depuis cet onglet « Sécurité ». Nous recommandons de l’exiger de tous les administrateurs : ils voient les salaires et les coordonnées bancaires.</p></section>`;
  }
  const sa = SAAS.superAdmin ? `<section class="card"><h2>Réinitialiser la double authentification d’un client</h2><p class="small muted">Pour un utilisateur qui a perdu son téléphone, après avoir vérifié son identité (appel au numéro de la fiche société, pièce d’identité).</p>
    <form id="mfarf" class="fg">${field('E-mail de l’utilisateur', 'email', '', { type: 'email' })}</form><div class="row end"><button class="btn danger" data-act="mfaReinit">Réinitialiser</button></div></section>` : '';
  box.innerHTML = `<section class="card"><h2>Double authentification</h2>
    ${actifs.length ? `<p><span class="pill ok">Activée</span> À chaque connexion, un code à 6 chiffres vous est demandé en plus du mot de passe.</p>
      <div class="tw"><table><thead><tr><th>Appareil</th><th>Ajouté le</th><th></th></tr></thead><tbody>${actifs.map(f => `<tr><td>${esc(f.friendly_name || 'Application d’authentification')}</td><td>${f.created_at ? dFr(f.created_at.slice(0, 10)) : ''}</td><td class="nowrap"><button class="btn sm danger" data-act="mfaRetirer" data-id="${f.id}">Retirer</button></td></tr>`).join('')}</tbody></table></div>
      <div class="row"><button class="btn" data-act="mfaActiver">+ Ajouter un appareil de secours</button></div><p class="small muted">Conseil : enregistrez un second appareil (téléphone d’un associé, tablette) pour ne pas être bloqué si vous perdez le premier.</p>`
    : `<p><span class="pill late">Non activée</span> Protégez l’accès aux salaires, RIB et déclarations : en plus du mot de passe, un code à 6 chiffres généré par une application sur votre téléphone sera demandé à chaque connexion.</p>
      <ol class="small"><li>Installez une application d’authentification gratuite : Google Authenticator, Microsoft Authenticator ou Authy.</li><li>Cliquez sur « Activer », puis scannez le QR code avec l’application.</li><li>Saisissez le code affiché pour confirmer.</li></ol>
      <div class="row"><button class="btn primary" data-act="mfaActiver">Activer la double authentification</button></div>`}
    <div id="mfaenrol"></div></section>${connexions}${membres}${sa}`;
}
Object.assign(ACT, {
  mfaVerifier: async t => {
    const code = ($('#mfacode').value || '').replace(/\D/g, ''); const err = $('#mfaerr'); err.textContent = '';
    if (code.length !== 6) { err.textContent = tr('Saisissez les 6 chiffres du code.'); return; }
    t.disabled = true; const { actifs } = await mfaFacteurs(); let ok = false;
    for (const f of actifs) { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code }); if (!error) { ok = true; break; } }
    t.disabled = false; if (!ok) { err.textContent = tr('Code incorrect ou expiré. Attendez le code suivant et réessayez.'); $('#mfacode').select(); return; }
    relancer();
  },
  mfaActiver: async t => {
    t.disabled = true; const { tous, actifs } = await mfaFacteurs();
    for (const f of tous.filter(x => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
    const nom = (actifs.length ? 'Appareil de secours ' : 'Téléphone ') + new Date().toLocaleDateString('fr-FR') + ' ' + new Date().toLocaleTimeString('fr-FR').slice(0, 5);
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: nom, issuer: 'RM Paie' });
    t.disabled = false; if (error) { toast(error.message, 'err'); return; }
    MFA_ENROL = data;
    $('#mfaenrol').innerHTML = `<div class="mfa-qr"><img alt="QR code à scanner avec l’application d’authentification" src="${esc(data.totp.qr_code)}" width="200" height="200">
      <div><p><b>1.</b> Scannez ce QR code avec l’application.</p><p class="small muted">Pas de caméra ? Saisissez cette clé dans l’application :<br><code class="mono">${esc(data.totp.secret)}</code></p>
      <p><b>2.</b> Saisissez le code à 6 chiffres affiché :</p><form id="mfaef" class="fg"><label class="f"><span>Code</span><input id="mfaecode" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label></form>
      <p id="mfaeerr" class="err small"></p><div class="row"><button class="btn primary" data-act="mfaConfirmer">Confirmer</button><button class="btn" data-act="mfaAnnuler">Annuler</button></div></div></div>`;
  },
  mfaConfirmer: async t => {
    const code = ($('#mfaecode').value || '').replace(/\D/g, ''); const err = $('#mfaeerr');
    if (code.length !== 6) { err.textContent = tr('Saisissez les 6 chiffres du code.'); return; }
    t.disabled = true; const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: MFA_ENROL.id, code }); t.disabled = false;
    if (error) { err.textContent = tr('Code incorrect. Vérifiez l’heure de votre téléphone et réessayez avec le code suivant.'); return; }
    MFA_ENROL = null; toast('Double authentification activée.'); chargerSecurite();
  },
  mfaAnnuler: async () => { if (MFA_ENROL) await sb.auth.mfa.unenroll({ factorId: MFA_ENROL.id }); MFA_ENROL = null; chargerSecurite(); },
  mfaRetirer: t => modal(`<h2>Retirer cet appareil ?</h2><p>S’il s’agit de votre seul appareil, la double authentification sera désactivée et seul le mot de passe protégera votre compte.</p><div class="row end"><button class="btn" data-act="closeModal">Annuler</button><button class="btn danger" data-act="mfaRetirerOk" data-id="${t.dataset.id}">Retirer</button></div>`),
  mfaRetirerOk: async t => { const { error } = await sb.auth.mfa.unenroll({ factorId: t.dataset.id }); closeModal(); if (error) { toast(error.message, 'err'); return; } toast('Appareil retiré.'); chargerSecurite(); },
  mfaReinit: async t => {
    const email = (formData($('#mfarf')).email || '').trim(); if (!email) return;
    t.disabled = true; const { data, error } = await sb.functions.invoke('mfa-reinitialiser', { body: { email } }); t.disabled = false;
    if (error || (data && data.erreur)) toast((data && data.erreur) || error.message, 'err'); else toast(`Double authentification réinitialisée pour ${email}.`);
  }
});

/* ---------- Journal des erreurs : signalées au serveur, visibles dans Administration > Erreurs ---------- */
const RMPAIE_VERSION = '2026.11.19';
const ERR_VUES = new Set();
function signalerErreur(message, pile) {
  message = String(message || '').slice(0, 500); if (!message || /ResizeObserver|^Script error\.?$/.test(message)) return;
  const cle = message + '|' + String(pile || '').split('\n')[1]; if (ERR_VUES.has(cle) || ERR_VUES.size >= 20) return; ERR_VUES.add(cle);
  try { sb.rpc('journal_erreur', { p: { source: 'navigateur', message, pile: pile ? String(pile).slice(0, 4000) : null, url: location.pathname + ' › ' + (S.view || ''), agent: navigator.userAgent, version: RMPAIE_VERSION, org_id: SAAS.org ? SAAS.org.id : null } }).then(() => { }, () => { }); } catch (e) { }
}
window.addEventListener('error', e => signalerErreur(e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', e => { const r = e.reason; signalerErreur(r && r.message ? r.message : String(r), r && r.stack); });
async function chargerErreurs(box) {
  const { data, error } = await sb.rpc('admin_erreurs', { p_statut: ADM.errStatut || null }); if (error) { box.innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  const L = data || []; ADM.erreurs = L;
  box.innerHTML = `<section class="card"><div class="head"><h2>Erreurs (${L.length})</h2><div class="pz-seg">${[['', 'Toutes'], ['nouvelle', 'Nouvelles'], ['vue', 'Vues'], ['resolue', 'Résolues']].map(([k, l]) => `<button data-act="errFiltre" data-o="${k}" class="${(ADM.errStatut || '') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <p class="small muted">Erreurs survenues chez les utilisateurs (navigateur) et dans les fonctions serveur. Une alerte e-mail vous est envoyée chaque heure pour les nouvelles erreurs. Une erreur résolue qui se reproduit revient en « Nouvelle ».</p>
    ${L.length ? `<div class="tw"><table><thead><tr><th>Dernière</th><th>Source</th><th>Message</th><th class="n">Nb</th><th>Statut</th><th></th></tr></thead><tbody>
    ${L.map(e => `<tr><td class="nowrap">${new Date(e.dernier_le).toLocaleString('fr-FR')}</td><td>${e.source === 'serveur' ? 'Serveur' : 'Navigateur'}</td><td><b>${esc(e.message)}</b><div class="muted small">${esc(e.url || '')}${e.version ? ' · v' + esc(e.version) : ''}</div>${e.pile ? `<details><summary class="small">Pile</summary><pre class="small mono" style="white-space:pre-wrap;max-width:640px">${esc(e.pile)}</pre></details>` : ''}</td>
     <td class="n">${e.nb}</td><td>${{ nouvelle: '<span class="pill late">Nouvelle</span>', vue: '<span class="pill draft">Vue</span>', resolue: '<span class="pill ok">Résolue</span>' }[e.statut]}</td>
     <td class="nowrap">${e.statut !== 'vue' ? `<button class="btn sm" data-act="errStatut" data-id="${e.id}" data-s="vue">Vue</button> ` : ''}${e.statut !== 'resolue' ? `<button class="btn sm" data-act="errStatut" data-id="${e.id}" data-s="resolue">Résolue</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune erreur. 👍</p>'}</section>`;
}
Object.assign(ACT, {
  errFiltre: t => { ADM.errStatut = t.dataset.o || null; chargerAdmin(); },
  errStatut: async t => { const { error } = await sb.rpc('admin_erreur_statut', { p_id: Number(t.dataset.id), p_statut: t.dataset.s }); if (error) toast(error.message, 'err'); chargerAdmin(); }
});


/* ---------- Export complet des données (réversibilité, loi 09-08) ---------- */
async function exportComplet(t) {
  if (!window.JSZip) { toast('Préparation du fichier impossible : rechargez la page.', 'err'); return; }
  const lbl = t.textContent; t.disabled = true; t.textContent = tr('Préparation de l’export…');
  try {
    const id = SAAS.org.id, zip = new JSZip(), jour = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const [o, fa, pa, co] = await Promise.all([sb.from('organisations').select('*').eq('id', id).single(), sb.from('factures').select('*').eq('org_id', id), sb.from('paiements').select('*').eq('org_id', id), sb.from('consommation').select('*').eq('org_id', id)]);
    const org = o.data || {};
    zip.file('donnees-completes.json', JSON.stringify({ app: 'rm-paie', format: 1, exporte_le: new Date().toISOString(), societe: org, documents: Store.docs, factures: fa.data || [], paiements: pa.data || [], consommation: co.data || [] }, null, 1));
    const plat = (x, p = '', out = {}) => { Object.entries(x || {}).forEach(([k, v]) => { if (v && typeof v === 'object' && !Array.isArray(v)) plat(v, p + k + '.', out); else if (!Array.isArray(v)) out[p + k] = v; }); return out; };
    const tableau = lignes => { const cols = []; lignes.forEach(l => Object.keys(l).forEach(k => { if (!cols.includes(k)) cols.push(k); })); return csv([cols, ...lignes.map(l => cols.map(c => l[c] ?? ''))]); };
    const fichiers = [];
    for (const d of dossiers()) {
      const rep = 'dossiers/' + slug(d.raison || d.id) + '/';
      const emps = d.employees || [];
      zip.file(rep + 'salaries.csv', tableau(emps.map(e => { const x = Object.assign({}, e); delete x.pj; x.pieces_jointes = (e.pj || []).map(p => p.nom).join(' | '); return x; })));
      zip.file(rep + 'societe.json', JSON.stringify(Object.assign({}, d, { employees: undefined }), null, 1));
      const noms = {}; emps.forEach(e => noms[e.id] = ((e.matricule || '') + ' ' + (e.nom || '') + ' ' + (e.prenom || '')).trim());
      Store.keys('per-' + d.id + '-').sort().forEach(k => {
        const p = Store.get(k), mois = k.slice(('per-' + d.id + '-').length);
        if (p && p.validated && p.bulletins) zip.file(rep + 'bulletins/' + mois + '.csv', tableau(Object.entries(p.bulletins).map(([eid, r]) => Object.assign({ salarie: noms[eid] || eid, mois }, plat(r)))));
        if (p && p.vars) zip.file(rep + 'variables/' + mois + '.csv', tableau(Object.entries(p.vars).map(([eid, v]) => Object.assign({ salarie: noms[eid] || eid, mois }, plat(v)))));
      });
      emps.forEach(e => (e.pj || []).forEach(p => fichiers.push([p.chemin, rep + 'pieces-jointes/' + slug(noms[e.id] || e.id) + '/' + p.nom])));
    }
    if (org.rc_fichier) fichiers.push([org.rc_fichier, 'societe/' + (org.rc_fichier_nom || 'registre-commerce')]);
    zip.file('factures.csv', tableau((fa.data || []).map(f => plat(f))));
    zip.file('paiements.csv', tableau((pa.data || []).map(p => plat(p))));
    let manquants = 0;
    for (const [chemin, nom] of fichiers) { const { data, error } = await sb.storage.from('justificatifs').download(chemin); if (error || !data) manquants++; else zip.file(nom, data); }
    zip.file('LISEZMOI.txt', `Export des données RM Paie — ${org.raison_sociale || ''} (${org.numero_client || ''})\r\nExporté le ${new Date().toLocaleString('fr-FR')}\r\n\r\n` +
      `donnees-completes.json : toutes les données, réimportables dans RM Paie ou un autre logiciel.\r\ndossiers/<société>/salaries.csv : fiches salariés.\r\ndossiers/<société>/bulletins/AAAA-MM.csv : bulletins validés (brut, cotisations, IR, net…).\r\ndossiers/<société>/variables/AAAA-MM.csv : variables saisies chaque mois.\r\ndossiers/<société>/pieces-jointes/ : documents des salariés.\r\nsociete/ : registre de commerce.\r\nfactures.csv, paiements.csv : votre facturation RM Paie.\r\n\r\nLes fichiers CSV utilisent le point-virgule et s’ouvrent directement dans Excel.\r\n` + (manquants ? `\r\nAttention : ${manquants} pièce(s) jointe(s) n’ont pas pu être récupérées.\r\n` : ''));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    saveFile('RM_Paie_export_' + slug(org.raison_sociale || 'donnees') + '_' + jour + '.zip', blob);
    toast(manquants ? `Export prêt (${manquants} pièce(s) jointe(s) non récupérée(s)).` : 'Export complet prêt.', manquants ? 'warn' : 'ok');
  } catch (e) { signalerErreur('Export des données : ' + e.message, e.stack); toast('L’export a échoué : ' + e.message, 'err'); }
  t.disabled = false; t.textContent = lbl;
}


/* ---------- Administration : configuration du paiement par carte ---------- */
async function chargerPaiementCarte(box) {
  const { data: d, error } = await sb.functions.invoke('cmi-diagnostic', { body: {} });
  if (error || !d || d.erreur) { box.innerHTML = `<section class="card"><p class="err">${esc((d && d.erreur) || (error && error.message) || 'Diagnostic indisponible.')}</p></section>`; return; }
  const ok = d.controles.every(c => c.ok);
  const badge = d.mode === 'production' ? '<span class="pill ok">Production</span>' : d.mode === 'test' ? '<span class="pill draft">Mode test</span>' : '<span class="pill draft">Démonstration</span>';
  box.innerHTML = `<section class="card"><div class="head"><h2>Paiement par carte ${badge}</h2></div>
    <p class="small muted">Paiement sur la page sécurisée de la passerelle (3-D Secure). RM Paie ne voit ni ne stocke jamais les numéros de carte. Le paiement n’est encaissé qu’après confirmation serveur à serveur (rappel signé), puis la facture acquittée est émise automatiquement.</p>
    <div class="tw"><table><thead><tr><th>Contrôle</th><th>État</th><th>Détail</th></tr></thead><tbody>${d.controles.map(c => `<tr><td>${esc(c.point)}</td><td>${c.ok ? '<span class="pill ok">OK</span>' : '<span class="pill late">À faire</span>'}</td><td class="small">${esc(c.detail)}</td></tr>`).join('')}</tbody></table></div>
    ${ok ? '' : '<p class="small warnc">Tant que ces points ne sont pas réglés, les clients ne peuvent pas payer par carte.</p>'}</section>
   <section class="card"><h2>À communiquer à votre acquéreur</h2><p class="small muted">Ces paramètres sont à donner au service e-commerce de votre banque (ou de son établissement de paiement) lors de l’ouverture du magasin en ligne.</p>
    <div class="tw"><table><tbody>${Object.entries(d.a_declarer).map(([k, v]) => `<tr><td>${esc(k)}</td><td><code class="mono small">${esc(v)}</code></td><td class="nowrap"><button class="btn sm" data-act="copier" data-v="${esc(v)}">Copier</button></td></tr>`).join('')}</tbody></table></div></section>
   <section class="card"><h2>Mise en service, étape par étape</h2><ol class="small">
    <li><b>Contrat d’acceptation :</b> depuis novembre 2024, le CMI ne signe plus directement avec les commerçants. Le contrat se signe avec l’établissement de paiement de votre banque (Attijari Payment, Damane Cash, M2T, Al Filahi Cash, Lana Cash, CDM Pay, Saham Paiements…) ou un acquéreur indépendant. Demandez une offre « paiement en ligne » compatible avec la page de paiement hébergée CMI (3D Pay Hosting).</li>
    <li><b>Dossier :</b> statuts, RC, patente, CIN du gérant, spécimen de chèque, questionnaire e-marchand ; le site doit afficher conditions générales, prix, politique de remboursement, mentions légales et contact (déjà en place).</li>
    <li><b>Environnement de test :</b> l’acquéreur fournit un identifiant marchand et une clé de magasin de test. Renseignez-les dans Supabase (secrets <code>CMI_CLIENT_ID</code>, <code>CMI_STORE_KEY</code>) avec la passerelle de test, puis faites un paiement test complet.</li>
    <li><b>Recette :</b> l’acquéreur vérifie les paiements test (accepté, refusé, abandon) avant d’ouvrir la production.</li>
    <li><b>Production :</b> remplacez l’identifiant, la clé et l’adresse de passerelle par ceux de production, puis faites un premier paiement réel de faible montant.</li></ol></section>
   <section class="card"><h2>Derniers échanges avec la passerelle</h2>${d.rappels.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Événement</th><th>Référence</th></tr></thead><tbody>${d.rappels.map(r => `<tr><td class="nowrap">${new Date(r.cree_le).toLocaleString('fr-FR')}</td><td>${esc({ cmi_rappel: 'Rappel reçu', cmi_refus: 'Paiement refusé', cmi_signature_invalide: 'Signature invalide', cmi_montant_incoherent: 'Montant incohérent', cmi_enregistrement_echoue: 'Enregistrement échoué', cmi_marchand_incoherent: 'Identifiant marchand incohérent' }[r.action] || r.action)}${r.details && r.details.code ? ' (code ' + esc(r.details.code) + ')' : ''}</td><td class="small mono">${esc((r.details && r.details.oid) || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Aucun échange pour le moment.</p>'}</section>`;
}
Object.assign(ACT, { copier: async t => { try { await navigator.clipboard.writeText(t.dataset.v); toast('Copié.'); } catch (e) { toast('Copie impossible : sélectionnez le texte.', 'warn'); } } });


/* ---------- Administration : mesure d'audience (hébergée chez nous, sans cookie) ---------- */
async function chargerAudience(box) {
  const j = ADM.audJours || 30;
  const { data: a, error } = await sb.rpc('admin_audience', { p_jours: j });
  if (error || !a) { box.innerHTML = `<section class="card"><p class="err">${esc((error && error.message) || 'Indisponible')}</p></section>`; return; }
  const max = Math.max(1, ...a.par_jour.map(x => x.vues));
  const conv = a.visites ? (100 * a.inscriptions / a.visites).toFixed(1).replace('.', ',') + ' %' : '—';
  const tab = (titre, L, k, v) => `<div><h3 class="small">${titre}</h3>${L.length ? `<table class="small"><tbody>${L.map(x => `<tr><td>${esc(x[k])}</td><td class="n">${fmt0(x[v])}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Pas encore de données.</p>'}</div>`;
  box.innerHTML = `<section class="card"><div class="head"><h2>Audience du site</h2><div class="pz-seg">${[7, 30, 90, 365].map(n => `<button data-act="audJours" data-o="${n}" class="${j === n ? 'on' : ''}">${n} j</button>`).join('')}</div></div>
    <p class="small muted">Mesure hébergée sur nos serveurs, sans cookie, sans adresse IP ni identifiant : seulement des compteurs de pages vues par jour. Une visite = la première page d’une session de navigation.</p>
    <div class="grid kpis">${kpi('Visites', fmt0(a.visites))}${kpi('Pages vues', fmt0(a.vues))}${kpi('Inscriptions', fmt0(a.inscriptions))}${kpi('Taux de conversion', conv, 'inscriptions / visites')}</div>
    <div class="aud-bars" role="img" aria-label="Pages vues par jour">${a.par_jour.map(x => `<span title="${dFr(x.jour)} : ${x.vues} pages vues, ${x.visites} visites" style="height:${Math.max(2, Math.round(100 * x.vues / max))}%"></span>`).join('') || '<p class="muted small">Pas encore de données.</p>'}</div>
    <div class="aud-grid">${tab('Pages les plus vues', a.pages, 'page', 'vues')}${tab('Provenance des visites', a.sources, 'source', 'visites')}${tab('Appareils', a.appareils, 'appareil', 'visites')}</div></section>`;
}
const fmt0 = n => Number(n || 0).toLocaleString('fr-FR');
Object.assign(ACT, { audJours: t => { ADM.audJours = Number(t.dataset.o); chargerAdmin(); } });


/* ---------- Sécurité du poste : type réel des fichiers, déconnexion automatique, formulaires ---------- */
// Lit la signature du fichier (ses premiers octets) : l'extension et le type annoncé ne suffisent pas.
async function typeReel(f) {
  const b = new Uint8Array(await f.slice(0, 8).arrayBuffer());
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D) return 'pdf';
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  return null;
}
// Déconnexion après 30 minutes sans activité (poste laissé ouvert), avec avertissement 1 minute avant.
const INACTIVITE_MIN = 30;
let veilleLancee = false;
function veilleInactivite() {
  if (veilleLancee) return; veilleLancee = true;
  const CLE = 'rmpaie-activite'; let dernier = Date.now(), averti = false;
  const marque = () => { dernier = Date.now(); if (averti) { averti = false; const m = $('#veillemsg'); if (m) closeModal(); } try { localStorage.setItem(CLE, String(dernier)); } catch (e) { } };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(n => window.addEventListener(n, () => { if (Date.now() - dernier > 5000) marque(); }, { passive: true, capture: true }));
  window.addEventListener('storage', e => { if (e.key === CLE && e.newValue) dernier = Math.max(dernier, Number(e.newValue)); });   // activité dans un autre onglet
  marque();
  setInterval(() => {
    if (!SAAS.session) return; const repos = Date.now() - dernier;
    if (repos > INACTIVITE_MIN * 60000) { veilleLancee = false; try { sessionStorage.setItem('rmpaie-veille', '1'); } catch (e) { } deconnexion(); }
    else if (repos > (INACTIVITE_MIN - 1) * 60000 && !averti) { averti = true; modal(`<h2 id="veillemsg">Toujours là ?</h2><p>Sans activité, vous serez déconnecté dans une minute pour protéger les données de paie.</p><div class="row end"><button class="btn primary" data-act="closeModal">Je continue</button></div>`); }
  }, 15000);
}
try { if (sessionStorage.getItem('rmpaie-veille')) { sessionStorage.removeItem('rmpaie-veille'); setTimeout(() => toast('Vous avez été déconnecté après ' + INACTIVITE_MIN + ' minutes sans activité.', 'warn'), 1500); } } catch (e) { }
// Aucun formulaire ne s'envoie « à l'ancienne » : tout passe par les boutons du logiciel (permet une politique CSP stricte, sans script en ligne).
document.addEventListener('submit', e => e.preventDefault());

document.addEventListener('change', e => { if (e.target && e.target.id === 'voirpwd') { const i = document.querySelector('#loginf [name=pwd]'); if (i) i.type = e.target.checked ? 'text' : 'password'; } });
document.addEventListener('focusin', e => { const t = e.target; if (t && t.matches && t.matches('#loginf [name=ident]')) { t.setAttribute('autocapitalize', 'none'); t.setAttribute('autocorrect', 'off'); t.setAttribute('spellcheck', 'false'); t.setAttribute('autocomplete', 'username'); t.setAttribute('inputmode', 'email'); } });
