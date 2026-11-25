// HomeTown — couche de données.
// Mode « cloud » : Supabase (connexion par e-mail et mot de passe, données du foyer partagées et synchronisées en direct).
// Mode « essai local » : si config.js n'a pas encore les clés, tout reste dans ce navigateur (pour tester l'app).
// Les écritures sont d'abord appliquées sur le téléphone, puis envoyées ; hors ligne, elles attendent dans une file.
(() => {
  const CFG = window.HOMETOWN_CONFIG || {};
  const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && !/VOTRE|YOUR/i.test(CFG.supabaseUrl + CFG.supabaseAnonKey) && window.supabase);
  const SCHEMA = 2; // version du schéma de base que cette version de l'app sait lire (2 = v1.2 : demandes d'aide)
  const K = { cache: 'hometown.cache.v1', outbox: 'hometown.outbox.v1', local: 'hometown.local.v1' };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const COLS = {
    // v1.2 : to_member, ref et note servent aux demandes d'aide (script supabase/002_entraide.sql)
    events: ['id', 'household_id', 'kind', 'member', 'task_id', 'task_name', 'target', 'points', 'at', 'created_by', 'to_member', 'ref', 'note'],
    tasks: ['household_id', 'id', 'target', 'name', 'freq', 'effort', 'minutes', 'base_at', 'archived', 'sort', 'updated_at'],
    rewards: ['id', 'household_id', 'emoji', 'name', 'price', 'planned_date', 'updated_at']
  };
  const pick = (t, row) => { const o = {}; COLS[t].forEach(c => { if (row[c] !== undefined) o[c] = row[c]; }); return o; };
  const blank = () => ({ user: null, household: null, me: null, members: [], tasks: [], events: [], rewards: [], dbSchema: SCHEMA, lastError: null });
  let sb = null, S = blank(), chan = null, flushing = false, loading = null;
  const listeners = [];
  const emit = () => { clearTimeout(emit.t); emit.t = setTimeout(() => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }), 0); };
  const keyOf = (t, r) => t === 'members' ? r.key : r.id;
  function merge(t, row) {
    const arr = S[t], k = keyOf(t, row), i = arr.findIndex(r => keyOf(t, r) === k);
    if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push(row);
    if (t === 'events') arr.sort((a, b) => (a.at < b.at ? -1 : 1));
  }
  function saveCache() {
    if (!S.household) return;
    const snap = { household: S.household, me: S.me, members: S.members, tasks: S.tasks, events: S.events, rewards: S.rewards };
    if (CLOUD) ls.set(K.cache, { ...snap, uid: S.user && S.user.id }); else ls.set(K.local, { ...snap, user: S.user });
  }
  const outbox = () => ls.get(K.outbox, []);
  function queue(table, row) { const ob = outbox(); ob.push({ table, row }); ls.set(K.outbox, ob); flush(); }
  const isNet = e => !e || !e.code || /fetch|network|load failed|timeout/i.test(e.message || '');

  async function flush() {
    if (!CLOUD || flushing || !S.user) return;
    flushing = true;
    try {
      for (;;) {
        const ob = outbox(); if (!ob.length) break;
        const { table, row } = ob[0];
        const q = table === 'events' ? sb.from('events').upsert(row, { onConflict: 'id', ignoreDuplicates: true })
          : table === 'tasks' ? sb.from('tasks').upsert(row, { onConflict: 'household_id,id' })
          : sb.from('rewards').upsert(row, { onConflict: 'id' });
        const { error } = await q;
        if (error) {
          if (isNet(error)) break; // pas de réseau : on réessaiera plus tard
          console.error('HomeTown : écriture refusée', table, error); S.lastError = error.message;
        }
        const cur = outbox(); cur.shift(); ls.set(K.outbox, cur);
      }
    } catch (e) { /* réseau indisponible */ } finally { flushing = false; emit(); }
  }

  async function fetchAll(table, hid, order) {
    let out = [], from = 0;
    for (;;) {
      const { data, error } = await sb.from(table).select('*').eq('household_id', hid).order(order).range(from, from + 999);
      if (error) throw error;
      out = out.concat(data); if (data.length < 1000) break; from += 1000;
    }
    return out;
  }
  async function load() {
    if (!CLOUD || !S.household) return;
    if (loading) return loading;
    loading = (async () => {
      const hid = S.household.id;
      const [mem, tk, ev, rw] = await Promise.all([fetchAll('members', hid, 'created_at'), fetchAll('tasks', hid, 'sort'),
        fetchAll('events', hid, 'at'), fetchAll('rewards', hid, 'created_at')]);
      Object.assign(S, { members: mem, tasks: tk, events: ev, rewards: rw });
      outbox().forEach(o => merge(o.table, o.row)); // ce qui n'est pas encore envoyé reste visible
      const { data: h } = await sb.from('households').select('*').eq('id', hid).maybeSingle(); if (h) S.household = h;
      const { data: m } = await sb.from('app_meta').select('v').eq('k', 'schema_version').maybeSingle(); if (m) S.dbSchema = +m.v;
      saveCache(); emit();
    })().finally(() => { loading = null; });
    return loading;
  }
  async function resolveHousehold() {
    const { data, error } = await sb.from('members').select('key, household_id, households(*)').eq('user_id', S.user.id).maybeSingle();
    if (error) throw error;
    if (data) { S.household = data.households; S.me = data.key; } else { S.household = null; S.me = null; ls.del(K.cache); }
  }
  function subscribe() {
    if (!CLOUD || chan || !S.household) return;
    const hid = S.household.id;
    chan = sb.channel('hh-' + hid);
    ['events', 'tasks', 'rewards', 'members'].forEach(t => chan.on('postgres_changes',
      { event: '*', schema: 'public', table: t, filter: 'household_id=eq.' + hid },
      p => { if (p.new && Object.keys(p.new).length) { merge(t, p.new); saveCache(); emit(); } }));
    chan.subscribe(st => { if (st === 'SUBSCRIBED') load().catch(() => {}); });
  }
  function status() {
    if (!CLOUD) return S.household ? 'ready' : 'local_setup';
    if (!S.user) return 'signed_out';
    return S.household ? 'ready' : 'no_household';
  }

  async function init() {
    if (!CLOUD) { const st = ls.get(K.local, null); if (st) Object.assign(S, st); return status(); }
    sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey,
      { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hometown.auth' } });
    const { data } = await sb.auth.getSession();
    S.user = data && data.session ? data.session.user : null;
    if (!S.user) return status();
    const c = ls.get(K.cache, null);
    if (c && c.uid === S.user.id) Object.assign(S, { household: c.household, me: c.me, members: c.members, tasks: c.tasks, events: c.events, rewards: c.rewards });
    try { await resolveHousehold(); if (S.household) await load(); } catch (e) { console.warn('HomeTown : hors ligne, données du téléphone utilisées', e); }
    subscribe(); flush();
    addEventListener('online', () => { flush(); load().catch(() => {}); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { flush(); load().catch(() => {}); } });
    setInterval(flush, 30000);
    sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_OUT') { S = blank(); emit(); } else if (session) S.user = session.user; });
    return status();
  }

  async function afterAuth(data) {
    S.user = data.user; await resolveHousehold();
    if (S.household) { await load(); subscribe(); }
    return status();
  }
  const API = {
    CLOUD, SCHEMA, uuid,
    init, status, state: () => S, on: f => listeners.push(f), pending: () => outbox().length, reload: () => load(),
    // Connexion par e-mail et mot de passe (aucun e-mail envoyé : « Confirm email » est désactivé dans Supabase).
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return afterAuth(data);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('confirm_required');
      return afterAuth(data);
    },
    async signOut() {
      if (CLOUD) { if (chan) { sb.removeChannel(chan); chan = null; } await sb.auth.signOut().catch(() => {}); ls.del(K.cache); ls.del(K.outbox); }
      else ls.del(K.local);
      S = blank(); emit();
    },
    // membersDef : [{key, name, color}] ; seed : tâches de départ (sans household_id)
    async createHousehold(name, me, membersDef, seed) {
      if (CLOUD) {
        const { data, error } = await sb.rpc('create_household', { p_name: name, p_member: me, p_members: membersDef });
        if (error) throw error;
        S.household = Array.isArray(data) ? data[0] : data; S.me = me;
        const rows = seed.map(t => pick('tasks', { ...t, household_id: S.household.id }));
        for (let i = 0; i < rows.length; i += 100) {
          const { error: e2 } = await sb.from('tasks').upsert(rows.slice(i, i + 100), { onConflict: 'household_id,id' });
          if (e2) throw e2;
        }
        await load(); subscribe();
      } else {
        S.user = { id: 'local' };
        S.household = { id: uuid(), name, invite_code: 'ESSAI', created_at: new Date().toISOString() };
        S.me = me; S.members = membersDef.map(m => ({ ...m, user_id: m.key === me ? 'local' : null }));
        S.tasks = seed.map(t => ({ ...t, household_id: S.household.id })); S.events = []; S.rewards = [];
        saveCache(); emit();
      }
      return status();
    },
    async previewHousehold(code) {
      const { data, error } = await sb.rpc('household_preview', { p_code: code });
      if (error) throw error; return data || [];
    },
    async joinHousehold(code, me) {
      const { data, error } = await sb.rpc('join_household', { p_code: code, p_member: me });
      if (error) throw error;
      S.household = Array.isArray(data) ? data[0] : data; S.me = me; await load(); subscribe();
      return status();
    },
    addEvent(e) {
      const row = pick('events', { id: uuid(), household_id: S.household.id, kind: 'done', at: new Date().toISOString(), created_by: S.user && S.user.id, ...e });
      merge('events', row); saveCache(); if (CLOUD) queue('events', row); emit(); return row;
    },
    saveTask(t) {
      const row = pick('tasks', { ...t, household_id: S.household.id, updated_at: new Date().toISOString() });
      merge('tasks', row); saveCache(); if (CLOUD) queue('tasks', row); emit(); return row;
    },
    saveReward(r) {
      const row = pick('rewards', { id: uuid(), ...r, household_id: S.household.id, updated_at: new Date().toISOString() });
      merge('rewards', row); saveCache(); if (CLOUD) queue('rewards', row); emit(); return row;
    },
    exportData() {
      const strip = o => { const { household_id, created_by, updated_by, user_id, ...r } = o; return r; };
      return { app: 'HomeTown', format: 1, schema: SCHEMA, exported_at: new Date().toISOString(),
        household: { name: S.household.name }, members: S.members.map(({ key, name, color }) => ({ key, name, color })),
        tasks: S.tasks.map(strip), events: S.events.map(strip), rewards: S.rewards.map(strip) };
    },
    // Restaure une sauvegarde dans le foyer actuel, sans rien effacer : on ajoute ce qui manque.
    importData(o) {
      if (!o || o.app !== 'HomeTown' || !Array.isArray(o.events)) throw new Error('Ce fichier n’est pas une sauvegarde HomeTown.');
      if ((o.schema || 1) > SCHEMA) throw new Error('Cette sauvegarde vient d’une version plus récente de l’app : mettez l’app à jour d’abord.');
      const keys = new Set(S.members.map(m => m.key)), have = new Set(S.events.map(e => e.id)), n = { tasks: 0, events: 0, rewards: 0, skipped: 0 };
      (o.tasks || []).forEach(t => { API.saveTask(t); n.tasks++; });
      o.events.forEach(e => {
        if (have.has(e.id)) return;
        if (!keys.has(e.member)) { n.skipped++; return; }
        const row = pick('events', { ...e, household_id: S.household.id, created_by: S.user && S.user.id });
        merge('events', row); if (CLOUD) queue('events', row); n.events++;
      });
      (o.rewards || []).forEach(r => { API.saveReward(r); n.rewards++; });
      saveCache(); emit(); return n;
    }
  };
  window.HTStore = API;
})();
