'use strict';
/* MOON DEFENDERS backend core: accounts, sync and the admin console.
   Storage-agnostic: works on a normal Node server (file store) and on Vercel (Redis store). */
const crypto = require('crypto');
const NM = 25, MAXAMT = 1e9, MAXBAL = 1e12, SESSION_S = 30 * 86400, ELEVATE_MS = 30 * 60 * 1000, MAX_BODY = 400 * 1024, MAX_SAVE = 300 * 1024;
const HEROES = ['Killua Zoldyck', 'Tanjiro Kamado', 'Kakashi Hatake', 'Beerus', 'Yami Sukehiro', 'Monkey D. Luffy', 'Satoru Gojo', 'Shanks', 'Yhwach', 'Madara Uchiha'];
const RARITY = ['Common', 'Common', 'Rare', 'Rare', 'Epic', 'Epic', 'Legendary', 'Legendary', 'Mythic', 'Mythic'];
const ORES = ['stone', 'copper', 'iron', 'gold', 'diamond'];
const defSave = name => ({ c: 150, d: 10, xp: 0, l: 1, own: { 0: { a: 0, b: 0, c: 0, d: 0, v: 1 } }, team: [0], mis: 1, sel: 0, up: 0, kills: 0, bh: 0, dl: { last: '', day: 0 }, ach: {}, name, done: {}, tried: {}, prog: null, bought: [], ore: { stone: 0, copper: 0, iron: 0, gold: 0, diamond: 0 }, obj: {} });
const need = l => Math.floor(80 * Math.pow(l, 1.5));
const fmt = n => Number(n).toLocaleString('en-US');
class CmdErr extends Error {}
const th = t => crypto.createHash('sha256').update(t).digest('hex');
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => e ? no(e) : ok(k.toString('hex'))));
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const validName = u => typeof u === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(u);
const validPass = p => typeof p === 'string' && p.length >= 8 && p.length <= 64;
const validSave = s => s && typeof s === 'object' && !Array.isArray(s) && JSON.stringify(s).length <= MAX_SAVE;

