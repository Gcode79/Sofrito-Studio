"""
Sofrito Studio — Instagram + Facebook content publisher.

Reads marketing/content/queue.json and publishes due posts to Instagram
(IG Business API) and Facebook (Page photos) using the Meta Graph API.

Requires (config/.env or env):
  META_ACCESS_TOKEN          (long-lived token with scopes: instagram_basic,
                              instagram_content_publish, pages_show_list,
                              pages_manage_posts)
  META_PAGE_ID               (optional — auto-resolved from the token if empty)
  META_INSTAGRAM_ACCOUNT_ID  (optional — auto-resolved from the page if empty)

Usage:
  python marketing/platforms/meta/post_to_meta.py --dry-run     # show what's due (default)
  python marketing/platforms/meta/post_to_meta.py --publish     # actually post due items
  python marketing/platforms/meta/post_to_meta.py --publish --platform instagram
"""

import hmac
import hashlib
import os
import sys
import json
import time
import datetime
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
QUEUE = ROOT / "marketing" / "content" / "queue.json"
CONFIG = ROOT / "config" / ".env"
API = "https://graph.facebook.com/v21.0"

# Safety valves: never flood the Graph API after a silent cron gap, and never
# retry a toxic post forever.
MAX_POSTS_PER_RUN = 4
STALE_SKIP_HOURS = 72
MAX_FAILURES_PER_POST = 5


def load_env():
    if CONFIG.exists():
        for line in CONFIG.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


load_env()

TOKEN = os.getenv("META_ACCESS_TOKEN", "").strip()
PAGE_ID = os.getenv("META_PAGE_ID", "").strip()
IG_ID = os.getenv("META_INSTAGRAM_ACCOUNT_ID", "").strip()
PAGE_TOKEN = ""  # page-scoped token, resolved from /me/accounts when needed
APP_SECRET = os.getenv("META_APP_SECRET", "").strip()


def appsecret_proof(token):
    """HMAC-SHA256 appsecret_proof for a token, keyed on META_APP_SECRET.
    Returns '' when the app secret is not configured so the publisher keeps
    working in local/dev setups that don't enforce the requirement."""
    if not APP_SECRET or not token:
        return ""
    return hmac.new(APP_SECRET.encode(), token.encode(), hashlib.sha256).hexdigest()

# The demo clip used as a stand-in until real faceless clips are uploaded.
# The publisher refuses to post it as-is.
PLACEHOLDER = "https://sofritostudio.com/videos/cooking-demo.mp4"
VIDEO_BASE = ROOT / "deploy" / "videos"


def local_video_path(video_url):
    """Resolve a /videos/<file>.mp4 URL to the local deploy file, or None."""
    if not video_url or not video_url.startswith("https://sofritostudio.com/videos/"):
        return None
    rel = urllib.parse.unquote(video_url.replace("https://sofritostudio.com/videos/", ""))
    if not rel or ".." in rel or "/" in rel or "\\" in rel:
        return None  # plain filename only (no traversal / subpaths)
    p = VIDEO_BASE / rel
    return p if p.is_file() else None


def video_ready(post):
    """A video post is publishable only when its video_url is a reachable,
    non-placeholder asset under /videos/. Returns (ready, reason)."""
    url = post.get("video_url") or ""
    if not url:
        return False, "no video_url"
    if url == PLACEHOLDER:
        return False, "placeholder clip — swap in a production /videos/ asset"
    local = local_video_path(url)
    if local:
        if local.suffix.lower() != ".mp4":
            return False, "video_url is not an .mp4 asset"
        if local.stat().st_size <= 0:
            return False, "video file is empty"
        return True, ""
    if not url.startswith("https://sofritostudio.com/videos/"):
        return False, "video_url is not a site /videos/ asset"
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=20) as r:
            # 2xx/3xx reachable; 405 = server allows the path but not HEAD (asset exists)
            if r.status >= 400 and r.status != 405:
                return False, f"video_url unreachable ({r.status})"
    except urllib.error.HTTPError as e:
        if e.code != 405:
            return False, f"video_url unreachable ({e.code})"
    except Exception as e:
        return False, f"video_url unreachable ({e})"
    return True, ""


def auto_ready(posts):
    """Scan phase: flip queued video posts to ready:true when a valid,
    non-placeholder .mp4 is detected in /videos/. Returns count flipped."""
    flipped = 0
    for post in posts:
        if post.get("kind") != "video" or not post.get("video_url"):
            continue
        if post.get("video_url") == PLACEHOLDER:
            continue
        local = local_video_path(post.get("video_url"))
        if not local or local.suffix.lower() != ".mp4" or local.stat().st_size <= 0:
            continue
        if not post.get("ready"):
            post["ready"] = True
            print(f"[AUTO-READY] Flipped {post['id']} to ready state after detecting {local.name}")
            flipped += 1
    return flipped


