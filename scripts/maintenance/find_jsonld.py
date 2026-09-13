with open('C:/Users/josho/SofritoStudio/deploy/index.html') as f:
    content = f.read()
start = content.find('<script id="structured-data"')
if start != -1:
    end = content.find('</script>', start)
    snippet = content[start:end+9]
    print('JSON-LD block found (length:', len(snippet), 'chars)')
    print('First 500 chars:', snippet[:500])
else:
    print('structured-data script not found')
