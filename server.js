'use strict';
/* MOON DEFENDERS account server: zero dependencies, Node.js 18+.
   Serves the game at "/" and the account API at "/api/*".
   Usernames are unique (case-insensitive), passwords are hashed with scrypt,
   and each account's progress is stored on the server so it works on any device. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000;
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');      // put this on a persistent disk
const FILE = path.join(DIR, 'accounts.json');
const PAGE = path.join(__dirname, 'index.html');
const ORIGIN = process.env.CORS_ORIGIN || '';                          // only if the page is hosted elsewhere
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY = 400 * 1024, MAX_SAVE = 300 * 1024, SESSION_MS = 30 * 864e5;
fs.mkdirSync(DIR, { recursive: true });

/* ---- Admin configuration (server-side only; never sent to the browser) ----
   ADMIN_USERS : comma separated usernames that hold the admin role (default: anw4aar)
   ADMIN_KEY   : secret passphrase (12+ chars). Required to unlock the console. If unset, admin is disabled. */
const ADMIN_USERS = new Set((process.env.ADMIN_USERS || 'anw4aar').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const ADMIN_ON = ADMIN_KEY.length >= 12;
const ELEVATE_MS = 30 * 60 * 1000;
if (!ADMIN_ON) console.warn('[admin] ADMIN_KEY is missing or shorter than 12 characters: the admin console is DISABLED.');

let DB = { users: {}, sessions: {} };
try { DB = JSON.parse(fs.readFileSync(FILE, 'utf8')); DB.users = DB.users || {}; DB.sessions = DB.sessions || {}; } catch (e) {}
/* the admin role is derived only from server configuration: it is re-applied on every start */
for (const k in DB.users) { if (ADMIN_USERS.has(k)) DB.users[k].role = 'admin'; else delete DB.users[k].role; }
DB.adminlog = DB.adminlog || [];
let timer = null;
const flush = () => { clearTimeout(timer); timer = null; const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, FILE); };
const persist = () => { if (!timer) timer = setTimeout(flush, 300); };
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, () => { try { flush(); } catch (e) {} process.exit(0); }));

const NM = 25, MAXAMT = 1e9, MAXBAL = 1e12;
const HEROES = ['Killua Zoldyck', 'Tanjiro Kamado', 'Kakashi Hatake', 'Beerus', 'Yami Sukehiro', 'Monkey D. Luffy', 'Satoru Gojo', 'Shanks', 'Yhwach', 'Madara Uchiha'];
const RARITY = ['Common', 'Common', 'Rare', 'Rare', 'Epic', 'Epic', 'Legendary', 'Legendary', 'Mythic', 'Mythic'];
const RAR = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
const ORES = ['stone', 'copper', 'iron', 'gold', 'diamond'];
const defSave = name => ({ c: 150, d: 10, xp: 0, l: 1, own: { 0: { a: 0, b: 0, c: 0, d: 0, v: 1 } }, team: [0], mis: 1, sel: 0, up: 0, kills: 0, bh: 0, dl: { last: '', day: 0 }, ach: {}, name, done: {}, tried: {}, prog: null, bought: [], ore: { stone: 0, copper: 0, iron: 0, gold: 0, diamond: 0 }, obj: {} });
const need = l => Math.floor(80 * Math.pow(l, 1.5));
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
    DB.users[key] = { name: u, salt, hash, created: Date.now(), save: b.save || null, rev: b.save ? 1 : 0, arev: 0 };
    if (ADMIN_USERS.has(key)) DB.users[key].role = 'admin';
    const tok = newSession(key); flush();
    return send(res, 200, { ok: true, token: tok, name: u, save: DB.users[key].save, rev: DB.users[key].rev, arev: 0 });
  }
  if (url === '/api/login' && req.method === 'POST') {
    const key = String(b.username || '').toLowerCase(), fk = ipOf(req) + '|' + key;
    if (blocked(fk)) return send(res, 429, { ok: false, error: 'Too many attempts. Try again later.' });
    const u = DB.users[key], ok = u && typeof b.password === 'string' && same(await scrypt(b.password, u.salt), u.hash);
    if (!ok) { fail(fk); return send(res, 401, { ok: false, error: 'Wrong username or password.' }); }
    fails.delete(fk);
    return send(res, 200, { ok: true, token: newSession(key), name: u.name, save: u.save, rev: u.rev, arev: u.arev | 0 });
  }
  const a = authed(req);
  if (!a) return send(res, 401, { ok: false, error: 'Not logged in.' });
  if (url === '/api/me') return send(res, 200, { ok: true, name: a.user.name, save: a.user.save, rev: a.user.rev, arev: a.user.arev | 0 });
  if (url === '/api/save' && req.method === 'POST') {
    if (!validSave(b.save)) return send(res, 400, { ok: false, error: 'Invalid save data.' });
    if ((b.arev | 0) !== (a.user.arev | 0)) return send(res, 409, { ok: false, error: 'admin-update', admin: true, save: a.user.save, rev: a.user.rev, arev: a.user.arev | 0 });   // never overwrite an admin change
    if (!b.force && (b.base | 0) !== a.user.rev) return send(res, 409, { ok: false, error: 'conflict', save: a.user.save, rev: a.user.rev });
    a.user.save = b.save; a.user.rev++; a.user.updated = Date.now(); persist();
    return send(res, 200, { ok: true, rev: a.user.rev });
  }
  if (url === '/api/logout' && req.method === 'POST') { delete DB.sessions[a.tok]; persist(); return send(res, 200, { ok: true }); }
  if (url.startsWith('/api/admin/')) return adminApi(req, res, url, a, b);
  send(res, 404, { ok: false, error: 'Not found' });
}

