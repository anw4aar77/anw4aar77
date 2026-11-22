'use strict';
/* JSON-file store for a normal Node host (VPS, Render, Railway...). NOT for Vercel: its disk is not persistent. */
const fs = require('fs'), path = require('path');
module.exports = function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const FILE = path.join(dir, 'accounts.json');
  let DB = { users: {}, sessions: {}, adminlog: [] };
  try { DB = Object.assign(DB, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) {}
  let timer = null;
  const flush = () => { clearTimeout(timer); timer = null; const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, FILE); };
  const persist = () => { if (!timer) timer = setTimeout(flush, 300); };
  const hits = new Map(), cp = x => x == null ? x : JSON.parse(JSON.stringify(x));
  setInterval(() => { const n = Date.now(); for (const k in DB.sessions) if (DB.sessions[k].exp < n) delete DB.sessions[k]; persist(); }, 36e5).unref();
  return {
    file: FILE, flush,
    ping: async () => true,
    getUser: async k => cp(DB.users[k]) || null,
    getUsers: async keys => keys.map(k => cp(DB.users[k]) || null),
    createUser: async (k, u) => { if (DB.users[k]) return false; DB.users[k] = cp(u); persist(); return true; },
    listUsers: async () => Object.keys(DB.users),
    mutate: async (k, fn) => { if (!DB.users[k]) return undefined; const [nu, res] = await fn(cp(DB.users[k])); if (nu) { DB.users[k] = nu; persist(); } return res; },
    getSession: async h => { const s = DB.sessions[h]; return s && s.exp > Date.now() ? cp(s) : null; },
    putSession: async (h, s, ttl) => { DB.sessions[h] = Object.assign(cp(s), { exp: Date.now() + ttl * 1000 }); persist(); },
    delSession: async h => { delete DB.sessions[h]; persist(); },
    hit: async (k, ttl) => { const f = hits.get(k); const n = f && f.e > Date.now() ? f.n + 1 : 1; hits.set(k, { n, e: f && f.e > Date.now() ? f.e : Date.now() + ttl * 1000 }); return n; },
    hits: async k => { const f = hits.get(k); return f && f.e > Date.now() ? f.n : 0; },
    clearHits: async k => { hits.delete(k); },
    pushLog: async e => { DB.adminlog.push(e); if (DB.adminlog.length > 1000) DB.adminlog.splice(0, DB.adminlog.length - 1000); persist(); },
    getLog: async n => DB.adminlog.slice(-n)
  };
};
