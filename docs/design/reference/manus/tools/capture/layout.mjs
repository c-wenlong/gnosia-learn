// Reads page geometry from the static signed-in snapshots (the 1440 x 900 ones and the 390 x 844
// mobile-* ones) and writes raw/layout.json: the sidebar, the main column, its header band, the
// composer, h1, every grid and max-width container, fixed and sticky layers, dialogs, inner
// scrollers, and a few page-specific measures (Library columns, grid cards, the thread column and
// the side panel). raw/pages.md is written by hand from it.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs SNAPS=<snapshot dir> node tools/capture/layout.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium, RAW, SNAPS, metaOf, newContext, openSnap } from './signed-in/lib.mjs';

if (!SNAPS) { console.error('SNAPS=<snapshot dir> is required'); process.exit(2); }
const LABELS = fs.readdirSync(SNAPS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((l) => fs.existsSync(path.join(SNAPS, `${l}.html`))).sort();

function measure() {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const cls = (e) => (typeof e.className === 'string' ? e.className : '');
  const tag = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls(e).split(/\s+/).filter((c) => c && !c.includes('[') && !c.includes(':')).slice(0, 3).map((c) => '.' + c).join('');
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility === 'visible' && cs.display !== 'none'; };
  const inVp = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const all = [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg') && vis(e));
  const out = { vw: innerWidth, vh: innerHeight };
  const nav = document.querySelector('nav');
  out.sidebar = nav && vis(nav) ? { ...R(nav), bg: getComputedStyle(nav).backgroundColor, after: getComputedStyle(nav, '::after').width + ' ' + getComputedStyle(nav, '::after').backgroundColor } : null;
  const main = document.querySelector('#manus-home-page-session-content');
  out.main = main && { ...R(main), bg: getComputedStyle(main).backgroundColor };
  if (main) {
    // The header band: the first full-width child row at the top of the main column.
    const head = [...main.querySelectorAll('*')].find((e) => vis(e) && R(e).y === R(main).y && R(e).w >= R(main).w - 1 && R(e).h >= 40 && R(e).h <= 130 && e.children.length);
    out.header = head ? { el: tag(head), ...R(head) } : null;
    const topBar = [...main.querySelectorAll('*')].filter((e) => vis(e) && R(e).y >= 0 && R(e).y < 12 && R(e).h >= 28 && R(e).h <= 34).map((e) => ({ el: tag(e), text: (e.innerText || '').trim().slice(0, 30), ...R(e) }));
    out.topBarItems = topBar.filter((t, i, a) => a.findIndex((u) => u.x === t.x) === i).slice(0, 10);
  }
  const h1 = [...document.querySelectorAll('h1')].find(vis);
  out.h1 = h1 && { text: h1.innerText.slice(0, 50), font: getComputedStyle(h1).font.slice(0, 120), ...R(h1) };
  const ce = [...document.querySelectorAll('[contenteditable=true]')].find((e) => vis(e) && !e.matches('[role=textbox]'));
  if (ce) {
    let box = ce;
    while (box && getComputedStyle(box).backgroundColor === 'rgba(0, 0, 0, 0)') box = box.parentElement;
    const st = box && box.closest('.sticky');
    out.composer = { box: R(box), radius: box && getComputedStyle(box).borderRadius, editor: R(ce), toolRow: R(box && [...box.querySelectorAll('button')][0] && [...box.querySelectorAll('button')][0].parentElement && [...box.querySelectorAll('button')][0].closest('div.flex')), sticky: st ? { ...R(st), bottom: getComputedStyle(st).bottom } : null };
  }
  const seen = new Set();
  out.maxWidths = all.filter((e) => { const m = getComputedStyle(e).maxWidth; return /px$/.test(m) && parseFloat(m) >= 300 && parseFloat(m) <= 1800 && inVp(e); })
    .map((e) => ({ el: tag(e), max: getComputedStyle(e).maxWidth, padL: getComputedStyle(e).paddingLeft, padR: getComputedStyle(e).paddingRight, ...R(e) })).filter((o) => { const k = o.max + o.x + o.w; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  out.grids = all.filter((e) => { const cs = getComputedStyle(e); return cs.display === 'grid' && cs.gridTemplateColumns.split(' ').length >= 2 && R(e).w > 200 && inVp(e); })
    .map((e) => { const cs = getComputedStyle(e); return { el: tag(e), cols: cs.gridTemplateColumns, colGap: cs.columnGap, rowGap: cs.rowGap, ...R(e), firstChild: R(e.firstElementChild) }; }).slice(0, 10);
  out.fixed = all.filter((e) => ['sticky', 'fixed'].includes(getComputedStyle(e).position) && R(e).w > 100).map((e) => ({ el: tag(e), pos: getComputedStyle(e).position, top: getComputedStyle(e).top, bottom: getComputedStyle(e).bottom, z: getComputedStyle(e).zIndex, ...R(e) })).slice(0, 12);
  out.dialogs = [...document.querySelectorAll('[role=dialog]')].filter(vis).map((d) => ({ el: tag(d), ...R(d), panel: R(d.firstElementChild), radius: getComputedStyle(d.firstElementChild || d).borderRadius }));
  out.scrollers = all.filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20).map((e) => ({ el: tag(e), ...R(e), scrollHeight: e.scrollHeight, scrollTop: Math.round(e.scrollTop) })).slice(0, 6);
  out.body = { font: getComputedStyle(document.body).fontFamily.slice(0, 120), size: getComputedStyle(document.body).fontSize, bg: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color };

  // Page-specific measures.
  const rows = [...document.querySelectorAll('#manus-home-page-session-content [role=button].group')].filter((e) => vis(e) && e.querySelector('time'));
  if (rows.length) {
    const r0 = rows[0];
    const part = (sel) => R(r0.querySelector(sel));
    out.libraryRow = { row: R(r0), inner: R(r0.firstElementChild), icon: part('svg, img'), title: R([...r0.querySelectorAll('span')].find((s) => s.innerText.trim())), source: part('.text-\\[13px\\]'), time: part('time'), menu: part('button'), pitch: rows[1] ? Math.round((R(rows[1]).y - R(r0).y) * 10) / 10 : null, count: rows.length };
  }
  const cards = [...document.querySelectorAll('#manus-home-page-session-content .clickable.flex-col.rounded-\\[12px\\]')].filter(vis);
  if (cards.length > 1) out.gridCards = { first: R(cards[0]), second: R(cards[1]), gapX: Math.round((R(cards[1]).x - R(cards[0]).x - R(cards[0]).w) * 10) / 10, perRow: cards.filter((c) => Math.abs(R(c).y - R(cards[0]).y) < 2).length, count: cards.length };
  const types = [...document.querySelectorAll('#manus-home-page-session-content button.min-w-12')].filter((e) => vis(e) && inVp(e));
  if (types.length) out.typeTabs = { first: R(types[0]), last: R(types[types.length - 1]), count: types.length, gap: types[1] ? Math.round((R(types[1]).x - R(types[0]).x - R(types[0]).w) * 10) / 10 : null };
  const turn = document.querySelector('.group\\/turn');
  if (turn) out.thread = { turn: R(turn), column: R(turn.parentElement), userBubble: R(document.querySelector('.group\\/turn [class*="ui-density-bubble-padding-y"]')) };
  const tabbar = document.querySelector('[data-context-menu=sidebar-tab]');
  if (tabbar) {
    let panel = tabbar;
    while (panel && panel.getBoundingClientRect().height < innerHeight - 1) panel = panel.parentElement;
    out.sidePanel = { panel: R(panel), tabbar: R(tabbar.parentElement), tab: R(tabbar), handle: R(document.querySelector('.mx-auto.h-full.w-px')) };
  }
  const aside = document.querySelector('aside');
  if (aside && vis(aside)) out.fileTree = R(aside);
  return out;
}

const browser = await chromium.launch();
const res = {};
for (const label of LABELS) {
  const meta = metaOf(label);
  const ctx = await newContext(browser, meta);
  try {
    const page = await openSnap(ctx, label);
    res[`${label}@${meta.w}`] = { label, url: meta.url, ...(await page.evaluate(measure)) };
    console.log(label, meta.w);
  } catch (e) {
    console.log('failed', label, e.message.split('\n')[0]);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(RAW, 'layout.json'), JSON.stringify(res, null, 1) + '\n');
console.log('raw/layout.json', Object.keys(res).length, 'snapshots');
