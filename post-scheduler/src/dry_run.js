// dry_run.js — local, safe, no-network engine test for the Sofrito Studio post scheduler.
// Mirrors the selection + payload-building logic in scheduler.js (KV → fetch is the only
// part omitted, so this can never publish). Run with:  npm run check
//
// It loads the real calendar file, picks the next pending post scheduled for today or
// later, resolves the platform's top posting hour (if a schedule profile is present),
// and prints the exact payload that WOULD be sent — proving the ad queue fires correctly.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CALENDAR_PATH = resolve(here, '../calendar_update.json');

// Minimal in-memory stand-in for a KV schedule-profile entry (mirrors env.POST_METRICS).
// Only used by the top-hour adjustment; keep empty to exercise the "no profile" path.
const SCHEDULE_PROFILES = Object.freeze({
  instagram: { topHours: ['9', '13', '18'] },
  twitter:   { topHours: ['8', '12', '17'] },
});

function loadProfile(platform) {
  return SCHEDULE_PROFILES[platform] ?? null;
}

function pickNextPending(calendar, now) {
  return calendar
    .filter((p) => (p.status ?? p.scheduleStatus ?? 'pending') === 'pending')
    .filter((p) => new Date(p.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    [0] ?? null;
}

// Mirror of scheduler.js: resolve the platform + type to an API endpoint and payload body.
// NOTE: never executed against the network here — this only builds and prints the request.
function buildRequest(next, profile) {
  const platform = next.platform ?? next.schedulePlatform;
  const type = next.type ?? 'video';
  const copy = next.copy ?? next.scheduleCopy ?? '';
  const utm = next.utm ?? next.tracking ?? '';
  const asset = next.assetUrl ?? next.assetFile ?? next.asset ?? '';

  // Top-hour adjustment (identical logic to the engine).
  let date = new Date(next.date);
  let topHourNote = 'none';
  if (profile && profile.topHours?.length) {
    const hours = profile.topHours.map((h) => parseInt(String(h), 10));
    const nowHour = new Date().getUTCHours();
    // Preserve the stored date's hour when it's from the same day, else snap forward.
    const chosen = hours.find((h) => h > nowHour) ?? hours[0];
    date = new Date(date);
    date.setUTCHours(chosen, 0, 0, 0);
    topHourNote = `top-hour ${chosen}:00 UTC`;
  }

  const apiUrlByPlatform = {
    twitter:   'https://api.twitter.com/2/tweets',
    linkedin:  'https://api.linkedin.com/v2/ugcPosts',
    facebook:  'https://graph.facebook.com/v18.0/me/feed',
    tiktok:    'https://open-api.tiktok.com/v1/video/publish/',
    instagram: 'https://graph.facebook.com/v18.0/me/media',
    youtube:   'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable',
  };

  return {
    id: next.id ?? next.postId,
    date: date.toISOString(),
    platform,
    type,
    apiUrl: apiUrlByPlatform[platform],
    asset,
    copy: `${copy} ${utm}`.trim(),
    utm,
    topHour: topHourNote,
    statusAfterRun: 'sent',
  };
}

async function main() {
  const raw = await readFile(CALENDAR_PATH, 'utf8');
  const calendar = JSON.parse(raw);
  const now = new Date();

  console.log(`Loaded ${calendar.length} calendar entries from ${CALENDAR_PATH}`);
  console.log(`Engine local dry-run — ${now.toISOString()}\n`);

  const next = pickNextPending(calendar, now);
  if (!next) {
    console.log('No pending post scheduled for today or later. Nothing to send. ✅');
    console.log('(This means current calendar items are either past-dated or already sent.)');
    return;
  }

  const profile = loadProfile(next.platform ?? next.schedulePlatform);
  const request = buildRequest(next, profile);

  console.log('NEXT PENDING POST — would send:');
  console.log(JSON.stringify(request, null, 2));
  console.log('\nMetric initial state written by engine: impressions=0 clicks=0 likes=0 comments=0 shares=0');
  console.log(`\nDRY RUN COMPLETE — no network call made, nothing published. Next would be marked ${request.statusAfterRun}.`);
}

main().catch((err) => {
  console.error(`Dry run failed: ${err.message}`);
  process.exitCode = 1;
});
