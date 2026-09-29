// Reads layout geometry (container widths, grids, sticky elements, section order) for each public page at
// 1440, 1920 and 390 wide and prints JSON. raw/pages.md was written from this output.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright/index.js node layout.mjs > /some/scratch/layout.json
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.default ?? pw;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const UAM = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const paths = {
  home: '/', search: '/search?query=machine%20learning', browse: '/browse/data-science',
  course: '/learn/machine-learning', specialization: '/specializations/machine-learning-introduction',
  certificate: '/professional-certificates/google-data-analytics', course2: '/learn/learning-how-to-learn',
};

function measure() {
  const R = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
  const tag = e => e.tagName.toLowerCase() + (e.id && !/^cds-react|^:r/.test(e.id) ? '#' + e.id : '') + ([...e.classList].filter(c => /^(cds-[A-Z]|rc-)/.test(c)).slice(0, 2).map(c => '.' + c).join(''));
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = [...document.querySelectorAll('body *')].filter(e => !e.closest('#onetrust-consent-sdk') && !e.closest('svg') && vis(e));
  const out = { vw: innerWidth, docH: document.documentElement.scrollHeight };
  const h1 = document.querySelector('h1'); out.h1 = h1 && { text: h1.innerText.slice(0, 50), ...R(h1) };
  out.sticky = all.filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position) && R(e).w > 150).map(e => ({ el: tag(e), pos: getComputedStyle(e).position, top: getComputedStyle(e).top, ...R(e) }));
  const seen = new Set();
  out.maxWidths = all.filter(e => { const m = getComputedStyle(e).maxWidth; return /px$/.test(m) && parseFloat(m) >= 600 && parseFloat(m) <= 1700; })
    .map(e => ({ el: tag(e), max: getComputedStyle(e).maxWidth, pad: getComputedStyle(e).paddingLeft, ...R(e) })).filter(o => { const k = o.el + o.max + o.x + o.w; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  out.grids = all.filter(e => getComputedStyle(e).display === 'grid' && R(e).w > 500 && getComputedStyle(e).gridTemplateColumns.split(' ').length >= 2)
    .map(e => { const cs = getComputedStyle(e); return { el: tag(e), cols: cs.gridTemplateColumns, gap: cs.columnGap, ...R(e) }; }).slice(0, 14);
  const main = document.querySelector('#rendered-content, main, #main') || document.body;
  const kids = [...main.children].filter(vis);
  out.mainEl = tag(main);
  out.sections = kids.map(e => { const h = e.querySelector('h1,h2,h3'); return { el: tag(e), bg: getComputedStyle(e).backgroundColor, ...R(e), heading: h ? h.innerText.slice(0, 50).replace(/\n/g, ' ') : '' }; }).slice(0, 30);
  const hd = document.querySelector('.rc-GlobalPageHeaderContainer'); out.header = hd && R(hd);
  out.body = { font: getComputedStyle(document.body).fontFamily.slice(0, 60), size: getComputedStyle(document.body).fontSize, bg: getComputedStyle(document.body).backgroundColor };
  return out;
}

const b = await chromium.launch();
const res = {};
for (const [vw, vh, mob] of [[1440, 900, false], [1920, 1080, false], [390, 844, true]]) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, userAgent: mob ? UAM : UA, isMobile: mob, hasTouch: mob });
  const p = await ctx.newPage();
  for (const [k, path] of Object.entries(paths)) {
    if (vw === 1920 && !['home', 'search', 'course', 'browse'].includes(k)) continue;
    await p.goto('https://www.coursera.org' + path, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(6500);
    if (!mob) { const x = await p.$('[data-testid=coach-close]'); if (x && await x.isVisible()) { await x.click(); await p.waitForTimeout(900); } }
    res[`${k}@${vw}`] = await p.evaluate(measure);
  }
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
await b.close();
