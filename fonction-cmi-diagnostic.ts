// État de la configuration du paiement par carte, pour le super-administrateur (aucune valeur secrète n'est renvoyée).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, hashCMI, json } from "../_shared/cmi.ts";
import { avecJournal } from "../_shared/erreurs.ts";

Deno.serve(avecJournal("cmi-diagnostic", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const appelant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: sa } = await appelant.rpc("est_super_admin");
  if (sa !== true) return json({ erreur: "Réservé au super-administrateur." }, 403);

  const env = (k: string) => (Deno.env.get(k) ?? "").trim();
  const gateway = env("CMI_GATEWAY_URL") || "https://testpayment.cmi.co.ma/fim/est3Dgate";
  const site = env("SITE_URL");
  const api = env("SUPABASE_PUBLIC_URL") || env("SUPABASE_URL");
  const controles: { point: string; ok: boolean; detail: string }[] = [];
  controles.push({ point: "Identifiant marchand (CMI_CLIENT_ID)", ok: /^\d{6,15}$/.test(env("CMI_CLIENT_ID")), detail: env("CMI_CLIENT_ID") ? `renseigné (${env("CMI_CLIENT_ID").length} chiffres)` : "manquant" });
  controles.push({ point: "Clé du magasin (CMI_STORE_KEY)", ok: env("CMI_STORE_KEY").length >= 8, detail: env("CMI_STORE_KEY") ? "renseignée (valeur masquée)" : "manquante" });
  controles.push({ point: "Adresse du site (SITE_URL)", ok: /^https:\/\/[^/]+$/.test(site), detail: site || "manquante (format attendu : https://votre-domaine.ma)" });
  controles.push({ point: "Passerelle de paiement (CMI_GATEWAY_URL)", ok: /^https:\/\//.test(gateway), detail: gateway });
  let joignable = false;
  try { const r = await fetch(gateway, { method: "GET", signal: AbortSignal.timeout(8000) }); joignable = r.status < 500; } catch { joignable = false; }
  controles.push({ point: "Passerelle joignable depuis le serveur", ok: joignable, detail: joignable ? "oui" : "pas de réponse" });
  let signature = false;
  try { signature = (await hashCMI({ clientid: "1", amount: "1.00", oid: "x" }, "k")).length === 88; } catch { /* */ }
  controles.push({ point: "Calcul de signature SHA-512 (ver3)", ok: signature, detail: signature ? "opérationnel" : "erreur" });

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rappels } = await service.from("journal").select("action, details, cree_le").like("action", "cmi_%").order("cree_le", { ascending: false }).limit(10);
  return json({
    mode: /testpayment/i.test(gateway) ? "test" : "production",
    a_declarer: {
      "URL de rappel (callback)": `${api}/functions/v1/cmi-callback`,
      "URL de retour succès (okUrl)": `${api}/functions/v1/cmi-retour?etat=ok`,
      "URL de retour échec (failUrl)": `${api}/functions/v1/cmi-retour?etat=echec`,
      "Adresse du site marchand (shopurl)": site,
      "Type de magasin": "3D_PAY_HOSTING",
      "Algorithme de signature": "ver3 (SHA-512)",
      "Type de transaction": "PreAuth, capturée par la réponse ACTION=POSTAUTH du rappel",
      "Devise": "504 (dirham)",
    },
    controles, rappels: rappels ?? [],
  });
}));
