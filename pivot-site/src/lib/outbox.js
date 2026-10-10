import { nowIso, sha256Hex } from './http.js';
import { enqueueEmail } from './email.js';

export async function persistPaymentEmails(env, paymentKey, jobs) {
  if (!paymentKey) throw new Error('Payment delivery requires a payment identity');
  const statements = [];
  for (const job of jobs) {
    const id = await sha256Hex(`${paymentKey}:${job.template}`);
    const payload = { ...job, delivery_key: id, emails_sent_id: id, email_log_id: id };
    statements.push(env.DB.prepare(
      `INSERT INTO email_outbox (id, created_at, payload)
       SELECT ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM emails_sent WHERE template = ? AND status IN ('queued','sent')
           AND json_extract(metadata, '$.payment_key') = ?
           AND json_extract(metadata, '$.lead_id') = ?
       ) ON CONFLICT(id) DO NOTHING`
    ).bind(id, nowIso(), JSON.stringify(payload), job.template, paymentKey, job.lead_id || null));
  }
  await env.DB.batch(statements);
}

export async function dispatchEmailOutbox(env) {
  const rows = await env.DB.prepare(
    `SELECT id, payload FROM email_outbox WHERE dispatched_at IS NULL ORDER BY created_at LIMIT 100`
  ).all();
  for (const row of rows.results || []) {
    // Failure leaves the durable row pending for the next hourly sweep.
    try {
      await enqueueEmail(env, JSON.parse(row.payload));
      await env.DB.prepare(`UPDATE email_outbox SET dispatched_at = ? WHERE id = ?`)
        .bind(nowIso(), row.id).run();
    } catch {
      console.error('email outbox dispatch failed', row.id);
    }
  }
}