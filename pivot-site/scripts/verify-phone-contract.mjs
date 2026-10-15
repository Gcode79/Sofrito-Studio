// One-off verification for the Pillar 3 phone contract on POST /api/founding-application.
// Modeled on scripts/test-runtime.js: in-memory D1 from migrations, synthetic env,
// global fetch stubbed ONLY for the Turnstile siteverify call.
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
register('./html-loader.mjs', import.meta.url);
const { default: worker } = await import('../src/worker.js');

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('challenges.cloudflare.com/turnstile')) {
    return new Response(JSON.stringify({ success: true, hostname: 'example.test' }), { headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('unexpected fetch: ' + url);
};

function database() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'));
  const wrap = (sql, args = []) => ({
    bind: (...values) => wrap(sql, values),
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
  });
  return { raw: db, prepare: wrap, batch: async () => [] };
}
const env = {
  DB: database(),
  CONFIG: { get: async () => null, put: async () => {} },
  EMAIL_QUEUE: { send: async () => {} },
  WEBHOOK_QUEUE: { send: async () => {} },
  SITE_URL: 'https://example.test',
  TURNSTILE_SECRET_KEY: 'test-secret',
  RESEND_API_KEY: 'synthetic', RESEND_FROM: 'test@example.test', NOTIFICATION_EMAIL: 'owner@example.test',
};
const ctx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };

const post = (body) => worker.fetch(new Request('https://example.test/api/founding-application', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env, ctx);

const base = { name: 'Test Cook', business_name: 'Test Truck', business_type: 'food_truck', showcase_link: 'https://instagram.com/testtruck', turnstile_token: 'tok' };

// 1. phone: "" -> 201, stored as NULL
let res = await post({ ...base, email: 'empty@test.dev', phone: '' });
assert.equal(res.status, 201, 'empty phone should return 201, got ' + res.status + ' ' + await res.clone().text());
let row = env.DB.raw.prepare('SELECT phone FROM leads WHERE email = ?').get('empty@test.dev');
assert.equal(row.phone, null, 'empty phone must be stored as NULL');
console.log('PASS 1: phone:"" -> 201, stored NULL');

// 2. phone omitted entirely -> 201
res = await post({ ...base, email: 'omitted@test.dev' });
assert.equal(res.status, 201, 'omitted phone should return 201, got ' + res.status);
console.log('PASS 2: phone omitted -> 201');

// 3. phone: "123" -> 422 incomplete-phone guard
res = await post({ ...base, email: 'bad@test.dev', phone: '123' });
assert.equal(res.status, 422, 'phone "123" should return 422, got ' + res.status);
const err = await res.json();
assert.match(err.error, /phone number looks incomplete/);
console.log('PASS 3: phone:"123" -> 422 (' + err.error + ')');

// 4. valid phone -> 201, stored verbatim
res = await post({ ...base, email: 'full@test.dev', phone: '808-555-1234' });
assert.equal(res.status, 201);
row = env.DB.raw.prepare('SELECT phone FROM leads WHERE email = ?').get('full@test.dev');
assert.equal(row.phone, '808-555-1234');
console.log('PASS 4: valid phone -> 201, stored');

globalThis.fetch = realFetch;
console.log('ALL PHONE CONTRACT TESTS PASSED');
