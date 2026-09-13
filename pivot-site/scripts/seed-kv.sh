#!/usr/bin/env bash
# ============================================================
# Sofrito Studio — KV seed script (CONFIG binding)
# Job: 1c
# MCP: cloudflare-bindings
# Last updated: 2026-09-04
# Purpose: Seeds KV = truth for all config/pricing/feature flags
#          + the email templates emitted from src/emails/*.html.
# Run: bash scripts/seed-kv.sh   (after wrangler login)
# ============================================================
set -euo pipefail

KV_BINDING="CONFIG"
BASE_URL="${SITE_URL:-https://sofritostudio.com}"

kv() { # kv <key> <value>
  npx wrangler kv key put --binding="$KV_BINDING" "$1" "$2" >/dev/null
  echo "kv: $1"
}

kv_file() { # kv_file <key> <path>  (reads file bytes)
  npx wrangler kv key put --binding="$KV_BINDING" "$1" --path="$2" >/dev/null
  echo "kv: $1 (file ${2})"
}

echo "=== site config ==="
kv "site/name"    "Sofrito Studio"
kv "site/tagline" "Brand foundations for food businesses"
kv "site/url"     "$BASE_URL"
kv "site/positioning" "Your food has a story. We make sure people taste it before they take a single bite."
# Public-safe config served at GET /api/config. Set session_url (Stripe/Calendly)
# and booking_url when they exist; null hides the buttons on the pages.
kv "site/config" '{"email":"hello@sofritostudio.com","socials":{"instagram":"https://instagram.com/sofritostudio"},"session_url":null,"booking_url":null}'

echo "=== packages ==="
kv "packages/session"       '{"name":"Sofrito Session","category":"session","description":"1:1 brand session","price_cents":40000,"billing":"one_time","cta":"Book a Sofrito Session"}'
kv "packages/sprint"        '{"name":"Brand & Web Sprint","category":"project","description":"Brand + website in 48 hours","price_cents":99700,"billing":"one_time","cta":"Start the Sprint"}'

echo "=== feature flags ==="
kv "features/lead-capture"       "on"
kv "features/email-drip"         "on"
kv "features/newsletter"         "on"
kv "features/social-pipeline"    "on"
kv "features/case-study-drafts"  "on"

echo "=== lead scoring weights ==="
kv "scoring/weights" '{"package_specific":30,"budget_set":20,"message_length_30":25,"business_name":15,"phone":10,"max":100}'

echo "=== email drip schedule ==="
kv "drip/schedule" '{"welcome_1":{"day":2,"template":"templates/emails/welcome-1.html"},"welcome_2":{"day":5,"template":"templates/emails/welcome-2.html"},"welcome_3":{"day":9,"template":"templates/emails/welcome-3.html"}}'

echo "=== email templates (from src/emails) ==="
for f in "$(dirname "$0")/../src/emails/"*.html; do
  name="$(basename "$f")"
  kv_file "templates/emails/$name" "$f"
done

echo "=== make.com webhook routing ==="
kv "make/lead-topic" "lead.new"

echo "Done. Verify: npx wrangler kv key list --binding=CONFIG"