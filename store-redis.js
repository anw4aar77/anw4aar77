'use strict';
/* Redis store over the Upstash/Vercel KV REST API (no dependencies). Works on Vercel serverless functions. */
module.exports = function redisStore(url, token) {
  const P = 'md:';
  const cmd = async a => {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status)); return j.result;
  };
  const CAS = "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]) return 1 end return 0";
  const parse = v => v ? JSON.parse(v) : null;
  return {
    ping: async () => { if (await cmd(['PING']) !== 'PONG') throw new Error('bad reply'); },
    getUser: async k => parse(await cmd(['GET', P + 'u:' + k])),
    getUsers: async keys => keys.length ? (await cmd(['MGET', ...keys.map(k => P + 'u:' + k)])).map(parse) : [],
    createUser: async (k, u) => { if (await cmd(['SET', P + 'u:' + k, JSON.stringify(u), 'NX']) !== 'OK') return false; await cmd(['SADD', P + 'users', k]); return true; },
    listUsers: async () => cmd(['SMEMBERS', P + 'users']),
    /* atomic read-modify-write: fn(user) -> [newUserOrNull, result]; retried if someone else wrote in between */
    mutate: async (k, fn) => {
      for (let i = 0; i < 8; i++) {
        const raw = await cmd(['GET', P + 'u:' + k]); if (!raw) return undefined;
        const [nu, res] = await fn(JSON.parse(raw)); if (!nu) return res;
        if (await cmd(['EVAL', CAS, '1', P + 'u:' + k, raw, JSON.stringify(nu)]) === 1) return res;
      }
      throw new Error('Account is busy, please retry.');
    },
    getSession: async h => parse(await cmd(['GET', P + 's:' + h])),
    putSession: (h, s, ttl) => cmd(['SET', P + 's:' + h, JSON.stringify(s), 'EX', String(ttl)]),
    delSession: h => cmd(['DEL', P + 's:' + h]),
    hit: async (k, ttl) => { const n = await cmd(['INCR', P + 'rl:' + k]); if (n === 1) await cmd(['EXPIRE', P + 'rl:' + k, String(ttl)]); return n; },
    hits: async k => +(await cmd(['GET', P + 'rl:' + k])) || 0,
    clearHits: k => cmd(['DEL', P + 'rl:' + k]),
    pushLog: async e => { await cmd(['LPUSH', P + 'adminlog', JSON.stringify(e)]); await cmd(['LTRIM', P + 'adminlog', '0', '999']); },
    getLog: async n => (await cmd(['LRANGE', P + 'adminlog', '0', String(n - 1)])).map(parse).reverse()
  };
};
