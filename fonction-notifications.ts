// Tâche quotidienne : met à jour les statuts, émet les factures le 1er du mois et envoie les e-mails
// (fin d'essai à J-2, nouvelle facture, facture échue). E-mails envoyés via Resend (https://resend.com).
// Planification : Supabase > Edge Functions > notifications > Schedule, tous les jours à 05:00.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { envoyerMail } from "../_shared/mail.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = Deno.env.get("SITE_URL") ?? "";
const SECRET = Deno.env.get("CRON_SECRET");
const ALERTE = Deno.env.get("ALERTE_EMAIL"); // destinataire des alertes d'erreurs (vous)

// Alerte : erreurs nouvelles ou revenues depuis la dernière alerte (appel horaire avec {"tache":"erreurs"})
async function alerteErreurs() {
  const { data } = await db.from("erreurs").select("id, source, message, nb, url, dernier_le").eq("statut", "nouvelle").is("alerte_le", null).order("dernier_le", { ascending: false }).limit(50);
  if (!data?.length || !ALERTE) return 0;
  const lignes = data.map((e) => `• [${e.source}] ${e.message} — ${e.nb} fois, dernière à ${new Date(e.dernier_le).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" })}${e.url ? "\n  " + e.url : ""}`).join("\n");
  if (await envoyer(ALERTE, `RM Paie : ${data.length} nouvelle(s) erreur(s)`, `Erreurs détectées sur RM Paie :\n\n${lignes}\n\nDétail : ${SITE} > Administration > Erreurs`)) {
    await db.from("erreurs").update({ alerte_le: new Date().toISOString() }).in("id", data.map((e) => e.id));
  }
  return data.length;
}

// Résiliations : rappel 15 jours avant la suppression, puis suppression des fichiers et des données à J+90
async function resiliations(iso: (d: Date) => string) {
  const b = { rappels: 0, suppressions: 0 };
  const j15 = new Date(Date.now() + 15 * 864e5);
  const { data: proches } = await db.from("organisations").select("id, raison_sociale, email_facturation, suppression_prevue").eq("statut", "resilie").lte("suppression_prevue", iso(j15)).is("rappel_suppression_le", null);
  for (const o of proches ?? []) {
    if (await envoyer(o.email_facturation, "RM Paie : vos données seront supprimées dans 15 jours",
      `Bonjour,\n\nSuite à la résiliation de votre abonnement, les données de ${o.raison_sociale} (salariés, bulletins, déclarations, pièces jointes) seront définitivement supprimées le ${o.suppression_prevue}.\n\nPour les conserver, connectez-vous et utilisez « Mon compte > Exporter toutes mes données ». Vous pouvez aussi annuler la résiliation depuis cette même page.\n\n${SITE}\n\nL'équipe RM Paie`)) {
      await db.from("organisations").update({ rappel_suppression_le: new Date().toISOString() }).eq("id", o.id); b.rappels++;
    }
  }
  const { data: aSupprimer } = await db.rpc("comptes_a_supprimer");
  for (const o of aSupprimer ?? []) {
    try {
      for (const dossier of ["", "salaries"]) {
        const prefixe = dossier ? `${o.id}/${dossier}` : o.id;
        const { data: liste } = await db.storage.from("justificatifs").list(prefixe, { limit: 1000 });
        const chemins = (liste ?? []).filter((f) => f.id).map((f) => `${prefixe}/${f.name}`);
        if (chemins.length) await db.storage.from("justificatifs").remove(chemins);
      }
      const { data: sous } = await db.storage.from("justificatifs").list(`${o.id}/salaries`, { limit: 1000 });
      for (const d of (sous ?? []).filter((f) => !f.id)) {
        const { data: l2 } = await db.storage.from("justificatifs").list(`${o.id}/salaries/${d.name}`, { limit: 1000 });
        const c2 = (l2 ?? []).map((f) => `${o.id}/salaries/${d.name}/${f.name}`);
        if (c2.length) await db.storage.from("justificatifs").remove(c2);
      }
      const { error } = await db.rpc("supprimer_compte", { p_org: o.id });
      if (error) throw error;
      b.suppressions++;
    } catch (e) {
      await db.rpc("journal_erreur", { p: { source: "serveur", message: `Suppression du compte ${o.raison_sociale} : ${(e as Error).message}`, url: "notifications" } });
    }
  }
  return b;
}

