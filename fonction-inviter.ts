// Invite un collaborateur : enregistre l'invitation (contrôle des droits en base) puis envoie l'e-mail d'invitation Supabase.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json } from "../_shared/cmi.ts";
import { avecJournal } from "../_shared/erreurs.ts";

Deno.serve(avecJournal("inviter", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { org_id, email, role } = await req.json();
    const userDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    if (typeof email !== "string" || email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erreur: "Adresse e-mail invalide." }, 400);
    if (role && !["admin", "collaborateur"].includes(role)) return json({ erreur: "Rôle inconnu." }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: quotaOk } = await service.rpc("quota_invitations", { p_org: org_id });
    if (quotaOk !== true) return json({ erreur: "Trop d'invitations aujourd'hui (20 par 24 heures)." }, 429);
    const { error } = await userDb.rpc("inviter", { p_org: org_id, p_email: email, p_role: role ?? "collaborateur" });
    if (error) return json({ erreur: error.message }, 403);

    const { error: e2 } = await service.auth.admin.inviteUserByEmail(email, { redirectTo: Deno.env.get("SITE_URL") });
    // Utilisateur déjà inscrit : il a été ajouté directement au compte, aucun e-mail n'est nécessaire.
    return json({ ok: true, email_envoye: !e2 });
  } catch (e) {
    throw e; // journalisé par avecJournal, sans détail technique renvoyé au navigateur
  }
}));
