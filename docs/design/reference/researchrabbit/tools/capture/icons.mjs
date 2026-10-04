// Lifts the inline SVG icons out of the ResearchRabbit snapshots into icons/ and writes icons/INDEX.tsv,
// plus the graph engine's own canvas icon paths as icons/graph-<name>.svg.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tools/capture/icons.mjs
//
// Reads the snapshots like measure.mjs does (SNAP_DIR, else RR_SNAPSHOTS gunzipped to a temp directory
// outside the repository). An icon is an svg between 10 and 64px on a side, plus the wordmark and the
// rabbit mark. The big Lottie rabbit animation, the illustration art and any svg with more than a few
// dozen shapes are skipped. Icons are deduplicated by geometry, so one file lists every page and place
// it was seen. Colour is `currentColor` wherever the computed fill or stroke equals the svg's text
// colour, so each icon recolours from CSS `color` the way it does on the site.
//
// A file is named from icon-names.tsv (geometry hash, name) when the hash is listed there, else from
// the aria-label or text of the button it sits in, else from the nearest styled-component display name,
// else `icon-<hash>`. Run once, read INDEX.tsv, add names to icon-names.tsv, run again.
//
// The graph's canvas icons are 24x24 path strings in the app's bundle (`graphIconPathMap`: Author,
// EvaluationAlert, EvaluationCaution, Seed, Star, StarCircle, Tick). Only those path strings are
// copied, from a prettified copy of the bundle named by RR_BUNDLE; the bundle itself is not kept.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REF = path.resolve(HERE, '..', '..');
const OUT = path.join(REF, 'icons') + path.sep;
const ARCHIVE = (process.env.RR_SNAPSHOTS || '~/.self-learn/researchrabbit-snapshots').replace(/^~/, os.homedir());
const BUNDLE = process.env.RR_BUNDLE || '';

const PAGES = [
  'home-light-default', 'library-list-light-default', 'library-map-light-default', 'library-map-light-hover',
  'library-map-light-positions-moved', 'library-map-light-positions-reset-menu', 'search-list-light-default',
  'search-map-light-default', 'search-map-light-filter-popover', 'search-map-light-inspect-node',
  'search-map-light-settings-advanced', 'search-map-light-settings-size', 'search-map-light-settings-x-axis',
  'search-map-light-settings-y-axis', 'search-map-light-zoomed-in', 'search-split-light-default',
  'search-split-light-hover-input', 'search-split-light-hover-legend-inputs', 'search-split-light-hover-legend-results',
  'search-split-light-hover-list-card', 'search-split-light-hover-result', 'search-split-light-inspect-node',
];

