with open('C:/Users/josho/SofritoStudio/deploy/index.html') as f:
    content = f.read()
start = content.find('<script type="application/ld+json" id="structured-data"')
if start != -1:
    end = content.find('</script>', start)
    snippet = content[start:end+9]
    print('Block found (length:', len(snippet), 'chars)')
    print('Contains Product:', '@type": "Product"' in snippet)
    print('Contains image:', '"image"' in snippet)
    print('Contains brand Organization:', '@type": "Organization"' in snippet)
    print('Contains returnMethod:', 'returnMethod' in snippet)
    print('Contains returnFees:', 'returnFees' in snippet)
    print('Contains hasMerchantReturnPolicy:', 'hasMerchantReturnPolicy' in snippet)
    print('Contains shippingDetails:', 'shippingDetails' in snippet)
    print('Contains availability:', 'availability' in snippet)
else:
    print('Block not found')
