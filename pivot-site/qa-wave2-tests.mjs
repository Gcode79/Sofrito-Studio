// QA Wave-2 Row 6 & 8 Tests
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

function getEnv(dotenvContent, key) {
  const m = dotenvContent.match(new RegExp(`${key}=["']?([^"'\r\n]+)`));
  return m ? m[1] : null;
}

const dotenv = readFileSync('.dev.vars', 'utf8');
const STRIPE_API_KEY = getEnv(dotenv, 'STRIPE_API_KEY');
const STRIPE_WEBHOOK_SECRET = getEnv(dotenv, 'STRIPE_WEBHOOK_SECRET');

if (!STRIPE_API_KEY || !STRIPE_WEBHOOK_SECRET) {
  console.error('Missing Stripe keys in .dev.vars');
  process.exit(1);
}

async function d1Execute(sql) {
   // Escape single quotes and collapse whitespace for shell command
   const escaped = sql.replace(/'/g, "''").replace(/\s+/g, ' ');
   const cmd = `npx wrangler d1 execute sofrito-db --local --command "${escaped}"`;
   try {
     const output = execSync(cmd, { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
     return output;
   } catch (e) {
     console.error('D1 exec failed:', e.stderr?.toString() || e.message);
     throw e;
   }
 }

async function d1Query(sql) {
  const result = await d1Execute(sql);
  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return null;
  }
}

async function httpPost(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

// ============================================================
// ROW 6: Webhook Replay Test
// ============================================================
console.log('\n════════════════════════════════════════════════');
console.log(' ROW 6: Webhook Replay (checkout.session.completed x2)');
console.log('════════════════════════════════════════════════');

// Clean up any previous test data
const testEmail = `qa6-${Date.now()}@test.com`;
const testLeadId = `lead_${crypto.createHash('sha256').update(testEmail).digest('hex').slice(0, 24)}`;
console.log(`Test lead ID: ${testLeadId}`);
console.log(`Test email: ${testEmail}`);

// Step 1: Create a Stripe checkout session
console.log('\n[Step 1] Creating Stripe checkout session...');
const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${STRIPE_API_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': 'Sofrito Session',
    'line_items[0][price_data][product_data][description]': '45-minute brand strategy session',
    'line_items[0][price_data][unit_amount]': '40000',
    'line_items[0][quantity]': '1',
    success_url: 'http://localhost/success.html',
    cancel_url: 'http://localhost/cancelled.html',
    'metadata[lead_id]': testLeadId,
  }),
});

if (!sessionRes.ok) {
  const err = await sessionRes.text();
  console.error('Failed to create session:', sessionRes.status, err);
} else {
  const session = await sessionRes.json();
  console.log(`Session created: ${session.id}`);
  const sessionId = session.id;

  // Step 2: Insert lead into D1 with matching stripe_session_id
  console.log('\n[Step 2] Inserting lead into D1...');
  const nowEpoch = Math.floor(Date.now() / 1000);
  await d1Execute(
    `INSERT OR IGNORE INTO leads (id, created_at, name, email, status, source, channel, checkout_started_at, stripe_session_id, checkout_url)
     VALUES ('${testLeadId}', datetime('now'), 'QA Row 6', '${testEmail}', 'checkout_started', 'lead_api', 'api', ${nowEpoch}, '${sessionId}', 'http://localhost/success.html');`
  );
  console.log('Lead inserted.');

  // Verify lead
  const verifyResult = await d1Query(`SELECT id, status, stripe_session_id FROM leads WHERE id = '${testLeadId}';`);
  console.log('Lead verified:', JSON.stringify(verifyResult));

  // Step 3: Construct signed webhook payload
  console.log('\n[Step 3] Building signed webhook payload...');
  const eventPayload = {
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        amount_total: 40000,
        currency: 'usd',
        invoice: `in_${sessionId.slice(0, 16)}`,
        description: 'Sofrito Session',
      },
    },
    id: `evt_${sessionId.slice(0, 24)}`,
    livemode: false,
  };
  const rawPayload = JSON.stringify(eventPayload);
  const t = Math.floor(Date.now() / 1000);
  const signedPayload = `${t}.${rawPayload}`;
  const signature = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');
  const stripeSignature = `t=${t},v1=${signature}`;
  console.log('Payload signed.');

  // Step 4: POST webhook twice
  console.log('\n[Step 4] POSTing webhook twice...');
  const results = [];
  for (let i = 0; i < 2; i++) {
    const res = await httpPost('http://127.0.0.1:8788/api/stripe-webhook', rawPayload, {
      'stripe-signature': stripeSignature,
    });
    console.log(`  POST #${i + 1}: ${res.status} ${res.body}`);
    results.push({ status: res.status, body: res.body });
  }

  // Step 5: Check D1 results
  console.log('\n[Step 5] Checking D1 state...');
  const leadStatus = await d1Query(`SELECT id, status, paid_at FROM leads WHERE id = '${testLeadId}';`);
  console.log('Lead status:', JSON.stringify(leadStatus));

  const revenueCount = await d1Query(`SELECT COUNT(*) as count FROM revenue WHERE source = 'stripe' AND metadata LIKE '%qa6%';`);
  console.log('Revenue count:', JSON.stringify(revenueCount));

  const emailLog = await d1Query(`SELECT type, status FROM email_log WHERE lead_id = '${testLeadId}';`);
  console.log('Email log:', JSON.stringify(emailLog));

  // Also check by source_id (event ID)
  const revenueBySource = await d1Query(`SELECT id, source_id, amount_cents, description FROM revenue WHERE source = 'stripe' AND source_id = '${eventPayload.id}';`);
  console.log('Revenue by event ID:', JSON.stringify(revenueBySource));

  // Summary
  console.log('\n[ROW 6 SUMMARY]');
  const both200 = results.every(r => r.status === 200 || r.status === 201);
  console.log(`  Both POSTs 2xx: ${both200}`);
  console.log(`  Lead paid: ${leadStatus?.results?.[0]?.status === 'paid'}`);
  console.log(`  Revenue records: ${revenueCount?.results?.[0]?.count ?? 'unknown'}`);
  const emailTypes = emailLog?.results?.map(r => r.type) ?? [];
  const hasReceipt = emailTypes.includes('receipt');
  const hasBooking = emailTypes.includes('booking_link');
  console.log(`  Receipt email sent: ${hasReceipt}`);
  console.log(`  Booking email sent: ${hasBooking}`);
  console.log(`  Email count: ${emailTypes.length}`);
  console.log(`  PASS: ${both200 && leadStatus?.results?.[0]?.status === 'paid' && revenueCount?.results?.[0]?.count === 1 && hasReceipt && hasBooking && emailTypes.length === 2}`);
}

