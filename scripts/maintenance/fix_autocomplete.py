import os, re, glob

DEPLOY = 'C:/Users/josho/SofritoStudio/deploy'

# Map field name/type -> autocomplete value
def autocomplete_for(tag):
    name_m = re.search(r'name=["\']([^"\']+)["\']', tag)
    type_m = re.search(r'type=["\']([^"\']+)["\']', tag)
    name = name_m.group(1).lower() if name_m else ''
    type_ = type_m.group(1).lower() if type_m else ''
    if name == 'email' or type_ == 'email':
        return 'email'
    if name == 'phone' or type_ == 'tel':
        return 'tel'
    if name == 'name':
        return 'name'
    if type_ == 'url' or name == 'platform':
        return 'url'
    if name == 'audience_size':
        return 'organization'
    # selects, checkboxes, textareas, and non-personal text fields
    return 'off'

changed = 0
html_files = glob.glob(DEPLOY + '/**/*.html', recursive=True)
for path in sorted(html_files):
    rel = os.path.relpath(path, DEPLOY).replace('\\', '/')
    with open(path, encoding='utf-8', errors='replace') as f:
        content = f.read()
    orig = content

    def fix_tag(m):
        global changed
        tag = m.group(0)
        if 'autocomplete' in tag:
            return tag
        if re.search(r'type=["\'](hidden|button|submit|image|reset)["\']', tag):
            return tag
        val = autocomplete_for(tag)
        # insert autocomplete before the closing '>' of the tag
        new_tag = tag[:-1] + f' autocomplete="{val}">'
        changed += 1
        return new_tag

    content = re.sub(r'<(input|select|textarea)\b[^>]*>', fix_tag, content)
    if content != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"{rel}: updated")

print(f"\nTotal tags updated: {changed}")