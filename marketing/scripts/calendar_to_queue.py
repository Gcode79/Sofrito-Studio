#!/usr/bin/env python3
"""
Sofrito Studio — content calendar -> social queue sync.

Ensures the Meta queue always has a rolling 7-day runway of IG + FB posts
by generating themed filler from the weekly calendar (content_calendar.py
themes). Idempotent: only fills dates that have no post yet.

Usage:  python marketing/scripts/calendar_to_queue.py
"""
import datetime
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
QUEUE = ROOT / "marketing" / "content" / "queue.json"
SITE = "https://sofritostudio.com"

# Current offer only: 45-minute Sofrito Session ($400), credited in full toward
# the $997 Brand & Web Sprint when the Sprint is booked within 30 days.
# The per-product pages this file used to link (starter-kit.html,
# la-mesa-boricua-sales.html, full-table.html, coquito-guide.html,
# kitchen-bundle.html) are retired and return 404.
LOCKED_CLOSER = "Book your Sofrito Session now — $400, credited in full toward your $997 sprint."
CAMPAIGN = "cta_b02"


def cta_link(platform):
    """One CTA destination for every entry. All traffic lands on the homepage
    booking anchor; /session and every /products/* path are retired."""
    return f"{SITE}/?utm_source={platform}&utm_medium=image&utm_campaign={CAMPAIGN}#book-now"


WEEK_THEMES = [
    "Sofrito batch day — the base every dish builds on",
    "Weeknight arroz con pollo, one pot, under an hour",
    "Mainland ingredient swaps — cook boricua anywhere",
    "Nochebuena planning — the timeline that saves the table",
    "Coquito & postres — the sweet side of the island",
    "Kitchen systems & meal-prep — boricua all week",
    "Family table storytelling — tradition on the plate",
]

IMAGE_BASE = SITE + "/images"

# Assets are only reachable in production if they sit under the wrangler assets
# directory (pivot-site/public/). Anything outside it 404s, so every path this
# script emits is checked against disk before it goes in the queue.
PUBLIC_IMAGES = ROOT / "pivot-site" / "public" / "images"

# Rotate pin/hero images across filler posts (indexed by day)
PIN_IMAGES = [
    "pernil-course-pin.png", "rec-alcapurrias-pin.png", "rec-arroz-gandules-pin.png",
    "rec-arroz-pin.png", "rec-coquito-pin.png", "rec-habichuelas-pin.png",
    "rec-mofongo-pin.png", "rec-pastelillos-pin.png", "rec-tembleque-pin.png",
    "rec-tostones-pin.png",
]
FB_IMAGES = [
    "pernil-course.jpg", "rec-alcapurrias.jpg", "rec-arroz-gandules.jpg",
    "rec-arroz.jpg", "rec-coquito.jpg", "rec-habichuelas.jpg",
    "rec-mofongo.jpg", "rec-pastelillos.jpg", "rec-tembleque.jpg",
    "rec-tostones.jpg",
]


def theme_for(date):
    return WEEK_THEMES[date.weekday()]


def _asset_exists(rel):
    return (PUBLIC_IMAGES / rel).is_file()


def images_for(date):
    """Return (ig_rel, fb_rel), both paths under /images/ that exist on disk.

    The Facebook jpg list is mostly aspirational — only a couple of those files
    were ever produced. Rather than emit a URL that 404s, fall back to the pin
    PNG for that day, which always exists. If the pin itself is gone, fall back
    to any verified pin. Returns (None, None) only when no asset exists at all,
    in which case the caller skips generation instead of writing a broken URL.
    """
    idx = date.toordinal() % len(PIN_IMAGES)
    pin_rel = f"pins/{PIN_IMAGES[idx]}"
    if not _asset_exists(pin_rel):
        pin_rel = next((f"pins/{p}" for p in PIN_IMAGES if _asset_exists(f"pins/{p}")), None)
    if pin_rel is None:
        available = sorted((PUBLIC_IMAGES / "pins").glob("*.png")) if (PUBLIC_IMAGES / "pins").is_dir() else []
        pin_rel = f"pins/{available[0].name}" if available else None
    if pin_rel is None:
        return None, None
    fb_rel = FB_IMAGES[idx]
    if not _asset_exists(fb_rel):
        fb_rel = pin_rel  # same verified file, different platform
    return pin_rel, fb_rel


