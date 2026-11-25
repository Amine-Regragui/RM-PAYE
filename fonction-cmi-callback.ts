// Rappel serveur à serveur du CMI après un paiement. Seule source qui marque une facture payée.
// À déployer sans vérification de jeton : supabase functions deploy cmi-callback --no-verify-jwt
import { createClient } from "jsr:@supabase/supabase-js@2";
import { egaliteConstante, hashCMI } from "../_shared/cmi.ts";
import { avecJournal } from "../_shared/erreurs.ts";

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const STORE_KEY = Deno.env.get("CMI_STORE_KEY")!;
const CLIENT_ID = Deno.env.get("CMI_CLIENT_ID")!;
const texte = (s: string) => new Response(s, { headers: { "Content-Type": "text/plain" } });

Deno.serve(avecJournal("cmi-callback", async (req) => {
  if (req.method !== "POST") return texte("FAILURE");
  const form = await req.formData();
  const p: Record<string, string> = {};
  for (const [k, v] of form.entries()) p[k] = String(v);

  const recu = p.HASH ?? p.hash ?? "";
  const attendu = await hashCMI(p, STORE_KEY);
  if (!recu || !egaliteConstante(recu, attendu)) {
    await service.from("journal").insert({ action: "cmi_signature_invalide", details: { oid: p.oid ?? null } });
    return texte("FAILURE");
  }

  // Le rappel doit concerner notre magasin et la devise dirham
  if ((p.clientid ?? "") !== CLIENT_ID || (p.currency && p.currency !== "504")) {
    await service.from("journal").insert({ action: "cmi_marchand_incoherent", details: { oid: p.oid ?? null, clientid: p.clientid ?? null } });
    return texte("FAILURE");
  }
  await service.from("journal").insert({ action: "cmi_rappel", details: { oid: p.oid ?? null, code: p.ProcReturnCode ?? null, reponse: p.Response ?? null, carte: p.maskedCreditCard ?? null } });

  const approuveCmd = p.ProcReturnCode === "00" && (p.Response ?? "").toLowerCase() === "approved";
  if ((p.oid ?? "").startsWith("CMD-")) {
    // Paiement d'une validation de bulletins
    const { data: c } = await service.from("commandes").select("id, total_ttc, statut").eq("reference", p.oid).single();
    if (!c) return texte("FAILURE");
    if (!approuveCmd) { await service.from("journal").insert({ action: "cmi_refus", details: { oid: p.oid, code: p.ProcReturnCode ?? null } }); return texte("APPROVED"); }
    if (Number(p.amount).toFixed(2) !== Number(c.total_ttc).toFixed(2)) {
      await service.from("journal").insert({ action: "cmi_montant_incoherent", details: { oid: p.oid, recu: p.amount, attendu: c.total_ttc } });
      return texte("FAILURE");
    }
    const { error } = await service.rpc("payer_commande", {
      p_commande: c.id, p_montant: Number(c.total_ttc), p_reference: p.oid, p_transaction: p.TransId ?? p.AuthCode ?? null,
      p_details: { auth_code: p.AuthCode ?? null, trans_id: p.TransId ?? null, carte: p.maskedCreditCard ?? null, date: p.EXTRA_TRXDATE ?? null },
    });
    if (error) { await service.from("journal").insert({ action: "cmi_enregistrement_echoue", details: { oid: p.oid, erreur: error.message } }); return texte("FAILURE"); }
    return texte("ACTION=POSTAUTH");
  }

  const { data: pay } = await service.from("paiements").select("id, facture_id, montant, statut").eq("reference", p.oid).single();
  if (!pay) return texte("FAILURE");

  const approuve = p.ProcReturnCode === "00" && (p.Response ?? "").toLowerCase() === "approved";
  if (!approuve) {
    await service.from("paiements").update({ statut: "echoue", details: { code: p.ProcReturnCode, message: p.ErrMsg ?? p.mdErrorMsg ?? null } }).eq("id", pay.id);
    return texte("APPROVED"); // accusé de réception d'un refus
  }
  if (Number(p.amount).toFixed(2) !== Number(pay.montant).toFixed(2)) {
    await service.from("journal").insert({ action: "cmi_montant_incoherent", details: { oid: p.oid, recu: p.amount, attendu: pay.montant } });
    return texte("FAILURE");
  }

  const { error } = await service.rpc("enregistrer_paiement", {
    p_facture: pay.facture_id, p_montant: Number(pay.montant), p_moyen: "carte", p_reference: p.oid,
    p_transaction: p.TransId ?? p.AuthCode ?? null,
    p_details: { auth_code: p.AuthCode ?? null, trans_id: p.TransId ?? null, carte: p.maskedCreditCard ?? null, date: p.EXTRA_TRXDATE ?? null },
  });
  if (error) {
    await service.from("journal").insert({ action: "cmi_enregistrement_echoue", details: { oid: p.oid, erreur: error.message } });
    return texte("FAILURE");
  }
  return texte("ACTION=POSTAUTH");
}));
