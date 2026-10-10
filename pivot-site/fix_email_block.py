import re

with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix template typo
content = re.sub(r"template: \'lead_acknowldgement\'", r"template: \'lead_acknowledgement\'", content)

# Fix double semicolon after email block: replace });; with });
content = re.sub(r'\)\;\;', r'\)\;', content)

with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed template and double semicolon')
