import os, re, glob

DEPLOY = 'C:/Users/josho/SofritoStudio/deploy'

print("=== 1. CANONICAL + NOINDEX SCAN (all HTML) ===")
html_files = glob.glob(DEPLOY + '/**/*.html', recursive=True)
for path in sorted(html_files):
    rel = os.path.relpath(path, DEPLOY).replace('\\', '/')
    with open(path, encoding='utf-8', errors='replace') as f:
        content = f.read()
    canon = re.search(r'<link[^>]*rel=["\']canonical["\'][^>]*>', content)
    noindex = re.search(r'<meta[^>]*name=["\']robots["\'][^>]*content=["\'][^>]*noindex', content)
    flags = []
    if canon: flags.append('CANONICAL: ' + (re.search(r'href=["\']([^"\']+)', canon.group(0)).group(1) if canon.group(0) else '?'))
    else: flags.append('NO-CANONICAL')
    if noindex: flags.append('NOINDEX!')
    print(f"{rel}: {' | '.join(flags)}")

print()
print("=== 2. SITEMAP vs FILES (404 sources) ===")
with open(DEPLOY + '/sitemap.xml', encoding='utf-8') as f:
    sitemap = f.read()
locs = re.findall(r'<loc>(https://sofritostudio\.com[^<]+)</loc>', sitemap)
print(f"Sitemap entries: {len(locs)}")
missing = []
for loc in locs:
    path = loc.replace('https://sofritostudio.com', '')
    # strip query
    path = path.split('?')[0]
    if path == '/':
        filepath = DEPLOY + '/index.html'
    else:
        filepath = DEPLOY + path
    if not os.path.exists(filepath):
        missing.append(loc)
print(f"Missing from deploy/: {len(missing)}")
for m in missing:
    print("  MISSING:", m)

print()
print("=== 3. TRAILING SLASH / EXTENSIONLESS URLS IN SITEMAP ===")
extless = [l for l in locs if not l.split('?')[0].endswith('.html') and l != 'https://sofritostudio.com/']
print(f"Extensionless sitemap URLs (worker 301s these): {len(extless)}")
for e in extless[:10]:
    print("  ", e)