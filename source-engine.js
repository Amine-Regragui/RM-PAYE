/* ===== Moteur de calcul de paie marocaine (paramètres 2026) ===== */
const DEFAULT_PARAMS = {
  annee: 2026,
  smigHoraire: 17.92,
  heuresLegales: 191,
  joursMois: 26,
  plafondCNSS: 6000,
  tauxPrestSal: 4.48, tauxPrestPat: 8.98,
  tauxAF: 6.40,
  tauxAmoSal: 2.26, tauxAmoPat: 4.11,
  tauxTFP: 1.60,
  fpSeuilAnnuel: 78000, fpTauxBas: 35, fpTauxHaut: 25, fpPlafondAnnuel: 35000,
  famParPersonne: 600, famMaxPersonnes: 6,
  bareme: [
    { jusqua: 40000, taux: 0, deduire: 0 },
    { jusqua: 60000, taux: 10, deduire: 4000 },
    { jusqua: 80000, taux: 20, deduire: 10000 },
    { jusqua: 100000, taux: 30, deduire: 18000 },
    { jusqua: 180000, taux: 34, deduire: 22000 },
    { jusqua: null, taux: 37, deduire: 27400 }
  ],
  transportExoMax: 500,
  panierExoJourFacteurSmig: 2,
  anapecPlafond: 6000, anapecMoisMax: 24, anapecAmoDue: false,
  irExoPostPlafond: 10000, chargesEtatPlafond: 6000,
  congesParMois: 1.5,
  irRegul: true,
  ancTranches: [ { ans: 2, taux: 5 }, { ans: 5, taux: 10 }, { ans: 12, taux: 15 }, { ans: 20, taux: 20 }, { ans: 25, taux: 25 } ]
};

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };

function finDeMois(period) { const [y, m] = period.split('-').map(Number); return new Date(y, m, 0); }
function anneesEntre(d1, d2) {
  if (!d1) return 0; const a = new Date(d1); if (isNaN(a)) return 0;
  let y = d2.getFullYear() - a.getFullYear();
  if (d2.getMonth() < a.getMonth() || (d2.getMonth() === a.getMonth() && d2.getDate() < a.getDate())) y--;
  return Math.max(0, y);
}
function moisEntre(d1, d2) {
  if (!d1) return 0; const a = new Date(d1); if (isNaN(a)) return 0;
  let m = (d2.getFullYear() - a.getFullYear()) * 12 + (d2.getMonth() - a.getMonth());
  if (d2.getDate() < a.getDate()) m--; return Math.max(0, m);
}
function tauxAnciennete(ans, P) { let t = 0; for (const tr of P.ancTranches) if (ans >= tr.ans) t = tr.taux; return t; }
function irAnnuel(rni, P) {
  if (rni <= 0) return 0;
  for (const b of P.bareme) if (b.jusqua === null || rni <= b.jusqua) return Math.max(0, rni * b.taux / 100 - b.deduire);
  return 0;
}
function personnesACharge(emp, P) { return Math.min(P.famMaxPersonnes, (emp.conjointCharge ? 1 : 0) + Math.max(0, Math.floor(num(emp.enfants)))); }

/* cum = cumuls des mois précédents de l'année (bulletins validés) :
   {n, sbi, sni, ir, cnss, amo, brut, net, congesAcquis, congesPris, jours} */
