import os, re, glob

DEPLOY = 'C:/Users/josho/SofritoStudio/deploy'

print("=== 1. INTERNAL LINK STYLE (sample from index.html + about.html) ===")
for f in ['index.html', 'about.html', 'products/starter-kit.html']:
    with open(os.path.join(DEPLOY, f), encoding='utf-8', errors='replace') as fh:
        content = fh.read()
    links = re.findall(r'href="(/[^"#]*?)["#]', content)
    extless = [l for l in links if not l.endswith('.html') and not l.endswith('/') and '.' not in l.split('/')[-1]]
    html_links = [l for l in links if l.endswith('.html')]
    print(f"\n{f}: total internal links={len(links)}, .html links={len(html_links)}, extensionless={len(extless)}")
    print("  sample .html:", html_links[:5])
    print("  sample extless:", extless[:5])

print("\n=== 2. NOINDEX PAGES — why? ===")
for f in ['credits.html', 'freebies/mini-recipe.html', 'products/full-table-upsell.html', 'es/products/full-table-upsell.html']:
    with open(os.path.join(DEPLOY, f), encoding='utf-8', errors='replace') as fh:
        content = fh.read()
    m = re.search(r'<meta[^>]*name=["\']robots["\'][^>]*>', content)
    print(f"{f}: {m.group(0) if m else 'none'}")

print("\n=== 3. TRAILING-SLASH HANDLING CHECK (worker) ===")
print("index.js:425-434 — extensionless -> 301 .html. Trailing slash (/about/) falls through to ASSETS -> 404 (no about/index.html).")

print("\n=== 4. SITEMAP URL COUNT BY TYPE ===")
with open(DEPLOY + '/sitemap.xml', encoding='utf-8') as f:
    sitemap = f.read()
locs = re.findall(r'<loc>(https://sofritostudio\.com[^<]+)</loc>', sitemap)
print("Total:", len(locs))
print("With .html:", sum(1 for l in locs if '.html' in l))
print("Extensionless:", sum(1 for l in locs if '.html' not in l and l != 'https://sofritostudio.com/'))
print("Root only:", sum(1 for l in locs if l == 'https://sofritostudio.com/'))