def graph(path, params) -> dict:
    params["access_token"] = TOKEN
    proof = appsecret_proof(TOKEN)
    if proof:
        params["appsecret_proof"] = proof
    url = f"{API}/{path}?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=40) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:300]}


def graph_post(path, params) -> dict:
    """POST to the Graph API (used by IG media creation/publish endpoints —
    GET-only would return a list instead of creating a container)."""
    params["access_token"] = TOKEN
    proof = appsecret_proof(TOKEN)
    if proof:
        params["appsecret_proof"] = proof
    body = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"{API}/{path}", data=body, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:300]}


def resolve_page_and_ig():
    """Auto-resolve the Facebook page id (from the token) and the linked
    Instagram business account id. Both are optional if already configured."""
    page_id = PAGE_ID
    if not page_id:
        accounts = graph("me/accounts", {"fields": "id,name"})
        pages = accounts.get("data") or []
        if pages:
            page_id = pages[0]["id"]
    if not page_id:
        return None, None
    ig_id = IG_ID
    if not ig_id:
        info = graph(page_id, {"fields": "instagram_business_account"})
        iba = info.get("instagram_business_account") or {}
        ig_id = iba.get("id")
    return page_id, ig_id


def post_instagram(image_url, caption):
    created = graph_post(f"{IG_ID}/media", {"image_url": image_url, "caption": caption})
    if "error" in created:
        return created
    cid = created.get("id")
    if not cid:
        return {"error": "no creation id"}
    published = graph_post(f"{IG_ID}/media_publish", {"creation_id": cid})
    if "error" in published:
        return published
    return {"ok": True, "media_id": published.get("id")}


def resolve_page_token():
    """Fetch the page-scoped access token for the configured page. Page
    posting requires a page token (System User tokens carry the scopes but
    aren't page-scoped). Returns '' if not resolvable."""
    global PAGE_TOKEN
    if PAGE_TOKEN:
        return PAGE_TOKEN
    accounts = graph("me/accounts", {"fields": "id,access_token"})
    for page in accounts.get("data") or []:
        if page.get("id") == PAGE_ID and page.get("access_token"):
            PAGE_TOKEN = page["access_token"]
            return PAGE_TOKEN
    return ""


def post_facebook(image_url, caption):
    pt = resolve_page_token()
    if not pt:
        return {"error": "no page token (could not resolve from /me/accounts)"}
    data = urllib.parse.urlencode({
        "url": image_url, "message": caption, "access_token": pt,
        **({"appsecret_proof": appsecret_proof(pt)} if appsecret_proof(pt) else {}),
    }).encode()
    req = urllib.request.Request(f"{API}/{PAGE_ID}/feed", data=data)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return {"ok": True, "id": json.loads(r.read().decode()).get("id")}
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:300]}


def post_instagram_video(video_url, caption, thumb=None):
    params = {"media_type": "REELS", "video_url": video_url, "caption": caption, "access_token": TOKEN}
    if thumb:
        params["cover_url"] = thumb
    created = graph_post(f"{IG_ID}/media", params)
    if "error" in created:
        return created
    cid = created.get("id")
    if not cid:
        return {"error": "no reels creation id"}
    # Meta must finish processing the Reels container before media_publish —
    # publishing immediately fails with "Media ID is not available". Poll
    # status_code until FINISHED (or ERROR / timeout).
    deadline = time.time() + 300
    while time.time() < deadline:
        st = graph(f"{IG_ID}/{cid}", {"fields": "status_code"})
        code = (st or {}).get("status_code")
        if code == "FINISHED":
            break
        if code == "ERROR":
            return {"error": f"reels processing failed: {json.dumps(st)[:200]}"}
        if "error" in (st or {}):
            return {"error": f"reels status poll failed: {json.dumps(st)[:200]}"}
        time.sleep(10)
    else:
        return {"error": "reels processing timeout (container not FINISHED after 300s)"}
    published = graph_post(f"{IG_ID}/media_publish", {"creation_id": cid})
    if "error" in published:
        return published
    return {"ok": True, "media_id": published.get("id")}


