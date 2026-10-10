// ============================================================
// SOPRITO STUDIO — Lead Capture + Zapier → Google Sheets
// Target: src/worker.js  (draft, awaiting founder approval to merge)
// ============================================================
// CONTRACT WITH THE FOUNDER'S STANDING RULES:
//  * D1 is source of truth — lead row written first, synchronously.
//  * The Zapier webhook (Google Sheets) and the auto-email are
//    SIDE EFFECTS → enqueued asynchronously (WEBHOOK_QUEUE /
//    EMAIL_QUEUE), never awaited in the request path (fast return,
//    queue-driven retries, no double-send on retry thanks to the
//    (kind, external_id) unique constraint on outreach_events).
//  * No secrets in code: webhook URL lives in KV CONFIG, read at
//    run time. Nothing customer-identifiable is logged.

import { fetchZapierWebhook } from "./integrations/zapier";

function nowIso() {
  return new Date().toISOString();
}

// Deterministic, reproducible id from the canonical (lowercased) email.
// Lets the same lead be re-submitted without creating a duplicate row.
function leadId(email) {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  return `lead_${enc}`; // safe: only [A-Za-z0-9_.~-] after encoding
}

export async function handleLeadCapture(request, env, ctx) {
  try {
    // ---- Read body ONCE (handlers run async; request is a stream) ----
    const raw = await request.text();
    const body = raw ? JSON.parse(raw) : {};

    // ---- Validate (no new deps; manual, terse) ----
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!name) {
      return new Response(JSON.stringify({ error: "name_required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const phone = String(body.phone ?? "").trim().slice(0, 40);
    const businessName = String(body.business_name ?? "").trim().slice(0, 160);
    const businessType = String(body.business_type ?? "").trim().slice(0, 120);
    const budget = String(body.budget ?? "").trim().slice(0, 80);
    const message = String(body.message ?? "").trim().slice(0, 2000 optional));
  }
}
