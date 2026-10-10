import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
register('./html-loader.mjs', import.meta.url);
const { default: worker } = await import('../src/worker.js');
const { readJson, readWebhookText, hmacSha256 } = await import('../src/lib/http.js');
const { handleStripeWebhook, createAndSendStripeInvoice } = await import('../src/lib/billing.js');
const { handleCalendlyWebhook } = await import('../src/lib/booking.js');
const { handleUnbilledFinalSweep } = await import('../src/lib/automations.js');
const { persistPaymentEmails, dispatchEmailOutbox } = await import('../src/lib/outbox.js');
const { processEmailMessage, tiktokTrack, updateLeadPaidState } = await import('../src/lib/email.js');
const { default: scheduler, publishDue } = await import('../../post-scheduler/src/scheduler.js');

function database() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'));
  db.exec(readFileSync(new URL('../../post-scheduler/migrations/0001_publications.sql', import.meta.url), 'utf8'));
  const wrap = (sql, args = []) => ({
    bind: (...values) => wrap(sql, values),
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
  });
  return { raw: db, prepare: wrap, batch: async statements => {
    db.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } };
}
function environment() {
  const DB = database(); const queued = []; const tasks = [];
  return { DB, queued, tasks, CONFIG: { get: async () => null, put: async () => {} },
    EMAIL_QUEUE: { send: async job => queued.push(job) }, SITE_URL: 'https://example.test',
    RESEND_API_KEY: 'synthetic', RESEND_FROM: 'test@example.test', NOTIFICATION_EMAIL: 'owner@example.test',
    ctx: { waitUntil: promise => tasks.push(promise) },
  };
}
async function signed(body, type = 'stripe') {
  const ts = String(Math.floor(Date.now() / 1000)); const raw = JSON.stringify(body);
  const sig = await hmacSha256('synthetic', `${ts}.${raw}`);
  return new Request('https://example.test/api/hook', { method: 'POST', body: raw,
    headers: { [type === 'stripe' ? 'stripe-signature' : 'calendly-webhook-signature']: `t=${ts},v1=${sig}` } });
}

 test('migrations and signed webhook entry points work; test events cannot mutate data', async () => {
  const env = environment();
  let response = await handleStripeWebhook(await signed({ type: 'checkout.session.expired', livemode: false, data: { object: { id: 'synthetic' } } }), { ...env, STRIPE_WEBHOOK_SECRET: 'synthetic' }, env.ctx);
  assert.equal(response.status, 200); assert.equal((await response.json()).reason, 'test_mode');
  response = await handleStripeWebhook(await signed({ type: 'unhandled', livemode: true, data: { object: {} } }), { ...env, STRIPE_WEBHOOK_SECRET: 'synthetic' }, env.ctx);
  assert.equal(response.status, 200);
  response = await handleCalendlyWebhook(await signed({ event: 'unhandled' }, 'calendly'), { ...env, CALENDLY_WEBHOOK_SIGNING_KEY: 'synthetic' }, env.ctx);
  assert.equal(response.status, 200);
  response = await worker.fetch(new Request('https://example.test/api/lead', { method: 'POST', body: '{' }), env, env.ctx);
  assert.equal(response.status, 400);
  response = await handleStripeWebhook(new Request('https://example.test', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=123' } }), { ...env, STRIPE_WEBHOOK_SECRET: 'synthetic' }, env.ctx);
  assert.equal(response.status, 400);
 });

test('stream limits count UTF-8 bytes and cancel oversized bodies', async () => {
  await assert.rejects(readJson(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ text: 'é'.repeat(150000) }) })), { status: 413 });
  let cancelled = false;
  const stream = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(600000)); }, cancel() { cancelled = true; } });
  await assert.rejects(readWebhookText(new Request('https://example.test', { method: 'POST', body: stream, duplex: 'half' })), { status: 413 });
  assert.equal(cancelled, true);
  assert.deepEqual(await readJson(new Request('https://example.test', { method: 'POST', body: '{"text":"é"}' })), { text: 'é' });
});

