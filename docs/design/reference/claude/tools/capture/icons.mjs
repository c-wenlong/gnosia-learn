// Lifts Claude's icons out of the signed-in page copies into icons/ and writes icons/INDEX.tsv.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs SNAPS=<dir of page copies> \
//     HB=<harfbuzzjs dir> WAWOFF2=<wawoff2 dir> node tools/capture/icons.mjs
//
// Claude draws almost every glyph with an icon font, Anthropicons-Variable (axes wght 400 to 700,
// opsz 12 to 32, and two animation axes), as one private-use character in a span[data-cds=Icon]
// whose inline style sets the size and a weight that thins the stroke as the icon grows (533.3 at
// 16px, 433.3 at 20px, 577.8 at 12px). Each copy is opened in Chromium and every such span is read:
// its character, size, weight and the label of the control around it (aria-label, or the visible
// text of its row). The font file comes from the CDN cache lib.mjs keeps; it is decompressed with
// wawoff2 and each character's outline is drawn with harfbuzzjs at the weight and optical size it
// was most often shown at, then written as an SVG named by the font's own glyph name (else by the
// label, else by the code point; tools/capture/icon-names.tsv, written by hand from the labels, wins over both). The few inline <svg>s (the Claude wordmark, the greeting's
// asterisk, the incognito ghost, the voice bars) are normalised and written by label or geometry
// hash. HB and WAWOFF2 default to the copies under tools/tldrawkc/node_modules in this repository.
// The glyphs and marks are Anthropic's property, kept for reference only.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium, REF, SNAPS, CACHE, metaOf, newContext, openSnap } from './signed-in/lib.mjs';

if (!SNAPS) { console.error('SNAPS=<dir of page copies> is required'); process.exit(2); }
const require = createRequire(import.meta.url);
const NM = path.resolve(REF, '..', '..', '..', '..', 'tools', 'tldrawkc', 'node_modules');
const hbjs = await require(process.env.HB || path.join(NM, 'harfbuzzjs'));
const decompress = require(path.join(process.env.WAWOFF2 || path.join(NM, 'wawoff2'), 'decompress.js'));
const OUT = path.join(REF, 'icons');
const NAMES = new Map();
try { for (const l of fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'icon-names.tsv'), 'utf8').split('\n')) { const [k, n] = l.split('\t'); if (k && n && !k.startsWith('#')) NAMES.set(k, n.trim()); } } catch { /* optional */ }
fs.mkdirSync(OUT, { recursive: true });

const LABELS = fs.readdirSync(SNAPS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((l) => fs.existsSync(path.join(SNAPS, `${l}.html`))).sort();

function read() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  // A control's own label: its aria-label (with the chat or artifact title cut off "More options
  // for <title>" and "Select <title>"), or the visible text of a menu item, tab or radio. List rows
  // and search results are skipped, since their text is the owner's own titles.
  const labelOf = (e) => {
    for (let n = e.parentElement, i = 0; n && i < 6; n = n.parentElement, i++) {
      if (n.closest('li, tr, [role=option], [data-testid=sidebar-recents], [data-testid=sidebar-pinned]') && !n.matches('button[aria-label], [role^=menuitem]')) continue;
      const a = n.getAttribute('aria-label');
      if (a) return clean(a.replace(/^(More options for|Select|Open standalone version of|Rename) .*/, '$1').replace(/^Model: .*/, 'Model'));
      if (/^(menuitem|menuitemradio|menuitemcheckbox|tab|radio)$/.test(n.getAttribute('role') || '')) {
        const t = clean((n.innerText || '').split('\n')[0]);
        if (t) return t;
      }
    }
    return '';
  };
  const glyphs = [...document.querySelectorAll('span[data-cds=Icon]')].map((e) => {
    const cs = getComputedStyle(e);
    return { ch: [...(e.textContent || '')].map((c) => c.codePointAt(0)).filter((c) => c >= 0xe000), size: Math.round(parseFloat(cs.fontSize)), weight: Math.round(parseFloat(cs.fontWeight) * 10) / 10, label: labelOf(e) };
  }).filter((g) => g.ch.length);
  const svgs = [...document.querySelectorAll('svg')].filter((s) => !s.closest('svg *') && s.getBoundingClientRect().width > 0).map((s) => ({ html: s.outerHTML, w: Math.round(s.getBoundingClientRect().width), h: Math.round(s.getBoundingClientRect().height), label: (s.getAttribute('aria-label') || '') || labelOf(s) }));
  return { glyphs, svgs };
}

