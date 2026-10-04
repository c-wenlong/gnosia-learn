// Lifts every distinct inline <svg> icon out of the signed-in Manus snapshots into icons/ and writes
// icons/INDEX.tsv. Run: SNAPS=<dir of *.html> node tools/capture/icons.mjs
//
// No dependencies. Each svg is normalised (ids renamed c0.., class/style/data-*/aria-* dropped, var(...) and
// currentColor paints set to currentColor), hashed on geometry (width/height excluded), and written once.
// Names come from icon-names.tsv (hash -> name), else the lucide class, else icon-<hash8>.
// Also lists the <img> glyphs (files.manuscdn.com/assets/icon/session/*.svg), fetching those into icons/session/.
// Manus's own marks (logo, wordmark, Cue badge glyph) are Manus's property, kept for reference only.
import crypto from 'crypto';
import fs from 'fs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = new URL('../../icons/', import.meta.url).pathname;
const SNAPS = process.env.SNAPS;
if (!SNAPS) { console.error('set SNAPS=<dir with the *.html snapshots>'); process.exit(1); }
fs.mkdirSync(OUT + 'session', { recursive: true });

const names = new Map();
try { for (const l of fs.readFileSync(HERE + 'icon-names.tsv', 'utf8').split('\n')) { const [k, n] = l.split('\t'); if (k && n && k !== 'hash') names.set(k, n); } } catch { /* optional */ }

// One pass per file: svgs become a marker, aria-label/title become text, tags drop out, so the words
// either side of the k-th marker are what sat next to the k-th svg.
const MARK = '\u0001';
const flatten = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<svg\b[\s\S]*?<\/svg>/g, MARK)
  .replace(/<[^>]*?\s(?:aria-label|title)="([^"]*)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const attr = (tag, a) => (tag.match(new RegExp('\\s' + a + '="([^"]*)"')) || [])[1];

function normalise(raw) {
  const open = raw.match(/^<svg\b[^>]*>/)[0];
  let s = raw;
  const ids = [...new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))];
  ids.forEach((id, i) => { const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); s = s.replace(new RegExp('"' + esc + '"', 'g'), `"c${i}"`).replace(new RegExp('url\\(#' + esc + '\\)', 'g'), `url(#c${i})`).replace(new RegExp('"#' + esc + '"', 'g'), `"#c${i}"`); });
  s = s.replace(/\s(class|style|data-[\w-]+|aria-[\w-]+|focusable|role|tabindex|color|data-claude\w*)="[^"]*"/g, '');
  s = s.replace(/\s(fill|stroke)="(currentColor|var\([^"]*\))"/g, ' $1="currentColor"');
  s = s.replace(/\s(xmlns:xlink|xmlns)="[^"]*"/g, '').replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return { svg: s, open, lucide: (attr(open, 'class') || '').match(/lucide-([a-z0-9-]+)/)?.[1] };
}