// Runs in the page: one record per icon-sized svg currently in the DOM.
function collect() {
  const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0, 3).map((x) => Math.round(parseFloat(x))).join(',') : c; };
  const hex = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c; const [r, g, b] = m[1].split(',').map((x) => Math.round(parseFloat(x))); return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const dn = (n) => { const c = typeof n.className === 'string' ? n.className : (n.className && n.className.baseVal) || ''; const m = c.split(/\s+/).find((x) => /-sc-/.test(x)); return m ? m.replace(/-sc-.*$/, '') : ''; };
  const isMark = (s) => /Navigation__StyledWordmark|Navigation__LogoContainer/.test(dn(s) + ' ' + dn(s.parentElement || s));
  return [...document.querySelectorAll('svg')].filter((s) => {
    const r = s.getBoundingClientRect();
    const small = r.width >= 10 && r.width <= 64 && r.height >= 10 && r.height <= 64;
    if (!(small || isMark(s)) || s.closest('svg svg')) return false;
    if (s.closest('[class*="Rabbit__Container-sc-"], [class*="RabbitTrail__RabbitContainer-sc-"]') && s.querySelectorAll('*').length > 40) return false; // Lottie rabbit
    if (s.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse').length > 40) return false; // illustration art
    return getComputedStyle(s).visibility !== 'hidden';
  }).map((s) => {
    const r = s.getBoundingClientRect(), col = rgb(getComputedStyle(s).color);
    const c = s.cloneNode(true);
    const shapes = [...s.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse')], cshapes = [...c.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse')];
    shapes.forEach((e, i) => {
      const cs = getComputedStyle(e), t = cshapes[i];
      for (const a of ['fill', 'stroke']) if ((t.getAttribute(a) || '').startsWith('var(')) t.setAttribute(a, rgb(cs[a]) === col ? 'currentColor' : hex(cs[a]));
      if (!t.hasAttribute('fill') && cs.fill !== 'none' && !cs.fill.startsWith('url')) t.setAttribute('fill', rgb(cs.fill) === col ? 'currentColor' : hex(cs.fill));
      else if (t.getAttribute('fill') && !['none', 'currentColor'].includes(t.getAttribute('fill')) && !t.getAttribute('fill').startsWith('url') && rgb(cs.fill) === col) t.setAttribute('fill', 'currentColor');
      if (!t.hasAttribute('stroke') && cs.stroke !== 'none') {
        t.setAttribute('stroke', rgb(cs.stroke) === col ? 'currentColor' : hex(cs.stroke));
        t.setAttribute('stroke-width', parseFloat(cs.strokeWidth) || 1);
        if (cs.strokeLinecap !== 'butt') t.setAttribute('stroke-linecap', cs.strokeLinecap);
        if (cs.strokeLinejoin !== 'miter') t.setAttribute('stroke-linejoin', cs.strokeLinejoin);
      }
    });
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    for (const a of ['id', 'class', 'focusable', 'aria-hidden', 'aria-labelledby', 'style', 'data-testid']) c.removeAttribute(a);
    const refs = new Set([...c.outerHTML.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1].replace(/&quot;|"/g, '')));
    c.querySelectorAll('[id],[class],[style]').forEach((e) => { if (!refs.has(e.id)) e.removeAttribute('id'); e.removeAttribute('class'); if (e.tagName !== 'mask') e.removeAttribute('style'); });
    c.querySelectorAll('image').forEach((e) => e.remove());
    if (!c.hasAttribute('viewBox')) c.setAttribute('viewBox', `0 0 ${c.getAttribute('width') || Math.round(r.width)} ${c.getAttribute('height') || Math.round(r.height)}`.replace(/px/g, ''));
    if (!c.hasAttribute('width') || /%|em/.test(c.getAttribute('width'))) c.setAttribute('width', Math.round(r.width));
    if (!c.hasAttribute('height') || /%|em/.test(c.getAttribute('height'))) c.setAttribute('height', Math.round(r.height));
    const holder = s.closest('button,a,[role=button],[role=tab],label,li');
    const label = (holder?.getAttribute('aria-label') || s.getAttribute('aria-label') || holder?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    let comp = '';
    for (let n = s, i = 0; n && i < 4 && !comp; n = n.parentElement, i++) comp = dn(n);
    const place = (holder ? holder.tagName.toLowerCase() : s.parentElement.tagName.toLowerCase()) + (comp ? ' ' + comp : '');
    const strokeOnly = shapes.length > 0 && shapes.every((e) => getComputedStyle(e).fill === 'none');
    return { w: Math.round(r.width), h: Math.round(r.height), vb: s.getAttribute('viewBox'), html: c.outerHTML, label, comp, place, strokeOnly };
  });
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

async function main() {
  const pw = await import(process.env.PLAYWRIGHT || 'playwright');
  const { chromium } = pw.default ?? pw;
  let snapDir = process.env.SNAP_DIR;
  let tmp = null;
  if (!snapDir) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-icons-'));
    for (const name of PAGES) fs.writeFileSync(path.join(tmp, `${name}.html`), zlib.gunzipSync(fs.readFileSync(path.join(ARCHIVE, `${name}.html.gz`))));
    snapDir = tmp;
  }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.route('**/*', (route) => (route.request().url().startsWith('file:') ? route.continue() : route.abort()));
  const seen = new Map();
  for (const name of PAGES) {
    const page = await ctx.newPage();
    await page.goto(`file://${snapDir}/${name}.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1200);
    const tag = name.replace(/-light-default$/, '').replace(/-light-/, ' ');
    for (const ic of await page.evaluate(collect)) {
      const key = crypto.createHash('md5').update(ic.html.replace(/\s(width|height|id)="[^"]*"/g, '').replace(/<(desc|title)>.*?<\/\1>/g, '').replace(/url\(#[^)]*\)/g, '')).digest('hex').slice(0, 8);
      const hit = seen.get(key);
      if (hit) { hit.where.add(tag); hit.sizes.add(`${ic.w}x${ic.h}`); if (ic.label) hit.labels.add(ic.label); hit.places.add(ic.place); continue; }
      seen.set(key, { ...ic, key, where: new Set([tag]), sizes: new Set([`${ic.w}x${ic.h}`]), labels: new Set(ic.label ? [ic.label] : []), places: new Set([ic.place]) });
    }
    await page.close();
    console.log(' ', name, seen.size, 'distinct so far');
  }
  await browser.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  if (!seen.size) throw new Error('no icons collected');

  fs.mkdirSync(OUT, { recursive: true });
  // The graph icons come from the bundle, which is not kept. Without it, the committed
  // graph-*.svg files and their index rows stay exactly as they are.
  const haveBundle = Boolean(BUNDLE && fs.existsSync(BUNDLE));
  let keptGraphRows = [];
  if (!haveBundle && fs.existsSync(OUT + 'INDEX.tsv')) {
    keptGraphRows = fs.readFileSync(OUT + 'INDEX.tsv', 'utf8').split('\n').filter((l) => l.startsWith('graph-'));
  }
  for (const f of fs.readdirSync(OUT)) {
    if (!haveBundle && f.startsWith('graph-')) continue;
    if (f.endsWith('.svg') || f === 'INDEX.tsv') fs.unlinkSync(OUT + f);
  }

  const names = new Map();
  try { for (const l of fs.readFileSync(path.join(HERE, 'icon-names.tsv'), 'utf8').split('\n')) { const [k, n] = l.split('\t'); if (k && n && k !== 'hash') names.set(k, n); } } catch { /* optional */ }
  const all = [...seen.values()].sort((a, b) => b.where.size - a.where.size || a.key.localeCompare(b.key));
  const count = new Map();
  for (const ic of all) {
    const lab = [...ic.labels][0];
    ic.name = names.get(ic.key) || (lab && lab.length <= 24 ? slug(lab) : ic.comp ? slug(ic.comp.split('__').join('-')) : '') || 'icon-' + ic.key;
    count.set(ic.name, (count.get(ic.name) || 0) + 1);
  }
  const rows = [];
  for (const ic of all) {
    ic.file = (count.get(ic.name) > 1 ? `${ic.name}-${ic.key}` : ic.name) + '.svg';
    fs.writeFileSync(OUT + ic.file, ic.html.replace(/></g, '>\n<') + '\n');
    rows.push([ic.file, ic.name, ic.key, [...ic.sizes].sort().join(' '), ic.vb || '', ic.strokeOnly ? 'stroke' : 'fill', [...ic.where].join('; '), [...ic.places].slice(0, 3).join('; '), [...ic.labels].slice(0, 3).join(' / ')].map((x) => String(x).replace(/\t/g, ' ')).join('\t'));
  }

  // The graph engine's canvas icons: 24x24 path strings from the bundle.
  const graph = [];
  if (haveBundle) {
    const src = fs.readFileSync(BUNDLE, 'utf8');
    for (const n of ['Author', 'EvaluationAlert', 'EvaluationCaution', 'Seed', 'Star', 'StarCircle', 'Tick']) {
      const m = new RegExp(`(?:^|[\\s,;])${n}\\s*=\\s*"(M[^"]+)"`).exec(src);
      if (!m) { console.log('  missing graph icon', n); continue; }
      const file = `graph-${slug(n)}.svg`;
      fs.writeFileSync(OUT + file, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">\n<path fill="currentColor" d="${m[1]}"/>\n</svg>\n`);
      graph.push([file, `graph-${slug(n)}`, crypto.createHash('md5').update(m[1]).digest('hex').slice(0, 8), '24x24', '0 0 24 24', 'fill', 'graph canvas (graphIconPathMap)', `canvas Path2D, ${n}`, n].join('\t'));
    }
  } else {
    graph.push(...keptGraphRows);
    console.log('  no bundle (set RR_BUNDLE); kept', keptGraphRows.length, 'graph icons as they are');
  }
  fs.writeFileSync(OUT + 'INDEX.tsv', ['file\tinferred_name\thash\tsizes\tviewBox\tstyle\tseen_on\tplace\ttext_or_label', ...rows, ...graph].join('\n') + '\n');
  console.log(rows.length, 'dom icons and', graph.length, 'graph icons ->', OUT);
}

await main();
