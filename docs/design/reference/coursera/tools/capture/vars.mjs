// Dump every --cds-* custom property from coursera.org, keyed by selector and media
// condition, plus the value each resolves to at three viewport widths.
// Usage: OUT=<file> node vars.mjs   (PLAYWRIGHT=<path to playwright> if not resolvable)
import fs from 'fs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.default ?? pw;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA });
const p = await ctx.newPage();
const fonts = new Set();
p.on('response', (r) => { if (/\.(woff2?|ttf|otf)(\?|$)/.test(r.url())) fonts.add(r.url()); });
await p.goto('https://www.coursera.org/learn/machine-learning', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(7000);
const out = await p.evaluate(() => {
  const decls = [], fontfaces = [], keyframes = new Set();
  const walk = (rules, media) => {
    for (const r of rules) {
      if (r.type === 4) { walk(r.cssRules, [...media, r.conditionText]); continue; }
      if (r.cssRules && !r.style) { walk(r.cssRules, media); continue; }
      if (r.type === 5) { fontfaces.push(r.cssText); continue; }
      if (r.type === 7) { keyframes.add(r.name); continue; }
      if (!r.style) continue;
      const sel = r.selectorText || '';
      if (!sel.startsWith(':root')) continue;
      for (const n of r.style) if (n.startsWith('--')) decls.push({ selector: sel, media: media.join(' and ') || null, name: n, value: r.style.getPropertyValue(n).trim() });
    }
  };
  for (const ss of document.styleSheets) { try { walk(ss.cssRules, []); } catch { /* cross-origin sheet */ } }
  return { decls, fontfaces, keyframes: [...keyframes], htmlAttrs: [...document.documentElement.attributes].map((a) => a.name + '=' + a.value) };
});
const names = [...new Set(out.decls.map((d) => d.name))];
const resolved = {};
for (const w of [390, 768, 1024, 1440]) {
  await p.setViewportSize({ width: w, height: 900 });
  await p.waitForTimeout(300);
  resolved[w] = await p.evaluate((ns) => { const cs = getComputedStyle(document.documentElement); return Object.fromEntries(ns.map((n) => [n, cs.getPropertyValue(n).trim()])); }, names);
}
// the same names with the page forced dark, to read the dark side of every light-dark() pair
await p.evaluate(() => { document.documentElement.dataset.colorTheme = 'dark'; document.documentElement.style.colorScheme = 'dark'; });
const probe = await p.evaluate((ns) => {
  const el = document.createElement('div'); document.body.appendChild(el);
  const res = {};
  for (const n of ns) { el.style.color = ''; el.style.color = `var(${n})`; res[n] = getComputedStyle(el).color; }
  document.documentElement.dataset.colorTheme = 'light'; document.documentElement.style.colorScheme = 'light';
  const light = {}; for (const n of ns) { el.style.color = `var(${n})`; light[n] = getComputedStyle(el).color; }
  el.remove(); return { dark: res, light };
}, names.filter((n) => n.includes('color')));
// root: authored values of the base :root rule; resolved: computed at 1440 wide
const root = Object.fromEntries(out.decls.filter((d) => d.selector === ':root' && !d.media).map((d) => [d.name, d.value]));
fs.writeFileSync(process.env.OUT, JSON.stringify({ url: p.url(), read: new Date().toISOString().slice(0, 10), root, resolved: resolved[1440], resolvedByWidth: resolved, ...out, colorProbe: probe, fonts: [...fonts] }, null, 1));
console.log(out.decls.length, names.length, [...new Set(out.decls.map((d) => d.media))]);
await b.close();
