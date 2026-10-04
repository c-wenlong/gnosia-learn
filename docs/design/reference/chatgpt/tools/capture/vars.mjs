// Read every custom property ChatGPT's stylesheets declare and write raw/css-vars.json.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs SNAPS=<dir of page copies> node tools/capture/vars.mjs
//
// chatgpt.com serves its CSS from its own origin (chatgpt.com/cdn/assets/*.css), so snapshot.js
// could read every sheet through the CSSOM and inline it as a <style> block in each page copy.
// This script collects those blocks from every copy in SNAPS, keeps one of each (by the sha1 of
// its text; the pages share 18 sheets and add a few of their own), and parses each in a headless
// Chromium with a constructed CSSStyleSheet. Every rule that declares a custom property is kept
// with its selector, its enclosing @media/@supports/@layer/@container chain, and the sheet it came
// from; @font-face rules are kept too, with a data: URL cut to its media type. Sheets are named
// `s-<first 10 hex of the sha1>`, with the first copy each one appeared in, so a rebuild from the
// same copies writes the same bytes (apart from readAt).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = path.resolve(here, '..', '..');
const SNAPS = process.env.SNAPS ? path.resolve(process.env.SNAPS) : null;
if (!SNAPS) { console.error('SNAPS=<dir of page copies> is required'); process.exit(2); }

