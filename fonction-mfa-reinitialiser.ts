// Réinitialise la double authentification d'un utilisateur qui a perdu son téléphone.
// Réservé au super-administrateur (lui-même authentifié avec son second facteur).
// Appel : POST { "email": "client@exemple.ma" }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json } from "../_shared/cmi.ts";
import { avecJournal } from "../_shared/erreurs.ts";

Deno.serve(avecJournal("mfa-reinitialiser", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const appelant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: sa } = await appelant.rpc("est_super_admin");
  if (sa !== true) return json({ erreur: "Réservé au super-administrateur (avec double authentification)." }, 403);
  const { email } = await req.json();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let user = null;
  for (let page = 1; page <= 20 && !user; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    user = data.users.find((u) => (u.email ?? "").toLowerCase() === String(email ?? "").trim().toLowerCase()) ?? null;
    if (data.users.length < 1000) break;
  }
  if (!user) return json({ erreur: "Aucun utilisateur avec cette adresse e-mail." }, 404);
  const { data: f } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  for (const facteur of f?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: facteur.id });
  await admin.from("journal").insert({ action: "mfa_reinitialise", details: { email: user.email, facteurs: (f?.factors ?? []).length } });
  return json({ ok: true, supprimes: (f?.factors ?? []).length });
}));