const envoyer = (a: string, sujet: string, texte: string) => envoyerMail({ a, sujet, texte });
const dh = (n: number) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DH";

Deno.serve(async (req) => {
  // Refus par défaut : sans secret configuré, la tâche ne peut pas être déclenchée de l'extérieur
  if (!SECRET || req.headers.get("x-cron-secret") !== SECRET) return new Response("refusé", { status: 401 });
  const corps = await req.json().catch(() => ({}));
  if (corps?.tache === "erreurs") return new Response(JSON.stringify({ alertes: await alerteErreurs() }), { headers: { "Content-Type": "application/json" } });
  try {
  const aujourdhui = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const bilan: Record<string, number> = { essais: 0, factures_emises: 0, nouvelles: 0, relances: 0, suspendus: 0 };

  if (aujourdhui.getUTCDate() === 1) {
    const { data } = await db.rpc("generer_factures");
    bilan.factures_emises = Number(data ?? 0);
  }
  const { data: s } = await db.rpc("maj_statuts");
  bilan.suspendus = Number(s ?? 0);

  // Fin d'essai dans 2 jours
  const j7 = new Date(aujourdhui.getTime() + 2 * 864e5);
  const { data: essais } = await db.from("organisations").select("raison_sociale, email_facturation, essai_fin").eq("statut", "essai").eq("essai_fin", iso(j7));
  for (const o of essais ?? []) {
    if (await envoyer(o.email_facturation, "Votre essai RM Paie se termine dans 2 jours",
      `Bonjour,\n\nL'essai gratuit de RM Paie pour ${o.raison_sociale} se termine le ${o.essai_fin}. Vos données sont conservées : l'abonnement démarre automatiquement et la première facture sera disponible dans « Mon compte ».\n\n${SITE}\n\nL'équipe RM Paie`)) bilan.essais++;
  }

  // Factures émises aujourd'hui
  const { data: nouvelles } = await db.from("factures").select("numero, total_ttc, echeance, client").eq("type", "facture").eq("date_emission", iso(aujourdhui));
  for (const f of nouvelles ?? []) {
    if (await envoyer(f.client?.email, `Votre facture RM Paie ${f.numero}`,
      `Bonjour,\n\nVotre facture ${f.numero} d'un montant de ${dh(f.total_ttc)} TTC est disponible dans « Mon compte », à régler avant le ${f.echeance}. Vous pouvez la payer par carte bancaire en ligne.\n\n${SITE}\n\nL'équipe RM Paie`)) bilan.nouvelles++;
  }

  // Relance : échéance dépassée hier
  const hier = new Date(aujourdhui.getTime() - 864e5);
  const { data: echues } = await db.from("factures").select("numero, total_ttc, echeance, client").eq("type", "facture").eq("statut", "emise").eq("echeance", iso(hier));
  for (const f of echues ?? []) {
    if (await envoyer(f.client?.email, `Rappel : facture RM Paie ${f.numero} échue`,
      `Bonjour,\n\nSauf erreur de notre part, la facture ${f.numero} de ${dh(f.total_ttc)} TTC arrivée à échéance le ${f.echeance} reste impayée. Sans règlement, l'accès à la paie passera en lecture seule. Réglez-la par carte dans « Mon compte ».\n\n${SITE}\n\nL'équipe RM Paie`)) bilan.relances++;
  }

  Object.assign(bilan, await resiliations(iso));
  await db.rpc("nettoyer_erreurs");
  await db.rpc("nettoyer_audience");
  await db.rpc("nettoyer_journal");
  bilan.alertes = await alerteErreurs();
  await db.from("journal").insert({ action: "notifications", details: bilan });
  return new Response(JSON.stringify(bilan), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    await db.rpc("journal_erreur", { p: { source: "serveur", message: "Tâche quotidienne : " + (e as Error).message, pile: (e as Error).stack, url: "notifications" } });
    return new Response("erreur", { status: 500 });
  }
});
