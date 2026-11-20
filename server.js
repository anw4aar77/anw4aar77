'use strict';
/* MOON DEFENDERS account server: zero dependencies, Node.js 18+.
   Serves the game at "/" and the account API at "/api/*".
   Usernames are unique (case-insensitive), passwords are hashed with scrypt,
   and each account's progress is stored on the server so it works on any device. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000;
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');      // put this on a persistent disk
const FILE = path.join(DIR, 'accounts.json');
const PAGE = path.join(__dirname, 'MOON_DEFENDERS_ready.html');
const ORIGIN = process.env.CORS_ORIGIN || '';                          // only if the page is hosted elsewhere
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY = 400 * 1024, MAX_SAVE = 300 * 1024, SESSION_MS = 30 * 864e5;
fs.mkdirSync(DIR, { recursive: true });

let DB = { users: {}, sessions: {} };
try { DB = JSON.parse(fs.readFileSync(FILE, 'utf8')); DB.users = DB.users || {}; DB.sessions = DB.sessions || {}; } catch (e) {}
let timer = null;
const flush = () => { clearTimeout(timer); timer = null; const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, FILE); };
const persist = () => { if (!timer) timer = setTimeout(flush, 300); };
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, () => { try { flush(); } catch (e) {} process.exit(0); }));

const th = t => crypto.createHash('sha256').update(t).digest('hex');
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => e ? no(e) : ok(k.toString('hex'))));
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const validName = u => typeof u === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(u);
const validPass = p => typeof p === 'string' && p.length >= 8 && p.length <= 64;
const validSave = s => s && typeof s === 'object' && !Array.isArray(s) && JSON.stringify(s).length <= MAX_SAVE;

const fails = new Map();
const blocked = k => { const f = fails.get(k); return f && f.n >= 8 && Date.now() - f.t < 6e5; };
const fail = k => { const f = fails.get(k); fails.set(k, { n: (f && Date.now() - f.t < 6e5 ? f.n : 0) + 1, t: Date.now() }); };
const ipOf = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';

const cors = () => ORIGIN ? { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' } : {};
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors() }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let n = 0; const c = []; req.on('data', d => { n += d.length; if (n > MAX_BODY) { no(new Error('too big')); req.destroy(); } else c.push(d); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch (e) { no(new Error('bad json')); } }); req.on('error', no); });
const newSession = key => { const tok = crypto.randomBytes(32).toString('hex'); DB.sessions[th(tok)] = { u: key, exp: Date.now() + SESSION_MS }; persist(); return tok; };
const authed = req => { const m = /^Bearer (\w{64})$/.exec(req.headers.authorization || ''); if (!m) return null; const s = DB.sessions[th(m[1])]; if (!s || s.exp < Date.now() || !DB.users[s.u]) return null; s.exp = Date.now() + SESSION_MS; return { key: s.u, user: DB.users[s.u], tok: th(m[1]) }; };
setInterval(() => { const n = Date.now(); for (const k in DB.sessions) if (DB.sessions[k].exp < n) delete DB.sessions[k]; persist(); }, 36e5).unref();

async function api(req, res, url) {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }
  if (url === '/api/ping') return send(res, 200, { ok: true, md: 1 });
  let b = {};
  if (req.method === 'POST') { try { b = await body(req); } catch (e) { return send(res, 400, { ok: false, error: 'Bad request' }); } }
  if (url === '/api/register' && req.method === 'POST') {
    const u = b.username, p = b.password;
    if (!validName(u)) return send(res, 400, { ok: false, error: 'Username: 3-16 letters, numbers or underscores.' });
    if (!validPass(p)) return send(res, 400, { ok: false, error: 'Password must be 8-64 characters.' });
    if (b.save != null && !validSave(b.save)) return send(res, 400, { ok: false, error: 'Invalid save data.' });
    const key = u.toLowerCase();
    if (DB.users[key]) return send(res, 409, { ok: false, error: 'taken' });
    const salt = crypto.randomBytes(16).toString('hex'), hash = await scrypt(p, salt);
    if (DB.users[key]) return send(res, 409, { ok: false, error: 'taken' });          // re-check after the async hash: no race
    DB.users[key] = { name: u, salt, hash, created: Date.now(), save: b.save || null, rev: b.save ? 1 : 0 };
    const tok = newSession(key); flush();
    return send(res, 200, { ok: true, token: tok, name: u, save: DB.users[key].save, rev: DB.users[key].rev });
  }
  if (url === '/api/login' && req.method === 'POST') {
    const key = String(b.username || '').toLowerCase(), fk = ipOf(req) + '|' + key;
    if (blocked(fk)) return send(res, 429, { ok: false, error: 'Too many attempts. Try again later.' });
    const u = DB.users[key], ok = u && typeof b.password === 'string' && same(await scrypt(b.password, u.salt), u.hash);
    if (!ok) { fail(fk); return send(res, 401, { ok: false, error: 'Wrong username or password.' }); }
    fails.delete(fk);
    return send(res, 200, { ok: true, token: newSession(key), name: u.name, save: u.save, rev: u.rev });
  }
  const a = authed(req);
  if (!a) return send(res, 401, { ok: false, error: 'Not logged in.' });
  if (url === '/api/me') return send(res, 200, { ok: true, name: a.user.name, save: a.user.save, rev: a.user.rev });
  if (url === '/api/save' && req.method === 'POST') {
    if (!validSave(b.save)) return send(res, 400, { ok: false, error: 'Invalid save data.' });
    if (!b.force && (b.base | 0) !== a.user.rev) return send(res, 409, { ok: false, error: 'conflict', save: a.user.save, rev: a.user.rev });
    a.user.save = b.save; a.user.rev++; a.user.updated = Date.now(); persist();
    return send(res, 200, { ok: true, rev: a.user.rev });
  }
  if (url === '/api/logout' && req.method === 'POST') { delete DB.sessions[a.tok]; persist(); return send(res, 200, { ok: true }); }
  send(res, 404, { ok: false, error: 'Not found' });
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) return api(req, res, url).catch(e => { console.error(e); if (!res.headersSent) send(res, 500, { ok: false, error: 'Server error' }); });
  if (url === '/' || url === '/index.html') return fs.readFile(PAGE, (e, d) => {
    if (e) { res.writeHead(500); return res.end('Game file MOON_DEFENDERS_ready.html not found next to server.js'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(d);
  });
  res.writeHead(404); res.end('Not found');
}).listen(PORT, () => console.log('MOON DEFENDERS server running on http://localhost:' + PORT + '  (data: ' + FILE + ')'));
