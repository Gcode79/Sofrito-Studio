import re

with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the exact substring to replace (as seen in the output)
old = '  )\n  return json({ ok: true, id: lead.id, created_at: lead.created_at }, 201);'
new = '''  )
  // Auto-reply email
  ctx.waitUntil(
    enqueueEmail(env, {
      kind: \'email\',
      to: lead.email,
      template: \'lead_acknowledgement\',
      subject: \'Thanks for reaching out - Sofrito Studio\',
      data: { lead_id: lead.id, name: lead.name }
    })
  );
  return json({ ok: true, id: lead.id, created_at: lead.created_at }, 201);'''

if old not in content:
    print('Old substring not found')
    # Let's try to find a similar pattern with maybe different spacing
    # We'll do a regex
    pattern = re.compile(r'\)\s*\n\s*return json\(\s*{\s*ok:\s*true,\s*id:\s*lead\.id,\s*created_at:\s*lead\.created_at\s*},\s*201\s*\);')
    match = pattern.search(content)
    if match:
        print('Found via regex')
        # Replace with newline inserted
        # We'll keep the same indentation? We'll just replace the matched text with:
        # ') \\n  // Auto-reply email\\n  ctx.waitUntil(...) \\n  return json(...)'
        # But easier: we can do the same replacement but using regex groups.
        # For simplicity, we'll just insert after the closing parenthesis line.
        # Let's do a different approach: find the line that ends with ')'
        lines = content.splitlines(keepends=True)
        for i, line in enumerate(lines):
            if line.rstrip() == '  )':
                # Insert after this line
                lines.insert(i+1, '  // Auto-reply email\n')
                lines.insert(i+2, '  ctx.waitUntil(\n')
                lines.insert(i+3, '    enqueueEmail(env, {\n')
                lines.insert(i+4, '      kind: \'email\',\n')
                lines.insert(i+5, '      to: lead.email,\n')
                lines.insert(i+6, '      template: \'lead_acknowledgement\',\n')
                lines.insert(i+7, '      subject: \'Thanks for reaching out - Sofrito Studio\',\n')
                lines.insert(i+8, '      data: { lead_id: lead.id, name: lead.name }\n')
                lines.insert(i+9, '    })\n')
                lines.insert(i+10, '  );\n')
                break
        content = ''.join(lines)
        with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Inserted via line insertion')
    else:
        print('Could not find pattern')
else:
    content = content.replace(old, new)
    with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced old with new')
