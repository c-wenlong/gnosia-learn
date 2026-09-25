const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), crypto = require('crypto');
const OUT = process.env.SP + '/wt/docs/design/reference/brilliant/icons/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const seen = {}; const rows = [];
  for (const path of ['/courses/', '/courses/linear-expressions-and-equations/', '/login/', '/subscribe/', '/']) {
    await p.goto('https://brilliant.org' + path, { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(3500);
    const icons = await p.evaluate(() => [...document.querySelectorAll('svg')].filter(s => { const r = s.getBoundingClientRect(); return r.width >= 10 && r.width <= 48 && r.height >= 10 && r.height <= 48 && !s.closest('#onetrust-consent-sdk'); }).map(s => {
      const r = s.getBoundingClientRect(); const st = getComputedStyle(s); const shapes = [...s.querySelectorAll('path,circle,rect,line,polyline,polygon')];
      const fills = [...new Set(shapes.map(e => getComputedStyle(e).fill))], strokes = [...new Set(shapes.map(e => getComputedStyle(e).stroke))], sw = [...new Set(shapes.map(e => getComputedStyle(e).strokeWidth))];
      const ctx = (s.closest('a,button')?.innerText || s.closest('a,button')?.getAttribute('aria-label') || s.parentElement?.innerText || '').trim().slice(0, 40);
      const clone = s.cloneNode(true); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      return { w: Math.round(r.width), h: Math.round(r.height), color: st.color, fills, strokes, sw, ctx, vb: s.getAttribute('viewBox'), html: clone.outerHTML };
    }));
    for (const ic of icons) { const h = crypto.createHash('md5').update(ic.html.replace(/class="[^"]*"/g, '')).digest('hex').slice(0, 10); if (seen[h]) { seen[h].pages.add(path); continue; }
      seen[h] = { ...ic, pages: new Set([path]), file: h + '.svg' }; fs.writeFileSync(OUT + h + '.svg', ic.html.replace(/currentColor/g, 'currentColor')); }
  }
  const list = Object.values(seen).map(x => ({ file: x.file, size: `${x.w}x${x.h}`, viewBox: x.vb, style: x.strokes.some(s => s !== 'none') && x.sw.some(w => parseFloat(w) > 0 && w !== '1px') ? 'stroke ' + x.sw.join('/') : 'fill', fills: x.fills.join(' '), strokes: x.strokes.join(' '), ctx: x.ctx.replace(/\n/g, ' '), pages: [...x.pages].join(' ') }));
  fs.writeFileSync(process.env.SP + '/cap/icons.json', JSON.stringify(list, null, 1)); console.log(list.length); await b.close();
})();
