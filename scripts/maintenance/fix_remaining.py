with open('C:/Users/josho/SofritoStudio/deploy/affiliate.html', 'r') as f:
    content = f.read()
content = content.replace('<h1', '<h1 class="font-serif tracking-tight text-slate-900"')
content = content.replace('<h2', '<h2 class="font-serif tracking-tight text-slate-900"')
content = content.replace('<h3', '<h3 class="font-serif tracking-tight text-slate-900"')
content = content.replace('text-2xl', 'text-2xl sm:text-3xl lg:text-4xl')
with open('C:/Users/josho/SofritoStudio/deploy/affiliate.html', 'w') as f:
    f.write(content)
print('Fixed affiliate.html')

with open('C:/Users/josho/SofritoStudio/deploy/membership.html', 'r') as f:
    content = f.read()
content = content.replace('<h1', '<h1 class="font-serif tracking-tight text-slate-900"')
content = content.replace('<h2', '<h2 class="font-serif tracking-tight text-slate-900"')
content = content.replace('<h3', '<h3 class="font-serif tracking-tight text-slate-900"')
content = content.replace('text-2xl', 'text-2xl sm:text-3xl lg:text-4xl')
with open('C:/Users/josho/SofritoStudio/deploy/membership.html', 'w') as f:
    f.write(content)
print('Fixed membership.html')
