// Démo autonome : base PostgreSQL complète (PGlite) dans le navigateur, mêmes règles que la production.
import { PGlite } from './pglite-index.js';
const STORE = 'rmpaie-demo-v11';
const supprimerBase = nom => new Promise(ok => { try { const r = indexedDB.deleteDatabase('/pglite/' + nom); r.onsuccess = r.onerror = r.onblocked = () => ok(); setTimeout(ok, 3000); } catch (e) { ok(); } });
async function construire(db) {
    await db.exec(`create schema if not exists auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, pwd text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', coalesce(nullif(current_setting('test.aal', true), ''), 'aal1')) $$;
      create function auth.role() returns text language sql stable as $$ select case when current_setting('role', true) in ('anon', 'authenticated') then current_setting('role', true) else 'service_role' end $$;
      create table auth.mfa_factors (id uuid primary key, user_id uuid, friendly_name text, factor_type text default 'totp', status text default 'unverified', secret text, created_at timestamptz default now());
      do $$ begin create role anon; exception when others then null; end $$; do $$ begin create role authenticated; exception when others then null; end $$;
      grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;`);
    const schema = await (await fetch('schema.txt')).text();
    await db.exec(schema.replace('create extension if not exists pgcrypto;', ''));
    await db.exec('create table public.demo_fichiers (chemin text primary key, nom text, data text)');
    await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to authenticated;`);
    await db.exec("select set_config('test.uid', '', false)");
    await db.exec(await (await fetch('seed.txt')).text());
    await db.exec('create table public.demo_pret (ok boolean)');   // marqueur : la base est complète
}
const complete = async db => !!(await db.query("select to_regclass('public.demo_pret') as t")).rows[0].t;
async function ouvrir() {
  const fsBundle = await (await fetch('pglite-fs.wasm')).blob();
  // Les bases des anciennes versions de la démo sont supprimées (elles saturaient le stockage du téléphone)
  for (let v = 5; v <= 10; v++) supprimerBase('rmpaie-demo-v' + v);
  for (let essai = 0; essai < 2; essai++) {
    let d = null;
    try {
      d = new PGlite('idb://' + STORE, { fsBundle }); await d.waitReady;
      if (!(await complete(d))) {
        // Base absente ou restée incomplète (page fermée pendant le premier chargement) : on repart de zéro
        const entamee = (await d.query("select to_regclass('public.organisations') as t")).rows[0].t;
        if (entamee) { await d.close(); await supprimerBase(STORE); continue; }
        await construire(d);
      }
      return { db: d, persistant: true };
    } catch (e) { try { if (d) await d.close(); } catch (x) { } await supprimerBase(STORE); }
  }
  // Stockage indisponible (navigation privée, espace plein) : base en mémoire, perdue à la fermeture de la page
  const d = new PGlite({ fsBundle }); await d.waitReady; await construire(d); return { db: d, persistant: false };
}
(async () => {
  let db, persistant;
  try { ({ db, persistant } = await ouvrir()); }
  catch (e) { window.__demoErreur = e.message || String(e); window.__sbResolve(async () => JSON.stringify({ data: null, error: { message: 'La démonstration n’a pas pu démarrer sur cet appareil : ' + window.__demoErreur } })); return; }
  window.__demoPersistant = persistant;
  let chain = Promise.resolve();
  const lock = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  const EMB = { factures: ['factures', 'facture_id'], organisations: ['organisations', 'org_id'] };
  const id = s => '"' + String(s).replace(/"/g, '') + '"';
  let curAal = 'aal1';
  async function asUser(uid, fn) { await db.exec(`reset role; select set_config('test.uid', '${uid ? String(uid).replace(/[^0-9a-f-]/g, '') : ''}', false); select set_config('test.aal', '${curAal === 'aal2' ? 'aal2' : 'aal1'}', false); set role ${uid ? 'authenticated' : 'anon'};`); try { return await fn(); } finally { await db.exec('reset role'); } }
  async function query(o) {
    const P = []; const ph = v => { P.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v); return '$' + P.length; };
    const where = o.filters.length ? ' where ' + o.filters.map(([k, v]) => `t.${id(k)} = ${ph(v)}`).join(' and ') : '';
    if (o.op === 'select') {
      let cols = 't.*', joins = '';
      const m = /\*,\s*(\w+)\(([^)]*)\)/.exec(o.cols || '*');
      if (m) { const [tb, fk] = EMB[m[1]]; cols = `t.*, json_build_object(${m[2].split(',').map(c => `'${c.trim()}', e.${id(c.trim())}`).join(',')}) as ${id(m[1])}`; joins = ` left join public.${tb} e on e.id = t.${fk}`; }
      else if (o.cols && o.cols !== '*') cols = o.cols.split(',').map(c => 't.' + id(c.trim())).join(',');
      let sql = `select ${cols} from public.${id(o.table)} t${joins}${where}`;
      if (o.order) sql += ` order by t.${id(o.order[0])} ${o.order[1] ? 'asc' : 'desc'}`;
      if (o.range) sql += ` limit ${o.range[1] - o.range[0] + 1} offset ${o.range[0]}`;
      const rows = (await db.query(sql, P)).rows;
      if (o.single) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'introuvable' } };
      if (o.maybe) return { data: rows[0] || null, error: null };
      return { data: rows, error: null };
    }
    if (o.op === 'insert' || o.op === 'upsert') {
      const vals = Array.isArray(o.values) ? o.values : [o.values]; const keys = Object.keys(vals[0]);
      const pk = { documents: ['org_id', 'cle'], espaces: ['id'], parametres: ['cle'] }[o.table];
      let sql = `insert into public.${id(o.table)} (${keys.map(id).join(',')}) values ${vals.map(v => '(' + keys.map(k => ph(v[k])).join(',') + ')').join(',')}`;
      if (o.op === 'upsert' && pk) sql += ` on conflict (${pk.join(',')}) do update set ${keys.filter(k => !pk.includes(k)).map(k => `${id(k)} = excluded.${id(k)}`).join(',')}`;
      await db.query(sql, P); return { data: null, error: null };
    }
    if (o.op === 'update') { const sets = Object.entries(o.values).map(([k, v]) => `${id(k)} = ${ph(v)}`).join(','); await db.query(`update public.${id(o.table)} t set ${sets}${where}`, P); return { data: null, error: null }; }
    if (o.op === 'delete') { await db.query(`delete from public.${id(o.table)} t${where}`, P); return { data: null, error: null }; }
  }
  async function rpc(name, args) {
    if (!/^[a-z_]+$/.test(name)) throw new Error('fonction inconnue');
    const keys = Object.keys(args || {}); const P = keys.map(k => { const v = args[k]; return v !== null && typeof v === 'object' ? JSON.stringify(v) : v; });
    const r = await db.query(`select * from public.${name}(${keys.map((k, i) => `${k.replace(/[^a-z_]/g, '')} => $${i + 1}`).join(', ')})`, P);
    if (r.fields.length === 1 && r.fields[0].name === name) return { data: r.rows[0] ? r.rows[0][name] : null, error: null };
    return { data: r.rows, error: null };
  }
  // Double authentification (TOTP, RFC 6238) — même comportement que Supabase Auth
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const b32dec = t => { let bits = '', out = []; for (const c of t.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); } for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(out); };
  async function totp(secret, pas) {
    const key = await crypto.subtle.importKey('raw', b32dec(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const msg = new Uint8Array(8); let c = pas; for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg)); const o = h[19] & 15;
    return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
  }
  async function mfa(o) {
    await db.exec('reset role'); if (!o.uid) return { data: null, error: { message: 'non connecté' } };
    if (o.op === 'list') return { data: (await db.query('select id, friendly_name, factor_type, status, created_at from auth.mfa_factors where user_id = $1 order by created_at', [o.uid])).rows, error: null };
    if (o.op === 'enroll') {
      const b = crypto.getRandomValues(new Uint8Array(20)); let secret = ''; let bits = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) secret += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
      const id = crypto.randomUUID(); await db.query("insert into auth.mfa_factors (id, user_id, friendly_name, status, secret) values ($1, $2, $3, 'unverified', $4)", [id, o.uid, o.nom || 'Téléphone', secret]);
      return { data: { id, secret }, error: null };
    }
    const f = (await db.query('select * from auth.mfa_factors where id = $1 and user_id = $2', [o.id, o.uid])).rows[0];
    if (!f) return { data: null, error: { message: 'Factor not found' } };
    if (o.op === 'verify') {
      const pas = Math.floor(Date.now() / 30000); const code = String(o.code || '');
      for (const d of [-1, 0, 1]) if (await totp(f.secret, pas + d) === code) { await db.query("update auth.mfa_factors set status = 'verified' where id = $1", [f.id]); return { data: {}, error: null }; }
      return { data: null, error: { message: 'Invalid TOTP code entered' } };
    }
    if (o.op === 'unenroll') {
      const v = (await db.query("select count(*)::int n from auth.mfa_factors where user_id = $1 and status = 'verified'", [o.uid])).rows[0].n;
      if (v && o.aal !== 'aal2') return { data: null, error: { message: 'AAL2 required to unenroll verified factor' } };
      await db.query('delete from auth.mfa_factors where id = $1', [f.id]); return { data: { id: f.id }, error: null };
    }
    return { data: null, error: { message: 'opération inconnue' } };
  }
  window.__demoTotp = async uid => { const f = (await db.query("select secret from auth.mfa_factors where user_id = $1 order by created_at desc limit 1", [uid])).rows[0]; return f ? totp(f.secret, Math.floor(Date.now() / 30000)) : null; };
  async function handle(raw) {
    const o = JSON.parse(raw);
    return lock(async () => {
      curAal = o.aal === 'aal2' ? 'aal2' : 'aal1';
      try {
        if (o.kind === 'mfa') return JSON.stringify(await mfa(o));
        if (o.kind === 'login') { await db.exec('reset role'); const u = (await db.query('select id, email, pwd from auth.users where lower(email)=lower($1)', [o.email])).rows[0]; if (!u || u.pwd !== o.password) return JSON.stringify({ data: {}, error: { message: 'Invalid login credentials' } }); return JSON.stringify({ data: { session: { user: { id: u.id, email: u.email } } }, error: null }); }
        if (o.kind === 'signup') { await db.exec('reset role'); if ((await db.query('select 1 from auth.users where lower(email)=lower($1)', [o.email])).rows.length) return JSON.stringify({ data: {}, error: { message: 'User already registered' } }); const uid = crypto.randomUUID(); await db.query('insert into auth.users values ($1,$2,$3,$4)', [uid, o.email, JSON.stringify(o.meta || {}), o.password]); return JSON.stringify({ data: { session: { user: { id: uid, email: o.email } } }, error: null }); }
        if (o.kind === 'query') return JSON.stringify(await asUser(o.uid, () => query(o)));
        if (o.kind === 'rpc') return JSON.stringify(await asUser(o.uid, () => rpc(o.name, o.args)));
        if (o.kind === 'upload') {
          const org = String(o.path).split('/')[0];
          const seg = String(o.path).split('/')[1];
          const ok = (await asUser(o.uid, () => db.query((o.bucket === 'bulletins' || seg === 'salaries') ? 'select public.est_membre($1::uuid) ok' : 'select public.est_admin_org($1::uuid) ok', [org]))).rows[0].ok;
          if (!ok) return JSON.stringify({ data: null, error: { message: 'accès refusé' } });
          await db.query('insert into public.demo_fichiers values ($1,$2,$3) on conflict (chemin) do update set data = excluded.data', [o.path, o.nom, o.data]);
          return JSON.stringify({ data: { path: o.path }, error: null });
        }
        if (o.kind === 'remove') {
          for (const pth of o.paths || []) {
            const org = String(pth).split('/')[0];
            const ok = (await asUser(o.uid, () => db.query('select public.est_membre($1::uuid) ok', [org]))).rows[0].ok;
            if (ok && String(pth).split('/')[1] === 'salaries') await db.query('delete from public.demo_fichiers where chemin = $1', [pth]);
          }
          return JSON.stringify({ data: [], error: null });
        }
        if (o.kind === 'fn' && o.name === 'envoyer-bulletins') {
          const n = (o.body.envois || []).length;
          return JSON.stringify({ data: { envoyes: n, echecs: [], demo: true }, error: null });
        }
        if (o.kind === 'download') {
          const org = String(o.path).split('/')[0];
          const ok = (await asUser(o.uid, () => db.query('select (public.est_membre($1::uuid) or public.est_super_admin()) ok', [org]))).rows[0].ok;
          const f = (await db.query('select data from public.demo_fichiers where chemin = $1', [o.path])).rows[0];
          if (!ok || !f) return JSON.stringify({ data: null, error: { message: 'introuvable' } });
          return JSON.stringify({ data: f.data, error: null });
        }
        if (o.kind === 'fn' && o.name === 'inviter') { const r = await asUser(o.uid, () => rpc('inviter', { p_org: o.body.org_id, p_email: o.body.email, p_role: o.body.role })); return JSON.stringify({ data: { ok: true, email_envoye: true }, error: null }); }
        if (o.kind === 'fn' && o.name === 'cmi-diagnostic') {
          const ex = 'https://VOTRE-PROJET.supabase.co/functions/v1/';
          return JSON.stringify({ data: { mode: 'demo', a_declarer: { 'URL de rappel (callback)': ex + 'cmi-callback', 'URL de retour succès (okUrl)': ex + 'cmi-retour?etat=ok', 'URL de retour échec (failUrl)': ex + 'cmi-retour?etat=echec', 'Adresse du site marchand (shopurl)': 'https://votre-domaine.ma', 'Type de magasin': '3D_PAY_HOSTING', 'Algorithme de signature': 'ver3 (SHA-512)', 'Type de transaction': 'PreAuth, capturée par la réponse ACTION=POSTAUTH du rappel', 'Devise': '504 (dirham)' },
            controles: [{ point: 'Identifiant marchand (CMI_CLIENT_ID)', ok: false, detail: 'à recevoir de votre acquéreur' }, { point: 'Clé du magasin (CMI_STORE_KEY)', ok: false, detail: 'à recevoir de votre acquéreur' }, { point: 'Adresse du site (SITE_URL)', ok: false, detail: 'à définir après achat du nom de domaine' }, { point: 'Calcul de signature SHA-512 (ver3)', ok: true, detail: 'opérationnel' }], rappels: [] }, error: null });
        }
        if (o.kind === 'fn' && o.name === 'cmi-paiement') {
          if (o.body.commande_id) {
            const c = (await asUser(o.uid, () => query({ op: 'select', table: 'commandes', filters: [['id', o.body.commande_id]], cols: '*', single: true }))).data;
            if (!c) return JSON.stringify({ data: { erreur: 'Commande introuvable.' }, error: null });
            await db.exec("reset role; select set_config('test.uid', '', false)");
            await db.query("select public.payer_commande($1, $2, $3, $4, $5)", [c.id, c.total_ttc, 'CMD-DEMO-' + Date.now() % 100000, 'DEMO' + Math.floor(Math.random() * 1e6), JSON.stringify({ carte: '4000 00** **** 0002', demo: true })]);
            return JSON.stringify({ data: { demo: true }, error: null });
          }
          const f = (await asUser(o.uid, () => query({ op: 'select', table: 'factures', filters: [['id', o.body.facture_id]], cols: '*', single: true }))).data;
          if (!f) return JSON.stringify({ data: { erreur: 'Facture introuvable.' }, error: null });
          await db.exec("reset role; select set_config('test.uid', '', false)");
          await db.query("select public.enregistrer_paiement($1, $2, 'carte', $3, $4, $5)", [f.id, f.total_ttc, f.numero + '-DEMO' + Date.now() % 100000, 'DEMO' + Math.floor(Math.random() * 1e6), JSON.stringify({ carte: '4000 00** **** 0002', demo: true })]);
          return JSON.stringify({ data: { demo: true }, error: null });
        }
        return JSON.stringify({ data: null, error: { message: 'non disponible en démo' } });
      } catch (e) { return JSON.stringify({ data: null, error: { message: e.message, code: e.code } }); }
    });
  }
  window.__sbResolve(handle);
})();
