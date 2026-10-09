// ESLint gate: `no-undef` catches the missing-import class of bug that
// `node --check` cannot see (a bare identifier is a runtime ReferenceError,
// not a syntax error). Added 2026-10-08 after 70+ missing cross-module
// imports shipped to production and broke lead capture, webhooks, and the
// queue consumer. CI runs `npm run lint` on every push.
export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node / standard
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        queueMicrotask: 'readonly',
        // Web / Workers runtime
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        ReadableStream: 'readonly',
        AbortSignal: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        WebSocket: 'readonly',
      },
    },
    rules: { 'no-undef': 'error' },
  },
];
