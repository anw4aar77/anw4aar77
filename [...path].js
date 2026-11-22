'use strict';
/* Vercel serverless entry point: handles every /api/* request. */
const { createApp } = require('../lib/app');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
let app = null;
if (URL_ && TOKEN) app = createApp(require('../lib/store-redis')(URL_, TOKEN), { adminUsers: process.env.ADMIN_USERS, adminKey: process.env.ADMIN_KEY, trustProxy: true });

module.exports = async (req, res) => {
  if (!app) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: false, error: 'Database not configured: add an Upstash Redis store to this Vercel project (KV_REST_API_URL / KV_REST_API_TOKEN) and redeploy.' }));
  }
  const p = req.query && req.query.path ? '/api/' + [].concat(req.query.path).join('/') : String(req.url || '').split('?')[0];
  return app(req, res, p);
};