// ============================================================
// ROW 8: Abandon 2h+ Test
// ============================================================
console.log('\n\n════════════════════════════════════════════════');
console.log(' ROW 8: Abandon 2h+ Test');
console.log('════════════════════════════════════════════════');

const row8Email = `qa8-${Date.now()}@test.com`;
const row8LeadId = `lead_${crypto.createHash('sha256').update(row8Email).digest('hex').slice(0, 24)}`;
console.log(`Test lead ID: ${row8LeadId}`);

// Step 1: Insert lead with old checkout_started_at (3h ago)
console.log('\n[Step 1] Inserting lead with 3h old checkout...');
const nowEpoch8 = Math.floor(Date.now() / 1000);
const threeHoursAgo = nowEpoch8 - 10800;

// Clean up first
try {
  await d1Execute(`DELETE FROM leads WHERE id = '${row8LeadId}';`);
} catch {}

await d1Execute(
  `INSERT OR IGNORE INTO leads (id, created_at, name, email, status, source, channel, checkout_started_at, nudge_sent_at, checkout_url)
   VALUES ('${row8LeadId}', datetime('now'), 'QA Row 8', '${row8Email}', 'checkout_started', 'lead_api', 'api', ${threeHoursAgo}, NULL, 'http://localhost/checkout?test=row8');`
);
console.log('Lead inserted with old checkout_started_at.');

const leadCheck = await d1Query(`SELECT id, status, checkout_started_at, nudge_sent_at FROM leads WHERE id = '${row8LeadId}';`);
console.log('Lead check:', JSON.stringify(leadCheck));

// Step 2: Try to invoke scheduled handler
console.log('\n[Step 2] Invoking scheduled handler via direct Node import...');

try {
  // We need to create a minimal mock env/ctx and call the scheduled handler
  // Since worker.js is an ES module and imports fetch, crypto, etc., let's try a different approach
  // Use the wrangler dev internal API or a direct Node script

  // Write a separate script that imports worker.js
  const testScript = `
import worker from './src/worker.js';

const now = Math.floor(Date.now() / 1000);

// Mock env with D1 access via fetch to wrangler dev internal API
const env = {
  DB: {
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async () => {
          // Execute query via wrangler dev internal API or via child process
          const result = await fetch('http://127.0.0.1:8788/.internal/d1/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sql.replace(/\\?/g, () => {
              const val = args.shift();
              return typeof val === 'string' ? "'" + val.replace(/'/g, "''") + "'" : val;
            }) });
          });
          const data = await result.json();
          return data?.results?.[0] ?? null;
        },
        all: async () => {
          const result = await fetch('http://127.0.0.1:8788/.internal/d1/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: sql.replace(/\\?/g, () => {
              const val = args.shift();
              return typeof val === 'string' ? "'" + val.replace(/'/g, "''") + "'" : val;
            }) });
          });
          const data = await result.json();
          return data?.results ?? [];
        },
        run: async () => { return { success: true }; },
      }),
    }),
  },
  CONFIG: {
    get: async () => null,
    put: async () => {},
  },
  EMAIL_QUEUE: {
    send: async () => {},
  },
  WEBHOOK_QUEUE: {
    send: async () => {},
  },
  OPENROUTER_API_KEY: 'test',
  FLOW_API_KEY: 'test',
  SITE_URL: 'http://localhost',
  NOTIFICATION_EMAIL: 'test@sofritostudio.com',
};

const ctx = {
  waitUntil: async (p) => { await p; },
};

// Call scheduled handler
await worker.scheduled({ signal: AbortSignal.timeout(30000) }, env, ctx);
console.log('Scheduled handler completed');
`;
  writeFileSync('qa-row8-invoke.mjs', testScript);
  execSync('node qa-row8-invoke.mjs', { timeout: 60000, stdio: 'pipe' });
  console.log('Scheduled handler executed.');
} catch (e) {
  console.log('Direct invocation failed:', e.message);
  // Fall back: use wrangler dev HTTP internal API if available
}

// Step 3: Check if nudge was sent
console.log('\n[Step 3] Checking nudge status...');
const nudgeCheck = await d1Query(`SELECT id, status, nudge_sent_at FROM leads WHERE id = '${row8LeadId}';`);
console.log('Nudge check:', JSON.stringify(nudgeCheck));

const row8Lead = nudgeCheck?.results?.[0];
const nudgeSent = !!row8Lead?.nudge_sent_at;
const status = row8Lead?.status;
console.log(`  Nudge sent: ${nudgeSent}`);
console.log(`  Status after safety net: ${status}`);
console.log(`  PASS: ${nudgeSent && status === 'abandoned'}`);
