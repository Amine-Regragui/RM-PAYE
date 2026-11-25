// Envoi d'e-mails : par SMTP (hébergeur au Maroc ou tout autre fournisseur) si SMTP_HOST est défini,
// sinon par l'API Resend si RESEND_API_KEY est défini. Utilisé par les bulletins, les rappels et les alertes.
import nodemailer from "npm:nodemailer@6.10.1";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const EXPEDITEUR = env("EMAIL_EXPEDITEUR") || env("SMTP_ADMIN_EMAIL") || "RM Paie <no-reply@rmpaie.ma>";

export type PieceJointe = { filename: string; content: string }; // contenu en base64
export type Mail = { a: string; sujet: string; texte?: string; html?: string; repondreA?: string; pj?: PieceJointe[] };

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function smtp() {
  if (!transport) {
    // SMTP_SECURITE : ssl (port 465, par défaut), starttls (port 587) ou aucune (relais local uniquement)
    const port = Number(env("SMTP_PORT") || "465");
    const mode = env("SMTP_SECURITE") || (port === 465 ? "ssl" : "starttls");
    transport = nodemailer.createTransport({
      host: env("SMTP_HOST"), port, secure: mode === "ssl", requireTLS: mode === "starttls", ignoreTLS: mode === "aucune",
      auth: env("SMTP_USER") ? { user: env("SMTP_USER"), pass: env("SMTP_PASS") } : undefined,
    });
  }
  return transport;
}

export const mailConfigure = () => !!(env("SMTP_HOST") || env("RESEND_API_KEY"));

export async function envoyerMail(m: Mail): Promise<boolean> {
  if (!m.a) return false;
  if (env("SMTP_HOST")) {
    try {
      await smtp().sendMail({
        from: EXPEDITEUR, to: m.a, subject: m.sujet, text: m.texte, html: m.html, replyTo: m.repondreA || undefined,
        attachments: (m.pj ?? []).map((p) => ({ filename: p.filename, content: p.content, encoding: "base64" })),
      });
      return true;
    } catch (e) { console.error("SMTP :", (e as Error).message); return false; }
  }
  if (env("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EXPEDITEUR, to: [m.a], subject: m.sujet, text: m.texte, html: m.html, reply_to: m.repondreA || undefined, attachments: m.pj }),
    });
    return r.ok;
  }
  return false;
}
