import re, os

DEPLOY = 'C:/Users/josho/SofritoStudio/deploy'

# Pages missing canonical tags (from scan). 404.html gets noindex (it's an error page).
pages = {
    'credits.html': 'https://sofritostudio.com/credits.html',
    'freebies/holiday-cheat-sheet.html': 'https://sofritostudio.com/freebies/holiday-cheat-sheet.html',
    'freebies/mini-recipe.html': 'https://sofritostudio.com/freebies/mini-recipe.html',
    'freebies/pantry-checklist.html': 'https://sofritostudio.com/freebies/pantry-checklist.html',
    'freebies/sazon-guide.html': 'https://sofritostudio.com/freebies/sazon-guide.html',
    'freebies/thank-you.html': 'https://sofritostudio.com/freebies/thank-you.html',
}

for rel, canon in pages.items():
    path = os.path.join(DEPLOY, rel)
    with open(path, encoding='utf-8', errors='replace') as f:
        content = f.read()
    if 'rel="canonical"' in content:
        print(f"{rel}: already has canonical, skipping")
        continue
    # Insert after <title>...</title> if present, else before </head>
    m = re.search(r'(<title>[^<]*</title>)', content)
    if m:
        insert_at = m.end()
        new_content = content[:insert_at] + f'\n  <link rel="canonical" href="{canon}">' + content[insert_at:]
    else:
        new_content = content.replace('</head>', f'  <link rel="canonical" href="{canon}">\n</head>')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"{rel}: canonical added -> {canon}")

# 404.html: add noindex (error pages should not be indexed) + canonical to home
path = os.path.join(DEPLOY, '404.html')
with open(path, encoding='utf-8', errors='replace') as f:
    content = f.read()
if 'rel="canonical"' not in content:
    m = re.search(r'(<title>[^<]*</title>)', content)
    insert_at = m.end() if m else content.find('</head>')
    add = '\n  <meta name="robots" content="noindex">\n  <link rel="canonical" href="https://sofritostudio.com/">'
    new_content = content[:insert_at] + add + content[insert_at:]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("404.html: noindex + canonical to home added")
else:
    print("404.html: already has canonical")