def next_slot(posts):
    """First free slot AFTER the last scheduled FUTURE post (or today when the
    future runway is empty). The previous logic anchored on max(all datetimes),
    so once the queue hit its cap nothing new was ever generated — the runway
    silently shrank to zero while hundreds of past-dated posts sat unposted."""
    now = datetime.datetime.now(datetime.timezone.utc)
    dates = []
    for p in posts:
        if p.get("posted") or p.get("skipped"):
            continue  # posted/skipped history doesn't extend the runway
        try:
            dt = datetime.datetime.fromisoformat(p["datetime"])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            if dt.date() >= now.date():
                dates.append(dt)
        except Exception:
            continue
    base = max(dates) if dates else now
    slot = (base + datetime.timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
    return slot


# Keep the queue file bounded: drop posted/skipped posts older than this many
# days so the cap never blocks fresh top-ups again.
PRUNE_AFTER_DAYS = 45

# Hard ceiling on queue size. This was a bare 200 inline, which the queue
# silently exceeded (212 posts), turning every top-up into a permanent no-op.
# Named and raised so the limit is visible and adjustable.
QUEUE_CAP = 400

# Stop after this many new entries per run (one week of IG+FB pairs).
TOP_UP_ENTRIES = 14


def prune(posts):
    """Drop posted/skipped posts older than PRUNE_AFTER_DAYS, IN PLACE.

    This used to build and return a new list, which rebound the caller's
    `posts` name while `q["posts"]` still pointed at the original — so every
    generated entry was appended to a list that was then thrown away and the
    stale one was written back to disk. Mutating in place keeps
    `q["posts"] is posts` true so main() actually persists its work.
    """
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=PRUNE_AFTER_DAYS)
    kept, dropped = [], 0
    for p in posts:
        try:
            dt = datetime.datetime.fromisoformat(p["datetime"])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            done = p.get("posted") or p.get("skipped")
            if done and dt < cutoff:
                dropped += 1
                continue
        except Exception:
            pass
        kept.append(p)
    posts[:] = kept
    return dropped


def main():
    q = json.loads(QUEUE.read_text(encoding="utf-8"))
    posts = q["posts"]
    dropped = prune(posts)
    assert posts is q["posts"], "prune must not rebind q['posts']"
    existing = {p.get("datetime", "")[:10] for p in posts}
    counters = {}
    for p in posts:
        m = re.match(r"^(ig|fb)-(\d+)$", p.get("id", ""))
        if m:
            counters[m.group(1)] = max(counters.get(m.group(1), 0), int(m.group(2)))

    slot = next_slot(posts)
    added = 0
    while added < TOP_UP_ENTRIES and len(posts) < QUEUE_CAP:
        day = slot.date().isoformat()
        if day not in existing:
            pin_rel, fb_rel = images_for(slot.date())
            if pin_rel is None:
                print(f"no image asset found under {PUBLIC_IMAGES} - skipping top-up")
                break
            theme = theme_for(slot.date())
            counters["ig"] = counters.get("ig", 0) + 1
            counters["fb"] = counters.get("fb", 0) + 1
            posts.append({
                "id": f"ig-{counters['ig']:03d}", "platform": "instagram",
                "datetime": slot.isoformat(), "image_url": f"{IMAGE_BASE}/{pin_rel}",
                "caption": f"{theme} 🇵🇷\n\n{LOCKED_CLOSER}\n\n{cta_link('instagram')}", "posted": False,
            })
            posts.append({
                "id": f"fb-{counters['fb']:03d}", "platform": "facebook",
                "datetime": slot.isoformat(), "image_url": f"{IMAGE_BASE}/{fb_rel}",
                "caption": f"{theme}\n\n{LOCKED_CLOSER}\n\n{cta_link('facebook')}", "posted": False,
            })
            existing.add(day)
            added += 2
        slot += datetime.timedelta(days=1)

    q["posts"] = posts
    QUEUE.write_text(json.dumps(q, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"queue now: {len(posts)} posts (added {added}, pruned {dropped}, cap {QUEUE_CAP})")


if __name__ == "__main__":
    main()