test('qualifying automation and TikTok tracking resolve their dependencies', async t => {
  const env = environment();
  env.DB.raw.exec("INSERT INTO leads(id,created_at,name,email,status,paid_at) VALUES('lead','2020-01-01','Synthetic','test@example.test','paid',1)");
  await handleUnbilledFinalSweep(env);
  assert.equal(env.queued.length, 1);
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => { called = true; return Response.json({}); });
  await tiktokTrack({ TIKTOK_EVENTS_TOKEN: 'synthetic' }, { user: { email: 'test@example.test' } });
  assert.equal(called, true);
});

test('invoice retry resumes saved invoice and does not duplicate its line', async t => {
  let savedId; let hasLine = false; let lineCalls = 0; let fail = true; let status = 'draft';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(url).pathname; calls.push([path, init.headers['Idempotency-Key']]);
    let data;
    if (path === '/v1/customers') data = { data: [{ id: 'cus_test' }] };
    else if (path === '/v1/invoices' || path === '/v1/invoices/in_test') data = { id: 'in_test', customer: 'cus_test', status };
    else if (path.endsWith('/lines')) data = { data: hasLine ? [{ metadata: { sofrito_line: 'invoice-test' } }] : [], has_more: false };
    else if (path === '/v1/invoiceitems') { hasLine = true; lineCalls++; data = { id: 'ii_test' }; }
    else if (path.endsWith('/finalize')) {
      if (fail) { fail = false; throw new Error('synthetic timeout'); }
      status = 'open'; data = { id: 'in_test', status };
    } else if (path.endsWith('/send_invoice')) data = { id: 'in_test', status: 'open' };
    else throw new Error('Unexpected mock request');
    return Response.json(data);
  });
  const args = { customerEmail: 'test@example.test', customerName: 'Test', description: 'Test', meta: {},
    line: { amountCents: 59700, description: 'Test' }, idempotencyKey: 'invoice-test', onCreated: async id => { savedId = id; } };
  await assert.rejects(createAndSendStripeInvoice({ STRIPE_API_KEY: 'synthetic' }, args), /timeout/);
  assert.equal(savedId, 'in_test');
  await createAndSendStripeInvoice({ STRIPE_API_KEY: 'synthetic' }, { ...args, invoiceId: savedId });
  assert.equal(lineCalls, 1);
  assert.equal(calls.filter(([path]) => path === '/v1/invoices').length, 1);
  assert.ok(calls.find(([path, key]) => path === '/v1/invoiceitems' && key === 'invoice-test:line'));
});

test('refund affects only the matching current payment, never another same-email purchase', async () => {
  const env = environment();
  env.DB.raw.exec("INSERT INTO leads(id,created_at,name,email,status) VALUES('a','2020','A','same@example.test','paid'),('b','2020','B','same@example.test','paid')");
  await updateLeadPaidState(env, 'a', 1, 40000, 'pi_old');
  await updateLeadPaidState(env, 'b', 2, 40000, 'pi_new');
  const event = { id: 'evt_refund', created: 1, type: 'charge.refunded', livemode: true, data: { object: {
    payment_intent: 'pi_old', amount: 40000, amount_refunded: 40000, currency: 'usd', receipt_email: 'same@example.test', refunds: { data: [{ id: 're_test', amount: 40000 }] },
  } } };
  const response = await handleStripeWebhook(await signed(event), { ...env, STRIPE_WEBHOOK_SECRET: 'synthetic' }, env.ctx);
  assert.equal(response.status, 200); await Promise.all(env.tasks);
  assert.equal(env.DB.raw.prepare("SELECT status FROM leads WHERE id='a'").get().status, 'refunded');
  assert.equal(env.DB.raw.prepare("SELECT status FROM leads WHERE id='b'").get().status, 'paid');
  await updateLeadPaidState(env, 'a', 1, 40000, 'pi_old');
  assert.equal(env.DB.raw.prepare("SELECT status FROM leads WHERE id='a'").get().status, 'refunded');
  await updateLeadPaidState(env, 'b', 1, 40000, 'pi_older');
  assert.equal(env.DB.raw.prepare("SELECT stripe_payment_intent_id FROM leads WHERE id='b'").get().stripe_payment_intent_id, 'pi_new');
});

