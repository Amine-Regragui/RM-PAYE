// Prépare le formulaire de paiement CMI : soit une facture (Mon compte), soit une commande de validation de bulletins.
// Appelée par l'utilisateur connecté (jeton Supabase dans Authorization) ; les droits sont vérifiés par la RLS.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, hashCMI, json } from "../_shared/cmi.ts";
import { avecJournal } from "../_shared/erreurs.ts";

const URL_SUPA = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("CMI_CLIENT_ID")!;          // identifiant marchand fourni par le CMI
const STORE_KEY = Deno.env.get("CMI_STORE_KEY")!;          // clé du magasin (secrète)
const GATEWAY = Deno.env.get("CMI_GATEWAY_URL") ?? "https://testpayment.cmi.co.ma/fim/est3Dgate";
const SITE = Deno.env.get("SITE_URL")!;                     // ex. https://rmpaie.ma
// Adresse publique de l'API (en auto-hébergement, SUPABASE_URL est l'adresse interne du conteneur)
const URL_PUBLIQUE = Deno.env.get("SUPABASE_PUBLIC_URL") || URL_SUPA;

Deno.serve(avecJournal("cmi-paiement", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { facture_id, commande_id } = await req.json();
    const auth = req.headers.get("Authorization") ?? "";
    const userDb = createClient(URL_SUPA, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userDb.auth.getUser();
    const service = createClient(URL_SUPA, SERVICE);
    let montant: number, oid: string, retour: string, client: Record<string, string> = {};

    if (commande_id) {
      // Paiement demandé au moment de valider les bulletins du mois
      const { data: c, error } = await userDb.from("commandes").select("id, org_id, total_ttc, statut, periode").eq("id", commande_id).single();
      if (error || !c) return json({ erreur: "Commande introuvable ou accès refusé." }, 403);
      if (c.statut !== "en_attente") return json({ erreur: "Cette commande n'est plus à régler." }, 400);
      const { data: o } = await userDb.from("organisations").select("raison_sociale, email_facturation").eq("id", c.org_id).single();
      client = { raison_sociale: o?.raison_sociale ?? "", email: o?.email_facturation ?? "" };
      montant = Number(c.total_ttc); oid = `CMD-${c.id.slice(0, 8)}-${crypto.randomUUID().slice(0, 6)}`;
      await service.from("commandes").update({ reference: oid }).eq("id", c.id);
      retour = `commande=${c.id}`;
    } else {
      const { data: f, error } = await userDb.from("factures").select("id, numero, org_id, total_ttc, statut, client").eq("id", facture_id).single();
      if (error || !f) return json({ erreur: "Facture introuvable ou accès refusé." }, 403);
      if (f.statut !== "emise") return json({ erreur: "Cette facture n'est pas à régler." }, 400);
      client = f.client ?? {};
      montant = Number(f.total_ttc); oid = `${f.numero}-${crypto.randomUUID().slice(0, 6)}`;
      await service.from("paiements").insert({
        facture_id: f.id, org_id: f.org_id, montant: f.total_ttc, moyen: "carte", statut: "en_attente", reference: oid,
        details: { initie_par: u?.user?.email ?? null },
      });
      retour = `facture=${f.id}`;
    }

    const fields: Record<string, string> = {
      clientid: CLIENT_ID,
      amount: montant.toFixed(2),
      currency: "504",
      oid,
      okUrl: `${URL_PUBLIQUE}/functions/v1/cmi-retour?etat=ok&${retour}`,
      failUrl: `${URL_PUBLIQUE}/functions/v1/cmi-retour?etat=echec&${retour}`,
      callbackUrl: `${URL_PUBLIQUE}/functions/v1/cmi-callback`,
      shopurl: SITE,
      TranType: "PreAuth",
      storetype: "3D_PAY_HOSTING",
      hashAlgorithm: "ver3",
      lang: "fr",
      rnd: crypto.randomUUID().replace(/-/g, "").slice(0, 20),
      refreshtime: "5",
      AutoRedirect: "true",
      BillToName: String(client.raison_sociale ?? "").slice(0, 60),
      BillToCompany: String(client.raison_sociale ?? "").slice(0, 60),
      email: String(u?.user?.email ?? client.email ?? ""),
      encoding: "UTF-8",
    };
    fields.hash = await hashCMI(fields, STORE_KEY);
    return json({ url: GATEWAY, fields, test: /testpayment/i.test(GATEWAY) });
  } catch (e) {
    throw e; // journalisé par avecJournal, sans détail technique renvoyé au navigateur
  }
}));
