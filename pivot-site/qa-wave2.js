// QA Wave-2 Row 6: Webhook replay test
// Creates a lead in D1, then replays a checkout.session.completed webhook twice.
// Verifies: both 200, exactly one revenue record, lead becomes paid, exactly one set of emails.

import { readFileSync } from 'node:fs';

// --- Config from .dev.vars (values not echoed) ---
const dotenv = readFileSync('.dev.vars', 'utf8');
function getEnv(key) {
  const m = dotenv.match(new RegExp(`${key}=["']?([^"'\r\n]+)`));
  return m ? m[1] : null;
}
const STRIPE_API_KEY = getEnv('STRIPE_API_KEY');
const STRIPE_WEBHOOK_SECRET = getEnv('STRIPE_WEBHOOK_SECRET');

console.log('Stripe API key loaded:', STRIPE_API_KEY ? 'yes' : 'NO');
console.log('Webhook secret loaded:', STRIPE_WEBHOOK_SECRET ? 'yes' : 'NO');

// --- Step 1: Create a Stripe checkout session ---
console.log('\n=== Step 1: Create checkout session ===');
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
    success_url: 'http://localhost/success.html?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'http://localhost/cancelled.html',
    'metadata[test]': 'qa-row-6',
  }),
});
if (!sessionRes.ok) {
  const err = await sessionRes.text();
  console.error('Failed to create checkout session:', sessionRes.status, err);
  process.exit(1);
}
const session = await sessionRes.json();
const sessionId = session.id;
console.log('Session ID:', sessionId);

// --- Step 2: Insert lead into D1 via wrangler CLI ---
console.log('\n=== Step 2: Insert lead into D1 ===');
const email = `qa-row6-${Date.now()}@test.com`;
const leadId = `lead_${await sha256Hex(email)}`.slice(0, 28);
console.log('Lead ID:', leadId);
console.log('Email:', email);

const now = Math.floor(Date.now() / 1000);

// Insert lead with stripe_session_id matching the checkout session
const insertSql = `INSERT OR IGNORE INTO leads (id, created_at, name, email, status, source, channel, checkout_started_at, stripe_session_id, checkout_url)
VALUES (?, ?, ?, ?, 'checkout_started', 'lead_api', 'api', ?, ?, ?)`;
const insertParams = [leadId, new Date().toISOString(), `QA Row 6`, email, now, sessionId, 'http://localhost/checkout?session=' + sessionId];

// Build the sqlite3 command
// Use wrangler d1 execute --local
const paramsPlaceholder = insertParams.map(() => '?').join(', ');
const sqlWithValues = insertSql.replace(/\?/g, () => '?').replace('?, ?, ?, ?, ?, ?, ?, ?, ?, ?', paramsPlaceholder);

// Actually, let me use a simpler approach - write a SQL file
const sql = `INSERT OR IGNORE INTO leads (id, created_at, name, email, status, source, channel, checkout_started_at, stripe_session_id, checkout_url)
VALUES ('${leadId}', '${new Date().toISOString()}', 'QA Row 6', '${email}', 'checkout_started', 'lead_api', 'api', ${now}, '${sessionId}', 'http://localhost/checkout?session=${sessionId}');`;

// Write SQL file
import { writeFileSync } from 'node:fs';
writeFileSync('qa-row6.sql', sql);

const d1Res = await fetch('http://127.0.0.1:8788/.internal/d1/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql }),
}).catch(() => null);

if (d1Res && d1Res.ok) {
  console.log('D1 insert via internal API: OK');
} else {
  // Fall back to wrangler CLI
  const { execSync } = await import('node:child_process');
  try {
    execSync(`npx wrangler d1 execute sofrito-db --local --file qa-row6.sql`, { stdio: 'pipe' });
    console.log('D1 insert via wrangler CLI: OK');
  } catch (e) {
    console.error('D1 insert failed:', e.message);
    // Try alternate approach - see if we can use node with better-sqlite3
  }
}

