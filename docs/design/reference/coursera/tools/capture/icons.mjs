// Collects every distinct inline <svg> icon on Coursera's public pages into icons/ and writes icons/INDEX.tsv.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright/index.js node icons.mjs
//
// CDS icons carry no name in the DOM (only `cds-react-aria...` ids and hashed css classes), so a file is named
// by the first hint that exists: a CDS component class on the svg or an ancestor (cds-ContextualHelpIcon),
// then the aria-label or text of the button or link it sits in, else a short hash of its geometry. Files whose
// geometry matches are one icon, listed once with every page and place it was seen. Colour is kept as
// `currentColor` wherever the computed fill or stroke equals the svg's text colour, so each icon recolours
// from CSS `color` the way it does on the site.
import crypto from 'crypto';
import fs from 'fs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.default ?? pw;
const OUT = new URL('../../icons/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const BASE = 'https://www.coursera.org';
const wait = (p, ms) => p.waitForTimeout(ms);

// Runs in the page: returns one record per icon-sized svg currently in the DOM.
function collect() {
  const rgb = c => { const m = c.match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0, 3).map(x => Math.round(parseFloat(x))).join(',') : c; };
  const hex = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c; const [r, g, b] = m[1].split(',').map(x => Math.round(parseFloat(x))); return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''); };
  return [...document.querySelectorAll('svg')].filter(s => {
    if (s.closest('#onetrust-consent-sdk')) return false;
    const r = s.getBoundingClientRect(); const isLogo = s.getAttribute('aria-label') === 'Coursera';
    return isLogo || (r.width >= 10 && r.width <= 64 && r.height >= 10 && r.height <= 64 && !s.closest('svg svg'));
  }).map(s => {
    const r = s.getBoundingClientRect(), col = rgb(getComputedStyle(s).color);
    const c = s.cloneNode(true);
    const shapes = [...s.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse')], cshapes = [...c.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse')];
    shapes.forEach((e, i) => {
      const cs = getComputedStyle(e), t = cshapes[i];
      for (const a of ['fill', 'stroke']) if ((t.getAttribute(a) || '').startsWith('var(')) t.setAttribute(a, rgb(cs[a]) === col ? 'currentColor' : hex(cs[a]));
      if (!t.hasAttribute('fill') && cs.fill !== 'none') t.setAttribute('fill', rgb(cs.fill) === col ? 'currentColor' : hex(cs.fill));
      else if (t.getAttribute('fill') && t.getAttribute('fill') !== 'none' && t.getAttribute('fill') !== 'currentColor' && rgb(cs.fill) === col) t.setAttribute('fill', 'currentColor');
      if (!t.hasAttribute('stroke') && cs.stroke !== 'none') {
        t.setAttribute('stroke', rgb(cs.stroke) === col ? 'currentColor' : hex(cs.stroke));
        t.setAttribute('stroke-width', parseFloat(cs.strokeWidth) || 1);
        if (cs.strokeLinecap !== 'butt') t.setAttribute('stroke-linecap', cs.strokeLinecap);
        if (cs.strokeLinejoin !== 'miter') t.setAttribute('stroke-linejoin', cs.strokeLinejoin);
      }
    });
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    for (const a of ['id', 'class', 'focusable', 'aria-hidden', 'aria-labelledby', 'style']) c.removeAttribute(a);
    // keep ids that a url(#...) reference points at (gradients, clip paths, masks), drop the rest
    const refs = new Set([...c.outerHTML.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1].replace(/&quot;|"/g, '')));
    c.querySelectorAll('[id],[class],[style]').forEach(e => { if (!refs.has(e.id)) e.removeAttribute('id'); e.removeAttribute('class'); if (e.tagName !== 'mask') e.removeAttribute('style'); });
    if (!c.hasAttribute('viewBox')) c.setAttribute('viewBox', `0 0 ${c.getAttribute('width') || Math.round(r.width)} ${c.getAttribute('height') || Math.round(r.height)}`.replace(/px/g, ''));
    if (!c.hasAttribute('width')) c.setAttribute('width', Math.round(r.width));
    if (!c.hasAttribute('height')) c.setAttribute('height', Math.round(r.height));
    const cdsClass = [s, ...(function* () { let a = s.parentElement; for (let i = 0; a && i < 4; i++, a = a.parentElement) yield a; })()]
      .flatMap(e => [...e.classList]).find(x => /^cds-[A-Z]\w+/.test(x) && !/^cds-(root|grid)/.test(x)) || '';
    const holder = s.closest('button,a,[role=button],[role=tab],summary');
    const label = (holder?.getAttribute('aria-label') || s.getAttribute('aria-label') || holder?.innerText || s.parentElement?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const place = (holder ? holder.tagName.toLowerCase() + (holder.getAttribute('data-testid') ? '[' + holder.getAttribute('data-testid') + ']' : '') : s.parentElement.tagName.toLowerCase()) + (cdsClass ? ' ' + cdsClass : '');
    const strokeOnly = shapes.length && shapes.every(e => getComputedStyle(e).fill === 'none') ;
    return { w: Math.round(r.width), h: Math.round(r.height), vb: s.getAttribute('viewBox'), html: c.outerHTML, cdsClass, label, place, strokeOnly, color: col };
  });
}

const seen = new Map();
async function grab(p, tag) {
  const list = await p.evaluate(collect);
  let fresh = 0;
  for (const ic of list) {
    // identity is the geometry: drop ids, sizes and the aria ids drawn into paths
    const key = crypto.createHash('md5').update(ic.html.replace(/\s(width|height|id)="[^"]*"/g, '').replace(/<(desc|title)>.*?<\/\1>/g, '').replace(/url\(#[^)]*\)|clip\d+_\d+_\d+/g, '')).digest('hex').slice(0, 8);
    const hit = seen.get(key);
    if (hit) { hit.where.add(tag); hit.sizes.add(`${ic.w}x${ic.h}`); if (ic.label) hit.labels.add(ic.label); hit.places.add(ic.place); continue; }
    fresh++;
    seen.set(key, { ...ic, key, where: new Set([tag]), sizes: new Set([`${ic.w}x${ic.h}`]), labels: new Set(ic.label ? [ic.label] : []), places: new Set([ic.place]) });
  }
  console.log(' ', tag, list.length, 'svgs,', fresh, 'new');
}
async function scrollAll(p) {
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 700) { await p.evaluate(y => scrollTo(0, y), y); await wait(p, 200); }
  await grab(p, p._tag); await p.evaluate(() => scrollTo(0, 0)); await wait(p, 400);
}
async function open(p, path, tag) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await wait(p, 6000); p._tag = tag;
  await p.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
}
async function tryDo(label, fn) { try { await fn(); } catch (e) { console.log('  skip', label, String(e.message).split('\n')[0]); } }

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA });
const p = await ctx.newPage();

