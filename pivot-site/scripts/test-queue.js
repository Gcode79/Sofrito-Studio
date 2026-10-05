// ============================================================
// Sofrito Studio — queue consumer regression tests
// Run: node scripts/test-queue.js   (also wired into CI)
// No dependencies; fetch and bindings are mocked.
// A failing assertion exits non-zero.
// ============================================================
import { register } from 'node:module';

// Serve the worker's *.html email-template imports as text modules
// (mirrors Wrangler's behavior; plain Node cannot import .html).
register('./html-loader.mjs', import.meta.url);

const { processEmailMessage, processWebhookMessage } = await import('../src/lib/email.js');

let passed = 0;
function ok(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    passed++;
    console.log(`ok: ${name}`);
  }
}
async function throwsAsync(fn) {
  try { await fn(); return false; }
  catch { return true; }
}

// Silence worker console chatter during tests.
const _log = console.log, _warn = console.warn, _err = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
function restoreConsole() { console.log = _log; console.warn = _warn; console.error = _err; }

// ---- mocks ----
let lastFetch = null;
function mockFetch(status, body = '{}') {
  lastFetch = null;
  globalThis.fetch = async (url, init) => {
    lastFetch = { url, init };
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'mock',
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };
}
function mockFetchThrow(msg = 'boom') {
  globalThis.fetch = async () => { throw new Error(msg); };
}
const dbStub = {
  prepare: () => ({ bind: () => ({}) }),
  batch: async () => {},
};
const baseEnv = {
  WEBHOOK_URL: 'https://example.test/hook',
  RESEND_API_KEY: 'test-key',
  RESEND_FROM_NAME: 'Sofrito',
  RESEND_FROM: 'test@sofritostudio.com',
  CONFIG: { get: async () => null },
  DB: dbStub,
};
const emailJob = (over = {}) => ({
  kind: 'email',
  to: 'lead@example.com',
  subject: 'Test',
  html: '<p>hi</p>',
  template: 'no-such-template',
  emails_sent_id: 'uuid-email-1',
  email_log_id: 'uuid-log-1',
  ...over,
});
const webhookJob = (over = {}) => ({ topic: 'lead.new', payload: { id: 'lead-1' }, ...over });

// ---- webhook: success paths acknowledge quietly ----
mockFetch(200);
ok('webhook 200 returns without throwing', await throwsAsync(() => processWebhookMessage(baseEnv, webhookJob())) === false);
mockFetch(201);
ok('webhook 201 returns without throwing', await throwsAsync(() => processWebhookMessage(baseEnv, webhookJob())) === false);

// ---- webhook: retryable failures must throw (queue retries -> DLQ) ----
for (const s of [429, 500, 502, 503]) {
  mockFetch(s, 'busy');
  const threw = await throwsAsync(() => processWebhookMessage(baseEnv, webhookJob()));
  ok(`webhook ${s} throws (retryable)`, threw);
}
mockFetchThrow('connection reset');
ok('webhook network error throws', await throwsAsync(() => processWebhookMessage(baseEnv, webhookJob())));

// ---- webhook: permanent failures are loud but acknowledged ----
mockFetch(422, 'bad payload');
ok('webhook 422 returns without throwing (permanent)', await throwsAsync(() => processWebhookMessage(baseEnv, webhookJob())) === false);
mockFetch(401, 'unauthorized');
ok('webhook 401 returns without throwing (permanent)', await throwsAsync(() => processWebhookMessage(baseEnv, webhookJob())) === false);

// ---- webhook: missing URL ----
const noUrl = { ...baseEnv, WEBHOOK_URL: '' };
ok('webhook missing URL without flag throws (misconfiguration)', await throwsAsync(() => processWebhookMessage(noUrl, webhookJob())));
ok('webhook missing URL with WEBHOOK_DISABLED=true returns quietly',
  await throwsAsync(() => processWebhookMessage({ ...noUrl, WEBHOOK_DISABLED: 'true' }, webhookJob())) === false);

// ---- email: idempotency key is stable per job ----
mockFetch(200, JSON.stringify({ id: 're_123' }));
await processEmailMessage(baseEnv, emailJob());
ok('email sends Idempotency-Key header', lastFetch.init.headers['Idempotency-Key'] === 'uuid-email-1');
mockFetch(200, JSON.stringify({ id: 're_124' }));
await processEmailMessage(baseEnv, emailJob());
const key2 = lastFetch.init.headers['Idempotency-Key'];
ok('email redelivery reuses the same idempotency key', key2 === 'uuid-email-1');

// ---- email: provider failure still throws (existing retry behavior) ----
mockFetch(500, 'resend down');
ok('email Resend 500 throws (retries)', await throwsAsync(() => processEmailMessage(baseEnv, emailJob())));

restoreConsole();
console.log(`\n${passed} assertions passed${process.exitCode ? ' (WITH FAILURES)' : ''}.`);
