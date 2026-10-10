lines = []
with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find start index
start = None
for i, line in enumerate(lines):
    if '// Auto-reply email' in line:
        start = i
        break

if start is None:
    print('Start not found')
    exit(1)

# Find end index: line that starts with '  return json' (two spaces)
end = None
for i in range(start, len(lines)):
    if lines[i].strip().startswith('return json'):
        end = i
        break

if end is None:
    print('End not found')
    exit(1)

# Replace lines[start:end] with new block
new_block = '''  // Auto-reply email
  ctx.waitUntil(
    enqueueEmail(env, {
      kind: 'email',
      to: lead.email,
      template: 'lead_acknowledgement',
      subject: 'Thanks for reaching out – Sofrito Studio',
      data: { lead_id: lead.id, name: lead.name }
    })
  );
'''

# Ensure newline at end of block
new_block_lines = new_block.splitlines(keepends=True)
lines[start:end] = new_block_lines

with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Replaced email block')