const seen = new Map();
const imgs = new Map();
const files = fs.readdirSync(SNAPS).filter((f) => f.endsWith('.html')).sort();
for (const f of files) {
  const label = f.replace(/\.html$/, '');
  const html = fs.readFileSync(SNAPS + '/' + f, 'utf8');
  const flat = flatten(html); const marks = []; for (let i = flat.indexOf(MARK); i >= 0; i = flat.indexOf(MARK, i + 1)) marks.push(i);
  let k = -1;
  for (const m of html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)) {
    k++;
    const { svg, open, lucide } = normalise(m[0]);
    if (svg.length > 20000) continue; // illustrations, not icons
    const geom = svg.replace(/^<svg[^>]*>/, '').replace(/\s(width|height)="[^"]*"/g, '');
    const key = crypto.createHash('md5').update(geom + (attr(open, 'viewBox') || '')).digest('hex').slice(0, 8);
    const before = flat.slice(Math.max(0, marks[k] - 80), marks[k]).replace(new RegExp(MARK, 'g'), '[svg]').trim().split(' ').slice(-3).join(' ');
    const after = flat.slice(marks[k] + 1, marks[k] + 80).replace(new RegExp(MARK, 'g'), '[svg]').trim().split(' ').slice(0, 3).join(' ');
    const w = attr(open, 'width') || '', h = attr(open, 'height') || '';
    let e = seen.get(key);
    if (!e) { e = { key, svg, vb: attr(open, 'viewBox') || '', lucide, sizes: new Set(), where: new Set(), ctx: new Map(), n: 0, stroke: /stroke="currentColor"/.test(svg) && /fill="none"/.test(open) }; seen.set(key, e); }
    e.n++; e.sizes.add(`${Math.round(parseFloat(w)) || '?'}x${Math.round(parseFloat(h)) || '?'}`); e.where.add(label);
    const c = `${before} | ${after}`; e.ctx.set(c, (e.ctx.get(c) || 0) + 1);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const src = attr(m[0], 'src'); if (!src || !/manuscdn\.com\/assets\/icon\//.test(src)) continue;
    const e = imgs.get(src) || { n: 0, where: new Set() }; e.n++; e.where.add(label); imgs.set(src, e);
  }
  for (const m of html.matchAll(/https:\/\/files\.manuscdn\.com\/assets\/icon\/[\w\/.-]+\.svg/g)) {
    const e = imgs.get(m[0]) || { n: 0, where: new Set() }; if (!e.where.has(label)) { e.where.add(label); e.n++; } imgs.set(m[0], e);
  }
}

for (const f of fs.readdirSync(OUT)) if (f.endsWith('.svg')) fs.unlinkSync(OUT + f);
const all = [...seen.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
const used = new Map();
for (const e of all) { e.name = names.get(e.key) || (e.lucide ? 'lucide-' + e.lucide : 'icon-' + e.key); used.set(e.name, (used.get(e.name) || 0) + 1); }
const MARKS = /^(logo-|cue-|manus-)/;
const rows = [['file', 'inferred_name', 'hash', 'sizes', 'viewBox', 'style', 'seen_on', 'count', 'role', 'note'].join('\t')];
let named = 0, fallback = 0;
for (const e of all) {
  e.file = (used.get(e.name) > 1 ? `${e.name}-${e.key}` : e.name) + '.svg';
  fs.writeFileSync(OUT + e.file, e.svg.replace(/></g, '>\n<') + '\n');
  if (names.has(e.key)) named++; else fallback++;
  const role = [...e.ctx.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c).join(' // ');
  const note = MARKS.test(e.name) ? "Manus's property, kept for reference only" : names.has(e.key) ? '' : e.lucide ? 'unnamed, lucide class' : 'unnamed fallback';
  rows.push([e.file, e.name, e.key, [...e.sizes].join(' '), e.vb, e.stroke ? 'stroke' : 'fill', [...e.where].slice(0, 6).join('; ') + (e.where.size > 6 ? `; +${e.where.size - 6}` : ''), e.n, role, note].map((x) => String(x).replace(/\t/g, ' ')).join('\t'));
}

// img icons: list by URL; fetch the public session glyphs
rows.push('', '# <img> icons loaded from files.manuscdn.com (url, snapshots, count, stored copy)');
for (const [url, e] of [...imgs.entries()].sort()) {
  let stored = '';
  if (/\/icon\/session\/[\w-]+\.svg$/.test(url)) {
    const nm = url.split('/').pop();
    try { const r = await fetch(url); if (r.ok) { fs.writeFileSync(OUT + 'session/' + nm, await r.text()); stored = 'icons/session/' + nm; } else stored = 'fetch ' + r.status; } catch { stored = 'fetch failed'; }
  } else stored = 'not downloaded';
  rows.push([url, [...e.where].slice(0, 6).join('; '), e.n, stored].join('\t'));
}
rows.push('', "# Manus's own marks (logo, wordmark, Cue badge glyph) are Manus's property and kept for reference only.");
fs.writeFileSync(OUT + 'INDEX.tsv', rows.join('\n') + '\n');
console.log(`${all.length} distinct icons (${named} named, ${fallback} unnamed), ${imgs.size} img icons`);