await open(p, '/learn/machine-learning', 'course');
await grab(p, 'course (chat panel open)');
await tryDo('close chat', async () => { await p.click('[data-testid=coach-close]'); await wait(p, 900); });
await scrollAll(p);
await tryDo('modules', async () => {
  const btns = await p.$$('#modules button[aria-expanded]');
  for (const bt of btns) if (/^(Week|Module) \d/.test(await bt.innerText())) { await bt.scrollIntoViewIfNeeded(); await bt.click(); await wait(p, 800); break; }
  const cta = await p.$('#modules button[id$="-cta"]'); if (cta && await cta.isVisible()) { await cta.click(); await wait(p, 800); }
  await grab(p, 'course (module expanded)');
});
await tryDo('faq', async () => { for (const bt of (await p.$$('button[id$="-accordion-header"]')).slice(0, 1)) { await bt.scrollIntoViewIfNeeded(); await bt.click(); await wait(p, 600); } await grab(p, 'course (faq open)'); });
await tryDo('sticky', async () => { await p.evaluate(() => scrollTo(0, 1500)); await wait(p, 900); await grab(p, 'course (sticky header)'); });

await open(p, '/search?query=machine%20learning', 'search');
await scrollAll(p);
await tryDo('dropdown', async () => { await p.click('[data-testid=filter-dropdown-productTypeDescription]'); await wait(p, 800); await grab(p, 'search (filter dropdown)'); await p.keyboard.press('Escape'); });
await tryDo('panel', async () => { await p.click('[data-testid=filter-and-sort-button]'); await wait(p, 1000); await grab(p, 'search (filter panel)'); await p.keyboard.press('Escape'); });
await tryDo('search focus', async () => { await p.click('[data-testid=search-autocomplete-input]'); await wait(p, 900); await grab(p, 'search (autocomplete open)'); });

for (const [path, tag] of [['/', 'home'], ['/browse/data-science', 'browse'], ['/specializations/machine-learning-introduction', 'specialization'], ['/professional-certificates/google-data-analytics', 'certificate'], ['/learn/learning-how-to-learn', 'course2']]) {
  await tryDo(tag, async () => {
    await open(p, path, tag);
    await tryDo('close chat', async () => { await p.click('[data-testid=coach-close]', { timeout: 2000 }); await wait(p, 700); });
    await scrollAll(p);
    if (tag === 'home') { await p.click('[data-testid=megamenu-explore-button]'); await wait(p, 1000); await grab(p, 'home (explore menu)'); }
    if (/specialization|certificate/.test(tag)) { const bt = (await p.$$('button[aria-label^="Course details for"]'))[0]; if (bt) { await bt.scrollIntoViewIfNeeded(); await bt.click(); await wait(p, 800); await grab(p, tag + ' (course details open)'); } }
  });
}
await b.close();

// name each icon: icon-names.tsv (geometry hash, name) wins; the topic-category glyphs are named by their
// pill label; anything else stays `icon-<hash>`. Two icons with one name get the hash as a suffix.
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const names = new Map();
try { for (const l of fs.readFileSync(new URL('./icon-names.tsv', import.meta.url), 'utf8').split('\n')) { const [k, n] = l.split('\t'); if (k && n && k !== 'hash') names.set(k, n); } } catch { /* optional */ }
const all = [...seen.values()].sort((a, b) => b.where.size - a.where.size || a.key.localeCompare(b.key));
const count = new Map();
for (const ic of all) {
  ic.name = names.get(ic.key) || (/Pill/i.test(ic.cdsClass) && ic.label ? 'category-' + slug(ic.label) : 'icon-' + ic.key);
  count.set(ic.name, (count.get(ic.name) || 0) + 1);
}
const rows = [];
for (const ic of all) {
  ic.file = (count.get(ic.name) > 1 ? `${ic.name}-${ic.key}` : ic.name) + '.svg';
  fs.writeFileSync(OUT + ic.file, ic.html.replace(/></g, '>\n<') + '\n');
  rows.push([ic.file, ic.name, ic.key, [...ic.sizes].join(' '), ic.vb || '', ic.strokeOnly ? 'stroke' : 'fill', [...new Set([...ic.where].map(w => w.replace(/ \(.*\)/, '')))].join('; '), [...ic.places].slice(0, 3).join('; '), [...ic.labels].slice(0, 3).join(' / ')].map(x => String(x).replace(/\t/g, ' ')).join('\t'));
}
fs.writeFileSync(OUT + 'INDEX.tsv', ['file\tinferred_name\thash\tsizes\tviewBox\tstyle\tseen_on\tplace\ttext_or_label', ...rows].join('\n') + '\n');
console.log(rows.length, 'icons ->', OUT);
