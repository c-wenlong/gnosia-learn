// Lifts every icon ChatGPT draws from its SVG sprites out of the page copies into icons/ and writes
// icons/INDEX.tsv.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs SNAPS=<dir of page copies> node tools/capture/icons.mjs
//
// ChatGPT draws its icons as <svg><use href="/cdn/assets/sprites-core-*.svg#name"></svg>. When a
// page is copied, snapshot.js copies just the <symbol>s the page uses into one hidden
// <svg data-sprites> at the end of <body>, as `spr<N>-<name>` (N is the sprite file), and points
// each <use> at its local copy. This script reads those symbols from every copy, keeps one of
// each (by content), and writes each as a standalone SVG named by its sprite id without the
// `spr<N>-` prefix. Sprites whose ids are content hashes (the second sprite file names its symbols
// `a1bba7` and so on) get a name from where the icon is used: the aria-label or text of the
// nearest labelled control, recorded in INDEX.tsv. Every file paints in currentColor.
//
// The icons are OpenAI's property, kept for reference only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium, REF, SNAPS, metaOf, newContext, openSnap } from './signed-in/lib.mjs';

if (!SNAPS) { console.error('SNAPS=<dir of page copies> is required'); process.exit(2); }
const OUT = path.join(REF, 'icons');
const LABELS = fs.readdirSync(SNAPS).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();

const browser = await chromium.launch();
const icons = new Map(); // content hash -> { ids:Set, symbol, viewBox, pages:Set, uses, labels:Map }
for (const label of LABELS) {
  const ctx = await newContext(browser, metaOf(label));
  const page = await openSnap(ctx, label);
  const found = await page.evaluate(() => {
    const syms = [...document.querySelectorAll('svg[data-sprites] symbol')];
    // The name comes from the nearest control's aria-label or its own short text (a button, a link,
    // a menu item, a tab); never from message content, so no chat text ends up in a file name.
    const labelOf = (u) => {
      const c = u.closest && u.closest('button, a, [role=button], [role=menuitem], [role=menuitemradio], [role=tab], [role=option], [role=switch]');
      if (!c) return '';
      if (c.closest('.markdown, [data-message-author-role]')) return '';
      const t = (c.getAttribute('aria-label') || (c.innerText || '').trim().split('\n')[0] || '').split(/[,.]/)[0].trim();
      return t.length <= 32 ? t : '';
    };
    const uses = [...document.querySelectorAll('use')];
    return syms.map((s) => {
      const id = s.id;
      const u = uses.filter((x) => x.getAttribute('href') === '#' + id);
      const seen = u.find((x) => { const r = x.closest('svg').getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      return { id, viewBox: s.getAttribute('viewBox'), inner: s.innerHTML, uses: u.length, label: labelOf(seen || u[0] || s), size: seen ? Math.round(seen.closest('svg').getBoundingClientRect().width) : null };
    });
  });
  for (const f of found) {
    const key = crypto.createHash('sha1').update(f.viewBox + f.inner).digest('hex').slice(0, 12);
    if (!icons.has(key)) icons.set(key, { ids: new Set(), viewBox: f.viewBox, inner: f.inner, pages: new Set(), uses: 0, labels: new Map(), sizes: new Set() });
    const e = icons.get(key);
    e.ids.add(f.id.replace(/^spr\d+-/, ''));
    e.pages.add(label);
    e.uses += f.uses;
    if (f.label) e.labels.set(f.label, (e.labels.get(f.label) || 0) + 1);
    if (f.size) e.sizes.add(f.size);
  }
  await ctx.close();
}
await browser.close();

const isHash = (id) => /^[0-9a-f]{6}$/.test(id);
const slug = (s) => s.toLowerCase().replace(/\S*\d\S*/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const used = new Set();
const rows = [];
for (const [key, e] of [...icons.entries()].sort((a, b) => [...a[1].ids].sort()[0].localeCompare([...b[1].ids].sort()[0]) || a[0].localeCompare(b[0]))) {
  // A symbol that both sprite files carry keeps its readable id over the hash.
  const id = [...e.ids].sort().find((x) => !isHash(x)) || [...e.ids].sort()[0];
  const topLabel = [...e.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  let name = isHash(id) ? (topLabel ? slug(topLabel[0]) : 'icon') + '-' + id : id;
  while (used.has(name)) name += '-' + key.slice(0, 4);
  used.add(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${e.viewBox}" fill="currentColor">${e.inner.replace(/\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')}</svg>\n`;
  fs.writeFileSync(path.join(OUT, `${name}.svg`), svg);
  rows.push([name + '.svg', [...e.ids].sort().join(' '), e.viewBox, [...e.sizes].sort((a, b) => a - b).join(' '), e.uses, [...e.pages].sort().join(' '), topLabel ? topLabel[0].replace(/\t/g, ' ') : '']);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
const head = [
  '# Icons lifted from the inlined sprite symbols of the ChatGPT page copies (tools/capture/icons.mjs).',
  '# file, sprite id(s) without the spr<N>- prefix, viewBox, rendered size(s) in CSS px, <use> count over all copies, page copies, the label of the nearest control where it was used',
  "# OpenAI's icons, kept for reference only.",
  ['file', 'sprite_id', 'viewbox', 'sizes', 'uses', 'pages', 'used_in'].join('\t'),
];
fs.writeFileSync(path.join(OUT, 'INDEX.tsv'), head.concat(rows.map((r) => r.join('\t'))).join('\n') + '\n');
console.log(`${rows.length} icons -> icons/`);