test('outbox recovers partial dispatch with stable identities and suppresses sent redelivery', async t => {
  const env = environment();
  const jobs = ['receipt.html', 'booking-link.html'].map(template => ({ kind: 'email', template, subject: 'Test', to: 'test@example.test', data: {} }));
  await persistPaymentEmails(env, 'cs_test', jobs);
  let fail = true;
  env.EMAIL_QUEUE.send = async job => { if (job.template === 'booking-link.html' && fail) throw new Error('synthetic unavailable'); env.queued.push(job); };
  await dispatchEmailOutbox(env);
  assert.equal(env.queued.length, 1);
  await persistPaymentEmails(env, 'cs_test', jobs);
  fail = false; await dispatchEmailOutbox(env);
  assert.equal(env.queued.length, 2);
  assert.notEqual(env.queued[0].emails_sent_id, env.queued[1].emails_sent_id);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ id: 'email_test' }); });
  await processEmailMessage(env, env.queued[0]); await processEmailMessage(env, env.queued[0]);
  assert.equal(calls, 1);
});

test('scheduler rejects unauthorized requests, future dates and drafts; claims once under concurrency', async t => {
  const env = environment(); let calls = 0;
  const calendar = [
    { id: 'future', date: '2099-01-01', approved: true, status: 'pending', platform: 'twitter' },
    { id: 'draft', date: '2020-01-01', approved: false, status: 'pending', platform: 'twitter' },
  ];
  Object.assign(env, { SCHEDULER_KEY: 'synthetic', TWITTER_TOKEN: 'synthetic', POST_METRICS: { get: async () => JSON.stringify(calendar), put: async () => {} } });
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ data: { id: 'post_test' } }); });
  assert.equal((await scheduler.fetch(new Request('https://example.test/run'), env)).status, 401);
  assert.equal((await scheduler.fetch(new Request('https://example.test/run', { headers: { authorization: 'Bearer synthetic' } }), env)).status, 405);
  await publishDue(env); assert.equal(calls, 0);
  calendar.push({ id: 'due', date: '2020-01-01', approved: true, status: 'pending', platform: 'twitter', copy: 'Test' });
  await Promise.all([publishDue(env), publishDue(env)]); assert.equal(calls, 1);
  assert.equal(env.DB.raw.prepare("SELECT status FROM publications WHERE id='due'").get().status, 'sent');
});

test('scheduler retains claim after uncertain provider outcome', async t => {
  const env = environment(); let calls = 0;
  Object.assign(env, { TWITTER_TOKEN: 'synthetic', POST_METRICS: { get: async () => JSON.stringify([{ id: 'uncertain', date: '2020-01-01', approved: true, status: 'pending', platform: 'twitter' }]), put: async () => {} } });
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('synthetic timeout'); });
  assert.equal((await publishDue(env)).status, 502);
  await publishDue(env); assert.equal(calls, 1);
});


test('paid checkout handler persists both deliveries and safely replays the event', async () => {
  const env = environment();
  env.DB.raw.exec("INSERT INTO leads(id,created_at,name,email,status,stripe_session_id) VALUES('payer','2020','Test','test@example.test','new','cs_test')");
  const event = { id: 'evt_paid', created: 100, type: 'checkout.session.completed', livemode: true,
    data: { object: { id: 'cs_test', payment_intent: 'pi_test', payment_status: 'paid', amount_total: 40000,
      currency: 'usd', metadata: { lead_id: 'payer' } } } };
  const bindings = { ...env, STRIPE_WEBHOOK_SECRET: 'synthetic' };
  assert.equal((await handleStripeWebhook(await signed(event), bindings, env.ctx)).status, 200);
  await Promise.all(env.tasks);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM email_outbox').get().n, 2);
  assert.equal((await handleStripeWebhook(await signed(event), bindings, env.ctx)).status, 200);
  await Promise.all(env.tasks);
  assert.equal(env.queued.filter(job => job.template === 'receipt.html').length, 1);
  assert.equal(env.queued.filter(job => job.template === 'booking-link.html').length, 1);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM revenue').get().n, 1);
  assert.equal(env.DB.raw.prepare("SELECT paid_at FROM leads WHERE id='payer'").get().paid_at, 100);
});
test('CR1 blocker: legacy pending invoice reconciles via metadata instead of duplicating', async t => {
  let createCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(url).pathname;
    let data;
    if (path === '/v1/invoices' && init.method === 'GET') {
      data = { data: [{ id: 'in_legacy', metadata: { invoice_id: 'legacy-123' }, customer: 'cus_test', status: 'open' }], has_more: false };
    } else if (path === '/v1/invoices') { createCalls++; data = { id: 'in_dupe', status: 'draft' }; }
    else throw new Error('Unexpected mock request: ' + path);
    return Response.json(data);
  });
  const found = await (await import('../src/lib/billing.js')).reconcileLegacyInvoice({ STRIPE_API_KEY: 'test' }, 'legacy-123');
  assert.equal(found, 'in_legacy');
  assert.equal(createCalls, 0);
});