function createApp(store, o = {}) {
  const ADMIN_USERS = new Set((o.adminUsers || 'anw4aar').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  const ADMIN_KEY = o.adminKey || '', ADMIN_ON = ADMIN_KEY.length >= 12, ORIGIN = o.origin || '', TRUST = !!o.trustProxy;
  if (!ADMIN_ON) console.warn('[admin] ADMIN_KEY is missing or shorter than 12 characters: the admin console is DISABLED.');
  const isAdminKey = k => ADMIN_USERS.has(k);
  const ipOf = req => (TRUST && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket && req.socket.remoteAddress || '?';
  const cors = () => ORIGIN ? { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' } : {};
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors() }); res.end(JSON.stringify(obj)); };
  const readBody = req => new Promise((ok, no) => {
    if (req.body !== undefined && req.body !== null) { try { ok(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString() || '{}') : req.body); } catch (e) { no(new Error('bad json')); } return; }
    let n = 0; const c = [];
    req.on('data', d => { n += d.length; if (n > MAX_BODY) { no(new Error('too big')); req.destroy(); } else c.push(d); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch (e) { no(new Error('bad json')); } });
    req.on('error', no);
  });
  const blocked = async k => (await store.hits(k)) >= 8;
  const fail = k => store.hit(k, 600);
  const newSession = async key => { const tok = crypto.randomBytes(32).toString('hex'); await store.putSession(th(tok), { u: key, t: Date.now() }, SESSION_S); return tok; };
  async function authed(req) {
    const m = /^Bearer (\w{64})$/.exec(req.headers.authorization || ''); if (!m) return null;
    const h = th(m[1]), sess = await store.getSession(h); if (!sess) return null;
    const user = await store.getUser(sess.u); if (!user) return null;
    if (Date.now() - (sess.r || sess.t || 0) > 36e5) { sess.r = Date.now(); await store.putSession(h, sess, SESSION_S); }
    return { key: sess.u, user, tok: h, sess };
  }
  const audit = (cmd, ok, ip, who) => store.pushLog({ t: Date.now(), who: who || '', cmd: String(cmd).slice(0, 300), ok: !!ok, ip });

  const handle = async (req, res, url) => {
    try { await route(req, res, url); } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { ok: false, error: 'Server error' }); }
  };

  async function route(req, res, url) {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }
    if (url === '/api/ping') {
      try { await store.ping(); } catch (e) { return send(res, 503, { ok: false, error: 'Database not reachable: ' + e.message }); }
      return send(res, 200, { ok: true, md: 1 });
    }
    let b = {};
    if (req.method === 'POST') { try { b = await readBody(req); } catch (e) { return send(res, 400, { ok: false, error: 'Bad request' }); } }
    if (url === '/api/register' && req.method === 'POST') {
      const u = b.username, p = b.password;
      if (!validName(u)) return send(res, 400, { ok: false, error: 'Username: 3-16 letters, numbers or underscores.' });
      if (!validPass(p)) return send(res, 400, { ok: false, error: 'Password must be 8-64 characters.' });
      if (b.save != null && !validSave(b.save)) return send(res, 400, { ok: false, error: 'Invalid save data.' });
      const key = u.toLowerCase();
      if (await store.getUser(key)) return send(res, 409, { ok: false, error: 'taken' });
      const salt = crypto.randomBytes(16).toString('hex'), hash = await scrypt(p, salt);
      const rec = { name: u, salt, hash, created: Date.now(), save: b.save || null, rev: b.save ? 1 : 0, arev: 0 };
      if (!(await store.createUser(key, rec))) return send(res, 409, { ok: false, error: 'taken' });   // atomic: only one registration can win a username
      return send(res, 200, { ok: true, token: await newSession(key), name: u, save: rec.save, rev: rec.rev, arev: 0 });
    }
    if (url === '/api/login' && req.method === 'POST') {
      const key = String(b.username || '').toLowerCase(), fk = ipOf(req) + '|' + key;
      if (await blocked(fk)) return send(res, 429, { ok: false, error: 'Too many attempts. Try again later.' });
      const u = await store.getUser(key), ok = u && typeof b.password === 'string' && same(await scrypt(b.password, u.salt), u.hash);
      if (!ok) { await fail(fk); return send(res, 401, { ok: false, error: 'Wrong username or password.' }); }
      await store.clearHits(fk);
      return send(res, 200, { ok: true, token: await newSession(key), name: u.name, save: u.save, rev: u.rev, arev: u.arev | 0 });
    }
    const a = await authed(req);
    if (!a) return send(res, 401, { ok: false, error: 'Not logged in.' });
    if (url === '/api/me') return send(res, 200, { ok: true, name: a.user.name, save: a.user.save, rev: a.user.rev, arev: a.user.arev | 0 });
    if (url === '/api/save' && req.method === 'POST') {
      if (!validSave(b.save)) return send(res, 400, { ok: false, error: 'Invalid save data.' });
      const r = await store.mutate(a.key, u => {
        if ((b.arev | 0) !== (u.arev | 0)) return [null, { code: 409, body: { ok: false, error: 'admin-update', admin: true, save: u.save, rev: u.rev, arev: u.arev | 0 } }];   // never overwrite an admin change
        if (!b.force && (b.base | 0) !== (u.rev | 0)) return [null, { code: 409, body: { ok: false, error: 'conflict', save: u.save, rev: u.rev } }];
        u.save = b.save; u.rev = (u.rev | 0) + 1; u.updated = Date.now();
        return [u, { code: 200, body: { ok: true, rev: u.rev } }];
      });
      return send(res, r.code, r.body);
    }
    if (url === '/api/logout' && req.method === 'POST') { await store.delSession(a.tok); return send(res, 200, { ok: true }); }
    if (url.startsWith('/api/admin/')) return adminApi(req, res, url, a, b);
    send(res, 404, { ok: false, error: 'Not found' });
  }

  async function adminApi(req, res, url, a, b) {
    const ip = ipOf(req), admin = ADMIN_ON && isAdminKey(a.key);
    if (!admin) {                                          // every admin route: non-admins are refused, whatever they send
      if (url === '/api/admin/status') return send(res, 200, { ok: true, admin: false });
      await audit('(denied) ' + a.user.name + ' tried ' + url, false, ip);
      return send(res, 403, { ok: false, error: 'Forbidden' });
    }
    const sess = a.sess, unlocked = !!(sess.adm && sess.adm > Date.now());
    if (url === '/api/admin/status') return send(res, 200, { ok: true, admin: true, unlocked });
    if (url === '/api/admin/unlock' && req.method === 'POST') {
      const fk = 'adm|' + a.key + '|' + ip;
      if (await blocked(fk)) return send(res, 429, { ok: false, error: 'Too many attempts. Try again later.' });
      const x = crypto.createHash('sha256').update(String(b.key || '')).digest(), y = crypto.createHash('sha256').update(ADMIN_KEY).digest();
      if (!crypto.timingSafeEqual(x, y)) { await fail(fk); await audit('(failed admin unlock) ' + a.user.name, false, ip); return send(res, 401, { ok: false, error: 'Wrong admin key.' }); }
      await store.clearHits(fk); sess.adm = Date.now() + ELEVATE_MS; await store.putSession(a.tok, sess, SESSION_S); await audit('(admin console unlocked)', true, ip);
      return send(res, 200, { ok: true });
    }
    if (!unlocked) return send(res, 403, { ok: false, error: 'Admin console is locked.', locked: true });
    sess.adm = Date.now() + ELEVATE_MS; await store.putSession(a.tok, sess, SESSION_S);   // sliding 30 minute window
    if (url === '/api/admin/lock' && req.method === 'POST') { delete sess.adm; await store.putSession(a.tok, sess, SESSION_S); return send(res, 200, { ok: true }); }
    if (url === '/api/admin/history') return send(res, 200, { ok: true, history: await store.getLog(60) });
    if (url === '/api/admin/run' && req.method === 'POST') {
      const line = String(b.command || '').trim().slice(0, 300);
      if (!line) return send(res, 400, { ok: false, error: 'Empty command.' });
      let r; try { r = await runCommand(line); } catch (e) { if (e instanceof CmdErr) r = { ok: false, msg: e.message }; else { console.error(e); r = { ok: false, msg: 'Internal error while running the command.' }; } }
      await audit(line, r.ok, ip, a.user.name);
      return send(res, r.ok ? 200 : 400, r.ok ? { ok: true, msg: r.msg } : { ok: false, error: r.msg });
    }
    send(res, 404, { ok: false, error: 'Not found' });
  }

  const amount = v => (/^\d{1,10}$/.test(v || '') && +v > 0 && +v <= MAXAMT) ? +v : null;
  async function findUser(n) { const k = String(n || '').toLowerCase(); if (!validName(n)) return null; const user = await store.getUser(k); return user ? { key: k, user } : null; }
  function findHero(q) {
    q = q.trim().toLowerCase(); if (!q) throw new CmdErr('Missing character name.');
    if (/^\d$/.test(q)) return +q;
    let m = HEROES.map((n, i) => [n.toLowerCase(), i]).filter(([n]) => n === q);
    if (!m.length) m = HEROES.map((n, i) => [n.toLowerCase(), i]).filter(([n]) => n.includes(q));
    if (m.length === 1) return m[0][1];
    throw new CmdErr(m.length ? 'Ambiguous name, matches: ' + m.map(x => HEROES[x[1]]).join(', ') : 'Unknown character. Valid: ' + HEROES.join(', '));
  }
  function loadSave(u) {
    const S = Object.assign(defSave(u.name), u.save && typeof u.save === 'object' ? u.save : {});
    S.own = S.own || {}; if (!S.own[0]) S.own[0] = { a: 0, b: 0, c: 0, d: 0, v: 1 };
    S.team = Array.isArray(S.team) && S.team.length ? S.team : [0]; S.ore = Object.assign({ stone: 0, copper: 0, iron: 0, gold: 0, diamond: 0 }, S.ore);
    S.done = S.done || {}; S.tried = S.tried || {}; S.obj = S.obj || {}; S.ach = S.ach || {}; S.bought = S.bought || []; S.dl = S.dl || { last: '', day: 0 };
    return S;
  }
  /* edit a player's save atomically: op(S) changes it and returns the success message */
  const edit = (f, op) => store.mutate(f.key, u => { const S = loadSave(u), msg = op(S, u); u.save = S; u.rev = (u.rev | 0) + 1; u.arev = (u.arev | 0) + 1; u.updated = Date.now(); return [u, msg]; });

  async function runCommand(line) {
    const t = line.replace(/^\//, '').split(/\s+/).filter(Boolean), cmd = (t.shift() || '').toLowerCase(), O = m => ({ ok: true, msg: m });
    if (cmd === 'help') return O(['Commands (player names are not case-sensitive):',
      '/give diamonds|coins|xp <player> <amount>', '/give character <player> <name>', '/give ore <player> <stone|copper|iron|gold|diamond> <amount>',
      '/remove coins|diamonds <player> <amount>', '/remove ore <player> <ore> <amount>', '/remove character <player> <name>',
      '/level <player> <level>', '/unlockmissions <player> <1-' + NM + '>', '/resetmissions <player>',
      '/player <player>', '/players [filter]', '/log [count]', '/help'].join('\n'));
    if (cmd === 'players') {
      const f = (t[0] || '').toLowerCase(), all = await store.listUsers(), keys = all.filter(k => k.includes(f)).sort().slice(0, 60), us = await store.getUsers(keys);
      return O(all.length + ' accounts' + (f ? ' (filter: ' + f + ')' : '') + '\n' + us.filter(Boolean).map(u => { const S = loadSave(u); return u.name + '  (Lv ' + S.l + ', ' + fmt(S.c) + ' coins, ' + fmt(S.d) + ' diamonds)'; }).join('\n'));
    }
    if (cmd === 'log') { const n = Math.min(50, Math.max(1, +t[0] || 10)), L = await store.getLog(n); return O(L.map(e => new Date(e.t).toISOString().slice(0, 19).replace('T', ' ') + (e.ok ? '  OK   ' : '  FAIL ') + e.cmd).join('\n') || 'Log is empty.'); }
    if (cmd === 'player') {
      const f = await findUser(t[0]); if (!f) throw new CmdErr('Player not found.');
      const u = f.user, S = loadSave(u), cleared = Object.keys(S.done).length;
      const heroes = Object.keys(S.own).map(Number).sort((x, y) => x - y).map(i => HEROES[i] + ' [' + RARITY[i] + '] Lv' + S.own[i].v + ' (DMG+' + S.own[i].a + ' RNG+' + S.own[i].b + ' SPD+' + S.own[i].c + ' ABL+' + S.own[i].d + ')');
      return O(['Player: ' + u.name + (isAdminKey(f.key) ? '  [ADMIN]' : ''), 'Created: ' + (u.created ? new Date(u.created).toISOString().slice(0, 10) : '?') + '   Last saved: ' + (u.updated ? new Date(u.updated).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never') + '   Save revision: ' + (u.rev | 0) + '   Admin updates: ' + (u.arev | 0),
        'Level ' + S.l + '  (XP ' + fmt(S.xp) + '/' + fmt(need(S.l)) + ')   Coins ' + fmt(S.c) + '   Diamonds ' + fmt(S.d) + '   Kills ' + fmt(S.kills),
        'Missions unlocked: ' + S.mis + '/' + NM + '   cleared: ' + cleared + '   attempted: ' + Object.keys(S.tried).length,
        'Characters (' + heroes.length + '/10):', ...heroes.map(x => '  - ' + x), 'Team: ' + S.team.map(i => HEROES[i]).join(', '),
        'Ores: ' + ORES.map(x => x + ' ' + fmt(S.ore[x] | 0)).join(', '), 'Achievements claimed: ' + Object.keys(S.ach).length + '   Fortify level: ' + (S.bh | 0) + '   Daily streak day: ' + (S.dl.day | 0)].join('\n'));
    }
    if (cmd === 'give' || cmd === 'remove') {
      const give = cmd === 'give', what = (t.shift() || '').toLowerCase();
      if (!['diamonds', 'coins', 'xp', 'character', 'ore'].includes(what) || (!give && what === 'xp')) throw new CmdErr('Usage: /' + cmd + ' ' + (give ? 'diamonds|coins|xp|character|ore' : 'diamonds|coins|character|ore') + ' <player> ...   (type /help)');
      const f = await findUser(t.shift()); if (!f) throw new CmdErr('Player not found.');
      if (what === 'character') {
        const id = findHero(t.join(' '));
        if (give) return O(await edit(f, (S, u) => { if (S.own[id]) throw new CmdErr(u.name + ' already owns ' + HEROES[id] + '.'); S.own[id] = { a: 0, b: 0, c: 0, d: 0, v: 1 }; if (S.team.length < 4) S.team.push(id); return 'Gave ' + HEROES[id] + ' (' + RARITY[id] + ') to ' + u.name + '.'; }));
        if (id === 0) throw new CmdErr('Killua Zoldyck is the starter hero and cannot be removed.');
        return O(await edit(f, (S, u) => { if (!S.own[id]) throw new CmdErr(u.name + ' does not own ' + HEROES[id] + '.'); delete S.own[id]; S.team = S.team.filter(i => i !== id); if (!S.team.length) S.team = [0]; if (S.up === id) S.up = 0; return 'Removed ' + HEROES[id] + ' from ' + u.name + '.'; }));
      }
      let ore = null; if (what === 'ore') { ore = (t.shift() || '').toLowerCase().replace(/_?ore$/, ''); if (!ORES.includes(ore)) throw new CmdErr('Unknown ore. Use: ' + ORES.join(', ') + '.'); }
      const n = amount(t[0]); if (n === null) throw new CmdErr('Amount must be a whole number between 1 and ' + fmt(MAXAMT) + '.');
      if (t.length > 1) throw new CmdErr('Too many arguments. Type /help.');
      if (what === 'xp') return O(await edit(f, (S, u) => {   // same rules as the game: each level-up pays 100*level coins and 3 diamonds
        const lv = S.l; let c = 0, d = 0; S.xp += n; while (S.xp >= need(S.l)) { S.xp -= need(S.l); S.l++; S.c += 100 * S.l; S.d += 3; c += 100 * S.l; d += 3; if (S.l > 5000) throw new CmdErr('Level too high.'); }
        if (S.c > MAXBAL || S.d > MAXBAL) throw new CmdErr('Result would exceed the balance limit.');
        return 'Gave ' + fmt(n) + ' XP to ' + u.name + '. Level ' + lv + ' -> ' + S.l + (c ? ' (level-up rewards: +' + fmt(c) + ' coins, +' + d + ' diamonds)' : '') + '.';
      }));
      const fld = what === 'coins' ? 'c' : what === 'diamonds' ? 'd' : null, label = fld ? what : ore + ' ore';
      return O(await edit(f, (S, u) => {
        const hold = fld ? S : S.ore, key = fld || ore, old = hold[key] | 0;
        if (give) { if (old + n > MAXBAL) throw new CmdErr('Result would exceed the balance limit.'); hold[key] = old + n; return 'Gave ' + fmt(n) + ' ' + label + ' to ' + u.name + '. Now: ' + fmt(hold[key]) + '.'; }
        const rm = Math.min(old, n); hold[key] = old - rm; return 'Removed ' + fmt(rm) + ' ' + label + ' from ' + u.name + (rm < n ? ' (they only had ' + fmt(old) + ')' : '') + '. Now: ' + fmt(hold[key]) + '.';
      }));
    }
    if (cmd === 'level') {
      const f = await findUser(t[0]); if (!f) throw new CmdErr('Player not found.'); const n = /^\d{1,4}$/.test(t[1] || '') ? +t[1] : 0; if (n < 1 || n > 1000) throw new CmdErr('Level must be a whole number from 1 to 1000.');
      return O(await edit(f, (S, u) => { const old = S.l; S.l = n; S.xp = 0; return u.name + ' level: ' + old + ' -> ' + n + ' (XP reset to 0, no level-up rewards).'; }));
    }
    if (cmd === 'unlockmissions') {
      const f = await findUser(t[0]); if (!f) throw new CmdErr('Player not found.'); const n = /^\d{1,3}$/.test(t[1] || '') ? +t[1] : 0; if (n < 1 || n > NM) throw new CmdErr('Mission number must be 1 to ' + NM + '.');
      return O(await edit(f, (S, u) => { const old = S.mis; S.mis = Math.max(S.mis, n); return u.name + ' missions unlocked: ' + old + ' -> ' + S.mis + '/' + NM + '.'; }));
    }
    if (cmd === 'resetmissions') {
      const f = await findUser(t[0]); if (!f) throw new CmdErr('Player not found.');
      return O(await edit(f, (S, u) => { S.mis = 1; S.sel = 0; S.done = {}; S.tried = {}; S.obj = {}; return 'Mission progress reset for ' + u.name + ' (coins, diamonds, heroes and ores were not touched).'; }));
    }
    throw new CmdErr('Unknown command "/' + cmd + '". Type /help.');
  }
  return handle;
}
module.exports = { createApp };
