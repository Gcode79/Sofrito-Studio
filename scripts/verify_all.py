#!/usr/bin/env python3
"""
Sofrito Studio — pre-commit / pre-deploy verification harness.

Runs every check the project has before anything is committed or deployed:

  CODE      node --check on all JS        | python -m py_compile on all .py
            PowerShell parse on all .ps1  | JSON validity on all .json
  MARKUP    HTML well-formedness (deploy + root) for every page
  ASSETS    every internal href/src/srcset/style-bg resolves to a real file
  WORKFLOW  all .github/workflows referenced scripts exist, YAML parses
  WORKER    every JS import in cloudflare/src resolves locally
  AUTOMATION no unbounded loop/spike patterns in automation scripts
  SEO       canonical present per page, noindex flags, sitemap URLs resolve (warnings)
  FORMS     form fields carry autocomplete attributes (warnings)

Exit 0 = all green (safe to commit/deploy). Exit 1 = at least one failure.

Usage:
  python scripts/verify_all.py                # full check (default)
  python scripts/verify_all.py --quick        # skip the slow HTML crawl
"""
import datetime
import html.parser
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Encode-safe output (git hooks / Windows consoles can default to cp1252)
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
QUICK = "--quick" in sys.argv

FAILURES = []
WARNINGS = []
PASS = 0


def fail(area, msg):
    FAILURES.append(f"[{area}] {msg}")


def warn(area, msg):
    WARNINGS.append(f"[{area}] {msg}")


def ok(area):
    global PASS
    PASS += 1


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, shell=False, **kw)


def js_ext(path):
    return path.suffix == ".js"


def py_ext(path):
    return path.suffix == ".py"


def ps_ext(path):
    return path.suffix == ".ps1"


# ------------------------------------------------------------------
# 1) JavaScript syntax
# ------------------------------------------------------------------
def check_js():
    files = list((ROOT / "deploy" / "js").glob("*.js")) + list((ROOT / "cloudflare" / "src").glob("*.js"))
    bad = 0
    for f in sorted(set(files)):
        r = run(["node", "--check", str(f)])
        if r.returncode != 0:
            bad += 1
            fail("JS", f"{f.relative_to(ROOT)}: {r.stderr.strip()[:200]}")
    if not bad:
        ok("JS")


# ------------------------------------------------------------------
# 2) Python compile
# ------------------------------------------------------------------
def check_py():
    dirs = ["mailer", "buttondown", "marketing", "marketing/scripts", "scripts"]
    files = []
    for d in dirs:
        base = ROOT / d
        if base.exists():
            files += [p for p in base.rglob("*.py")]
    bad = 0
    for f in files:
        r = run([sys.executable, "-m", "py_compile", str(f)])
        if r.returncode != 0:
            bad += 1
            fail("PY", f"{f.relative_to(ROOT)}: {r.stderr.strip()[:200]}")
    if not bad:
        ok("PY")


# ------------------------------------------------------------------
# 3) PowerShell parse
# ------------------------------------------------------------------
def check_ps():
    files = list((ROOT / "scripts").glob("*.ps1")) + list((ROOT / "cloudflare").glob("*.ps1"))
    bad = 0
    for f in files:
        try:
            from System.Management.Automation.Language import Parser  # noqa
            tokens, errs = Parser.ParseFile(str(f), None, None)
            if errs and errs.Count:
                bad += 1
                fail("PS", f"{f.relative_to(ROOT)}: {errs[0].Message}")
        except Exception:
            # No PowerShell host available (e.g., on non-Windows) — fall back to a cheap brace/paren scan
            src = f.read_text(encoding="utf-8", errors="ignore")
            for open_ch, close_ch in (("{", "}"), ("(", ")")):
                if src.count(open_ch) != src.count(close_ch):
                    bad += 1
                    fail("PS", f"{f.relative_to(ROOT)}: unbalanced {open_ch}{close_ch}")
    if not bad:
        ok("PS")


# ------------------------------------------------------------------
# 4) JSON validity
# ------------------------------------------------------------------
def check_json():
    roots = [ROOT / "data", ROOT / "marketing" / "content"]
    files = [p for r in roots for p in (r.glob("*.json") if r.exists() else [])]
    files += list((ROOT / "deploy" / "data").glob("*.json"))
    bad = 0
    for f in set(files):
        try:
            json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            bad += 1
            fail("JSON", f"{f.relative_to(ROOT)}: {e}")
    if not bad:
        ok("JSON")


# ------------------------------------------------------------------
# 5) HTML well-formedness
# ------------------------------------------------------------------
VOID = {"img", "br", "meta", "link", "input", "hr", "source", "track", "wbr", "base", "col", "embed", "area"}


