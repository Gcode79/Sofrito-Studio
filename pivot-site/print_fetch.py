lines = []
with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the line that contains 'fetch:' (the property)
start = None
for i, line in enumerate(lines):
    if line.strip().startswith('fetch:'):
        start = i
        break

if start is None:
    print('Fetch property not found')
    exit(1)

# Find the end of the fetch property: look for the next line that starts with '  queue:' or '  scheduled:' or '}' at same indent?
# We'll just collect until we see a line that starts with '  queue:' (two spaces) at same indent as fetch.
end = None
for i in range(start+1, len(lines)):
    stripped = lines[i].lstrip()
    if stripped.startswith('queue:') or stripped.startswith('scheduled:'):
        end = i
        break
if end is None:
    # look for closing brace of the exported object
    for i in range(start+1, len(lines)):
        if lines[i].strip() == '}':
            end = i
            break

if end is None:
    end = len(lines)

print(''.join(lines[start:end]))
