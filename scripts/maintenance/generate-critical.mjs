// Critical CSS extraction — Tech Lead approved plan (adapted for ESM)
const { generate } = await import('critical');
const puppeteer = await import('puppeteer');

await generate({
  base: 'C:/Users/josho/SofritoStudio/deploy/',
  src: 'index.html',
  target: {
    html: 'C:/Users/josho/SofritoStudio/deploy/index.html',
    css: 'C:/Users/josho/AppData/Local/Temp/opencode/critical.css',
  },
  inline: true,
  extract: false, // keep original classes in style.min.css to prevent FOUC on scroll
  width: 412,
  height: 915,
  // THE FIX: Force these classes into the inline <style> block to eliminate CLS
  // NOTE: penthouse forceInclude matches selectors EXACTLY — must list full selectors
  include: [
    '.trust-strip',
    '.hero .trust-strip',
    '.hero .trust-strip .trust-num',
    '.hero .trust-strip .trust-label',
    '.hero-urgency',
    '.hero-signup',
    '.hero-signup input',
    '.hero-signup .btn',
    '.hero-signup .form-note',
    '.hero-bg-img',
  ],
  penthouse: {
    puppeteer: {
      getBrowser: async () =>
        puppeteer.launch({
          executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
          defaultViewport: { width: 412, height: 1800 }, // Belt and suspenders approach
        }),
    },
  },
});

console.log('Critical CSS successfully inlined!');