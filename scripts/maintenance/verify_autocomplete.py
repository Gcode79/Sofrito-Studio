import re

for f in ['index.html', 'contact.html', 'products/starter-kit.html', 'affiliate.html']:
    with open('C:/Users/josho/SofritoStudio/deploy/' + f, encoding='utf-8') as fh:
        c = fh.read()
    inputs = re.findall(r'<(input|select|textarea)\b[^>]*>', c)
    no_auto = [i for i in inputs if 'autocomplete' not in i and not re.search(r'type=["\x27](hidden|button|submit|image|reset)["\x27]', i)]
    print(f, '| total:', len(inputs), '| missing autocomplete:', len(no_auto))