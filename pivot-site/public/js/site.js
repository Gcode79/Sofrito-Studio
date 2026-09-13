// ============================================================
// Sofrito Studio — shared site JS
// Job: 1k
// MCP: cloudflare-static-assets
// Last updated: 2026-09-04
// Purpose: i18n toggle, price/URL hydration from /api, order-life
//          form submissions, analytics beacon, small UI helpers.
// Include with <script src="/js/site.js" defer></script>
// ============================================================
(function () {
  'use strict';

  var API = window.SITE && window.SITE.api ? window.SITE.api : '/api';

  // ---- Helpers -------------------------------------------------
  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function setStatus(id, html, ok) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.innerHTML = html;
    el.className = 'text-sm ' + (ok === false ? 'text-red-600' : 'text-green-600');
  }

  function asMoney(cents, billing) {
    var d = (Number(cents) || 0) / 100;
    var label = '$' + d.toLocaleString('en-US', { minimumFractionDigits: d % 1 === 0 ? 0 : 2 });
    if (billing === 'monthly') label += '/mo';
    return label;
  }

  // ---- Analytics beacon (server-side events, privacy-friendly) --
  function consentGiven() {
    return localStorage.getItem('ss_consent') === '1';
  }
  function track(name, props) {
    if (!consentGiven()) return;
    var session = sessionStorage.getItem('ss_sid') || null;
    fetch(API + '/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        session: session,
        page_url: location.pathname + location.search,
        properties: props || {},
      }),
      keepalive: true,
    }).catch(function () {});
  }

  // ---- Cloudflare Zaraz (guarded) ---------------------------------
  // No-op until the Zaraz snippet is injected via Cloudflare's dashboard.
  // When it is, these fire tool events you can re-route into triggers.
  // ---- TikTok Pixel (guarded) ------------------------------------
  // Standard events + ttq.identify. All PII is SHA-256 hashed client-side
  // before it reaches the pixel (email lowercased, phone as digits only).
  function ttq(name, props) {
    if (!consentGiven()) return;
    loadTiktokSdk();
    try {
      if (window.ttq && typeof window.ttq.track === 'function') {
        window.ttq.track(name, props || {});
      } else if (Array.isArray(window.ttq)) {
        window.ttq.push(['track', name, props || {}]);
      }
    } catch (e) { /* never block the page on analytics */ }
  }
  function sha256Hex(str) {
    try {
      return crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(String(str)))
        .then(function (buf) {
          return [...new Uint8Array(buf)].map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        });
    } catch (e) { return Promise.resolve(''); }
  }
  function ttqIdentify(identity, done) {
    if (!consentGiven()) { if (done) done(); return; }
    var out = {};
    var jobs = [];
    var norm = {};
    if (identity.email) norm.email = String(identity.email).trim().toLowerCase();
    if (identity.phone_number) norm.phone_number = String(identity.phone_number).replace(/\D/g, '');
    if (identity.external_id) norm.external_id = String(identity.external_id).trim();
    Object.keys(norm).forEach(function (k) {
      jobs.push(sha256Hex(norm[k]).then(function (hex) { if (hex) out[k] = hex; }));
    });
    Promise.all(jobs).then(function () {
      try {
        if (Object.keys(out).length && window.ttq && typeof window.ttq.identify === 'function') {
          window.ttq.identify(out);
        }
      } catch (e) { /* never block the page on analytics */ }
      if (done) done();
    });
  }
  function tiktokPageLevel() {
    if (!consentGiven()) return;
    var p = location.pathname;
    var name = '';
    if (p.indexOf('/services.html') !== -1) name = 'Services & Packages';
    else if (p.indexOf('/session.html') !== -1) name = 'Brand Session';
    else if (p.indexOf('/work.html') !== -1) name = 'Recent Work';
    else if (p.indexOf('/blog/') !== -1) name = 'Journal';
    if (!name) return;
    ttq('ViewContent', { contents: [{ content_id: 'page', content_type: 'product', content_name: name }], currency: 'USD' });
  }
  function zaraz(name, props) {
    if (!consentGiven()) return;
    if (typeof window.zaraz !== 'object' || typeof window.zaraz.track !== 'function') return;
    try {
      window.zaraz.track(name, props || {});
    } catch (e) { /* never block the page on analytics */ }
  }
  // TikTok SDK is loaded lazily, only after the user consents.
  var tiktokLoaded = false;
  function loadTiktokSdk() {
    if (tiktokLoaded || (window.ttq && window.ttq.load)) { tiktokLoaded = true; return; }
    tiktokLoaded = true;
    try {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=DAD07T3C77U98E0UK9L0&lib=ttq';
      document.head.appendChild(s);
    } catch (e) { /* never break the page */ }
  }
  function zarazPageLevel() {
    // Package View / page-scoped events without content blockers.
    var p = location.pathname;
    if (p.indexOf('/services.html') !== -1) zaraz('Package View', { url: p });
    if (p.indexOf('/session.html') !== -1) zaraz('Session View', { url: p });
  }
  // ---- Google Analytics 4 (consent-gated) ------------------------
  // No gtag loads until the visitor accepts the consent banner, matching the
  // privacy note. On acceptance, gtag pushes jsc/config then injects gtag.js,
  // which fires the automatic page_view.
  var GA_MEASUREMENT_ID = 'G-7XFBM9JMEV';
  var ga4Loaded = false;
  function loadGA4() {
    if (ga4Loaded || !consentGiven()) return;
    ga4Loaded = true;
    try {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
      document.head.appendChild(s);
    } catch (e) { /* never break the page */ }
  }

  // ---- Cookie consent (minimal, privacy-first) -------------------
  function bindConsent() {
    if (consentGiven()) return;
    var bar = document.createElement('div');
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Privacy notice');
    bar.className =
      'fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-4 py-2';
    bar.innerHTML =
      '<div class="mx-auto max-w-6xl flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-slate-700">' +
        '<p class="flex-1">We use a little privacy-friendly analytics to know what content helps, and optional TikTok retargeting if you opt in. No selling your data. <a href="/privacy.html" class="underline text-slate-500 hover:text-slate-700">Learn more</a> · <button id="consent-decline" class="underline text-slate-500 hover:text-slate-700">No thanks</button></p>' +
        '<div class="flex gap-3">' +
          '<button id="consent-ok" class="rounded-md bg-orange-600 hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 transition">Sounds good</button>' +
        '</div>' +
      '</div>';

    bar.querySelector('#consent-ok').addEventListener('click', function () {
      localStorage.setItem('ss_consent', '1');
      bar.remove();
      loadGA4();
      loadTiktokSdk();
      zarazPageLevel();
      tiktokPageLevel();
      track('page_view', { referrer: document.referrer || null });
    });
    bar.querySelector('#consent-decline').addEventListener('click', function () {
      localStorage.setItem('ss_consent', '0');
      bar.remove();
    });
    document.body.appendChild(bar);
  }

  // ---- Price + site config hydration ----------------------------
  function hydratePrices() {
    fetch(API + '/packages')
      .then(function (r) { if (!r.ok) throw new Error('packages'); return r.json(); })
      .then(function (data) {
        (data.packages || []).forEach(function (p) {
          var card = document.querySelector('[data-price-card="' + p.slug + '"]');
          if (!card) return;
          var priceEl = card.querySelector('[data-price]');
          var moEl = card.querySelector('.price-mo');
          if (priceEl) priceEl.textContent = asMoney(p.price_cents, p.billing);
          if (moEl) moEl.textContent = p.billing === 'monthly' ? '· ' + p.name : '';
        });
      })
      .catch(function () { /* keep the static fallback */ });
  }

  function hydrateConfig() {
    fetch(API + '/config')
      .then(function (r) { if (!r.ok) throw new Error('config'); return r.json(); })
      .then(function (cfg) {
        if (cfg.email) {
          var emailEls = document.querySelectorAll('#site-email');
          emailEls.forEach(function (el) { el.textContent = cfg.email; });
        }
        var sessionBtn = document.getElementById('buy-session');
        if (sessionBtn && cfg.session_url) sessionBtn.href = cfg.session_url;
        var contactBtn = document.getElementById('book-session');
        if (contactBtn && cfg.booking_url) contactBtn.href = cfg.booking_url;
      })
      .catch(function () {});
  }

  // ---- i18n toggle (EN/ES) --------------------------------------
  var DEFAULT_I18N = {
    s96: { es: 'Estudio de marca para negocios de comida' },
    heroSub: { es: 'Sofrito Studio les da a restaurantes, salsas, food trucks y marcas gourmet la identidad, el sitio web y el contenido para verse como la casa que son — de la primera impresión al cliente repetido.' },
    jump1: { es: 'A quién servimos' }, jump2: { es: 'Servicios' }, jump3: { es: 'Guía Digital' },
    jump4: { es: 'Asistente IA' }, jump5: { es: 'Trabajo' },
    ingHead: { es: 'Hecho para el calor de la cocina' },
    ingSub: { es: 'Las marcas que amamos trabajan mejor cuando hay comida fresca en la línea. Si uno de estos eres tú, hablamos tu idioma.' },
    servHead: { es: 'Elige la oferta que pega con tu fogón' },
    servSub: { es: 'Dos formas de trabajar: una Sesión de 90 minutos para una lectura honesta, o el Sprint de marca y web en 48 horas. Precios fijos — sin sorpresas.' },
    guideHead: { es: 'La Guía Digital: marca en tres semanas' },
    guideSub: { es: 'Una guía gratuita y directa para negocios de comida. Sin fórmulas que pidan título — el método que usamos con clientes, primero el sabor.' },
    aiHead: { es: 'Una socia de marca por mensualidad' },
    aiSub: { es: 'Nuestra Asistente IA redacta pies de foto, una semana de publicaciones del menú y respuestas a los DM que lo merecen. Hecha con ingredientes que los listos ignoran.' },
    workHead: { es: 'Recién salido de la línea' },
    workSub: { es: 'Estudios de caso de negocios de comida que hemos ayudado a emplatar. Cuando lo hacemos bien, la fila crece.' },
    ctaHead: { es: 'Primero el sabor, después la marca. Lo probamos contigo.' },
    ctaSub: { es: 'Cuéntanos qué cocinas. Te respondemos con una lectura honesta y el primer paso — gratis.' },
  };
  var I18N = Object.assign({}, DEFAULT_I18N, window.I18N || {});
  function applyLang(lang) {
    localStorage.setItem('ss_lang', lang);
    document.documentElement.lang = lang;
    var label = document.getElementById('lang-toggle');
    if (label) label.textContent = lang === 'es' ? 'EN' : 'ES';
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (I18N[key] && I18N[key][lang]) el.textContent = I18N[key][lang];
    });
    window.SITE = window.SITE || {};
    window.SITE.lang = lang;
  }
  function bindLangToggle() {
    var btn = document.getElementById('lang-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      applyLang((window.SITE.lang || 'en') === 'es' ? 'en' : 'es');
    });
    applyLang(localStorage.getItem('ss_lang') || (((navigator.language || 'en').slice(0, 2) === 'es' ? 'es' : 'en')));
  }

  // ---- Guide form -> /api/newsletter ----------------------------
  function bindGuideForm() {
    var form = document.getElementById('guide-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var email = form.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        setStatus('guide-status', 'Please enter a valid email.', false);
        return;
      }
      btn.disabled = true;
      fetch(API + '/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'guide', referrer_url: location.href }),
      })
        .then(function (r) {
          return r.json().then(function (b) {
            if (!r.ok) throw new Error('newsletter');
            setStatus('guide-status', 'It\'s on the way. Check your inbox for the guide. <a href="' + (b.guide_url || '#') + '" class="underline text-white hover:text-orange-100">Download it now ￫</a>', true);
            track('guide_subscribe', { email: email });
            zaraz('Guide Subscribe', { email: email, source: 'guide' });
            ttqIdentify({ email: email }, function () {
              ttq('CompleteRegistration', {
                contents: [{ content_id: 'digital-guide', content_type: 'product', content_name: 'Sofrito Digital Guide' }],
                currency: 'USD',
              });
            });
          });
        })
        .catch(function () {
          setStatus('guide-status', 'Hmm, that didn\'t go through. Email hello@sofritostudio.com and we\'ll send it by hand.', false);
          btn.disabled = false;
        });
    });
  }

  // ---- Contact form -> /api/contact ------------------------------
  function bindContactForm() {
    var form = document.getElementById('contact-form');
    if (!form) return;
    var status = document.getElementById('contact-status');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (status) status.textContent = '';
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      var payload = {};
      ['name', 'email', 'phone', 'business_name', 'business_type', 'package_interest', 'budget', 'stage', 'timeline', 'city', 'decision', 'message'].forEach(function (k) {
        var field = form.elements[k];
        if (field) payload[k] = field.value;
      });
      payload.source = form.elements.source ? form.elements.source.value : 'organic';
      fetch(API + '/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (res.ok) {
            if (status) status.className = 'mt-4 rounded-md bg-green-600 text-white text-sm font-medium px-4 py-3';
            if (status)
              status.textContent =
                'Got it. We reply in person — usually within 24 hours. Check your inbox for a confirmation.';
            track('lead_submitted', { score: res.body.score });
            zaraz('Form Submit', { form: 'contact', score: res.body.score, package_interest: payload.package_interest || '' });
            ttqIdentify({ email: payload.email, phone_number: payload.phone, external_id: res.body.id }, function () {
              ttq('Lead', {
                contents: [{
                  content_id: payload.package_interest || 'general-enquiry',
                  content_type: 'product',
                  content_name: payload.package_interest || 'Contact',
                }],
                value: 0,
                currency: 'USD',
                description: payload.business_type || '',
                status: 'submitted',
              });
            });
            form.reset();
          } else {
            if (status) status.className = 'mt-4 rounded-md bg-red-50 text-red-600 text-sm font-medium px-4 py-3';
            if (status) status.textContent = res.body && res.body.error ? res.body.error : 'Something broke — try again, or write to hello@sofritostudio.com.';
            btn.disabled = false;
            btn.textContent = 'Send it';
          }
        })
        .catch(function () {
          if (status) status.className = 'mt-4 rounded-md bg-red-50 text-red-600 text-sm font-medium px-4 py-3';
          if (status) status.textContent = 'Network hiccup. Try again in a second.';
          btn.disabled = false;
          btn.textContent = 'Send it';
        });
    });
  }

  // ---- Rich-link tracking for outbound CTAs ----------------------
  function bindCtaTrack() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[data-track-cta]') : null;
      if (a) {
        track('cta_click_' + a.getAttribute('data-track-cta'), { href: a.getAttribute('href') });
        zaraz('CTA Click', { cta: a.getAttribute('data-track-cta'), url: a.getAttribute('href') });
        ttq('ClickButton', {
          contents: [{ content_id: a.getAttribute('data-track-cta'), content_type: 'product', content_name: a.getAttribute('data-track-cta') }],
          currency: 'USD',
        });
      }
    });
  }

  // ---- Entrance animation (addition of a visual cue only) ---------
  function bindReveal() {
    var els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('opacity-100');
          entry.target.classList.remove('opacity-0');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    els.forEach(function (el) {
      el.classList.add('transition', 'duration-500', 'opacity-0');
      io.observe(el);
    });
  }

  onReady(function () {
    hydratePrices();
    hydrateConfig();
    bindLangToggle();
    bindGuideForm();
    bindContactForm();
    bindCtaTrack();
    bindReveal();
    bindConsent();
    loadGA4();
    zarazPageLevel();
    tiktokPageLevel();
    track('page_view', { referrer: document.referrer || null });
  });
})();