lines = []
with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find start of the block we inserted
start = None
for i, line in enumerate(lines):
    if line.strip() == '// Auto-reply email':
        start = i
        break

if start is None:
    print('Start not found')
    exit(1)

# Find end: look for the line that contains just `);` (with possible spaces) after start
end = None
for i in range(start, len(lines)):
    stripped = lines[i].strip()
    if stripped == ');':
        end = i+1  # include this line
        break

if end is None:
    print('End not found')
    exit(1)

# Remove lines[start:end]
del lines[start:end]

with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Removed email block')
