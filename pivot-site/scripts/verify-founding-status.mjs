// Verification for GET /api/founding-status (CV-3, 2026-10-14).
// Modeled on scripts/verify-phone-contract.mjs: in-memory D1 from migrations,
// synthetic env, the REAL worker handler. The pill on the homepage renders
// only what this endpoint returns — a spot counts as taken only when a
// founding applicant converted (CRM 'won', or a payment stamped on any
// lead under the same email).
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
register('./html-loader.mjs', import.meta.url);
const { default: worker } = await import('../src/worker.js');

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
const ctx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
const get = (env) => worker.fetch(new Request('https://example.test/api/founding-status'), env, ctx);
const lead = (db, { id, email, channel = 'founding_application', status = 'new', paid_at = null }) =>
  db.prepare(`INSERT INTO leads (id, created_at, name, email, channel, status, paid_at, updated_at) VALUES (?, '2026-10-14T00:00:00Z', 'T', ?, ?, ?, ?, '2026-10-14T00:00:00Z')`).run(id, email, channel, status, paid_at);

// 1. Empty DB -> 10 of 10 remaining
{
  const env = { DB: database() };
  const res = await get(env);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control') || '', /max-age=300/);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, total: 10, taken: 0, remaining: 10 });
  console.log('PASS 1: empty DB -> remaining 10, cache header set');
}

// 2. A merely-submitted application does NOT consume a spot
{
  const env = { DB: database() };
  lead(env.DB.raw, { id: 'founding_a', email: 'a@test.dev', status: 'new' });
  lead(env.DB.raw, { id: 'founding_b', email: 'b@test.dev', status: 'qualified' });
  const body = await (await get(env)).json();
  assert.equal(body.taken, 0);
  assert.equal(body.remaining, 10);
  console.log('PASS 2: new/qualified applications -> taken still 0');
}

// 3. Founder marks an application 'won' -> spot taken
{
  const env = { DB: database() };
  lead(env.DB.raw, { id: 'founding_a', email: 'a@test.dev', status: 'won' });
  const body = await (await get(env)).json();
  assert.equal(body.taken, 1);
  assert.equal(body.remaining, 9);
  console.log('PASS 3: won application -> remaining 9');
}

// 4. Payment on a separate checkout lead under the same email -> spot taken
{
  const env = { DB: database() };
  lead(env.DB.raw, { id: 'founding_a', email: 'a@test.dev', status: 'new' });
  lead(env.DB.raw, { id: 'lead_checkout', email: 'a@test.dev', channel: 'web', status: 'paid', paid_at: 1760000000 });
  const body = await (await get(env)).json();
  assert.equal(body.taken, 1);
  assert.equal(body.remaining, 9);
  console.log('PASS 4: same-email paid checkout lead -> remaining 9');
}

// 5. A checkout payment from a NON-applicant email does not touch the count
{
  const env = { DB: database() };
  lead(env.DB.raw, { id: 'lead_other', email: 'other@test.dev', channel: 'web', status: 'paid', paid_at: 1760000000 });
  const body = await (await get(env)).json();
  assert.equal(body.taken, 0);
  console.log('PASS 5: unrelated payer -> taken still 0');
}

console.log('ALL FOUNDING-STATUS TESTS PASSED');
