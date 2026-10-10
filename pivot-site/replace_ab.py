import re

with open('src/worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = '''    // html_handling = "none" means the platform serves exact files only, so map
    // the extensionless root and bare directory names to their .html files here
    // (mirrors every canonical tag + sitemap entry).
    const assetUrl = new URL(request.url);
    if ((request.method === "GET" || request.method === "HEAD") && assetUrl.pathname === "/") {
      const req = new Request(assetUrl.origin + "/index.html", request);
      return env.ASSETS.fetch(req);
    }
    if ((request.method === "GET" || request.method === "HEAD") && assetUrl.pathname === "/sprint") {
      const req = new Request(assetUrl.origin + "/sprint.html", request);
      return env.ASSETS.fetch(req);
    }

'''

new_block = '''    // ------------------------------------------------------------
    // A/B split test for the landing page (entity='page')
    // ------------------------------------------------------------
    const assetUrl = new URL(request.url);
    const pathname = assetUrl.pathname;

    // Only apply the test to GET/HEAD on the root or the extensionless /sprint path
    if ((request.method === "GET" || request.method === "HEAD") &&
        (pathname === "/" || pathname === "/sprint")) {

      // ----- 1. Read existing cookies -----
      const cookieHeader = request.headers.get('Cookie') || '';
      const cookies = Object.fromEntries(
        cookieHeader.split('; ')
          .map(c => c.trim())
          .filter(c => c)
          .map(c => {
            const [k, v] = c.split('=');
            return [k, decodeURIComponent(v)];
          })
      );

      let variantLabel = cookies['sofrito_ab_page'];
      let visitorId = cookies['sofrito_ab_vid'];
      let resp = null;

      // ----- 2. If no variant yet, decide and set cookies -----
      if (!variantLabel) {
        // Ensure we have a visitor ID (persistent across reloads)
        if (!visitorId) {
          visitorId = crypto.randomUUID();
        }

        // Fetch the active page test and its variants
        const testRow = await env.DB.prepare(
          "SELECT id FROM ab_tests WHERE entity = 'page' AND status = 'running' LIMIT 1"
        ).first();

        if (testRow) {
          const testId = testRow.id;
          const variants = await env.DB.prepare(
            "SELECT id, label, weight FROM ab_variants WHERE test_id = ? ORDER BY id"
          ).bind(testId).all();

          // Weighted random selection
          const totalWeight = variants.results.reduce((sum, v) => sum + v.weight, 0);
          let r = Math.random() * totalWeight;
          let chosen = null;
          for (const v of variants.results) {
            if (r < v.weight) {
              chosen = v;
              break;
            }
            r -= v.weight;
          }
          if (!chosen && variants.results.length) chosen = variants.results[variants.results.length - 1];

          if (chosen) {
            variantLabel = chosen.label;
            const variantId = chosen.id;

            // ----- 3. Set cookies (visitor ID + variant) -----
            // Visitor ID lives for 1 year; variant cookie lives for the same period (so experience is stable)
            const cookieOpts = `Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
            const visitorCookie = `sofrito_ab_vid=${encodeURIComponent(visitorId)}; ${cookieOpts}`;
            const variantCookie = `sofrito_ab_page=${encodeURIComponent(variantLabel)}; ${cookieOpts}`;

            // ----- 4. Log the assignment (fire‑and‑forget) -----
            const now = new Date();
            const period = now.toISOString().slice(0, 10); // YYYY-MM-DD
            const assignmentId = crypto.randomUUID();
            ctx.waitUntil(
              env.DB.prepare(
                "INSERT INTO ab_assignments (id, test_id, subject_id, variant_id, period, assignment_type) VALUES (?, ?, ?, ?, ?, 'random_roll')"
              )
                .bind(assignmentId, testId, visitorId, variantId, period)
            );

            // We'll need to add the Set‑Cookie headers to the response later
            resp = null; // indicate we need to build a custom response
          }
        }
      }

      // ----- 5. Serve the appropriate asset -----
      // Default to control if something went wrong
      const servePath = variantLabel === 'challenger_boh' ? '/sprint-boh.html' : '/sprint.html';
      const assetReq = new Request(assetUrl.origin + servePath, request);

      let res = await env.ASSETS.fetch(assetReq);

      // If we decided to set cookies, inject them into the response
      if (resp === null && visitorId && variantLabel) {
        const visitorCookie = `sofrito_ab_vid=${encodeURIComponent(visitorId)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        const variantCookie = `sofrito_ab_page=${encodeURIComponent(variantLabel)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        const newHeaders = new Headers(res.headers);
        newHeaders.append('Set-Cookie', visitorCookie);
        newHeaders.append('Set-Cookie', variantCookie);
        res = new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: newHeaders
        });
      }

      return res;
    }
'''

# Replace first occurrence
new_content = content.replace(old_block, new_block, 1)

with open('src/worker.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Replacement done.")
