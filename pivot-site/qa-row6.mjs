// QA Wave-2 Row 6: Webhook Replay Test (file-based SQL)
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

const dotenv = readFileSync('.dev.vars', 'utf8');
const STRIPE_API_KEY = getEnv(dotenv, 'STRIPE_API_KEY');
const STRIPE_WEBHOOK_SECRET = getEnv(dotenv, 'STRIPE_WEBHOOK_SECRET');

function getEnv(content, key) {
  const m = content.match(new RegExp(`${key}=["']?([^"'\r\n]+)`));
  return m ? m[1] : null;
}

function sqlFile(name, content) {
  const path = `./${name}.sql`;
  writeFileSync(path, content);
  return path;
}

function d1ExecFile(sqlPath) {
  try {
    return execSync(`npx wrangler d1 execute sofrito-db --local --file "${sqlPath}"`, { encoding: 'utf8', timeout: 30000 });
  } catch (e) {
    console.error('D1 exec failed:', e.stderr?.toString() || e.message);
    throw e;
  }
}

function d1QueryFile(sqlPath) {
  const r = d1ExecFile(sqlPath);
  const m = r.match(/\[[\s\S]*\]/);
  return m ? JSON.parse(m[0]) : null;
}

async function d1Exec(sql) {
  const path = sqlFile('_tmp_exec', sql);
  try {
    return d1ExecFile(path);
  } finally {
    try { unlinkSync(path); } catch {}
  }
}

async function d1Query(sql) {
  const path = sqlFile('_tmp_q', sql);
  try {
    return d1QueryFile(path);
  } finally {
    try { unlinkSync(path); } catch {}
  }
}

const testEmail = `qa6-${Date.now()}@test.com`;
const leadId = `lead_${crypto.createHash('sha256').update(testEmail).digest('hex').slice(0, 24)}`;

console.log('=== ROW 6: Webhook Replay ===');
console.log(`Lead: ${leadId}, Email: ${testEmail}`);

// 1. Create Stripe checkout session
console.log('\n[1] Creating checkout session...');
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
    'metadata[lead_id]': leadId,
  }),
});
if (!sessionRes.ok) {
  console.error('Session creation failed:', sessionRes.status, await sessionRes.text());
  process.exit(1);
}
const session = await sessionRes.json();
const sessionId = session.id;
console.log(`Session: ${sessionId}`);

// 2. Insert lead into D1
console.log('\n[2] Inserting lead into D1...');
const now = Math.floor(Date.now() / 1000);
await d1Exec(
  `INSERT OR IGNORE INTO leads (id, created_at, name, email, status, source, channel, checkout_started_at, stripe_session_id, checkout_url) VALUES (${q(leadId)}, datetime('now'), ${q('QA Row 6')}, ${q(testEmail)}, ${q('checkout_started')}, ${q('lead_api')}, ${q('api')}, ${now}, ${q(sessionId)}, ${q('http://localhost/success.html')});`
);
console.log('Lead inserted.');
const v1 = await d1Query(`SELECT id, status, stripe_session_id FROM leads WHERE id = ${q(leadId)};`);
console.log('Verification:', JSON.stringify(v1));

// 3. Build signed payload
console.log('\n[3] Building signed payload...');
const event = {
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: sessionId, amount_total: 40000, currency: 'usd', invoice: `in_${sessionId.slice(0, 16)}`, description: 'Sofrito Session' } },
  id: `evt_${sessionId.slice(0, 24)}`,
};
const raw = JSON.stringify(event);
const t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest('hex');
const header = `t=${t},v1=${sig}`;
console.log('Signed.');

// 4. POST twice
console.log('\n[4] POSTing webhook twice...');
const results = [];
for (let i = 0; i < 2; i++) {
  const res = await fetch('http://127.0.0.1:8788/api/stripe-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
    body: raw,
  });
  const body = await res.text();
  results.push({ status: res.status, body });
  console.log(`  #${i + 1}: ${res.status} ${body}`);
}

// 5. Check D1
console.log('\n[5] Checking D1 state...');
const lead = await d1Query(`SELECT id, status, paid_at FROM leads WHERE id = ${q(leadId)};`);
console.log('Lead:', JSON.stringify(lead));
const rev = await d1Query(`SELECT COUNT(*) as count FROM revenue WHERE source = ${q('stripe')} AND source_id = ${q(event.id)};`);
console.log('Revenue:', JSON.stringify(rev));
const emails = await d1Query(`SELECT type FROM email_log WHERE lead_id = ${q(leadId)};`);
console.log('Emails:', JSON.stringify(emails));

// Summary
const paid = lead?.[0]?.results?.[0]?.status === 'paid';
const revCount = rev?.[0]?.results?.[0]?.count ?? 0;
const emailTypes = emails?.[0]?.results?.map(r => r.type) ?? [];
const hasReceipt = emailTypes.includes('receipt');
const hasBooking = emailTypes.includes('booking_link');
const pass = results.every(r => r.status === 200 || r.status === 201) && paid && revCount === 1 && hasReceipt && hasBooking;
console.log('\n[RESULT]');
console.log(`  Both POSTs OK: ${results.every(r => r.status === 200 || r.status === 201)}`);
console.log(`  Lead paid: ${paid}`);
console.log(`  Revenue count: ${revCount}`);
console.log(`  Receipt: ${hasReceipt}, Booking: ${hasBooking}, Total: ${emailTypes.length}`);
console.log(`  PASS: ${pass}`);

function q(val) {
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}
