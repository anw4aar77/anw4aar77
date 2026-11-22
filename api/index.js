'use strict';
const crypto = require('crypto');

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/^["']+|["']+$/g, '');
const REDIS_TOK = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim().replace(/^["']+|["']+$/g, '');
const ADMIN_USERS = new Set((process.env.ADMIN_USERS || 'anw4aar').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const ADMIN_ON = ADMIN_KEY.length >= 12;
const ELEVATE_MS = 30 * 60 * 1000;
const SESSION_MS = 30 * 864e5;
const MAX_SAVE = 300 * 1024;
const NM = 25, MAXAMT = 1e9, MAXBAL = 1e12;
const HEROES = ['Killua Zoldyck', 'Tanjiro Kamado', 'Kakashi Hatake', 'Beerus', 'Yami Sukehiro', 'Monkey D. Luffy', 'Satoru Gojo', 'Shanks', 'Yhwach', 'Madara Uchiha'];
const RARITY = ['Common', 'Common', 'Rare', 'Rare', 'Epic', 'Epic', 'Legendary', 'Legendary', 'Mythic', 'Mythic'];
const ORES = ['stone', 'copper', 'iron', 'gold', 'diamond'];

async function redis(cmd, ...args) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOK, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args])
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function getJson(k) {
  const v = await redis('GET', k);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}
async function setJson(k, v, ttlSec) {
  if (ttlSec) return redis('SET', k, JSON.stringify(v), 'EX', String(ttlSec));
  return redis('SET', k, JSON.stringify(v));
}

const defSave = name => ({ c: 150, d: 10, xp: 0, l: 1, own: { 0: { a: 0, b: 0, c: 0, d: 0, v: 1 } }, team: [0], mis: 1, sel: 0, up: 0, kills: 0, bh: 0, dl: { last: '', day: 0 }, ach: {}, name, done: {}, tried: {}, prog: null, bought: [], ore: { stone: 0, copper: 0, iron: 0, gold: 0, diamond: 0 }, obj: {}, fr: { s: 0, m: 0, ch: 0, h: {} }, evo: {} });
const need = l => Math.floor(80 * Math.pow(l, 1.5));
const th = t => crypto.createHash('sha256').update(t).digest('hex');
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => e ? no(e) : ok(k.toString('hex'))));
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const validName = u => typeof u === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(u);
const validPass = p => typeof p === 'string' && p.length >= 8 && p.length <= 64;
const validSave = s => s && typeof s === 'object' && !Array.isArray(s) && JSON.stringify(s).length <= MAX_SAVE;
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };

async function newSession(key) {
  const tok = crypto.randomBytes(32).toString('hex');
  await setJson('sess:' + th(tok), { u: key, exp: Date.now() + SESSION_MS }, Math.floor(SESSION_MS / 1000));
  return tok;
}
async function authed(req) {
  const m = /^Bearer (\w{64})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const tokHash = th(m[1]);
  const s = await getJson('sess:' + tokHash);
  if (!s || s.exp < Date.now()) return null;
  const u = await getJson('user:' + s.u);
  if (!u) return null;
  if (ADMIN_USERS.has(s.u)) u.role = 'admin';
  return { key: s.u, user: u, tok: tokHash, sess: s };
}
async function audit(cmd, ok, ip, who) {
  await redis('LPUSH', 'adminlog', JSON.stringify({ t: Date.now(), who: who || '', cmd: cmd.slice(0, 300), ok: !!ok, ip }));
  await redis('LTRIM', 'adminlog', '0', '999');
}

const fmt = n => Number(n).toLocaleString('en-US');
const amount = v => (/^\d{1,10}$/.test(v || '') && +v > 0 && +v <= MAXAMT) ? +v : null;
const cap = (v, n) => v + n > MAXBAL ? null : v + n;
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
  S.team = Array.isArray(S.team) && S.team.length ? S.team : [0];
  S.ore = Object.assign({ stone: 0, copper: 0, iron: 0, gold: 0, diamond: 0 }, S.ore);
  S.done = S.done || {}; S.tried = S.tried || {}; S.obj = S.obj || {}; S.ach = S.ach || {}; S.bought = S.bought || []; S.dl = S.dl || { last: '', day: 0 };
  S.fr = Object.assign({ s: 0, m: 0, ch: 0 }, S.fr && typeof S.fr === 'object' ? S.fr : {}); S.fr.h = S.fr.h && typeof S.fr.h === 'object' ? S.fr.h : {};
  S.evo = S.evo && typeof S.evo === 'object' ? S.evo : {};
  return S;
}
async function commit(key, u, S) {
  u.save = S; u.rev = (u.rev | 0) + 1; u.arev = (u.arev | 0) + 1; u.updated = Date.now();
  await setJson('user:' + key, u);
}