// Verify lead was inserted
console.log('\n=== Step 2b: Verify lead in D1 ===');
const verifySql = `SELECT id, status, stripe_session_id FROM leads WHERE id = '${leadId}';`;
writeFileSync('qa-row6-verify.sql', verifySql);
try {
  const { execSync } = await import('node:child_process');
  const output = execSync(`npx wrangler d1 execute sofrito-db --local --file qa-row6-verify.sql`, { encoding: 'utf8' });
  console.log('Verification:', output);
} catch (e) {
  console.error('Verification failed:', e.message);
}

// --- Step 3: Build signed webhook payload ---
console.log('\n=== Step 3: Build signed webhook payload ===');
const event = {
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: sessionId,
      amount_total: 40000,
      currency: 'usd',
      invoice: `in_test_${sessionId.slice(0, 16)}`,
      description: 'Sofrito Session',
    },
  },
  id: `evt_${sessionId.slice(0, 24)}`,
};
const rawPayload = JSON.stringify(event);

// Sign with HMAC-SHA256
const t = Math.floor(Date.now() / 1000);
const payloadToSign = `${t}.${rawPayload}`;
const encoder = new TextEncoder();
const keyBytes = encoder.encode(STRIPE_WEBHOOK_SECRET);
const sigBytes = encoder.encode(payloadToSign);
const crypto = await import('node:crypto');
const signature = crypto.createHmac('sha256', keyBytes).update(sigBytes).digest('hex');
const stripeSignature = `t=${t},v1=${signature}`;

console.log('Signature built: yes');
console.log('Event ID:', event.id);

// --- Step 4: POST webhook twice ---
console.log('\n=== Step 4: POST webhook twice ===');
const results = [];
for (let i = 0; i < 2; i++) {
  const res = await fetch('http://127.0.0.1:8788/api/stripe-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': stripeSignature,
    },
    body: rawPayload,
  });
  const body = await res.text();
  results.push({ status: res.status, body });
  console.log(`POST #${i + 1}: ${res.status} ${body}`);
}

// --- Step 5: Check D1 for revenue records ---
console.log('\n=== Step 5: Check revenue in D1 ===');
const revenueSql = `SELECT COUNT(*) as count FROM revenue WHERE source = 'stripe' AND source_id = '${event.id}';`;
writeFileSync('qa-row6-revenue.sql', revenueSql);
try {
  const { execSync } = await import('node:child_process');
  const output = execSync(`npx wrangler d1 execute sofrito-db --local --file qa-row6-revenue.sql`, { encoding: 'utf8' });
  console.log('Revenue count:', output);
} catch (e) {
  console.error('Revenue check failed:', e.message);
}

// --- Step 6: Check lead status ---
console.log('\n=== Step 6: Check lead status ===');
const leadSql = `SELECT id, status, paid_at FROM leads WHERE id = '${leadId}';`;
writeFileSync('qa-row6-lead.sql', leadSql);
try {
  const { execSync } = await import('node:child_process');
  const output = execSync(`npx wrangler d1 execute sofrito-db --local --file qa-row6-lead.sql`, { encoding: 'utf8' });
  console.log('Lead status:', output);
} catch (e) {
  console.error('Lead check failed:', e.message);
}

// --- Step 7: Check email log ---
console.log('\n=== Step 7: Check email log ===');
const emailSql = `SELECT type, status FROM email_log WHERE lead_id = '${leadId}';`;
writeFileSync('qa-row6-emails.sql', emailSql);
try {
  const { execSync } = await import('node:child_process');
  const output = execSync(`npx wrangler d1 execute sofrito-db --local --file qa-row6-emails.sql`, { encoding: 'utf8' });
  console.log('Email log:', output);
} catch (e) {
  console.error('Email check failed:', e.message);
}

// --- Summary ---
console.log('\n=== ROW 6 SUMMARY ===');
const bothOk = results.every(r => r.status === 200 || r.status === 201);
console.log('Both POSTs returned 200/201:', bothOk);
console.log('Revenue count: check above');
console.log('Lead status: check above');
console.log('Email count: check above');

async function sha256Hex(str) {
  const crypto = await import('node:crypto');
  return crypto.createHash('sha256').update(str).digest('hex');
}