const sheets = new Map();
for (const f of fs.readdirSync(SNAPS).filter((n) => n.endsWith('.html')).sort()) {
  const html = fs.readFileSync(path.join(SNAPS, f), 'utf8');
  for (const m of html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
    const css = m[2].replace(/<\\\/style/gi, '</style');
    const id = 's-' + crypto.createHash('sha1').update(css).digest('hex').slice(0, 10);
    const media = (m[1].match(/media="([^"]*)"/) || [])[1] || '';
    if (!sheets.has(id)) sheets.set(id, { name: id, firstIn: f.replace(/\.html$/, ''), media, bytes: css.length, css, pages: [] });
    const s = sheets.get(id);
    if (!s.pages.includes(f.replace(/\.html$/, ''))) s.pages.push(f.replace(/\.html$/, ''));
  }
}

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.default ?? pw;
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent('<!doctype html><html><head></head><body></body></html>');
const result = await p.evaluate((list) => {
  const rules = [];
  const fonts = [];
  const walk = (rs, ctx, file) => {
    for (const r of rs) {
      if (r.type === CSSRule.FONT_FACE_RULE) {
        const o = { file };
        for (let i = 0; i < r.style.length; i++) {
          let v = r.style.getPropertyValue(r.style[i]).trim();
          v = v.replace(/url\("?data:([^;,]+)[^)]*\)/g, 'url(data:$1,…)');
          o[r.style[i]] = v;
        }
        fonts.push(o);
        continue;
      }
      if (r.cssRules && !r.style) {
        const head = r.type === CSSRule.MEDIA_RULE ? '@media ' + r.media.mediaText
          : r.type === CSSRule.SUPPORTS_RULE ? '@supports ' + r.conditionText
          : r.constructor.name === 'CSSLayerBlockRule' ? '@layer ' + r.name
          : r.constructor.name === 'CSSContainerRule' ? '@container ' + r.conditionText
          : r.cssText.split('{')[0].trim();
        walk(r.cssRules, [...ctx, head], file);
        continue;
      }
      if (!r.style) continue;
      const props = {};
      let n = 0;
      for (let i = 0; i < r.style.length; i++) {
        const k = r.style[i];
        if (k.startsWith('--')) { props[k] = r.style.getPropertyValue(k).trim(); n++; }
      }
      // Declarations nested under a conditional rule inside a style rule (CSSNestedDeclarations) have
      // no selector of their own: they belong to the enclosing style rule.
      const outer = [...ctx].reverse().find((c) => c.startsWith('& '));
      if (n) rules.push({ file, selector: r.selectorText ?? (outer ? outer.slice(2) : ':scope'), context: ctx, properties: props });
      // A style rule can hold nested rules (CSS nesting); walk them too.
      if (r.cssRules && r.cssRules.length) walk(r.cssRules, [...ctx, '& ' + r.selectorText], file);
    }
  };
  for (const s of list) {
    const ss = new CSSStyleSheet();
    try { ss.replaceSync(s.css); } catch (e) { rules.push({ file: s.name, error: String(e) }); continue; }
    walk(ss.cssRules, s.media ? ['@media ' + s.media] : [], s.name);
  }
  return { rules, fonts };
}, [...sheets.values()].map(({ name, css, media }) => ({ name, css, media })));

// The cascade across layers, selector lists and @supports blocks decides which declaration wins,
// so the value each name actually takes on <html> is read from a real page copy as well: every
// name declared on a root-like selector, in dark (as captured) and light (the `dark` class removed
// from every element, as render.mjs does), and the accent names under each data-chat-theme.
// Custom properties compute to their text with var() substituted, so these are literals.
const ROOTISH = /^(:root|html|\.dark|\.light|\[data-chat-theme|\[data-ds-colored|body\[data-type-stack)/;
const rootNames = [...new Set(result.rules.filter((r) => !r.error && ROOTISH.test(r.selector) && !/puik/.test(r.selector)).flatMap((r) => Object.keys(r.properties)))].sort();
const ACCENTS = ['default', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'black'];
const ctx = await b.newContext();
await ctx.route('**/*', (route) => (route.request().url().startsWith('file:') ? route.continue() : route.abort()));
const page = await ctx.newPage();
const probe = fs.existsSync(path.join(SNAPS, 'home-dark.html')) ? 'home-dark' : fs.readdirSync(SNAPS).find((n) => n.endsWith('.html')).replace(/\.html$/, '');
await page.goto(`file://${SNAPS}/${probe}.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const computed = await page.evaluate(({ names, accents }) => {
  const h = document.documentElement;
  const read = (list) => { const cs = getComputedStyle(h); const o = {}; for (const n of list) o[n] = cs.getPropertyValue(n).trim(); return o; };
  const accentNames = names.filter((n) => /^--(theme-|color-chart-sequential)/.test(n));
  const captured = { chatTheme: h.getAttribute('data-chat-theme'), contrast: h.getAttribute('data-contrast'), classes: h.className };
  const darkEls = [...document.querySelectorAll('.dark')];
  const toLight = () => { darkEls.forEach((n) => n.classList.remove('dark')); h.style.colorScheme = 'light'; };
  const toDark = () => { darkEls.forEach((n) => n.classList.add('dark')); h.style.colorScheme = 'dark'; };
  // Chromium supports display-p3, so the `@supports (color:color(display-p3 1 1 1))` blocks win for
  // the accent hues. Those values are read first (as `p3`), then the blocks are deleted from the
  // inline sheets so every other reading is the sRGB value the token file carries.
  const p3 = { dark: read(names) };
  toLight(); p3.light = read(names); toDark();
  const dropP3 = (list) => { for (let i = list.cssRules.length - 1; i >= 0; i--) { const r = list.cssRules[i]; if (r.type === CSSRule.SUPPORTS_RULE && /display-p3/.test(r.conditionText)) list.deleteRule(i); else if (r.cssRules && !r.style) dropP3(r); } };
  for (const ss of document.styleSheets) { try { dropP3(ss); } catch { /* not readable */ } }
  const out = { captured, dark: read(names), accents: {} };
  for (const a of accents) { h.setAttribute('data-chat-theme', a); (out.accents[a] ||= {}).dark = read(accentNames); }
  h.setAttribute('data-chat-theme', captured.chatTheme);
  toLight();
  out.light = read(names);
  for (const a of accents) { h.setAttribute('data-chat-theme', a); out.accents[a].light = read(accentNames); }
  h.setAttribute('data-chat-theme', captured.chatTheme);
  // Only the names whose p3 reading differs from the sRGB one are kept.
  out.p3 = { dark: {}, light: {} };
  for (const t of ['dark', 'light']) for (const n of names) if (p3[t][n] !== out[t][n]) out.p3[t][n] = p3[t][n];
  return out;
}, { names: rootNames, accents: ACCENTS });
computed.page = probe;
await b.close();

// Which family a rule belongs to. ChatGPT's own tokens are the design-system palette (the
// `html, .light, .dark .light` light block and the `.dark` block, so `.light` inside a dark page
// forces light), the `data-chat-theme` accents, `data-contrast`, the sidebar and thread sizes, and
// the component variables its own classes read. Tailwind's internal `--tw-*` registers are
// Tailwind's. `.puik-root` is a second OpenAI kit the bundle declares but no element on any captured
// page carries; `[data-silk]` is Silk, the bottom-sheet library the phone thread's menus use;
// `.swiper-*` is Swiper.
const familyOf = (r) => {
  const names = Object.keys(r.properties);
  if (names.every((n) => /^--tw-/.test(n))) return 'tailwind';
  if (/puik-root/.test(r.selector)) return 'puik';
  if (/data-silk/.test(r.selector) || r.file === 's-375be35dba') return 'silk';
  if (/swiper/.test(r.selector) || names.every((n) => /^--swiper-/.test(n))) return 'swiper';
  return 'chatgpt';
};
const kept = result.rules.filter((r) => !r.error).map((r) => ({ ...r, family: familyOf(r) }));
const summary = {};
for (const r of kept) {
  const key = (r.context.length ? r.context.join(' ') + ' ' : '') + r.selector;
  summary[key] = (summary[key] || 0) + Object.keys(r.properties).length;
}
const families = {};
for (const r of kept) families[r.family] = (families[r.family] || 0) + Object.keys(r.properties).length;
const out = {
  // The day the copies were taken (the oldest copy's local date), so a rebuild writes the same bytes.
  readAt: (() => { const t = new Date(Math.min(...fs.readdirSync(SNAPS).filter((n) => n.endsWith('.html')).map((n) => fs.statSync(path.join(SNAPS, n)).mtimeMs))); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })(),
  source: 'the <style> blocks snapshot.js inlined into each page copy from chatgpt.com\'s same-origin stylesheets, deduplicated by sha1',
  sheets: [...sheets.values()].map(({ name, firstIn, media, bytes, pages }) => ({ name, firstIn, media: media || undefined, bytes, pages: pages.length })),
  counts: { rules: kept.length, fonts: result.fonts.length, byFamily: families, bySelector: Object.fromEntries(Object.entries(summary).sort((a, c) => c[1] - a[1] || (a[0] < c[0] ? -1 : 1))) },
  errors: result.rules.filter((r) => r.error),
  rules: kept,
  fonts: result.fonts,
  computed,
};
fs.mkdirSync(path.join(REF, 'raw'), { recursive: true });
fs.writeFileSync(path.join(REF, 'raw', 'css-vars.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`css-vars.json: ${sheets.size} sheets, ${out.counts.rules} rules with custom properties, ${out.counts.fonts} font faces`, families);
for (const [k, v] of Object.entries(out.counts.bySelector).slice(0, 40)) console.log(`  ${v}\t${k.slice(0, 150)}`);