const browser = await chromium.launch();
const glyphs = new Map();
const inline = new Map();
for (const label of LABELS) {
  const ctx = await newContext(browser, metaOf(label));
  const page = await openSnap(ctx, label);
  const r = await page.evaluate(read);
  for (const g of r.glyphs) {
    const cp = g.ch[0];
    const e = glyphs.get(cp) || { cp, n: 0, sizes: new Map(), weights: new Map(), labels: new Map(), where: new Set() };
    e.n++;
    e.sizes.set(g.size, (e.sizes.get(g.size) || 0) + 1);
    e.weights.set(`${g.size}@${g.weight}`, (e.weights.get(`${g.size}@${g.weight}`) || 0) + 1);
    if (g.label) e.labels.set(g.label, (e.labels.get(g.label) || 0) + 1);
    e.where.add(label);
    glyphs.set(cp, e);
  }
  for (const s of r.svgs) {
    let svg = s.html;
    const ids = [...new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))];
    ids.forEach((id, i) => { const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); svg = svg.replace(new RegExp('"' + esc + '"', 'g'), `"c${i}"`).replace(new RegExp('url\\(#' + esc + '\\)', 'g'), `url(#c${i})`).replace(new RegExp('"#' + esc + '"', 'g'), `"#c${i}"`); });
    svg = svg.replace(/\s(class|style|data-[\w-]+|aria-[\w-]+|focusable|role|tabindex)="[^"]*"/g, '').replace(/\s(xmlns:xlink|xmlns)="[^"]*"/g, '').replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    if (svg.length > 20000) continue;
    const key = crypto.createHash('md5').update(svg.replace(/^<svg[^>]*>/, '').replace(/\s(width|height)="[^"]*"/g, '')).digest('hex').slice(0, 8);
    const e = inline.get(key) || { key, svg, n: 0, sizes: new Set(), labels: new Map(), where: new Set() };
    e.n++; e.sizes.add(`${s.w}x${s.h}`); e.where.add(label);
    if (s.label) e.labels.set(s.label, (e.labels.get(s.label) || 0) + 1);
    inline.set(key, e);
  }
  await ctx.close();
}
await browser.close();

// The icon font, from the cache lib.mjs filled while the copies were open.
const css = JSON.parse(fs.readFileSync(path.join(REF, 'raw', 'css-vars.json'), 'utf8'));
const face = css.fonts.find((f) => /Anthropicons/.test(f['font-family']));
const fontUrl = face.src.match(/url\("([^"]+)"\)/)[1];
const cached = path.join(CACHE, crypto.createHash('sha1').update(fontUrl).digest('hex'));
const ttf = await decompress(fs.readFileSync(cached));
const hb = await hbjs;
const hbFace = hb.createFace(hb.createBlob(ttf), 0);
const font = hb.createFont(hbFace);

const slug = (s) => s.toLowerCase().replace(/^more options for .*/, 'more').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.svg')) fs.unlinkSync(path.join(OUT, f));
const rows = [['file', 'source', 'name', 'codepoint_or_hash', 'sizes', 'drawn_at', 'viewBox', 'seen_on', 'count', 'labels'].join('\t')];
const used = new Set();
const unique = (base) => { let n = base || 'icon', i = 2; while (used.has(n)) n = `${base}-${i++}`; used.add(n); return n; };

for (const e of [...glyphs.values()].sort((a, b) => b.n - a.n || a.cp - b.cp)) {
  const buf = hb.createBuffer();
  buf.addText(String.fromCodePoint(e.cp));
  buf.guessSegmentProperties();
  const [size, weight] = top(e.weights)[0][0].split('@').map(Number);
  font.setVariations({ wght: weight, opsz: Math.min(32, Math.max(12, size)) });
  hb.shape(font, buf);
  const g = buf.json()[0];
  buf.destroy();
  const gname = font.glyphName(g.g) || '';
  const d = font.glyphToPath(g.g);
  const adv = font.glyphHAdvance(g.g) || 1000;
  const label = top(e.labels)[0] ? top(e.labels)[0][0] : '';
  const cpKey = 'U+' + e.cp.toString(16).toUpperCase();
  const base = NAMES.get(cpKey) || (gname && !/^(uni|u|gid|glyph)[0-9A-F]+$/i.test(gname) ? slug(gname) : (label ? slug(label) : 'glyph-' + e.cp.toString(16)));
  const name = unique(base);
  const vb = `0 0 ${adv} 1000`;
  fs.writeFileSync(path.join(OUT, `${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="currentColor">\n<path transform="matrix(1 0 0 -1 0 1000)" d="${d}"/>\n</svg>\n`);
  rows.push([`${name}.svg`, 'Anthropicons-Variable', gname, 'U+' + e.cp.toString(16).toUpperCase(), top(e.sizes).map(([s]) => s + 'px').join(' '), `wght ${weight}, opsz ${Math.min(32, Math.max(12, size))}`, vb, [...e.where].slice(0, 5).join('; ') + (e.where.size > 5 ? `; +${e.where.size - 5}` : ''), e.n, top(e.labels).slice(0, 3).map(([l]) => l).join(' // ')].map((x) => String(x).replace(/\t/g, ' ')).join('\t'));
}
for (const e of [...inline.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))) {
  const label = top(e.labels)[0] ? top(e.labels)[0][0] : '';
  const name = unique(NAMES.get(e.key) || (label ? slug(label) : 'svg-' + e.key));
  fs.writeFileSync(path.join(OUT, `${name}.svg`), e.svg.replace(/></g, '>\n<') + '\n');
  rows.push([`${name}.svg`, 'inline svg', '', e.key, [...e.sizes].join(' '), '', (e.svg.match(/viewBox="([^"]*)"/) || [])[1] || '', [...e.where].slice(0, 5).join('; ') + (e.where.size > 5 ? `; +${e.where.size - 5}` : ''), e.n, top(e.labels).slice(0, 3).map(([l]) => l).join(' // ')].join('\t'));
}
rows.push('', '# Glyphs from Anthropic\'s icon font and Anthropic\'s marks (the Claude wordmark, the asterisk) are Anthropic\'s property, kept for reference only.');
fs.writeFileSync(path.join(OUT, 'INDEX.tsv'), rows.join('\n') + '\n');
console.log(`${glyphs.size} font glyphs, ${inline.size} inline svgs`);
