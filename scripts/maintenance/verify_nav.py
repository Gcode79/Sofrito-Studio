with open('C:/Users/josho/SofritoStudio/deploy/products.html') as f:
    content = f.read()
start = content.find('<ul class="nav-links"')
end = content.find('</ul>', start)
print('products.html nav:', content[start:end+5])

with open('C:/Users/josho/SofritoStudio/deploy/blog.html') as f:
    content = f.read()
start = content.find('<ul class="nav-links"')
end = content.find('</ul>', start)
print('blog.html nav:', content[start:end+5])
