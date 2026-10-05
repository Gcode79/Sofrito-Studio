#!/usr/bin/env node
// Smoke test the lead-capture and newsletter endpoints against a local
// `wrangler dev` instance. Start the dev server first (any port), then run:
//   node scripts/smoke-test-apis.js [url]
// Requires the local D1 schema applied: wrangler d1 migrations apply DB --local
// Uses a disposable email so production D1/Make is never touched.
const BASE = process.argv[2] || 'http://127.0.0.1:8787';

function expect(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  console.log('  PASS ' + label);
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  const email = `smoke-test-${Date.now()}@example.com`;
  console.log('Base: ' + BASE);

  const nl = await post('/api/newsletter', { email, source: 'smoke-test' });
  expect(nl.status === 200 && nl.json && nl.json.ok === true && /digital-guide/.test(nl.json.guide_url || ''), 'newsletter -> ok + guide_url');

  const ct = await post('/api/contact', { name: 'Smoke Test', email, message: 'This is a local smoke test submission.', source: 'smoke-test' });
  expect(ct.status === 201 && ct.json && ct.json.ok === true && typeof ct.json.id === 'string', 'contact -> 201 + lead id');

  const bad = await post('/api/newsletter', { email: 'nope' });
  expect(bad.status === 422, 'invalid email -> 422');

  await post('/api/contact', { name: 'DL Test', email, message: 'Duplicate rate-limit check.' });
  const dup = await post('/api/contact', { name: 'DL Test', email, message: 'Second hit within five minutes.' });
  expect(dup.status === 429, 'duplicate contact -> 429');

  console.log('ALL API SMOKE TESTS PASS');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});