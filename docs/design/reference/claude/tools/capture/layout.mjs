// Reads page geometry from the static signed-in copies (the 1440 x 900 ones and the 390 x 844
// mobile-* ones) and writes raw/layout.json: the sidebar, the content pane and its header, the
// composer, the greeting and page titles, every max-width container and grid, fixed and sticky
// layers, dialogs and menus, inner scrollers, and page-specific measures (the transcript column
// and user bubble, the 960 page column, list row pitch, the project grid, the settings nav).
// raw/pages.md is written by hand from it. Adapted from the Manus kit.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs SNAPS=<dir of page copies> node tools/capture/layout.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium, RAW, SNAPS, metaOf, newContext, openSnap } from './signed-in/lib.mjs';

if (!SNAPS) { console.error('SNAPS=<snapshot dir> is required'); process.exit(2); }
const LABELS = fs.readdirSync(SNAPS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((l) => fs.existsSync(path.join(SNAPS, `${l}.html`))).sort();

function measure() {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const cls = (e) => (typeof e.className === 'string' ? e.className : '');
  const tag = (e) => e.tagName.toLowerCase() + (e.getAttribute('data-cds') ? `[data-cds=${e.getAttribute('data-cds')}]` : '') + cls(e).split(/\s+/).filter((c) => c && !c.includes('[') && !c.includes(':')).slice(0, 3).map((c) => '.' + c).join('');
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (!(r.width > 0 && r.height > 0 && cs.visibility === 'visible' && cs.display !== 'none')) return false; for (let n = e; n && n !== document.documentElement; n = n.parentElement) if (+getComputedStyle(n).opacity === 0) return false; return true; };
  const inVp = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const paints = (e) => { const cs = getComputedStyle(e); return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0; };
  const P = (e) => { for (let n = e; n && n !== document.documentElement; n = n.parentElement) if (paints(n)) return n; return null; };
  const F = (e) => { const c = getComputedStyle(e); return `${c.fontWeight} ${c.fontSize}/${c.lineHeight} ${c.fontFamily.split(',').slice(0, 2).join(',')}`; };
  const all = [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg') && vis(e));
  const out = { vw: innerWidth, vh: innerHeight };
  const side = document.querySelector('aside.dframe-sidebar');
  out.sidebar = side && vis(side) ? { ...R(side), bg: getComputedStyle(side).backgroundColor } : null;
  const body = document.querySelector('[data-testid=sidebar]');
  out.sidebarBody = body && vis(body) ? { ...R(body), role: body.getAttribute('role'), bg: getComputedStyle(body).backgroundColor } : null;
  const pane = document.querySelector('.dframe-pane-primary');
  out.pane = pane && { ...R(pane), bg: getComputedStyle(pane).backgroundColor, radius: getComputedStyle(pane).borderTopLeftRadius, shadow: getComputedStyle(pane).boxShadow.slice(0, 200) };
  const root = document.querySelector('.dframe-root');
  out.ground = root && getComputedStyle(root).backgroundColor;
  const head = [...document.querySelectorAll('header.dframe-header, [data-testid=chat-header]')].find(vis);
  out.header = head ? { el: tag(head), ...R(head) } : null;
  const h1 = [...document.querySelectorAll('main h1')].find(vis);
  out.h1 = h1 && { text: h1.innerText.slice(0, 50), font: F(h1), ...R(h1) };
  const greet = [...document.querySelectorAll('main .font-display')].find(vis);
  out.greeting = greet && { text: greet.innerText.slice(0, 40), font: F(greet), ...R(greet), mark: R(greet.querySelector('svg')) };
  const ed = [...document.querySelectorAll('[data-testid=chat-input]')].find(vis);
  if (ed) {
    const box = P(ed);
    const btns = box ? [...box.querySelectorAll('button')].filter(vis) : [];
    out.composer = { box: R(box), radius: box && getComputedStyle(box).borderTopLeftRadius, editor: R(ed), toolRow: R(btns[0] && btns[0].closest('div.relative.flex')), firstButton: R(btns[0]), lastButton: R(btns[btns.length - 1]), dock: R(document.querySelector('[data-cds=ChatComposerDock]')) };
  }
  const seen = new Set();
  out.maxWidths = all.filter((e) => { const m = getComputedStyle(e).maxWidth; return /px$/.test(m) && parseFloat(m) >= 300 && parseFloat(m) <= 1800 && inVp(e); })
    .map((e) => ({ el: tag(e), max: getComputedStyle(e).maxWidth, padL: getComputedStyle(e).paddingLeft, padR: getComputedStyle(e).paddingRight, ...R(e) })).filter((o) => { const k = o.max + o.x + o.w; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  out.grids = all.filter((e) => { const cs = getComputedStyle(e); return cs.display === 'grid' && cs.gridTemplateColumns.split(' ').length >= 2 && R(e).w > 200 && inVp(e); })
    .map((e) => { const cs = getComputedStyle(e); return { el: tag(e), cols: cs.gridTemplateColumns, colGap: cs.columnGap, rowGap: cs.rowGap, ...R(e), firstChild: R(e.firstElementChild) }; }).slice(0, 10);
  out.fixed = all.filter((e) => ['sticky', 'fixed'].includes(getComputedStyle(e).position) && R(e).w > 100).map((e) => ({ el: tag(e), pos: getComputedStyle(e).position, top: getComputedStyle(e).top, bottom: getComputedStyle(e).bottom, z: getComputedStyle(e).zIndex, ...R(e) })).slice(0, 12);
  out.dialogs = [...document.querySelectorAll('[role=dialog]')].filter(vis).map((d) => ({ el: tag(d), ...R(d), radius: getComputedStyle(d).borderTopLeftRadius, bg: getComputedStyle(d).backgroundColor }));
  out.menus = [...document.querySelectorAll('[role=menu]')].filter(vis).map((d) => ({ el: tag(d), ...R(d), radius: getComputedStyle(d).borderTopLeftRadius, items: d.querySelectorAll('[role^=menuitem]').length, firstItem: R(d.querySelector('[role^=menuitem]')) }));
  out.scrollers = all.filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20).map((e) => ({ el: tag(e), ...R(e), scrollHeight: e.scrollHeight, scrollTop: Math.round(e.scrollTop) })).slice(0, 6);
  out.body = { font: getComputedStyle(document.body).fontFamily.slice(0, 120), size: getComputedStyle(document.body).fontSize, bg: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color };

  // Page-specific measures.
  const list = document.querySelector('[data-testid=transcript-list]');
  if (list) {
    const bubble = P(document.querySelector('[data-testid=user-message]'));
    out.thread = { column: R(document.querySelector('[data-testid=chat-column]')), list: R(list), feed: R(document.querySelector('[role=feed]')), userBubble: R(bubble), userBubbleRadius: bubble && getComputedStyle(bubble).borderTopLeftRadius, prose: R(document.querySelector('[data-cds=Prose]')), code: R(document.querySelector('[role=group][aria-label="markdown code"]')), table: R(document.querySelector('[data-cds=Prose] table')) };
  }
  const pg = [...document.querySelectorAll('main [data-cds=PageHeader]')].find(vis);
  if (pg) out.page = { header: R(pg), column: R(pg.parentElement), title: R(pg.querySelector('h1')) };
  const rows = [...document.querySelectorAll('main li, main tr')].filter((e) => vis(e) && e.querySelector('time') && inVp(e));
  if (rows.length > 1) out.listRow = { el: tag(rows[0]), first: R(rows[0]), pitch: Math.round((R(rows[1]).y - R(rows[0]).y) * 10) / 10, count: rows.length };
  const navS = document.querySelector('nav[aria-label=Settings]');
  if (navS && vis(navS)) out.settings = { nav: R(navS), firstItem: R(navS.querySelector('li')), row: R(document.querySelector('[data-cds=Dialog] [role=group]')), content: R(document.querySelector('.settings-group-dividers')) };
  const rowsSide = side ? [...side.querySelectorAll('div.group')].filter(vis) : [];
  if (rowsSide.length > 2) out.sidebarRows = { first: R(rowsSide[0]), second: R(rowsSide[1]), pitch: Math.round((R(rowsSide[2]).y - R(rowsSide[1]).y) * 10) / 10, pills: R(side.querySelector('.df-pills')), footer: R(side.querySelector('.df-footer-row')) };
  return out;
}

const browser = await chromium.launch();
const res = {};
for (const label of LABELS) {
  const meta = metaOf(label);
  const ctx = await newContext(browser, meta);
  try {
    const page = await openSnap(ctx, label);
    res[`${label}@${meta.w}`] = { label, url: meta.url.replace(/\/(chat|project)\/[0-9a-f-]+/, '/$1/<id>'), ...(await page.evaluate(measure)) };
    console.log(label, meta.w);
  } catch (e) {
    console.log('failed', label, e.message.split('\n')[0]);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(RAW, 'layout.json'), JSON.stringify(res, null, 1) + '\n');
console.log('raw/layout.json', Object.keys(res).length, 'copies');
