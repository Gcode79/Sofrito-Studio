import os, re, glob

DEPLOY = 'C:/Users/josho/SofritoStudio/deploy'

print("=== FORM INPUTS WITHOUT AUTOCOMPLETE ===")
html_files = glob.glob(DEPLOY + '/**/*.html', recursive=True)
for path in sorted(html_files):
    rel = os.path.relpath(path, DEPLOY).replace('\\', '/')
    with open(path, encoding='utf-8', errors='replace') as f:
        content = f.read()
    # find inputs, selects, textareas
    for m in re.finditer(r'<(input|select|textarea)\b[^>]*>', content):
        tag = m.group(0)
        if 'autocomplete' in tag:
            continue
        # skip hidden/button/submit/image inputs (no autocomplete needed)
        if re.search(r'type=["\'](hidden|button|submit|image|reset)["\']', tag):
            continue
        name = re.search(r'name=["\']([^"\']+)["\']', tag)
        type_ = re.search(r'type=["\']([^"\']+)["\']', tag)
        print(f"{rel}: <{m.group(1)}> name={name.group(1) if name else '?'} type={type_.group(1) if type_ else '?'}")