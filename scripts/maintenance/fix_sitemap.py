import re, os

DEPLOY = 'C:/Users/josho/SofritoStudio/deploy'
sitemap_path = DEPLOY + '/sitemap.xml'

with open(sitemap_path, encoding='utf-8') as f:
    sitemap = f.read()

# Transform every <loc> to its .html canonical (root stays /)
def fix_loc(m):
    loc = m.group(1)
    if loc == 'https://sofritostudio.com/':
        return m.group(0)
    if loc.endswith('.html'):
        return m.group(0)
    return f'<loc>{loc}.html</loc>'

new_sitemap = re.sub(r'<loc>(https://sofritostudio\.com[^<]+)</loc>', fix_loc, sitemap)

# Verify every URL maps to an existing file
locs = re.findall(r'<loc>(https://sofritostudio\.com[^<]+)</loc>', new_sitemap)
missing = []
for loc in locs:
    path = loc.replace('https://sofritostudio.com', '')
    if path == '/':
        fp = DEPLOY + '/index.html'
    else:
        fp = DEPLOY + path
    if not os.path.exists(fp):
        missing.append(loc)

print(f"Total URLs after fix: {len(locs)}")
print(f"URLs missing on disk: {len(missing)}")
for m in missing:
    print("  MISSING:", m)

if not missing:
    with open(sitemap_path, 'w', encoding='utf-8') as f:
        f.write(new_sitemap)
    print("Sitemap rewritten with .html canonicals.")
else:
    print("ABORTED — fix missing files first.")