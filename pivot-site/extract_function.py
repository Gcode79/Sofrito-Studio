lines = []
with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = None
for i, line in enumerate(lines):
    if line.strip().startswith('async function handleApiLead'):
        start = i
        break

end = None
for i in range(start+1, len(lines)):
    if lines[i].strip().startswith('async function'):
        end = i
        break

if end is None:
    end = len(lines)

with open('C:/Users/josho/SofritoStudio/pivot-site/handleapilead.txt', 'w', encoding='utf-8') as f:
    f.writelines(lines[start:end])

print('Written to file')
