import glob, os
files = glob.glob('C:/Users/josho/SofritoStudio/deploy/*.html')
for path in files:
    with open(path, 'r') as f:
        content = f.read()
    if 'nav-social' in content and 'nav-links' not in content:
        old = '<nav aria-label="Main navigation">\n      <ul>'
        new = '<nav aria-label="Main navigation">\n      <ul class="nav-links" id="navLinks">'
        if old in content:
            content = content.replace(old, new)
            with open(path, 'w') as f:
                f.write(content)
            print('Fixed:', os.path.basename(path))
        else:
            print('Pattern not found in:', os.path.basename(path))
