/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './public/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Pillar 1 — strict two-font system (Staff Design Engineer role, 2026-10-14).
        // display: Fraunces (self-hosted variable) for h1-h3 + hero callouts.
        // sans: Inter (self-hosted variable) for body, UI controls, form inputs.
        // serif is mapped to the display face so legacy font-serif classes
        // resolve to Fraunces instead of a system serif.
        // mono stays on the zero-network-cost system stack, confined to .fig-caption.
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
