// Signature des échanges avec le CMI (hashAlgorithm = ver3).
// Règle CMI : on trie les noms de paramètres (ordre naturel, sans tenir compte de la casse),
// on exclut "hash" et "encoding", on échappe "\" et "|" dans chaque valeur, on joint par "|",
// on ajoute la clé du magasin (échappée), puis SHA-512 encodé en base64.

const naturel = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase(), "en", { numeric: true });
const echapper = (v: string) => v.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

export async function hashCMI(params: Record<string, string>, storeKey: string): Promise<string> {
  const cles = Object.keys(params).filter((k) => !["hash", "encoding"].includes(k.toLowerCase())).sort(naturel);
  const texte = cles.map((k) => echapper(String(params[k] ?? "").trim())).join("|") + "|" + echapper(storeKey);
  const empreinte = new Uint8Array(await crypto.subtle.digest("SHA-512", new TextEncoder().encode(texte)));
  let bin = "";
  for (const o of empreinte) bin += String.fromCharCode(o);
  return btoa(bin);
}

export function egaliteConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const cors = {
  // Seul le site RM Paie peut appeler les fonctions depuis un navigateur (jamais « * »)
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") || "https://rmpaie.ma",
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
