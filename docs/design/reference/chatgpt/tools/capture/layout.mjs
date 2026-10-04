// Reads page geometry from the static signed-in page copies (the 1440 x 900 ones and the 390 x 844
// mobile-* ones) and writes raw/layout.json: the sidebar and the tiny rail, the main column and its
// header, the composer, the h1, the thread column and the user bubble, every grid and max-width
// container, fixed and sticky layers, dialogs and popovers, inner scrollers, and a few
// page-specific measures (Library rows, Images cards, Plugins rows, project chat rows).
// raw/pages.md is written by hand from it.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs SNAPS=<dir of page copies> node tools/capture/layout.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium, RAW, SNAPS, metaOf, newContext, openSnap } from './signed-in/lib.mjs';

if (!SNAPS) { console.error('SNAPS=<dir of page copies> is required'); process.exit(2); }
const LABELS = fs.readdirSync(SNAPS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((l) => fs.existsSync(path.join(SNAPS, `${l}.html`))).sort();

function measure() {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const cls = (e) => (typeof e.className === 'string' ? e.className : '');
  const tag = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls(e).split(/\s+/).filter((c) => c && !c.includes('[') && !c.includes(':') && !c.includes('(')).slice(0, 3).map((c) => '.' + c).join('');
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility === 'visible' && cs.display !== 'none'; };
  const inVp = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const painted = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)') return n; return null; };
  const all = [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg') && vis(e));
  const out = { vw: innerWidth, vh: innerHeight };
  const side = document.querySelector('#stage-slideover-sidebar') || document.querySelector('#stage-popover-sidebar [role=dialog]');
  out.sidebar = side && vis(side) ? { el: tag(side), ...R(side), bg: getComputedStyle(side).backgroundColor, borderEnd: `${getComputedStyle(side).borderRightWidth} ${getComputedStyle(side).borderRightColor}`, transform: getComputedStyle(side).transform } : null;
  const rail = document.querySelector('#stage-sidebar-tiny-bar');
  out.rail = rail && vis(rail) && inVp(rail) ? { ...R(rail), bg: getComputedStyle(rail).backgroundColor, buttons: [...rail.querySelectorAll('a, button, [role=button]')].filter((b) => vis(b) && inVp(b)).map((b) => ({ label: b.getAttribute('aria-label') || (b.innerText || '').trim().slice(0, 20), ...R(b) })) } : null;
  if (side && vis(side)) {
    const rows = [...side.querySelectorAll('.__menu-item')].filter((e) => vis(e) && inVp(e) && !e.closest('#stage-sidebar-tiny-bar'));
    out.sidebarRows = { first: R(rows[0]), second: R(rows[1]), count: rows.length, labels: [...side.querySelectorAll('h2.__menu-label')].filter(vis).map((h) => ({ text: h.innerText.trim(), ...R(h) })), header: R([...side.querySelectorAll('#sidebar-header')].find((e) => !e.closest('#stage-sidebar-tiny-bar'))), account: R([...side.querySelectorAll('[data-testid=accounts-profile-button]')].find((e) => !e.closest('#stage-sidebar-tiny-bar'))) };
  }
  const main = document.querySelector('main#main') || document.querySelector('main');
  out.main = main && vis(main) ? { ...R(main), bg: getComputedStyle(main).backgroundColor } : null;
  const head = document.querySelector('#page-header') || (main && main.parentElement.querySelector('header'));
  out.header = head && vis(head) ? { el: tag(head), ...R(head), position: getComputedStyle(head).position, items: [...head.querySelectorAll('button, a')].filter((b) => vis(b) && inVp(b)).map((b) => ({ label: b.getAttribute('aria-label') || (b.innerText || '').trim().slice(0, 20), ...R(b) })) } : null;
  const h1 = [...document.querySelectorAll('main h1, h1')].find((e) => vis(e) && inVp(e));
  out.h1 = h1 && { text: h1.innerText.slice(0, 50), font: getComputedStyle(h1).font.slice(0, 140), ...R(h1) };
  const pm = document.querySelector('#prompt-textarea');
  if (pm && vis(pm)) {
    const box = painted(pm);
    const st = pm.closest('.sticky');
    out.composer = { box: R(box), radius: box && getComputedStyle(box).borderRadius, bg: box && getComputedStyle(box).backgroundColor, shadow: box && getComputedStyle(box).boxShadow, editor: R(pm), buttons: [...box.querySelectorAll('button')].filter((b) => vis(b)).map((b) => ({ label: b.getAttribute('aria-label') || (b.innerText || '').trim().slice(0, 20), ...R(b) })), sticky: st ? { ...R(st), bottom: getComputedStyle(st).bottom } : null };
  }
  const turns = [...document.querySelectorAll('section[data-testid^=conversation-turn]')];
  if (turns.length) {
    const md = [...document.querySelectorAll('.markdown')].find((e) => vis(e));
    const bubble = [...document.querySelectorAll('[data-message-author-role=user] .whitespace-pre-wrap')].map((e) => painted(e)).find((e) => e && vis(e));
    out.thread = { turns: turns.length, renderedTurns: turns.filter((t) => t.getBoundingClientRect().height > 40).length, turn: R(turns.find((t) => inVp(t)) || turns[0]), markdown: R(md), markdownFont: md && getComputedStyle(md).font.slice(0, 120), userBubble: bubble ? { ...R(bubble), radius: getComputedStyle(bubble).borderRadius, padding: getComputedStyle(bubble).padding, bg: getComputedStyle(bubble).backgroundColor, maxWidth: getComputedStyle(bubble).maxWidth } : null };
  }
  const seen = new Set();
  out.maxWidths = all.filter((e) => { const m = getComputedStyle(e).maxWidth; return /px$/.test(m) && parseFloat(m) >= 300 && parseFloat(m) <= 1800 && inVp(e); })
    .map((e) => ({ el: tag(e), max: getComputedStyle(e).maxWidth, padL: getComputedStyle(e).paddingLeft, padR: getComputedStyle(e).paddingRight, ...R(e) })).filter((o) => { const k = o.max + o.x + o.w; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 14);
  out.grids = all.filter((e) => { const cs = getComputedStyle(e); return cs.display === 'grid' && cs.gridTemplateColumns.split(' ').length >= 2 && R(e).w > 200 && inVp(e); })
    .map((e) => { const cs = getComputedStyle(e); return { el: tag(e), cols: cs.gridTemplateColumns, colGap: cs.columnGap, rowGap: cs.rowGap, ...R(e), firstChild: R(e.firstElementChild) }; }).slice(0, 10);
  out.fixed = all.filter((e) => ['sticky', 'fixed'].includes(getComputedStyle(e).position) && R(e).w > 100 && inVp(e)).map((e) => ({ el: tag(e), pos: getComputedStyle(e).position, top: getComputedStyle(e).top, bottom: getComputedStyle(e).bottom, z: getComputedStyle(e).zIndex, ...R(e) })).slice(0, 14);
  out.dialogs = [...document.querySelectorAll('[role=dialog], [role=menu], .popover')].filter((d) => vis(d) && inVp(d) && R(d).w < innerWidth).map((d) => ({ el: tag(d), role: d.getAttribute('role'), ...R(d), radius: getComputedStyle(d).borderRadius, bg: getComputedStyle(d).backgroundColor, shadow: getComputedStyle(d).boxShadow })).slice(0, 8);
  out.scrollers = all.filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20).map((e) => ({ el: tag(e), ...R(e), scrollHeight: e.scrollHeight, scrollTop: Math.round(e.scrollTop) })).slice(0, 6);
  out.body = { font: getComputedStyle(document.body).fontFamily.slice(0, 160), size: getComputedStyle(document.body).fontSize, bg: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color };

  // Page-specific measures.
  const lh = document.querySelector('[data-testid=artifacts-surface-library-list-header]');
  if (lh) {
    const names = [...document.querySelectorAll('main button.min-w-0')].filter((e) => vis(e) && /\.\w{2,4}$/.test(e.innerText.trim()));
    const rowOf = (e) => { for (let n = e; n; n = n.parentElement) if (n.getBoundingClientRect().width >= 1000) return n; return null; };
    const r0 = names[0] && rowOf(names[0]);
    out.libraryRows = { header: R(lh), headerCols: getComputedStyle(lh).gridTemplateColumns, row: R(r0), pitch: names[1] ? Math.round((R(names[1]).y - R(names[0]).y) * 10) / 10 : null, name: R(names[0]), icon: r0 && R(r0.querySelector('img, svg')), count: names.length, toolbar: R(document.querySelector('[data-testid=page-table-toolbar-shell]')) };
  }
  const aerial = [...document.querySelectorAll('main *')].find((e) => e.children.length === 0 && (e.innerText || '').trim() === 'Aerial view');
  if (aerial) {
    let card = aerial; while (card && card.getBoundingClientRect().height < 150) card = card.parentElement;
    const next = card && card.nextElementSibling;
    out.imageCards = { card: R(card), radius: card && getComputedStyle(card).borderRadius, next: R(next), gapX: next ? Math.round((R(next).x - R(card).x - R(card).w) * 10) / 10 : null };
  }
  const gmail = document.querySelector('a[aria-label="Open Gmail"]');
  if (gmail) {
    const row = gmail.parentElement; const health = document.querySelector('a[aria-label="Open Health"]').parentElement; const drive = document.querySelector('a[aria-label="Open Google Drive"]').parentElement;
    out.pluginRows = { row: R(row), radius: getComputedStyle(row).borderRadius, gapX: Math.round((R(health).x - R(row).x - R(row).w) * 10) / 10, pitchY: Math.round((R(drive).y - R(row).y) * 10) / 10, icon: R(row.querySelector('[data-testid=plugin-icon-wrapper]')), search: R(document.querySelector('input[placeholder="Search plugins"]')) };
  }
  const pc = document.querySelector('[data-testid=project-conversation-overflow-date]');
  if (pc) {
    let row = pc; while (row && row.getBoundingClientRect().width < 740) row = row.parentElement;
    out.projectRows = { row: R(row), date: R(pc), title: h1 && R(h1) };
  }
  return out;
}

const browser = await chromium.launch();
const res = {};
for (const label of LABELS) {
  const meta = metaOf(label);
  const ctx = await newContext(browser, meta);
  try {
    const page = await openSnap(ctx, label);
    res[`${label}@${meta.w}`] = { label, url: meta.url.replace(/\/c\/[0-9a-f-]+/, '/c/<id>').replace(/\/g\/g-p-[^/]+/, '/g/<project>'), ...(await page.evaluate(measure)) };
    console.log(label, meta.w);
  } catch (e) {
    console.log('failed', label, e.message.split('\n')[0]);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(RAW, 'layout.json'), JSON.stringify(res, null, 1) + '\n');
console.log('raw/layout.json', Object.keys(res).length, 'page copies');
