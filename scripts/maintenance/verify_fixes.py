import re

files = ['credits.html', 'freebies/holiday-cheat-sheet.html', 'freebies/mini-recipe.html', 'freebies/pantry-checklist.html', 'freebies/sazon-guide.html', 'freebies/thank-you.html', '404.html']
for f in files:
    with open('C:/Users/josho/SofritoStudio/deploy/' + f, encoding='utf-8', errors='replace') as fh:
        c = fh.read()
    m = re.search(r'<link rel="canonical" href="([^"]+)"', c)
    r = re.search(r'<meta name="robots" content="([^"]+)"', c)
    print(f, '| canonical:', m.group(1) if m else 'MISSING', '| robots:', r.group(1) if r else '-')

with open('C:/Users/josho/SofritoStudio/deploy/sitemap.xml', encoding='utf-8') as f:
    content = f.read()
locs = re.findall(r'<loc>([^<]+)</loc>', content)
print()
print('Sitemap total:', len(locs))
print('Sitemap first 5:', locs[:5])
print('Sitemap all .html (or root):', all(l.endswith('.html') or l == 'https://sofritostudio.com/' for l in locs))