test('CR2: sent delivery status is terminal, failure update cannot overwrite it', async () => {
  const env = environment();
  const { updateEmailTracking } = await import('../src/lib/email.js');
  env.DB.raw.exec(`INSERT INTO emails_sent(id,created_at,to_email,template,subject,status) VALUES('e1','2020','t@t','x','s','sent')`);
  env.DB.raw.exec(`INSERT INTO email_log(id,created_at,lead_id,type,status) VALUES('l1','2020','x','x','sent')`);
  await updateEmailTracking(env, { emails_sent_id: 'e1', email_log_id: 'l1', delivery_key: 'k' }, { ok: false, error: 'queue ack failed' });
  assert.equal(env.DB.raw.prepare(`SELECT status FROM emails_sent WHERE id='e1'`).get().status, 'sent');
  assert.equal(env.DB.raw.prepare(`SELECT status FROM email_log WHERE id='l1'`).get().status, 'sent');
});

test('CR3: resuming an already-paid invoice returns paid status', async t => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname;
    if (path === '/v1/invoices/in_paid') return Response.json({ id: 'in_paid', customer: 'cus_test', status: 'paid', number: 'INV-1', status_transitions: { paid_at: 1700000000 } });
    throw new Error('Unexpected mock request: ' + path);
  });
  const result = await createAndSendStripeInvoice({ STRIPE_API_KEY: 'test' },
    { customerEmail: 't@t', customerName: 'T',
      description: 'Test', meta: {}, line: { amountCents: 100, description: 'Test' },
      idempotencyKey: 'paid-test', invoiceId: 'in_paid' });
  assert.equal(result.status, 'paid');
  assert.ok(result.paidAt);
});

test('CR4: resuming an open invoice does not re-send', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(url).pathname; calls.push(path);
    if (path === '/v1/invoices/in_open') return Response.json({ id: 'in_open', customer: 'cus_test', status: 'open', number: 'INV-2' });
    throw new Error('Unexpected mock request: ' + path);
  });
  const result = await createAndSendStripeInvoice({ STRIPE_API_KEY: 'test' },
    { customerEmail: 't@t', customerName: 'T',
      description: 'Test', meta: {}, line: { amountCents: 100, description: 'Test' },
      idempotencyKey: 'open-test', invoiceId: 'in_open' });
  assert.equal(result.status, 'open');
  assert.ok(!calls.some(p => p.endsWith('/send_invoice')), 'send_invoice must not be called on resumed open invoice');
});

test('CR5: ambiguous open resume returns reconciliation-required, not sent', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname; calls.push(path);
    if (path === '/v1/invoices/in_ambig') return Response.json({ id: 'in_ambig', customer: 'cus_test', status: 'open', number: 'INV-3' });
    throw new Error('Unexpected mock request: ' + path);
  });
  const result = await createAndSendStripeInvoice({ STRIPE_API_KEY: 'test' },
    { customerEmail: 't@t', customerName: 'T', description: 'Test', meta: {},
      line: { amountCents: 100, description: 'Test' },
      idempotencyKey: 'ambig-test', invoiceId: 'in_ambig' });
  assert.equal(result.reconciliationRequired, true);
  assert.ok(!calls.some(p => p.endsWith('/send_invoice')));
});
