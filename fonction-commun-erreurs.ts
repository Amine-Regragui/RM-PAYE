// Journal des erreurs côté serveur : toute exception non gérée d'une fonction est enregistrée
// dans la table « erreurs » (visible dans Administration > Erreurs) puis renvoyée en 500.
import { createClient } from "jsr:@supabase/supabase-js@2";

const service = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export async function signaler(fonction: string, e: unknown, contexte?: string) {
  try {
    const err = e instanceof Error ? e : new Error(String(e));
    await service().rpc("journal_erreur", { p: { source: "serveur", message: `${fonction} : ${err.message}`, pile: err.stack, url: contexte ?? fonction } });
  } catch { /* le journal ne doit jamais faire échouer la réponse */ }
}

export function avecJournal(fonction: string, handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try { return await handler(req); }
    catch (e) {
      await signaler(fonction, e, new URL(req.url).pathname);
      return new Response(JSON.stringify({ erreur: "Erreur interne, l’équipe RM Paie a été prévenue." }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") || "https://rmpaie.ma" } });
    }
  };
}