/* ================= ADMIN ================= */
const isAdmin = a => ADMIN_ON && ADMIN_USERS.has(a.key) && a.user.role === 'admin';
const admFails = new Map();
async function adminApi(req, res, url, a, b) {
  const ip = ipOf(req);
  if (!isAdmin(a)) {                                   // every admin route: non-admins are refused, whatever they send
    if (url === '/api/admin/status') return send(res, 200, { ok: true, admin: false });
    audit('(denied) ' + a.user.name + ' tried ' + url, false, ip);
    return send(res, 403, { ok: false, error: 'Forbidden' });
  }
  const sess = DB.sessions[a.tok], unlocked = !!(sess && sess.adm && sess.adm > Date.now());
  if (url === '/api/admin/status') return send(res, 200, { ok: true, admin: true, unlocked });
  if (url === '/api/admin/unlock' && req.method === 'POST') {
    const fk = 'adm|' + a.key + '|' + ip;
    if (blocked(fk)) return send(res, 429, { ok: false, error: 'Too many attempts. Try again later.' });
    const x = crypto.createHash('sha256').update(String(b.key || '')).digest(), y = crypto.createHash('sha256').update(ADMIN_KEY).digest();
    if (!crypto.timingSafeEqual(x, y)) { fail(fk); audit('(failed admin unlock) ' + a.user.name, false, ip); return send(res, 401, { ok: false, error: 'Wrong admin key.' }); }
    fails.delete(fk); sess.adm = Date.now() + ELEVATE_MS; persist(); audit('(admin console unlocked)', true, ip);
    return send(res, 200, { ok: true });
  }
  if (!unlocked) return send(res, 403, { ok: false, error: 'Admin console is locked.', locked: true });
  sess.adm = Date.now() + ELEVATE_MS;                   // sliding 30 minute window
  if (url === '/api/admin/lock' && req.method === 'POST') { delete sess.adm; persist(); return send(res, 200, { ok: true }); }
  if (url === '/api/admin/history') return send(res, 200, { ok: true, history: DB.adminlog.slice(-60) });
  if (url === '/api/admin/run' && req.method === 'POST') {
    const line = String(b.command || '').trim().slice(0, 300);
    if (!line) return send(res, 400, { ok: false, error: 'Empty command.' });
    let r; try { r = runCommand(line); } catch (e) { console.error(e); r = { ok: false, msg: 'Internal error while running the command.' }; }
    audit(line, r.ok, ip, a.user.name);
    return send(res, r.ok ? 200 : 400, r.ok ? { ok: true, msg: r.msg } : { ok: false, error: r.msg });
  }
  send(res, 404, { ok: false, error: 'Not found' });
}
function audit(cmd, ok, ip, who) { DB.adminlog.push({ t: Date.now(), who: who || '', cmd: cmd.slice(0, 300), ok: !!ok, ip }); if (DB.adminlog.length > 1000) DB.adminlog.splice(0, DB.adminlog.length - 1000); persist(); }

