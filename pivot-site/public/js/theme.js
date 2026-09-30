// ============================================================
// Sofrito Studio — theme toggle (light / dark)
// Dark is the default. An inline head snippet applies the saved
// theme before first paint; this file wires the toggle buttons,
// persists the choice, and keeps the theme-color meta in sync.
// Include with <script src="/js/theme.js" defer></script>
// ============================================================
(function () {
  'use strict';

  var KEY = 'sofrito-theme';
  var DARK_META = '#09090b';
  var LIGHT_META = '#faf7f2';

  function current() {
    return document.documentElement.classList.contains('light') ? 'light' : 'dark';
  }

  function syncMeta(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? LIGHT_META : DARK_META);
  }

  function apply(theme) {
    document.documentElement.classList.toggle('light', theme === 'light');
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {
      /* storage unavailable (private mode) — theme still applies for the visit */
    }
    syncMeta(theme);
  }

  function init() {
    syncMeta(current());
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        apply(current() === 'light' ? 'dark' : 'light');
      });
    }
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