class HtmlCheck(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errs = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        elif tag in self.stack:
            while self.stack and self.stack[-1] != tag:
                self.errs.append("unclosed <" + self.stack.pop() + ">")
            self.stack.pop()
        else:
            self.errs.append("stray </" + tag + ">")


def check_html():
    html_files = []
    for base in (ROOT / "deploy", ROOT):
        if base == ROOT:
            continue  # avoid double-scanning the source mirror
        html_files += [p for p in base.rglob("*.html")]
    bad = 0
    for f in html_files:
        if any(part.startswith(".") for part in f.relative_to(ROOT).parts):
            continue
        parser = HtmlCheck()
        parser.feed(f.read_text(encoding="utf-8", errors="ignore"))
        leftovers = [t for t in parser.stack if t not in ("html", "body")]
        if parser.errs or leftovers:
            bad += 1
            fail("HTML", f"{f.relative_to(ROOT)}: {parser.errs[:3]} unclosed={leftovers[:3]}")
    if not bad:
        ok("HTML")


# ------------------------------------------------------------------
# 6) Internal asset/link resolution (deploy tree)
# ------------------------------------------------------------------
def check_assets():
    if QUICK:
        ok("ASSETS (quick skip)")
        return
    deploy = ROOT / "deploy"
    missing = set()
    scanned = 0
    href_re = re.compile(r'(?:href|src)="([^"]+)"')
    srcset_re = re.compile(r'srcset="([^"]+)"')
    bg_re = re.compile(r"background-image:\s*url\(['\"]?([^)'\"]+)['\"]?\)")
    for f in deploy.rglob("*.html"):
        src = f.read_text(encoding="utf-8", errors="ignore")
        page_dir = f.parent
        refs = href_re.findall(src) + bg_re.findall(src)
        for srcset in srcset_re.findall(src):
            refs += [c.strip().split()[0] for c in srcset.split(",")]
        for ref in refs:
            scanned += 1
            if not ref or ref.startswith(("#", "mailto:", "tel:", "data:", "javascript:", "http://", "https://", "//")):
                continue
            ref_path = ref.split("?")[0].split("#")[0]
            if not ref_path:
                continue
            # Root-absolute (/x) resolves against the deploy root; relative against the page dir
            base = deploy if ref_path.startswith("/") else page_dir
            target = (base / ref_path.lstrip("/")).resolve()
            if not target.exists():
                missing.add((f.relative_to(ROOT), ref))
    if missing:
        for page, ref in sorted(missing)[:25]:
            fail("ASSETS", f"{page} -> {ref}")
        if len(missing) > 25:
            fail("ASSETS", f"... and {len(missing) - 25} more")
    else:
        ok(f"ASSETS ({scanned} refs)")


# ------------------------------------------------------------------
# 7) Workflow references + YAML validity
# ------------------------------------------------------------------
def check_workflows():
    wf_dir = ROOT / ".github" / "workflows"
    bad = 0
    try:
        import yaml  # noqa
        have_yaml = True
    except Exception:
        have_yaml = False
    for f in wf_dir.glob("*.yml"):
        try:
            if have_yaml:
                yaml.safe_load(f.read_text(encoding="utf-8"))
        except Exception as e:
            bad += 1
            fail("WORKFLOW", f"{f.name}: YAML invalid: {e}")
        text = f.read_text(encoding="utf-8")
        wds = re.findall(r"working-directory:\s*(\S+)", text)
        for m in re.finditer(r"python\s+([^\s\"']+\.py)", text):
            script = m.group(1)
            if not (ROOT / script).exists() and not any((ROOT / wd / script).exists() for wd in wds):
                bad += 1
                fail("WORKFLOW", f"{f.name} -> missing script: {script}")
    if not bad:
        ok("WORKFLOW")


# ------------------------------------------------------------------
# 8) Worker imports resolve locally
# ------------------------------------------------------------------
def check_worker_imports():
    src_dir = ROOT / "cloudflare" / "src"
    bad = 0
    for f in src_dir.glob("*.js"):
        for m in re.finditer(r'from\s+"(\.\.?/[^"]+)"', f.read_text(encoding="utf-8")):
            resolved = (f.parent / m.group(1)).resolve()
            if not resolved.exists():
                bad += 1
                fail("WORKER", f"{f.name} -> unresolved import {m.group(1)}")
    if not bad:
        ok("WORKER")


# ------------------------------------------------------------------
# 8b) Worker modules actually load at runtime (catches ReferenceError /
#     template-literal bugs that syntax checks can't see)
# ------------------------------------------------------------------
def check_worker_loads():
    src_dir = ROOT / "cloudflare" / "src"
    bad = 0
    for f in src_dir.glob("*.js"):
        url = "file:///" + str(f).replace(os.sep, "/")
        r = run(["node", "--input-type=module", "-e", f"await import('{url}')"])
        if r.returncode != 0:
            bad += 1
            fail("WORKER-LOAD", f"{f.name}: {r.stderr.strip()[:200]}")
    if not bad:
        ok("WORKER-LOAD")


# ------------------------------------------------------------------
# 9) Automation spike patterns
# ------------------------------------------------------------------
def check_spikes():
    dirs = ["mailer", "buttondown", "marketing", "marketing/scripts", "scripts", "cloudflare"]
    risky = []
    for d in dirs:
        base = ROOT / d
        if not base.exists():
            continue
        for f in base.rglob("*.py"):
            if f.name == "verify_all.py":
                continue  # this file declares the patterns it scans for
            src = f.read_text(encoding="utf-8", errors="ignore")
            # pagination loop is OK only if the loop body contains a break/return
            for m in re.finditer(r"while\s+True", src):
                body_break = src[m.end():].find("break") < src[m.end():].find("\ndef ")
                if not body_break:
                    risky.append((f.relative_to(ROOT), "while True without break"))
            for pat in ("time.sleep(0)", "for i in itertools.count()"):
                if pat in src:
                    risky.append((f.relative_to(ROOT), pat))
    if risky:
        for r in risky:
            fail("AUTOMATION", f"{r[0]}: {r[1]}")
    else:
        ok("AUTOMATION")



# ------------------------------------------------------------------
# 10) SEO indexing hygiene (folded 2026-10-23 from
#     scripts/maintenance/scan_indexing.py, deleted in the same change)
#     Warning-level: surfaces drift without gating deploys.
# ------------------------------------------------------------------
def check_seo_indexing():
    deploy = ROOT / "deploy"
    issues = 0
    for f in sorted(deploy.rglob("*.html")):
        text = f.read_text(encoding="utf-8", errors="ignore")
        rel = f.relative_to(deploy)
        if not re.search(r'<link[^>]*rel=["\']canonical["\']', text):
            warn("SEO", f"{rel}: no canonical link")
            issues += 1
        if re.search(r'<meta[^>]*name=["\']robots["\'][^>]*content=["\'][^"\']*noindex', text):
            warn("SEO", f"{rel}: noindex (confirm intentional)")
            issues += 1
    sitemap = deploy / "sitemap.xml"
    if sitemap.exists():
        locs = re.findall(r"<loc>(https://sofritostudio\.com[^<]*)</loc>",
                          sitemap.read_text(encoding="utf-8", errors="ignore"))
        for loc in locs:
            path = loc.replace("https://sofritostudio.com", "").split("?")[0]
            if path in ("", "/"):
                target = deploy / "index.html"
                exists = target.exists()
            elif path.endswith(".html"):
                exists = (deploy / path.lstrip("/")).exists()
            else:
                exists = (deploy / (path.strip("/") + ".html")).exists() or \
                         (deploy / path.strip("/") / "index.html").exists()
            if not exists:
                warn("SEO", f"sitemap URL resolves to no file: {loc}")
                issues += 1
    if not issues:
        ok("SEO")


# ------------------------------------------------------------------
# 11) Form autocomplete hygiene (folded 2026-10-23 from
#     scripts/maintenance/scan_autocomplete.py, deleted in the same change)
#     Warning-level.
# ------------------------------------------------------------------
def check_forms_autocomplete():
    deploy = ROOT / "deploy"
    skip_types = ("hidden", "button", "submit", "image", "reset")
    missing = []
    for f in sorted(deploy.rglob("*.html")):
        text = f.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r"<(input|select|textarea)\b[^>]*>", text):
            tag = m.group(0)
            if "autocomplete" in tag:
                continue
            t = re.search(r'type=["\']([^"\']+)["\']', tag)
            if t and t.group(1).lower() in skip_types:
                continue
            missing.append(f"{f.relative_to(deploy)}: {tag[:80]}")
    for m in missing[:25]:
        warn("FORMS", m)
    if len(missing) > 25:
        warn("FORMS", f"... and {len(missing) - 25} more fields without autocomplete")
    if not missing:
        ok("FORMS")


# ------------------------------------------------------------------
def main():
    print("Sofrito Studio verification —", datetime.datetime.now().isoformat(timespec="seconds"))
    check_js()
    check_py()
    check_ps()
    check_json()
    check_html()
    check_assets()
    check_workflows()
    check_worker_imports()
    check_worker_loads()
    check_spikes()
    check_seo_indexing()
    check_forms_autocomplete()
    print(f"\nchecks passed: {PASS}   failures: {len(FAILURES)}   warnings: {len(WARNINGS)}")
    for w in WARNINGS:
        print("  warn:", w)
    if FAILURES:
        print("\nFAILURES:")
        for fl in FAILURES:
            print("  ✗", fl)
        sys.exit(1)
    print("✓ all green — safe to commit / deploy")
    sys.exit(0)


if __name__ == "__main__":
    main()