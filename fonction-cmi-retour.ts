// Retour du client après la page de paiement : la passerelle renvoie le navigateur en POST (formulaire),
// ce qu'un site statique refuse souvent (erreur 405). Cette fonction accepte GET ou POST et redirige vers le site.
// Elle ne valide rien : seul le rappel serveur (cmi-callback) marque une commande ou une facture payée.
// Déploiement : supabase functions deploy cmi-retour --no-verify-jwt
const SITE = Deno.env.get("SITE_URL")!;

Deno.serve((req) => {
  const u = new URL(req.url);
  const etat = u.searchParams.get("etat") === "ok" ? "ok" : "echec";
  const cible = new URL(SITE + "/");
  cible.searchParams.set("paiement", etat);
  for (const k of ["commande", "facture"]) {
    const v = u.searchParams.get(k);
    if (v && /^[0-9a-f-]{36}$/i.test(v)) cible.searchParams.set(k, v);
  }
  return new Response(null, { status: 303, headers: { Location: cible.toString(), "Cache-Control": "no-store" } });
});