const fmt = n => Number(n).toLocaleString('en-US');
const amount = v => (/^\d{1,10}$/.test(v || '') && +v > 0 && +v <= MAXAMT) ? +v : null;
function findUser(n) { const k = String(n || '').toLowerCase(); return DB.users[k] ? { key: k, user: DB.users[k] } : null; }
function findHero(q) {
  q = q.trim().toLowerCase(); if (!q) return { err: 'Missing character name.' };
  if (/^\d$/.test(q)) return { id: +q };
  let m = HEROES.map((n, i) => [n.toLowerCase(), i]).filter(([n]) => n === q);
  if (!m.length) m = HEROES.map((n, i) => [n.toLowerCase(), i]).filter(([n]) => n.includes(q));
  if (m.length === 1) return { id: m[0][1] };
  return { err: m.length ? 'Ambiguous name, matches: ' + m.map(x => HEROES[x[1]]).join(', ') : 'Unknown character. Valid: ' + HEROES.join(', ') };
}
function loadSave(u) {
  const d = defSave(u.name), sv = u.save && typeof u.save === 'object' ? u.save : {}, S = Object.assign(d, sv);
  S.own = S.own || {}; if (!S.own[0]) S.own[0] = { a: 0, b: 0, c: 0, d: 0, v: 1 };
  S.team = Array.isArray(S.team) && S.team.length ? S.team : [0]; S.ore = Object.assign({ stone: 0, copper: 0, iron: 0, gold: 0, diamond: 0 }, S.ore);
  S.done = S.done || {}; S.tried = S.tried || {}; S.obj = S.obj || {}; S.ach = S.ach || {}; S.bought = S.bought || []; S.dl = S.dl || { last: '', day: 0 };
  return S;
}
function commit(u, S) { u.save = S; u.rev = (u.rev | 0) + 1; u.arev = (u.arev | 0) + 1; u.updated = Date.now(); persist(); }
const cap = (v, n) => v + n > MAXBAL ? null : v + n;

