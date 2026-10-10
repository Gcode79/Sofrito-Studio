// ============================================================
// Sofrito Studio — Lead Capture Route (draft snippet)
// Target: src/worker.js  •  Job: module 3 Inbound Handling
// Bindings (from wrangler.toml — source of truth):
//   D1 `DB`  •  KV `CONFIG`  •  Queue `WEBHOOK_QUEUE`
// Status: DRAFT — awaiting founder approval before merge/deploy.
// ============================================================
// DESIGN NOTES
// ------------
// * D1 is the source of truth for business data. The insert is
//   idempotent on the PK: a re-post / retry of the same lead never
//   creates a duplicate row (and we never double-email).
// * The Zapier Google-Sheets webhook is a *side effect* → it goes
//   through WEBHOOK_QUEUE (async, retryable, max_retries=3) per the
//   repo's standing rule. The request path only does fast D1 work.
//   ⚠️ If the founder wants the webhook fired SYNCHRONOUSLY in the
//   request path instead, replace the `enqueueWebhook()` block below
//   with the one-liner in the comment at the bottom of this file.
// * No secrets/customer data in logs. The webhook URL is read from
//   KV CONFIG, never hard-coded.
// ============================================================

const ISO_NOW = () => strftime("%Y-%m-%dT%H:%M:%fZ", "now"); // repo timestamp convention

function leadId(email) {
  // Deterministic id from the canonical email → dedupes re-posts.
  return crypto.subtle
    ? `lead_${email.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "")}`
    : `lead_${Date.now()}`;
}

async function fetchZapierWebhook(url, payload, env) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`zapier_http_${res.status}`);
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ---- Only handle POST /api/lead on the apex domain ----
    if (!(request.method === "POST" && url.pathname === "/api/lead")) {
      return new Response("Not found", { status: 404 });
    }

    const isDuplicateByEmail = (conn, email) =>
      conn
        .prepare("SELECT id FROM leads WHERE email = ?1 LIMIT 1")
        .bind(email)
        .first();

    try {
      const body = await request.json();
      const email = String(body.email || "").trim().toLowerCase();

      // ---- Minimal validation (no new deps, no injection) ----
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ error: "invalid_email" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const name = String(body.name || "").slice(0, 120);
      const businessName = String(body.business_name || "").slice(0, 120);
      const businessType = String(body.business_type || "").slice(0, 80);
      const message = String(body.message || "").slice(0, 2000);
      const channel = String(body.channel || "contact_form").slice(0, 40);

      const db = env.DB;

      // ---- Idempotent dedupe: re-submit of same email returns existing row ----
      const existing = await isDuplicateByEmail(db, email);
      if (existing) {
        // Still log the webhook (mark as "existing_lead") so Sheets sees repeat touchpoints.
        await enqueueWebhook(env, {
          kind: "lead_capture",
          status: "existing",
          email,
          created_at: ISO_NOW(),
        });
        return new Response(JSON.stringify({ id: existing.id, duplicate: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // ---- Insert to D1 (source of truth) ----
      const id = leadId(email);
      const now = ISO_NOW();
      await db
        .prepare(
          `INSERT INTO leads (id, name, email, business_name, business_type, message, channel, status, source, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'new', 'contact_form', ?8, ?8)`
        )
        .bind(id, name, email, businessName || null, businessType || null, message, channel, now)
        .run();

      // ---- Async side-effect: log to Google Sheets via Zapier webhook ----
      await enqueueWebhook(env, {
        kind: "lead_capture",
        status: "new",
        email,
        business_name: businessName,
        business_type: businessType,
        message,
        channel,
        lead_id: id,
        created_at: now,
      });

      // ---- Async auto-reply queue (module 3 step "Push the lead to EMAIL_QUEUE") ----
      await env.EMAIL_QUEUE.send({
        kind: "lead_welcome",
        to: email,
        lead_id: id,
        created_at: now,
      });

      return new Response(JSON.stringify({ id, created_at: now }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // No sensitive data in the log line.
      console.error("lead_capture_error", err && err.message);
      return new Response(JSON.stringify({ error: "capture_failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

// ---- Async dispatch to Zapier (idempotent, retryable) ----
async function enqueueWebhook(env, payload) {
  const zapierUrl = await env.CONFIG.get("ZAPIER_LEAD_WEBHOOK_URL");
  if (!zapierUrl) {
    // URL not provisioned yet in KV — record the intent, don't crash the lead capture.
    console.error("zapier_webhook_unconfigured");
    return;
  }
  await env.WEBHOOK_QUEUE.send({
    zapier_url: zapierUrl,
    payload,
    retry_count: 0,
  });
}

// ============================================================
// Queue consumer (append to the existing WEBHOOK_QUEUE handler):
// ============================================================
// export async function queue(batch, env) {
//   for (const msg of batch.messages) {
//     const { zapier_url, payload } = msg.body;
//     try {
//       await fetchZapierWebhook(zapier_url, payload, env);
//       msg.ack();                       // success → remove from queue
//     } catch (e) {
//       msg.retry();                     // wrangler queue retries (max_retries=3)
//     }
//   }
// }
//
// ------------------------------------------------------------------
// ⚠️ SYNC alternative (only if the founder overrides the async rule):
// Replace `await enqueueWebhook(env, {...})` with:
//   await fetchZapierWebhook(
//     await env.CONFIG.get("ZAPIER_LEAD_WEBHOOK_URL"),
//     { kind: "lead_capture", status: "new", email, created_at: now },
//     env
//   );
// NOTE: this places a third-party HTTP call in the request hot path
// and defeats retry/queue backpressure — not recommended.
// ============================================================
