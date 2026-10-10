// QA Wave-2 Row 8: Abandon 2h+ Test
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import crypto from 'node:crypto';

function sqlFile(name, content) {
  const path = `./${name}.sql`;
  writeFileSync(path, content);
  return path;
}

function d1ExecFile(sqlPath) {
  return execSync(`npx wrangler d1 execute sofrito-db --local --file "${sqlPath}"`, { encoding: 'utf8', timeout: 30000 });
}

function d1QueryFile(sqlPath) {
  const r = d1ExecFile(sqlPath);
  const m = r.match(/\[[\s\S]*\]/);
  return m ? JSON.parse(m[0]) : null;
}

async function d1Exec(sql) {
  const path = sqlFile('_tmp_r8_exec', sql);
  try { return d1ExecFile(path); }
  finally { try { unlinkSync(path); } catch {} }
}

async function d1Query(sql) {
  const path = sqlFile('_tmp_r8_q', sql);
  try { return d1QueryFile(path); }
  finally { try { unlinkSync(path); } catch {} }
}

function q(val) {
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

const email = `qa8-${Date.now()}@test.com`;
const leadId = `lead_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 24)}`;

console.log('=== ROW 8: Abandon 2h+ ===');
console.log(`Lead: ${leadId}, Email: ${email}`);

// 1. Insert lead with old checkout_started_at
console.log('\n[1] Inserting lead with 3h-old checkout...');
const now = Math.floor(Date.now() / 1000);
const threeHoursAgo = now - 10800;

await d1Exec(`DELETE FROM leads WHERE id = ${q(leadId)};`);
await d1Exec(
  `INSERT INTO leads (id, created_at, name, email, status, source, channel, checkout_started_at, nudge_sent_at, checkout_url) ` +
  `VALUES (${q(leadId)}, datetime('now'), 'QA Row 8', ${q(email)}, 'checkout_started', 'lead_api', 'api', ${threeHoursAgo}, NULL, ${q('http://localhost/checkout')});`
);
console.log('Lead inserted.');
const before = await d1Query(`SELECT id, status, checkout_started_at, nudge_sent_at FROM leads WHERE id = ${q(leadId)};`);
console.log('Before:', JSON.stringify(before));

// 2. Import worker and call scheduled handler with mocked env
console.log('\n[2] Invoking scheduled handler...');

const workerModule = await import('./src/worker.js');
const worker = workerModule.default;

function makeDBProxy() {
  return {
    prepare(sql) {
      let finalSql = sql;
      return {
        bind(...args) {
          return {
            async first() {
              let sql = finalSql;
              for (const arg of args) {
                const val = typeof arg === 'string' ? arg.replace(/'/g, "''") : String(arg);
                sql = sql.replace(/\?/, `'${val}'`);
              }
              try {
                const path = sqlFile('_tmp_db', sql);
                try {
                  const r = d1ExecFile(path);
                  const m = r.match(/\[[\s\S]*\]/);
                  if (!m) return null;
                  const data = JSON.parse(m[0]);
                  return data?.results?.[0] ?? null;
                } finally { try { unlinkSync(path); } catch {} }
              } catch (e) {
                console.error('DB first failed:', e.message, sql);
                return null;
              }
            },
            async all() {
              let sql = finalSql;
              for (const arg of args) {
                const val = typeof arg === 'string' ? arg.replace(/'/g, "''") : String(arg);
                sql = sql.replace(/\?/, `'${val}'`);
              }
              try {
                const path = sqlFile('_tmp_db', sql);
                try {
                  const r = d1ExecFile(path);
                  const m = r.match(/\[[\s\S]*\]/);
                  if (!m) return [];
                  const data = JSON.parse(m[0]);
                  return data?.results ?? [];
                } finally { try { unlinkSync(path); } catch {} }
              } catch (e) {
                console.error('DB all failed:', e.message, sql);
                return [];
              }
            },
            async run() {
              let sql = finalSql;
              for (const arg of args) {
                const val = typeof arg === 'string' ? arg.replace(/'/g, "''") : String(arg);
                sql = sql.replace(/\?/, `'${val}'`);
              }
              try {
                const path = sqlFile('_tmp_db', sql);
                try { d1ExecFile(path); } finally { try { unlinkSync(path); } catch {} }
                return { success: true };
              } catch (e) {
                console.error('DB run failed:', e.message, sql);
                return { success: false };
              }
            },
          };
        },
      };
    },
  };
}

const env = {
  DB: makeDBProxy(),
  CONFIG: { get: async () => null, put: async () => {} },
  EMAIL_QUEUE: { send: async () => ({ ok: true }) },
  WEBHOOK_QUEUE: { send: async () => ({ ok: true }) },
  OPENROUTER_API_KEY: 'test',
  FLOW_API_KEY: 'test',
  SITE_URL: 'http://localhost',
  NOTIFICATION_EMAIL: 'test@sofritostudio.com',
};

const ctx = { waitUntil: async (p) => { await p; } };

try {
  await worker.scheduled({ signal: AbortSignal.timeout(30000) }, env, ctx);
  console.log('Scheduled handler executed successfully.');
} catch (e) {
  console.error('Scheduled handler failed:', e.message);
  console.error(e.stack);
}

// 3. Check nudge status
console.log('\n[3] Checking nudge...');
const after = await d1Query(`SELECT id, status, nudge_sent_at FROM leads WHERE id = ${q(leadId)};`);
console.log('After:', JSON.stringify(after));

const nudgeSent = after?.[0]?.results?.[0]?.nudge_sent_at !== null && after?.[0]?.results?.[0]?.nudge_sent_at !== undefined;
const nudgeVal = after?.[0]?.results?.[0]?.nudge_sent_at;
const statusAbandoned = after?.[0]?.results?.[0]?.status === 'abandoned';
console.log(`Nudge sent: ${nudgeSent} (nudge_sent_at: ${nudgeVal})`);
console.log(`Status abandoned: ${statusAbandoned}`);
console.log(`PASS: ${nudgeSent && statusAbandoned}`);
