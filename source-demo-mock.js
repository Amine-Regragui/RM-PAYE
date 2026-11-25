// Client « supabase-js » de démonstration : relaie les appels vers la base locale (backend.js)
(function () {
  const ready = new Promise(res => { window.__sbResolve = res; });
  const call = op => ready.then(h => h(JSON.stringify(Object.assign({ aal: (sess() || {}).aal || 'aal1' }, op)))).then(r => JSON.parse(r));
  const mem = {}; const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] ?? null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }, del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } } };
  try { const s = sessionStorage.getItem('demo-session'); if (s) mem['mock-session'] = s; } catch (e) { }
  const sess = () => { try { return JSON.parse(ls.get('mock-session')); } catch (e) { return null; } };
  const setSess = v => { ls.set('mock-session', v); try { sessionStorage.setItem('demo-session', v); } catch (e) { } };
  function qb(table) {
    const st = { table, filters: [], order: null, range: null, single: false, maybe: false, op: 'select', cols: '*' };
    const b = {
      select(c) { if (st.op === 'select') st.cols = c || '*'; return b; }, eq(k, v) { st.filters.push([k, v]); return b; },
      order(k, o) { st.order = [k, !(o && o.ascending === false)]; return b; }, limit(n) { st.range = [0, n - 1]; return b; }, range(a, z) { st.range = [a, z]; return b; },
      single() { st.single = true; return b; }, maybeSingle() { st.maybe = true; return b; },
      insert(v) { st.op = 'insert'; st.values = v; return b; }, upsert(v) { st.op = 'upsert'; st.values = v; return b; }, update(v) { st.op = 'update'; st.values = v; return b; }, delete() { st.op = 'delete'; return b; },
      then(res, rej) { return call({ kind: 'query', uid: sess() && sess().user.id, ...st }).then(res, rej); }
    };
    return b;
  }
  window.supabase = { createClient() { return {
    storage: { from: bucket => ({
      upload: (path, file) => new Promise(res => { const r = new FileReader(); r.onload = () => res(call({ kind: 'upload', uid: sess() && sess().user.id, bucket, path, nom: file.name, data: r.result })); r.readAsDataURL(file); }),
      remove: async paths => call({ kind: 'remove', uid: sess() && sess().user.id, bucket, paths }),
      createSignedUrl: async (path, sec) => ({ data: { signedUrl: 'https://rmpaie.ma/lien-demo/' + encodeURIComponent(path) + '?expire=' + sec }, error: null }),
      download: async path => { const r = await call({ kind: 'download', uid: sess() && sess().user.id, bucket, path }); if (r.error) return r; return { data: await (await fetch(r.data)).blob(), error: null }; }
    }) },
    from: qb, rpc: (name, args) => call({ kind: 'rpc', uid: sess() && sess().user.id, name, args }),
    functions: { invoke: (name, o) => call({ kind: 'fn', uid: sess() && sess().user.id, name, body: o && o.body }) },
    auth: {
      getSession: async () => ({ data: { session: sess() } }), getUser: async () => ({ data: { user: sess() && sess().user } }),
      signInWithPassword: async ({ email, password }) => { const r = await call({ kind: 'login', email, password }); if (!r.error) setSess(JSON.stringify(Object.assign({ aal: 'aal1' }, r.data.session))); return r; },
      signUp: async ({ email, password, options }) => { const r = await call({ kind: 'signup', email, password, meta: options && options.data }); if (!r.error) setSess(JSON.stringify(r.data.session)); return r; },
      signOut: async () => { ls.del('mock-session'); try { sessionStorage.removeItem('demo-session'); } catch (e) { } return {}; },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => { const s = sess(); if (!s) return { data: { currentLevel: null, nextLevel: null }, error: null }; const r = await call({ kind: 'mfa', op: 'list', uid: s.user.id }); const v = (r.data || []).some(f => f.status === 'verified'); return { data: { currentLevel: s.aal || 'aal1', nextLevel: v ? 'aal2' : (s.aal || 'aal1') }, error: null }; },
        listFactors: async () => { const s = sess(); const r = await call({ kind: 'mfa', op: 'list', uid: s && s.user.id }); const all = r.data || []; return { data: { all, totp: all.filter(f => f.status === 'verified') }, error: null }; },
        enroll: async ({ friendlyName, issuer }) => {
          const s = sess(); const r = await call({ kind: 'mfa', op: 'enroll', uid: s && s.user.id, nom: friendlyName }); if (r.error) return r;
          const iss = issuer || 'RM Paie'; const uri = `otpauth://totp/${encodeURIComponent(iss + ':' + s.user.email)}?secret=${r.data.secret}&issuer=${encodeURIComponent(iss)}`;
          const q = window.qrcode(0, 'M'); q.addData(uri); q.make();
          return { data: { id: r.data.id, type: 'totp', friendly_name: friendlyName, totp: { secret: r.data.secret, uri, qr_code: 'data:image/svg+xml;utf-8,' + encodeURIComponent(q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })) } }, error: null };
        },
        challenge: async () => ({ data: { id: crypto.randomUUID() }, error: null }),
        verify: async ({ factorId, code }) => { const s = sess(); const r = await call({ kind: 'mfa', op: 'verify', uid: s && s.user.id, id: factorId, code }); if (r.error) return r; s.aal = 'aal2'; setSess(JSON.stringify(s)); return { data: {}, error: null }; },
        challengeAndVerify: async ({ factorId, code }) => { const s = sess(); const r = await call({ kind: 'mfa', op: 'verify', uid: s && s.user.id, id: factorId, code }); if (r.error) return r; s.aal = 'aal2'; setSess(JSON.stringify(s)); return { data: {}, error: null }; },
        unenroll: async ({ factorId }) => { const s = sess(); return call({ kind: 'mfa', op: 'unenroll', uid: s && s.user.id, id: factorId }); }
      },
      resetPasswordForEmail: async () => ({}), updateUser: async () => ({ data: {}, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } })
    }
  }; } };
})();
