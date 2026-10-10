import re

with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the pattern to find the webhook block and the following line that is just a closing parenthesis and maybe whitespace before return.
# We'll capture the webhook block up to the closing parenthesis of the ctx.waitUntil call.
pattern = re.compile(r'(\s*// Async webhook dispatch to Zapier \(async through the queue - never sync\)\.\s*\n\s*ctx\.waitUntil\(\s*enqueueWebhook\(env, \'lead\.new\',\s*\{[\s\S]*?\}\)\s*\)\s*\n)', re.MULTILINE)
match = pattern.search(content)
if not match:
    print('Pattern not found')
    exit(1)

webhook_block_end = match.group(1)  # includes the newline after the closing parenthesis
# We want to insert after this block, before the return line.
# The return line starts with '  return json' (two spaces)
# We'll insert our email block after webhook_block_end.

email_block = '''  // Auto-reply email
  ctx.waitUntil(
    enqueueEmail(env, {
      kind: 'email',
      to: lead.email,
      template: 'lead_acknowledgement',
      subject: 'Thanks for reaching out - Sofrito Studio',
      data: { lead_id: lead.id, name: lead.name }
    })
  );
'''

# Insert after webhook_block_end
new_content = content.replace(webhook_block_end, webhook_block_end + email_block, 1)

with open('C:/Users/josho/SofritoStudio/pivot-site/src/worker.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Inserted email block after webhook')