async function runCommand(line) {
  const t = line.replace(/^\//, '').split(/\s+/).filter(Boolean), cmd = (t.shift() || '').toLowerCase();
  const E = m => ({ ok: false, msg: m }), O = m => ({ ok: true, msg: m });
  if (cmd === 'help') return O(['Commands:', '/give diamonds|coins|xp <player> <amount>', '/give character <player> <name>', '/give fragments <player> <star|moon|chest|character name> <amount>', '/remove fragments <player> <star|moon|chest|character name> <amount>', '/setevo <player> <character name> <0-5>', '/give ore <player> <stone|copper|iron|gold|diamond> <amount>', '/remove coins|diamonds <player> <amount>', '/remove ore <player> <ore> <amount>', '/remove character <player> <name>', '/level <player> <level>', '/unlockmissions <player> <1-' + NM + '>', '/resetmissions <player>', '/player <player>', '/players [filter]', '/log [count]', '/help'].join('\n'));
  if (cmd === 'players') {
    const f = (t[0] || '').toLowerCase();
    const keys = (await redis('SMEMBERS', 'users')) || [];
    const matched = keys.filter(k => k.includes(f)).slice(0, 60);
    const lines = [];
    for (const k of matched) {
      const u = await getJson('user:' + k);
      if (u) { const S = loadSave(u); lines.push(u.name + '  (Lv ' + S.l + ', ' + fmt(S.c) + ' coins, ' + fmt(S.d) + ' diamonds)'); }
    }
    return O(keys.length + ' accounts' + (f ? ' (filter: ' + f + ')' : '') + '\n' + lines.join('\n'));
  }
  if (cmd === 'log') {
    const n = Math.min(50, Math.max(1, +t[0] || 10));
    const raw = (await redis('LRANGE', 'adminlog', '0', String(n - 1))) || [];
    const rows = raw.map(x => JSON.parse(x)).reverse().map(e => new Date(e.t).toISOString().slice(0, 19).replace('T', ' ') + (e.ok ? '  OK   ' : '  FAIL ') + e.cmd);
    return O(rows.join('\n') || 'Log is empty.');
  }
  if (cmd === 'player') {
    const k = String(t[0] || '').toLowerCase(), u = await getJson('user:' + k);
    if (!u) return E('Player not found.');
    const S = loadSave(u), cleared = Object.keys(S.done).length;
    const heroes = Object.keys(S.own).map(Number).sort((x, y) => x - y).map(i => HEROES[i] + ' [' + RARITY[i] + '] Lv' + S.own[i].v + ' (DMG+' + S.own[i].a + ' RNG+' + S.own[i].b + ' SPD+' + S.own[i].c + ' ABL+' + S.own[i].d + ')' + (S.evo[i] ? ' Evo ' + S.evo[i] + '/5' : '') + (S.fr.h[i] ? ' [' + S.fr.h[i] + ' fragments]' : ''));
    return O(['Player: ' + u.name + (ADMIN_USERS.has(k) ? '  [ADMIN]' : ''), 'Level ' + S.l + '  (XP ' + fmt(S.xp) + '/' + fmt(need(S.l)) + ')   Coins ' + fmt(S.c) + '   Diamonds ' + fmt(S.d) + '   Kills ' + fmt(S.kills), 'Missions unlocked: ' + S.mis + '/' + NM + '   cleared: ' + cleared, 'Characters (' + heroes.length + '/10):', ...heroes.map(x => '  - ' + x), 'Team: ' + S.team.map(i => HEROES[i]).join(', '), 'Ores: ' + ORES.map(o => o + ' ' + fmt(S.ore[o] | 0)).join(', '), 'Fragments: star ' + fmt(S.fr.s | 0) + ', moon ' + fmt(S.fr.m | 0) + ', chests ' + fmt(S.fr.ch | 0)].join('\n'));
  }
  if (cmd === 'give' || cmd === 'remove') {
    const give = cmd === 'give', what = (t.shift() || '').toLowerCase();
    if (!['diamonds', 'coins', 'xp', 'character', 'ore', 'fragments'].includes(what) || (!give && what === 'xp')) return E('Invalid usage. Type /help');
    const k = String(t.shift() || '').toLowerCase(), u = await getJson('user:' + k);
    if (!u) return E('Player not found.');
    const S = loadSave(u);
    if (what === 'fragments') {
      const typ = t.slice(0, -1).join(' ').toLowerCase(), n = amount(t[t.length - 1]);
      if (!typ || n === null) return E('Usage: /' + cmd + ' fragments <player> <star|moon|chest|character name> <amount>');
      let hold, key, label;
      if (typ === 'star' || typ === 'stars') { hold = S.fr; key = 's'; label = 'Star Fragments'; }
      else if (typ === 'moon' || typ === 'moons') { hold = S.fr; key = 'm'; label = 'Moon Fragments'; }
      else if (typ === 'chest' || typ === 'chests') { hold = S.fr; key = 'ch'; label = 'treasure chests'; }
      else { const h = findHero(typ); if (h.err) return E(h.err); hold = S.fr.h; key = h.id; label = HEROES[h.id] + ' Fragments'; }
      const old = hold[key] | 0;
      if (give) { const nv = cap(old, n); if (nv === null) return E('Exceeds balance limit.'); hold[key] = nv; await commit(k, u, S); return O('Gave ' + fmt(n) + ' ' + label + ' to ' + u.name + '. Now: ' + fmt(nv) + '.'); }
      const rm = Math.min(old, n); hold[key] = old - rm; await commit(k, u, S); return O('Removed ' + fmt(rm) + ' ' + label + ' from ' + u.name + '. Now: ' + fmt(hold[key]) + '.');
    }
    if (what === 'character') {
      const h = findHero(t.join(' ')); if (h.err) return E(h.err);
      if (give) { if (S.own[h.id]) return E(u.name + ' already owns ' + HEROES[h.id] + '.'); S.own[h.id] = { a: 0, b: 0, c: 0, d: 0, v: 1 }; if (S.team.length < 4) S.team.push(h.id); await commit(k, u, S); return O('Gave ' + HEROES[h.id] + ' to ' + u.name + '.'); }
      if (h.id === 0) return E('Starter hero cannot be removed.');
      if (!S.own[h.id]) return E(u.name + ' does not own ' + HEROES[h.id] + '.');
      delete S.own[h.id]; delete S.evo[h.id]; S.team = S.team.filter(i => i !== h.id); if (!S.team.length) S.team = [0]; if (S.up === h.id) S.up = 0; await commit(k, u, S); return O('Removed ' + HEROES[h.id] + ' from ' + u.name + '.');
    }
    let ore = null;
    if (what === 'ore') { ore = (t.shift() || '').toLowerCase().replace(/_?ore$/, ''); if (!ORES.includes(ore)) return E('Unknown ore.'); }
    const n = amount(t[0]); if (n === null) return E('Invalid amount.');
    if (what === 'xp') {
      let lv = S.l, c = 0, d = 0; S.xp += n;
      while (S.xp >= need(S.l)) { S.xp -= need(S.l); S.l++; S.c += 100 * S.l; S.d += 3; c += 100 * S.l; d += 3; if (S.l > 5000) return E('Level too high.'); }
      await commit(k, u, S); return O('Gave ' + fmt(n) + ' XP to ' + u.name + '. Level ' + lv + ' -> ' + S.l + '.');
    }
    const fld = what === 'coins' ? 'c' : what === 'diamonds' ? 'd' : null, hold = fld ? S : S.ore, key = fld || ore, label = fld ? what : ore + ' ore', old = hold[key] | 0;
    if (give) { const nv = cap(old, n); if (nv === null) return E('Exceeds balance limit.'); hold[key] = nv; await commit(k, u, S); return O('Gave ' + fmt(n) + ' ' + label + ' to ' + u.name + '. Now: ' + fmt(nv) + '.'); }
    const rm = Math.min(old, n); hold[key] = old - rm; await commit(k, u, S); return O('Removed ' + fmt(rm) + ' ' + label + ' from ' + u.name + '. Now: ' + fmt(hold[key]) + '.');
  }
  if (cmd === 'setevo') {
    const k = String(t.shift() || '').toLowerCase(), u = await getJson('user:' + k); if (!u) return E('Player not found.');
    const stage = t.pop(); if (!/^[0-5]$/.test(stage || '')) return E('Evolution stage must be 0-5.');
    const h = findHero(t.join(' ')); if (h.err) return E(h.err);
    const S = loadSave(u); if (!S.own[h.id]) return E(u.name + ' does not own ' + HEROES[h.id] + '.');
    const old = S.evo[h.id] | 0; if (+stage) S.evo[h.id] = +stage; else delete S.evo[h.id];
    await commit(k, u, S); return O(HEROES[h.id] + ' evolution for ' + u.name + ': ' + old + ' -> ' + (+stage) + '.');
  }
  if (cmd === 'level') {
    const k = String(t[0] || '').toLowerCase(), u = await getJson('user:' + k); if (!u) return E('Player not found.');
    const n = /^\d{1,4}$/.test(t[1] || '') ? +t[1] : 0; if (n < 1 || n > 1000) return E('Level 1-1000.');
    const S = loadSave(u), old = S.l; S.l = n; S.xp = 0; await commit(k, u, S); return O(u.name + ' level: ' + old + ' -> ' + n + '.');
  }
  if (cmd === 'unlockmissions') {
    const k = String(t[0] || '').toLowerCase(), u = await getJson('user:' + k); if (!u) return E('Player not found.');
    const n = /^\d{1,3}$/.test(t[1] || '') ? +t[1] : 0; if (n < 1 || n > NM) return E('Mission 1-' + NM + '.');
    const S = loadSave(u), old = S.mis; S.mis = Math.max(S.mis, n); await commit(k, u, S); return O(u.name + ' missions: ' + old + ' -> ' + S.mis + '/' + NM + '.');
  }
  if (cmd === 'resetmissions') {
    const k = String(t[0] || '').toLowerCase(), u = await getJson('user:' + k); if (!u) return E('Player not found.');
    const S = loadSave(u); S.mis = 1; S.sel = 0; S.done = {}; S.tried = {}; S.obj = {}; await commit(k, u, S); return O('Missions reset for ' + u.name + '.');
  }
  return E('Unknown command. Type /help.');
}

module.exports = async (req, res) => {
  try {
    if (!REDIS_URL || !REDIS_TOK) return send(res, 500, { ok: false, error: 'Database not configured on Vercel.' });
    const url = req.url.split('?')[0];
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '?';
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (url === '/api/ping') return send(res, 200, { ok: true, md: 1 });

    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b || '{}'); } catch { return send(res, 400, { ok: false, error: 'Bad JSON' }); } }

    if (url === '/api/register' && req.method === 'POST') {
      const u = String(b.username || '').trim(), p = b.password;
      if (!validName(u)) return send(res, 400, { ok: false, error: 'Username: 3-16 letters, numbers or underscores.' });
      if (!validPass(p)) return send(res, 400, { ok: false, error: 'Password must be 8-64 characters.' });
      if (b.save != null && !validSave(b.save)) return send(res, 400, { ok: false, error: 'Invalid save data.' });
      const key = u.toLowerCase();
      const salt = crypto.randomBytes(16).toString('hex'), hash = await scrypt(p, salt);
      const userObj = { name: u, salt, hash, created: Date.now(), save: b.save || null, rev: b.save ? 1 : 0, arev: 0 };
      if (ADMIN_USERS.has(key)) userObj.role = 'admin';
      // Atomic SET NX: impossible to register the same username twice from two devices
      const created = await redis('SET', 'user:' + key, JSON.stringify(userObj), 'NX');
      if (!created) return send(res, 409, { ok: false, error: 'taken' });
      await redis('SADD', 'users', key);
      const tok = await newSession(key);
      return send(res, 200, { ok: true, token: tok, name: u, save: userObj.save, rev: userObj.rev, arev: 0 });
    }

    if (url === '/api/login' && req.method === 'POST') {
      const key = String(b.username || '').trim().toLowerCase();
      const u = await getJson('user:' + key);
      const ok = u && typeof b.password === 'string' && same(await scrypt(b.password, u.salt), u.hash);
      if (!ok) return send(res, 401, { ok: false, error: 'Wrong username or password.' });
      const tok = await newSession(key);
      return send(res, 200, { ok: true, token: tok, name: u.name, save: u.save, rev: u.rev, arev: u.arev | 0 });
    }

    const a = await authed(req);
    if (!a) return send(res, 401, { ok: false, error: 'Not logged in.' });

    if (url === '/api/me') return send(res, 200, { ok: true, name: a.user.name, save: a.user.save, rev: a.user.rev, arev: a.user.arev | 0 });

    if (url === '/api/save' && req.method === 'POST') {
      if (!validSave(b.save)) return send(res, 400, { ok: false, error: 'Invalid save data.' });
      if ((b.arev | 0) !== (a.user.arev | 0)) return send(res, 409, { ok: false, error: 'admin-update', admin: true, save: a.user.save, rev: a.user.rev, arev: a.user.arev | 0 });
      if (!b.force && (b.base | 0) !== a.user.rev) return send(res, 409, { ok: false, error: 'conflict', save: a.user.save, rev: a.user.rev });
      a.user.save = b.save; a.user.rev++; a.user.updated = Date.now();
      await setJson('user:' + a.key, a.user);
      return send(res, 200, { ok: true, rev: a.user.rev });
    }

    if (url === '/api/logout' && req.method === 'POST') {
      await redis('DEL', 'sess:' + a.tok);
      return send(res, 200, { ok: true });
    }

    if (url.startsWith('/api/admin/')) {
      const isAdmin = ADMIN_ON && ADMIN_USERS.has(a.key) && a.user.role === 'admin';
      if (!isAdmin) {
        if (url === '/api/admin/status') return send(res, 200, { ok: true, admin: false });
        return send(res, 403, { ok: false, error: 'Forbidden' });
      }
      const unlocked = !!(a.sess && a.sess.adm && a.sess.adm > Date.now());
      if (url === '/api/admin/status') return send(res, 200, { ok: true, admin: true, unlocked });
      if (url === '/api/admin/unlock' && req.method === 'POST') {
        const x = crypto.createHash('sha256').update(String(b.key || '')).digest(), y = crypto.createHash('sha256').update(ADMIN_KEY).digest();
        if (!crypto.timingSafeEqual(x, y)) return send(res, 401, { ok: false, error: 'Wrong admin key.' });
        a.sess.adm = Date.now() + ELEVATE_MS;
        await setJson('sess:' + a.tok, a.sess, Math.floor(SESSION_MS / 1000));
        await audit('(admin console unlocked)', true, ip, a.user.name);
        return send(res, 200, { ok: true });
      }
      if (!unlocked) return send(res, 403, { ok: false, error: 'Admin console is locked.', locked: true });
      a.sess.adm = Date.now() + ELEVATE_MS;
      await setJson('sess:' + a.tok, a.sess, Math.floor(SESSION_MS / 1000));
      if (url === '/api/admin/lock' && req.method === 'POST') {
        delete a.sess.adm;
        await setJson('sess:' + a.tok, a.sess, Math.floor(SESSION_MS / 1000));
        return send(res, 200, { ok: true });
      }
      if (url === '/api/admin/history') {
        const raw = (await redis('LRANGE', 'adminlog', '0', '59')) || [];
        return send(res, 200, { ok: true, history: raw.map(x => JSON.parse(x)).reverse() });
      }
      if (url === '/api/admin/run' && req.method === 'POST') {
        const line = String(b.command || '').trim().slice(0, 300);
        if (!line) return send(res, 400, { ok: false, error: 'Empty command.' });
        const r = await runCommand(line);
        await audit(line, r.ok, ip, a.user.name);
        return send(res, r.ok ? 200 : 400, r.ok ? { ok: true, msg: r.msg } : { ok: false, error: r.msg });
      }
    }
    return send(res, 404, { ok: false, error: 'Not found' });
 } catch (e) {
    console.error(e);
    return send(res, 500, { ok: false, error: (e && e.message) || 'Server error' });
  }
};