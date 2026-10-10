lines = []
with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find start
start = None
for i, line in enumerate(lines):
    if line.strip().startswith('async function handleApiLead'):
        start = i
        break

if start is None:
    print('Start not found')
    exit(1)

# Find end: next line that starts with 'async function' after start
end = None
for i in range(start+1, len(lines)):
    if lines[i].strip().startswith('async function'):
        end = i
        break

if end is None:
    end = len(lines)

print(''.join(lines[start:end]))
