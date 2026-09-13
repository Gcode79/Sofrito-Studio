import glob, os, re

for path in glob.glob('C:/Users/josho/SofritoStudio/deploy/*.html'):
    with open(path, 'r') as f:
        content = f.read()
    name = os.path.basename(path)
    # Skip index.html (already has everything)
    if name == 'index.html':
        continue

    # 1. Add responsive prefixes to headings (if missing)
    # Find h1/h2/h3 without sm: or lg:
    content = re.sub(
        r'<h([1-3])([^>]*)class="([^"]*)"',
        lambda m: '<h' + m.group(1) + m.group(2) + 'class="' + m.group(3) + ' sm:text-3xl lg:text-4xl"' if 'sm:' not in m.group(3) else m.group(0),
        content
    )

    # 2. Add sticky bottom bar (if missing)
    if 'fixed bottom-0' not in content:
        # Insert before closing </body>
        sticky_bar = '''
  <div class="fixed bottom-0 left-0 right-0 z-50 bg-orange-600 text-white py-3 px-6 shadow-lg md:hidden" role="region" aria-label="Sticky checkout">
    <div class="flex items-center justify-between max-w-4xl mx-auto">
      <span class="font-sans text-sm font-medium">Get the Starter Kit — $9</span>
      <a href="products/starter-kit.html" class="bg-white text-orange-600 font-sans font-bold py-2 px-4 rounded-md hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2" data-cart-add="starter-kit">Shop Now</a>
    </div>
  </div>
'''
        content = content.replace('</body>', sticky_bar + '\n</body>')

    # 3. Add collapsible FAQ section (if missing)
    if '<details' not in content:
        accordion = '''
  <section class="section bg-gray-50" aria-label="Frequently asked questions">
    <div class="wrap max-w-3xl mx-auto">
      <h2 class="font-serif tracking-tight text-slate-900 text-2xl sm:text-3xl lg:text-4xl mb-6">Common Questions</h2>
      <div class="space-y-2">
        <details class="bg-white rounded-lg shadow-sm overflow-hidden">
          <summary class="font-sans text-slate-900 font-medium px-4 py-3 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-600">What is sofrito?</summary>
          <div class="font-sans text-slate-700 leading-relaxed px-4 pb-4">Sofrito is the flavor base of Puerto Rican cooking — a blended mix of recao (culantro), garlic, onion, bell pepper, and herbs.</div>
        </details>
        <details class="bg-white rounded-lg shadow-sm overflow-hidden">
          <summary class="font-sans text-slate-900 font-medium px-4 py-3 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-600">Can I cook boricua food if I'm not Puerto Rican?</summary>
          <div class="font-sans text-slate-700 leading-relaxed px-4 pb-4">Absolutely. Every product is written for home cooks of all levels, with step-by-step instructions and bilingual text.</div>
        </details>
      </div>
    </div>
  </section>
'''
        # Insert before closing </main> or before </body>
        if '</main>' in content:
            content = content.replace('</main>', accordion + '\n</main>')
        else:
            content = content.replace('</body>', accordion + '\n</body>')

    # 4. Add hover/focus to buttons (if btn class exists but no hover/focus)
    # This is handled by agents.css globally, so no HTML edit needed for this

    with open(path, 'w') as f:
        f.write(content)
    print('Fixed:', name)
