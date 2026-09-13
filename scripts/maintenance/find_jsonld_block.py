with open('C:/Users/josho/SofritoStudio/deploy/index.html') as f:
    content = f.read()
start = content.find('<script type="application/ld+json"')
end = content.find('</script>', start)
print('Block found at:', start, 'to', end)
print('Length:', end - start)
print('First 200 chars:', content[start:start+200])