def post_facebook_video(video_url, caption):
    pt = resolve_page_token()
    if not pt:
        return {"error": "no page token (could not resolve from /me/accounts)"}
    data = urllib.parse.urlencode({
        "file_url": video_url, "description": caption, "access_token": pt,
        **({"appsecret_proof": appsecret_proof(pt)} if appsecret_proof(pt) else {}),
    }).encode()
    req = urllib.request.Request(f"{API}/{PAGE_ID}/videos", data=data)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return {"ok": True, "id": json.loads(r.read().decode()).get("id")}
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:300]}


def due_posts(posts, platform=None):
    """Due = unposted, not permanently failed, scheduled at/before now,
    oldest first, capped per run. Posts overdue by more than STALE_SKIP_HOURS
    are marked skipped so a silent cron gap can't flood the feed on recovery."""
    now = datetime.datetime.now(datetime.timezone.utc)
    stale_cutoff = now - datetime.timedelta(hours=STALE_SKIP_HOURS)
    out = []
    skipped_stale = 0
    for p in posts:
        if p.get("posted") or p.get("skipped"):
            continue
        if p.get("fail_count", 0) >= MAX_FAILURES_PER_POST:
            continue
        if platform and p.get("platform") != platform:
            continue
        try:
            dt = datetime.datetime.fromisoformat(p["datetime"])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
        except Exception:
            continue
        if dt <= stale_cutoff:
            p["skipped"] = True
            skipped_stale += 1
            continue
        if dt <= now:
            out.append(p)
    out.sort(key=lambda p: p["datetime"])
    if skipped_stale:
        print(f"marked {skipped_stale} stale post(s) (> {STALE_SKIP_HOURS}h overdue) as skipped")
    return out[:MAX_POSTS_PER_RUN]


def main():
    global PAGE_ID, IG_ID  # auto-resolve may rewrite these
    publish = "--publish" in sys.argv
    platform = None
    if "--platform" in sys.argv:
        platform = sys.argv[sys.argv.index("--platform") + 1]

    if not QUEUE.exists():
        print("no queue at", QUEUE)
        return
    queue = json.loads(QUEUE.read_text(encoding="utf-8"))
    posts = queue.get("posts", [])

    # Scan phase: auto-flip queued videos to ready when a real /videos/ clip
    # is detected, and persist the state.
    flipped = auto_ready(posts)
    if flipped:
        QUEUE.write_text(json.dumps(queue, indent=2, ensure_ascii=False), encoding="utf-8")

    due = due_posts(posts, platform)
    if not due:
        print("nothing due.")
        return

    if not (TOKEN and PAGE_ID and IG_ID):
        if not TOKEN:
            print("META_ACCESS_TOKEN not set (config/.env). Dry-run of due posts only:")
            for p in due:
                print(f"  [{p['platform']}] {p['id']} {p['datetime']} {p['image_url']}")
            return
        # Token present but page/IG ids missing — auto-resolve from the token.
        page_id, ig_id = resolve_page_and_ig()
        if not page_id or not ig_id:
            print(f"Could not auto-resolve page/IG ids. Set META_PAGE_ID + META_INSTAGRAM_ACCOUNT_ID in config/.env.")
            print("Dry-run of due posts only:")
            for p in due:
                print(f"  [{p['platform']}] {p['id']} {p['datetime']} {p['image_url']}")
            return
        PAGE_ID, IG_ID = page_id, ig_id
        print(f"resolved PAGE_ID={PAGE_ID} IG_ID={IG_ID}")

    for p in due:
        print(f"posting [{p['platform']}] {p['id']} ...", end=" ")
        if not publish:
            if p.get("video_url"):
                ready, reason = video_ready(p)
                print(f"(dry-run, would post [video: {'ready' if ready else 'pending — ' + reason}])")
            else:
                print("(dry-run, would post)")
            continue
        if p.get("video_url"):
            ready, reason = video_ready(p)
            if not ready:
                print("SKIP (" + reason + ")")
                continue
            if p["platform"] == "instagram":
                res = post_instagram_video(p["video_url"], p["caption"], p.get("image_url"))
            else:
                res = post_facebook_video(p["video_url"], p["caption"])
        elif p["platform"] == "instagram":
            res = post_instagram(p["image_url"], p["caption"])
        else:
            res = post_facebook(p["image_url"], p["caption"])
        if res.get("ok"):
            p["posted"] = True
            p["fail_count"] = 0
            print("OK", res.get("id") or res.get("media_id"))
        else:
            p["fail_count"] = p.get("fail_count", 0) + 1
            print("FAIL", res.get("error", ""), f"(attempt {p['fail_count']}/{MAX_FAILURES_PER_POST})")

    QUEUE.write_text(json.dumps(queue, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()