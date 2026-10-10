import re

with open('src/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the webhook enqueue block
pattern = re.compile(r'(ctx\.waitUntil\(\s*enqueueWebhook\(env, \'lead\.new\',\s*\{[\s\S]*?\}\)\s*\)\s*)', re.DOTALL)
match = pattern.search(content)
if not match:
    print('Webhook enqueue block not found')
    exit(1)

webhook_block = match.group(1)
# Insert after this block
email_block = '''  // Auto-reply email
  ctx.waitUntil(
    enqueueEmail(env, {
      kind: 'email',
      to: lead.email,
      template: 'lead_acknowldgement',
      subject: 'Thanks for reaching out – Sofrito Studio',
      data: { lead_id: lead.id, name: lead.name }
    })
  );'''

# Insert after webhook_block, before the return statement.
# We'll replace the webhook_block with webhook_block + newline + email_block
new_content = content.replace(webhook_block, webhook_block + '\n' + email_block, 1)

with open('src/worker.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Patched worker with email enqueue')
