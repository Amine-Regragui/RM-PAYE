// Envoie à chaque salarié son propre bulletin de paie (PDF en pièce jointe), par e-mail (Resend) ou par WhatsApp (API officielle WhatsApp Business de Meta).
// Appelée par un utilisateur connecté ; l'appartenance à la société est vérifiée avec ses propres droits (RLS).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, json } from "../_shared/cmi.ts";
import { avecJournal } from "../_shared/erreurs.ts";
import { envoyerMail, mailConfigure } from "../_shared/mail.ts";

const URL_SUPA = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";            // jeton permanent (utilisateur système Meta Business)
const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "";      // identifiant du numéro WhatsApp Business
const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE") ?? "bulletin_paie";
const WA_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "fr";
const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_ENVOIS = 50, MAX_PDF = 2 * 1024 * 1024;
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const b64Octets = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

async function parEmail(e: any, ctx: any) {
  if (!emailOk(e.email)) return false;
  return await envoyerMail({
    a: e.email, repondreA: ctx.replyTo, sujet: `Votre bulletin de paie — ${ctx.libelle} — ${ctx.societe}`,
    html: `<p>Bonjour ${esc(e.nom)},</p><p>Vous trouverez ci-joint votre bulletin de paie de <b>${esc(ctx.libelle)}</b>, établi par <b>${esc(ctx.societe)}</b>.</p><p>Conservez-le sans limitation de durée.</p><p style="color:#6b7789;font-size:12px">Message envoyé par ${esc(ctx.societe)} avec RM Paie. Pour toute question, répondez à cet e-mail.</p>`,
    pj: [{ filename: e.fichier, content: e.pdf }],
  });
}

async function parWhatsApp(e: any, ctx: any) {
  if (!/^\d{11,15}$/.test(e.telephone ?? "")) return false;
  // 1. dépôt du PDF chez WhatsApp
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", "application/pdf");
  fd.append("file", new Blob([b64Octets(e.pdf)], { type: "application/pdf" }), e.fichier);
  const up = await fetch(`${GRAPH}/${WA_PHONE_ID}/media`, { method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}` }, body: fd });
  const media = await up.json().catch(() => ({}));
  if (!up.ok || !media.id) return false;
  // 2. message modèle approuvé par Meta, avec le bulletin en document
  const r = await fetch(`${GRAPH}/${WA_PHONE_ID}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: e.telephone, type: "template",
      template: {
        name: WA_TEMPLATE, language: { code: WA_LANG },
        components: [
          { type: "header", parameters: [{ type: "document", document: { id: media.id, filename: e.fichier } }] },
          { type: "body", parameters: [{ type: "text", text: e.nom }, { type: "text", text: ctx.libelle }, { type: "text", text: ctx.societe }] },
        ],
      },
    }),
  });
  return r.ok;
}

Deno.serve(avecJournal("envoyer-bulletins", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { canal = "email", org_id, societe, periode, libelle, envois } = await req.json();
    const wa = canal === "whatsapp";
    if (wa && (!WA_TOKEN || !WA_PHONE_ID)) return json({ erreur: "L'envoi par WhatsApp n'est pas encore configuré." }, 500);
    if (!wa && !mailConfigure()) return json({ erreur: "L'envoi d'e-mails n'est pas configuré." }, 500);
    if (!Array.isArray(envois) || !envois.length || envois.length > MAX_ENVOIS) return json({ erreur: "Liste d'envoi invalide." }, 400);
    const userDb = createClient(URL_SUPA, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: org } = await userDb.from("organisations").select("id, raison_sociale, statut, email_facturation").eq("id", org_id).single();
    if (!org) return json({ erreur: "Accès refusé." }, 403);
    if (!["essai", "actif"].includes(org.statut)) return json({ erreur: "Compte fermé : envoi impossible." }, 403);
    const service = createClient(URL_SUPA, SERVICE);
    // Anti-abus : plafond quotidien par société, pour que le service ne puisse pas servir à envoyer du courrier indésirable
    const { data: quotaOk } = await service.rpc("quota_envois", { p_org: org.id, p_nb: envois.length });
    if (quotaOk !== true) return json({ erreur: "Plafond d'envois atteint pour aujourd'hui (1 000 bulletins par 24 heures). Réessayez demain ou contactez-nous." }, 429);
    const ctx = { societe: String(societe || org.raison_sociale).slice(0, 60), libelle: String(libelle || periode), replyTo: org.email_facturation };
    let envoyes = 0; const echecs: string[] = [];
    for (const e of envois) {
      e.fichier = String(e.fichier || `Bulletin_${periode}.pdf`).replace(/[^\w.\-]/g, "_");
      // La pièce jointe doit être un vrai PDF (signature « %PDF- »), de taille limitée
      if (typeof e.pdf !== "string" || !e.pdf.startsWith("JVBERi0") || e.pdf.length > MAX_PDF * 1.4) { echecs.push(e.nom); continue; }
      const ok = wa ? await parWhatsApp(e, ctx) : await parEmail(e, ctx);
      if (ok) envoyes++; else echecs.push(e.nom || e.email || e.telephone);
    }
    await service.from("journal").insert({ org_id: org.id, action: "envoi_bulletins", details: { canal, periode, envoyes, echecs: echecs.length } });
    return json({ envoyes, echecs });
  } catch (_e) {
    return json({ erreur: "Envoi impossible." }, 500);
  }
}));