function runCommand(line) {
  const t = line.replace(/^\//, '').split(/\s+/).filter(Boolean), cmd = (t.shift() || '').toLowerCase();
  const E = m => ({ ok: false, msg: m }), O = m => ({ ok: true, msg: m });
  if (cmd === 'help') return O(['Commands (player names are not case-sensitive):',
    '/give diamonds|coins|xp <player> <amount>', '/give character <player> <name>', '/give ore <player> <stone|copper|iron|gold|diamond> <amount>',
    '/remove coins|diamonds <player> <amount>', '/remove ore <player> <ore> <amount>', '/remove character <player> <name>',
    '/level <player> <level>', '/unlockmissions <player> <1-' + NM + '>', '/resetmissions <player>',
    '/player <player>', '/players [filter]', '/log [count]', '/help'].join('\n'));
  if (cmd === 'players') { const f = (t[0] || '').toLowerCase(), L = Object.values(DB.users).filter(u => u.name.toLowerCase().includes(f)).slice(0, 60).map(u => { const S = loadSave(u); return u.name + '  (Lv ' + S.l + ', ' + fmt(S.c) + ' coins, ' + fmt(S.d) + ' diamonds)'; }); return O(Object.keys(DB.users).length + ' accounts' + (f ? ' (filter: ' + f + ')' : '') + '\n' + L.join('\n')); }
  if (cmd === 'log') { const n = Math.min(50, Math.max(1, +t[0] || 10)); return O(DB.adminlog.slice(-n).map(e => new Date(e.t).toISOString().slice(0, 19).replace('T', ' ') + (e.ok ? '  OK   ' : '  FAIL ') + e.cmd).join('\n') || 'Log is empty.'); }
  if (cmd === 'player') {
    const f = findUser(t[0]); if (!f) return E('Player not found.');
    const u = f.user, S = loadSave(u), cleared = Object.keys(S.done).length;
    const heroes = Object.keys(S.own).map(Number).sort((x, y) => x - y).map(i => HEROES[i] + ' [' + RARITY[i] + '] Lv' + S.own[i].v + ' (DMG+' + S.own[i].a + ' RNG+' + S.own[i].b + ' SPD+' + S.own[i].c + ' ABL+' + S.own[i].d + ')');
    return O(['Player: ' + u.name + (u.role === 'admin' ? '  [ADMIN]' : ''), 'Created: ' + (u.created ? new Date(u.created).toISOString().slice(0, 10) : '?') + '   Last saved: ' + (u.updated ? new Date(u.updated).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never') + '   Save revision: ' + (u.rev | 0) + '   Admin updates: ' + (u.arev | 0),
      'Level ' + S.l + '  (XP ' + fmt(S.xp) + '/' + fmt(need(S.l)) + ')   Coins ' + fmt(S.c) + '   Diamonds ' + fmt(S.d) + '   Kills ' + fmt(S.kills),
      'Missions unlocked: ' + S.mis + '/' + NM + '   cleared: ' + cleared + '   attempted: ' + Object.keys(S.tried).length,
      'Characters (' + heroes.length + '/10):', ...heroes.map(x => '  - ' + x), 'Team: ' + S.team.map(i => HEROES[i]).join(', '),
      'Ores: ' + ORES.map(o => o + ' ' + fmt(S.ore[o] | 0)).join(', '), 'Achievements claimed: ' + Object.keys(S.ach).length + '   Fortify level: ' + (S.bh | 0) + '   Daily streak day: ' + (S.dl.day | 0)].join('\n'));
  }
  if (cmd === 'give' || cmd === 'remove') {
    const give = cmd === 'give', what = (t.shift() || '').toLowerCase();
    if (!['diamonds', 'coins', 'xp', 'character', 'ore'].includes(what) || (!give && what === 'xp')) return E('Usage: /' + cmd + ' ' + (give ? 'diamonds|coins|xp|character|ore' : 'diamonds|coins|character|ore') + ' <player> ...   (type /help)');
    const f = findUser(t.shift()); if (!f) return E('Player not found.');
    const u = f.user, S = loadSave(u);
    if (what === 'character') {
      const h = findHero(t.join(' ')); if (h.err) return E(h.err);
      if (give) { if (S.own[h.id]) return E(u.name + ' already owns ' + HEROES[h.id] + '.'); S.own[h.id] = { a: 0, b: 0, c: 0, d: 0, v: 1 }; if (S.team.length < 4) S.team.push(h.id); commit(u, S); return O('Gave ' + HEROES[h.id] + ' (' + RARITY[h.id] + ') to ' + u.name + '.'); }
      if (h.id === 0) return E('Killua Zoldyck is the starter hero and cannot be removed.');
      if (!S.own[h.id]) return E(u.name + ' does not own ' + HEROES[h.id] + '.');
      delete S.own[h.id]; S.team = S.team.filter(i => i !== h.id); if (!S.team.length) S.team = [0]; if (S.up === h.id) S.up = 0; commit(u, S); return O('Removed ' + HEROES[h.id] + ' from ' + u.name + '.');
    }
    let ore = null; if (what === 'ore') { ore = (t.shift() || '').toLowerCase().replace(/_?ore$/, ''); if (!ORES.includes(ore)) return E('Unknown ore. Use: ' + ORES.join(', ') + '.'); }
    const n = amount(t[0]); if (n === null) return E('Amount must be a whole number between 1 and ' + fmt(MAXAMT) + '.');
    if (t.length > 1) return E('Too many arguments. Type /help.');
    if (what === 'xp') {                                   // identical rules to the game: level-ups pay 100*level coins and 3 diamonds
      let lv = S.l, c = 0, d = 0; S.xp += n; while (S.xp >= need(S.l)) { S.xp -= need(S.l); S.l++; S.c += 100 * S.l; S.d += 3; c += 100 * S.l; d += 3; if (S.l > 5000) return E('Level too high.'); }
      if (S.c > MAXBAL || S.d > MAXBAL) return E('Result would exceed the balance limit.');
      commit(u, S); return O('Gave ' + fmt(n) + ' XP to ' + u.name + '. Level ' + lv + ' -> ' + S.l + (c ? ' (level-up rewards: +' + fmt(c) + ' coins, +' + d + ' diamonds)' : '') + '.');
    }
    const fld = what === 'coins' ? 'c' : what === 'diamonds' ? 'd' : null, hold = fld ? S : S.ore, key = fld || ore, label = fld ? what : ore + ' ore', old = hold[key] | 0;
    if (give) { const nv = cap(old, n); if (nv === null) return E('Result would exceed the balance limit.'); hold[key] = nv; commit(u, S); return O('Gave ' + fmt(n) + ' ' + label + ' to ' + u.name + '. Now: ' + fmt(nv) + '.'); }
    const rm = Math.min(old, n); hold[key] = old - rm; commit(u, S); return O('Removed ' + fmt(rm) + ' ' + label + ' from ' + u.name + (rm < n ? ' (they only had ' + fmt(old) + ')' : '') + '. Now: ' + fmt(hold[key]) + '.');
  }
  if (cmd === 'level') {
    const f = findUser(t[0]); if (!f) return E('Player not found.'); const n = /^\d{1,4}$/.test(t[1] || '') ? +t[1] : 0; if (n < 1 || n > 1000) return E('Level must be a whole number from 1 to 1000.');
    const S = loadSave(f.user), old = S.l; S.l = n; S.xp = 0; commit(f.user, S); return O(f.user.name + ' level: ' + old + ' -> ' + n + ' (XP reset to 0, no level-up rewards).');
  }
  if (cmd === 'unlockmissions') {
    const f = findUser(t[0]); if (!f) return E('Player not found.'); const n = /^\d{1,3}$/.test(t[1] || '') ? +t[1] : 0; if (n < 1 || n > NM) return E('Mission number must be 1 to ' + NM + '.');
    const S = loadSave(f.user), old = S.mis; S.mis = Math.max(S.mis, n); commit(f.user, S); return O(f.user.name + ' missions unlocked: ' + old + ' -> ' + S.mis + '/' + NM + '.');
  }
  if (cmd === 'resetmissions') {
    const f = findUser(t[0]); if (!f) return E('Player not found.'); const S = loadSave(f.user);
    S.mis = 1; S.sel = 0; S.done = {}; S.tried = {}; S.obj = {}; commit(f.user, S); return O('Mission progress reset for ' + f.user.name + ' (coins, diamonds, heroes and ores were not touched).');
  }
  return E('Unknown command "/' + cmd + '". Type /help.');
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
