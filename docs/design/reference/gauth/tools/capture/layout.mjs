// Reads layout geometry (shell, column widths, grids, sticky and fixed elements, section order) for each
// public page at 1440, 1920, 1024 and 390 wide and writes raw/layout.json. raw/pages.md was written from it.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs node layout.mjs
import fs from 'node:fs';
import path from 'node:path';
import { BASE, RAW, chromium, UA, UA_MOBILE, closePromo } from './lib.mjs';

const paths = {
  home: '/', 'academy-science': '/course/science', 'academy-math': '/course/math',
  unit: '/course/math/algebra-1?unit=real-numbers-and-sets',
  'lesson-science': '/course/science/how-things-work-1/learn?entry_source=start&from=science',
  'lesson-math': '/course/math/algebra-1/fundamentals-of-set-theory/learn?entry_source=start&return_to=course_detail',
  'lesson-history': '/course/history/crossing-the-ocean-wall/learn?entry_source=start&from=history',
  atlas: '/atlas', news: '/news',
};

function measure() {
  const strip = (c) => String(c).replace(/__[A-Za-z0-9_-]{5,6}\b/g, '');
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
  const tag = (e) => e.tagName.toLowerCase() + [...e.classList].map(strip).filter((c) => /_/.test(c)).slice(0, 2).map((c) => '.' + c).join('');
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg') && vis(e));
  const out = { vw: innerWidth, docH: document.documentElement.scrollHeight };
  const h1 = document.querySelector('h1'); out.h1 = h1 && { text: h1.innerText.slice(0, 50), font: getComputedStyle(h1).font.slice(0, 120), ...R(h1) };
  out.fixed = all.filter((e) => ['sticky', 'fixed'].includes(getComputedStyle(e).position) && R(e).w > 120).map((e) => ({ el: tag(e), pos: getComputedStyle(e).position, top: getComputedStyle(e).top, z: getComputedStyle(e).zIndex, ...R(e) })).slice(0, 12);
  const seen = new Set();
  out.maxWidths = all.filter((e) => { const m = getComputedStyle(e).maxWidth; return /px$/.test(m) && parseFloat(m) >= 400 && parseFloat(m) <= 1800; })
    .map((e) => ({ el: tag(e), max: getComputedStyle(e).maxWidth, padL: getComputedStyle(e).paddingLeft, padR: getComputedStyle(e).paddingRight, ...R(e) })).filter((o) => { const k = o.el + o.max + o.x + o.w; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  out.grids = all.filter((e) => { const cs = getComputedStyle(e); return (cs.display === 'grid' && cs.gridTemplateColumns.split(' ').length >= 2) && R(e).w > 300; })
    .map((e) => { const cs = getComputedStyle(e); return { el: tag(e), cols: cs.gridTemplateColumns, colGap: cs.columnGap, rowGap: cs.rowGap, ...R(e) }; }).slice(0, 10);
  out.flexRows = all.filter((e) => { const cs = getComputedStyle(e); return cs.display === 'flex' && cs.flexWrap === 'wrap' && R(e).w > 300 && e.children.length >= 3; })
    .map((e) => { const cs = getComputedStyle(e); return { el: tag(e), gap: cs.gap, ...R(e) }; }).slice(0, 6);
  const side = document.querySelector('[class*="side-menu_side-menu__"], [class*="header_drawer__"], aside');
  out.sidebar = side && { el: tag(side), bg: getComputedStyle(side).backgroundColor, borderR: getComputedStyle(side).borderRightWidth + ' ' + getComputedStyle(side).borderRightColor, ...R(side) };
  const hd = document.querySelector('header'); out.header = hd && { el: tag(hd), bg: getComputedStyle(hd).backgroundColor, borderB: getComputedStyle(hd).borderBottomWidth + ' ' + getComputedStyle(hd).borderBottomColor, ...R(hd) };
  const main = document.querySelector('main') || document.body;
  out.main = { el: tag(main), ...R(main) };
  out.sections = [...main.querySelectorAll('section, [class*="Section__"], [class*="_section__"]')].filter((e) => vis(e) && R(e).w > 300).map((e) => { const h = e.querySelector('h1,h2,h3'); return { el: tag(e), bg: getComputedStyle(e).backgroundColor, ...R(e), heading: h ? h.innerText.slice(0, 50).replace(/\n/g, ' ') : '' }; }).slice(0, 16);
  out.body = { font: getComputedStyle(document.body).fontFamily.slice(0, 90), size: getComputedStyle(document.body).fontSize, bg: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color };
  return out;
}

const b = await chromium.launch();
const res = {};
for (const [vw, vh, mob] of [[1440, 900, false], [1920, 1080, false], [1024, 768, false], [390, 844, true]]) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, userAgent: mob ? UA_MOBILE : UA, isMobile: mob, hasTouch: mob });
  const p = await ctx.newPage();
  for (const [k, pth] of Object.entries(paths)) {
    if (vw !== 1440 && /lesson-history|news/.test(k)) continue;
    if (mob && k === 'lesson-science') continue; // a phone is redirected to /course/math
    try {
      await p.goto(BASE + pth, { waitUntil: 'load', timeout: 90000 }); await p.waitForTimeout(6500);
      await closePromo(p);
      res[`${k}@${vw}`] = await p.evaluate(measure);
      console.log(k, vw);
    } catch (e) { console.log('failed', k, vw, e.message.split('\n')[0]); }
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(path.join(RAW, 'layout.json'), JSON.stringify(res, null, 1) + '\n');