function calculerBulletin(emp, v, cum, P, period) {
  v = v || {}; cum = cum || {};
  const ref = finDeMois(period);
  const J = P.joursMois;
  const res = { period, empId: emp.id };

  // Base
  let base;
  if (emp.typeSalaire === 'horaire') { res.heures = num(v.heures ?? emp.heures ?? P.heuresLegales); base = num(emp.tauxHoraire) * res.heures; res.tauxHoraire = num(emp.tauxHoraire); }
  else { base = num(emp.salaireBase); res.heures = P.heuresLegales; res.tauxHoraire = base / P.heuresLegales; }
  res.base = r2(base);
  const absJ = Math.min(J, num(v.absJours));
  res.absJours = absJ;
  res.absence = emp.typeSalaire === 'horaire' ? 0 : r2(base / J * absJ);
  const baseEff = res.base - res.absence;

  // Ancienneté
  res.ancAns = anneesEntre(emp.dateEmbauche, ref);
  res.ancTaux = emp.contrat === 'ANAPEC' ? 0 : tauxAnciennete(res.ancAns, P);
  res.primeAnc = r2(baseEff * res.ancTaux / 100);

  // Heures sup
  const th = res.tauxHoraire;
  res.hs25 = num(v.hs25); res.hs50 = num(v.hs50); res.hs100 = num(v.hs100);
  res.mtHs25 = r2(th * 1.25 * res.hs25); res.mtHs50 = r2(th * 1.5 * res.hs50); res.mtHs100 = r2(th * 2 * res.hs100);
  res.mtHs = r2(res.mtHs25 + res.mtHs50 + res.mtHs100);

  // Primes imposables
  res.primesFixes = r2(num(emp.primesFixes));
  res.primeVar = r2(num(v.prime));
  res.autresImpos = r2(num(v.autresImpos));

  // Indemnités (part exonérée / excédent imposable)
  const joursTrav = Math.max(0, J - absJ);
  const transport = num(v.transport ?? emp.transportFixe);
  const panier = num(v.panier ?? emp.panierFixe);
  const transportExo = Math.min(transport, P.transportExoMax);
  const panierCap = P.panierExoJourFacteurSmig * P.smigHoraire * joursTrav;
  const panierExo = Math.min(panier, panierCap);
  res.transport = r2(transport); res.panier = r2(panier);
  res.autresExo = r2(num(v.autresExo));
  res.exo = r2(transportExo + panierExo + res.autresExo);
  res.excedentIndem = r2(transport - transportExo + panier - panierExo);

  res.sbi = r2(baseEff + res.primeAnc + res.mtHs + res.primesFixes + res.primeVar + res.autresImpos + res.excedentIndem);
  res.brut = r2(res.sbi + res.exo);

  // ANAPEC (contrat d'insertion)
  const moisAnc = moisEntre(emp.dateEmbauche, ref);
  res.anapec = emp.contrat === 'ANAPEC' && moisAnc < P.anapecMoisMax;
  const anapecExo = res.anapec ? Math.min(res.sbi, P.anapecPlafond) : 0;
  // Prolongation d'exonération IR après Idmaj (CDI) et prise en charge des charges par l'État
  res.irExoPost = !res.anapec && emp.irExoFin && new Date(emp.irExoFin) >= new Date(ref.getFullYear(), ref.getMonth(), 1);
  const irExoPost = res.irExoPost ? Math.min(res.sbi, P.irExoPostPlafond) : 0;
  res.chargesEtat = !res.anapec && emp.chargesEtatFin && new Date(emp.chargesEtatFin) >= new Date(ref.getFullYear(), ref.getMonth(), 1);

  // Cotisations salariales
  const assietteCnss = Math.max(0, res.sbi - anapecExo);
  res.baseCnss = r2(Math.min(assietteCnss, P.plafondCNSS));
  res.cnssSal = r2(res.baseCnss * P.tauxPrestSal / 100);
  res.baseAmo = (res.anapec && !P.anapecAmoDue) ? r2(assietteCnss) : res.sbi;
  res.amoSal = r2(res.baseAmo * P.tauxAmoSal / 100);
  res.cimrSal = r2(res.sbi * num(emp.cimrSal) / 100);
  res.mutSal = r2(num(emp.mutuelleSal));

  // Frais professionnels
  const sbiImpos = Math.max(0, res.sbi - anapecExo - irExoPost);
  res.fpTaux = (sbiImpos * 12 <= P.fpSeuilAnnuel) ? P.fpTauxBas : P.fpTauxHaut;
  res.fraisPro = r2(Math.min(sbiImpos * res.fpTaux / 100, P.fpPlafondAnnuel / 12));
  res.sni = r2(Math.max(0, sbiImpos - res.cnssSal - res.amoSal - res.cimrSal - res.mutSal - res.fraisPro));

  // IR régularisé sur le cumul annuel
  res.personnes = personnesACharge(emp, P);
  const n = (cum.n || 0) + 1;
  const cumSni = r2((cum.sni || 0) + res.sni);
  const famAnnuel = Math.min(P.famParPersonne * res.personnes, P.famParPersonne * P.famMaxPersonnes);
  const irCumTheo = Math.max(0, irAnnuel(cumSni * 12 / n, P) * n / 12 - famAnnuel * n / 12);
  res.irMoisSansRegul = r2(Math.max(0, irAnnuel(res.sni * 12, P) / 12 - famAnnuel / 12));
  res.ir = P.irRegul === false ? res.irMoisSansRegul : r2(irCumTheo - (cum.ir || 0));
  res.regulIr = r2(res.ir - res.irMoisSansRegul);

  // Retenues diverses
  res.avance = r2(num(v.avance));
  res.pret = r2(num(v.pret));

  res.totalRetSal = r2(res.cnssSal + res.amoSal + res.cimrSal + res.mutSal + res.ir);
  res.net = r2(res.brut - res.totalRetSal - res.avance - res.pret);

  // Charges patronales
  res.prestPat = r2(res.baseCnss * P.tauxPrestPat / 100);
  res.baseAf = r2(assietteCnss);
  res.afPat = r2(res.baseAf * P.tauxAF / 100);
  res.amoPat = r2(res.baseAmo * P.tauxAmoPat / 100);
  res.tfpPat = r2(assietteCnss * P.tauxTFP / 100);
  res.cimrPat = r2(res.sbi * num(emp.cimrPat) / 100);
  res.mutPat = r2(num(emp.mutuellePat));
  res.etatPrisEnCharge = 0;
  if (res.chargesEtat) {
    const b = Math.min(res.sbi, P.chargesEtatPlafond);
    res.etatPrisEnCharge = r2(Math.min(b, P.plafondCNSS) * P.tauxPrestPat / 100 + b * (P.tauxAF + P.tauxAmoPat + P.tauxTFP) / 100);
  }
  res.totalPat = r2(res.prestPat + res.afPat + res.amoPat + res.tfpPat + res.cimrPat + res.mutPat - res.etatPrisEnCharge);
  res.cnssTotal = r2(res.cnssSal + res.amoSal + res.prestPat + res.afPat + res.amoPat + res.tfpPat - res.etatPrisEnCharge);
  res.situationCnss = v.situationCnss || '';
  res.cout = r2(res.brut + res.totalPat);

  // Jours / congés
  res.joursDecl = Math.max(0, Math.min(J, J - absJ));
  res.congesPris = num(v.congesPris);
  res.congesAcquisMois = P.congesParMois;

  // Cumuls
  res.cum = {
    n, sbi: r2((cum.sbi || 0) + res.sbi), sni: cumSni, ir: r2((cum.ir || 0) + res.ir),
    cnss: r2((cum.cnss || 0) + res.cnssSal), amo: r2((cum.amo || 0) + res.amoSal),
    cimr: r2((cum.cimr || 0) + res.cimrSal), fp: r2((cum.fp || 0) + res.fraisPro),
    brut: r2((cum.brut || 0) + res.brut), net: r2((cum.net || 0) + res.net),
    base: r2((cum.base || 0) + baseEff), exo: r2((cum.exo || 0) + res.exo), mut: r2((cum.mut || 0) + res.mutSal),
    anapecExo: r2((cum.anapecExo || 0) + anapecExo + irExoPost),
    jours: (cum.jours || 0) + res.joursDecl,
    congesAcquis: r2((cum.congesAcquis ?? num(emp.congesReport)) + res.congesAcquisMois),
    congesPris: r2((cum.congesPris || 0) + res.congesPris)
  };
  res.cum.congesSolde = r2(res.cum.congesAcquis - res.cum.congesPris);
  return res;
}

/* Brut à partir d'un net cible (simulateur) */
function brutDepuisNet(netCible, emp, P, period) {
  let lo = 0, hi = netCible * 2 + 5000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const r = calculerBulletin({ ...emp, salaireBase: mid, typeSalaire: 'mensuel', dateEmbauche: emp.dateEmbauche }, {}, {}, P, period);
    if (r.net < netCible) lo = mid; else hi = mid;
  }
  return r2(hi);
}

/* Indemnité légale de licenciement (art. 53 Code du travail) en heures */
function indemniteLicenciement(ans, tauxHoraire) {
  if (ans <= 0) return { heures: 0, montant: 0 };
  let h = 0; let rest = ans;
  const tr = [[5, 96], [5, 144], [5, 192], [Infinity, 240]];
  for (const [duree, hpa] of tr) { const t = Math.min(rest, duree); h += t * hpa; rest -= t; if (rest <= 0) break; }
  return { heures: r2(h), montant: r2(h * tauxHoraire) };
}

if (typeof module !== 'undefined') module.exports = { DEFAULT_PARAMS, calculerBulletin, brutDepuisNet, indemniteLicenciement, irAnnuel, r2, num };
