// Measures Manus's signed-in components from the static DOM snapshots (see render.mjs, unsnap.py),
// in both themes and in every state CSS can reach once scripts are gone.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs SNAPS=<snapshot dir> node tools/capture/signed-in/measure.mjs [label ...] [--jobs N]
//
// With labels, only the components (and states) that live on those snapshots are re-measured and
// merged into the existing JSON. Writes raw/components-computed.json and one crop per component
// and state into components/crops/<component>-<state>.png (2x, 256 colours, halved when wider than
// 1600px). raw/measurements.md is then built from the JSON by build-measurements.mjs.
//
// Themes: Manus declares its light palette on :root and its dark one on .dark, and every component
// colour is a var() of those, so each snapshot (captured in dark) is measured once as captured and
// once with the `dark` class removed from <html>. Dark states keep their plain names (`default`,
// `hover`, ...); light states are `light`, `light-hover`, `light-focus-visible`, ... and every
// state records `theme`.
//
// States:
//   default        at rest, as captured
//   hover          real mouse hover (page.mouse.move), 450ms settle; Tailwind's hover: variants
//                  are plain CSS, so they apply on the static copy
//   focus-visible  real keyboard focus: focus(), Shift+Tab, Tab (or a Shift keydown then focus()),
//                  on the element or its first focusable descendant; a div with role=button and no
//                  tabindex cannot take focus and is recorded as skipped
//   anything else  another element, or another snapshot, captured in that state: `active` (the
//                  current nav tab), `selected` (the selected type tab), `checked` (the model in
//                  the model menu), `open`, `typed`, `enabled`, ...
// No click is dispatched anywhere; the snapshots have no scripts and every navigation away from the
// file is aborted.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, REF, RAW, CROPS, SNAPS, SCROLL, metaOf, newContext, openSnap } from './lib.mjs';

if (!SNAPS) { console.error('SNAPS=<snapshot dir> is required'); process.exit(2); }
const OUT = path.join(RAW, 'components-computed.json');
const args = process.argv.slice(2);
const jobsArg = args.indexOf('--jobs');
const CONC = jobsArg >= 0 ? +args[jobsArg + 1] : 4;
const ONLY = args.filter((a, i) => !a.startsWith('--') && (jobsArg < 0 || i !== jobsArg + 1));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------- page helpers (run in the page)
//
// Finders are plain functions of these globals, so a spec reads as what it looks for:
//   T(text, root)     the visible element whose innerText is exactly `text`, in the viewport first,
//                     then the smallest; TS(prefix, root) the same by prefix
//   Q(sel, i, root)   the i-th visible match of a CSS selector, in-viewport matches first
//   K(tokens, i, root) the i-th visible element carrying every class token (no CSS escaping needed
//                     for Tailwind names such as `group/nav-tab` or `p-[1px]`)
//   C(el, sel)        el.closest(sel);  CK(el, tokens) the closest element carrying the tokens
//   W(el, w)          el or the first ancestor at least `w` px wide (H(el, h) the same by height)
//   unhidden(list)    the first element of a list whose centre nothing covers;  at(x, y) the element there
//   P(el)             el or the first ancestor that paints a fill, border or shadow
//   D()               the last visible [role=dialog];  M() the main content column
const HELPERS = () => {
  const vis = (e) => {
    if (!e || !e.getBoundingClientRect) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(e);
    if (cs.visibility !== 'visible' || cs.display === 'none') return false;
    // Opacity is not inherited in the computed style, so a popover held at opacity 0 (the thread's
    // hover outline, a hover-only toolbar) is found by walking up.
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) if (+getComputedStyle(n).opacity === 0) return false;
    return true;
  };
  const inVp = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth ? 1 : 0; };
  const order = (list) => list.filter(vis).map((e, i) => [e, i]).sort((a, b) => inVp(b[0]) - inVp(a[0]) || a[1] - b[1]).map((x) => x[0]);
  const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
  const byText = (pred, needle, root) => {
    root = root || document.body;
    // An sr-only label (a 1x1 clipped box) never counts as the visible text.
    const c = [...root.querySelectorAll('*')].filter((e) => e.textContent.includes(needle) && pred((e.innerText || '').trim()) && vis(e) && area(e) > 4);
    c.sort((a, b) => inVp(b) - inVp(a) || area(a) - area(b));
    return c[0] || null;
  };
  const hasTokens = (e, tokens) => e.classList && tokens.split(/\s+/).filter(Boolean).every((t) => e.classList.contains(t));
  const paints = (e) => {
    const cs = getComputedStyle(e);
    return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
  };
  Object.assign(window, {
    T: (text, root) => byText((t) => t === text, text, root),
    TS: (prefix, root) => byText((t) => t.startsWith(prefix), prefix, root),
    Q: (sel, i = 0, root = document) => order([...root.querySelectorAll(sel)])[i] || null,
    K: (tokens, i = 0, root = document) => order([...root.querySelectorAll('*')].filter((e) => hasTokens(e, tokens)))[i] || null,
    C: (el, sel) => (el ? el.closest(sel) : null),
    CK: (el, tokens) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (hasTokens(n, tokens)) return n; return null; },
    H: (el, h) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (n.getBoundingClientRect().height >= h - 0.5) return n; return null; },
    // The first visible element of a list whose centre is not covered by anything else.
    unhidden: (list) => [...list].find((e) => { if (!vis(e)) return false; const r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return h && (e.contains(h) || h.contains(e)); }) || null,
    W: (el, w) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (n.getBoundingClientRect().width >= w - 0.5) return n; return null; },
    at: (x, y) => document.elementFromPoint(x, y),
    P: (el) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (paints(n)) return n; return null; },
    D: () => { const d = [...document.querySelectorAll('[role=dialog]')].filter(vis); return d[d.length - 1] || null; },
    M: () => document.querySelector('#manus-home-page-session-content'),
    painted: (list) => [...list].find((e) => vis(e) && paints(e)) || null,
    unpainted: (list) => [...list].find((e) => vis(e) && !paints(e)) || null,
  });
  window.__isFocusable = (e) => e && (e.tabIndex >= 0 || e.isContentEditable || /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) && !e.disabled;
  window.__focusTarget = (e) => {
    if (window.__isFocusable(e)) return e;
    return [...e.querySelectorAll('a[href], button, input, select, textarea, [tabindex], [contenteditable=true]')].find((x) => window.__isFocusable(x) && vis(x)) || null;
  };
  // Every scroller's position as the snapshot was opened (after the scroll rule), put back before
  // each measurement, so an earlier component scrolled into view does not move a later one.
  window.__saveScroll = () => { window.__scrolls = [...document.querySelectorAll('*')].filter((e) => e.scrollTop || e.scrollLeft).map((e) => [e, e.scrollTop, e.scrollLeft]); window.__scrollY = scrollY; };
  window.__restoreScroll = () => { for (const [e, t, l] of window.__scrolls || []) { e.scrollTop = t; e.scrollLeft = l; } document.querySelectorAll('*').forEach((e) => { if ((e.scrollTop || e.scrollLeft) && !(window.__scrolls || []).some((x) => x[0] === e)) { e.scrollTop = 0; e.scrollLeft = 0; } }); scrollTo(0, window.__scrollY || 0); };
  // CSS animations are pinned so two runs crop the same pixels: a finite one (an entrance fade) is
  // finished, an infinite one (the promo progress, marquees, skeleton pulses) held at its first
  // frame. Transitions are left alone: hover and focus need them to finish.
  window.__freeze = () => {
    for (const a of document.getAnimations()) {
      if (typeof CSSAnimation === 'undefined' || !(a instanceof CSSAnimation)) continue;
      const t = a.effect && a.effect.getComputedTiming();
      if (t && t.iterations === Infinity) { a.pause(); a.currentTime = 0; } else { try { a.finish(); } catch { a.pause(); } }
    }
  };
  document.addEventListener('click', (e) => e.preventDefault(), true);
  document.addEventListener('submit', (e) => e.preventDefault(), true);
};

// Computed properties recorded for every component and state (the gauth set).
const PROPS = [
  'display', 'position', 'boxSizing', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'gap', 'rowGap', 'columnGap', 'flexDirection', 'alignItems', 'justifyContent', 'gridTemplateColumns',
  'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRightWidth', 'borderRightStyle', 'borderRightColor',
  'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor', 'borderLeftWidth', 'borderLeftStyle', 'borderLeftColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'backgroundColor', 'backgroundImage', 'boxShadow', 'backdropFilter', 'filter',
  'outlineWidth', 'outlineStyle', 'outlineColor', 'outlineOffset',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'textAlign',
  'color', 'textDecorationLine', 'textDecorationColor', 'textDecorationThickness', 'textUnderlineOffset',
  'transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay',
  'cursor', 'opacity', 'transform', 'overflow', 'zIndex', 'top',
];

// Reads one element: computed style, rect, ::before/::after, the painted layers inside it (so a
// root that paints nothing still shows what does), the paint of up to three ancestors, the first
// text node's type, the first icon, a field's placeholder (the composer's is Tiptap's
// `p.is-editor-empty::before`), and every `var(--x)` its classes and painted children name, with
// the value that variable resolves to in the current theme.
function styleOf(el, props) {
  const cls = (n) => (typeof n.className === 'string' ? n.className : n.getAttribute('class') || '');
  const short = (n) => n.tagName.toLowerCase() + cls(n).split(/\s+/).filter((c) => c && !c.includes('[') && !c.includes(':')).slice(0, 3).map((c) => '.' + c).join('');
  const pick = (cs) => { const o = {}; for (const p of props) o[p] = cs[p]; return o; };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const out = {
    tag: el.tagName.toLowerCase(),
    classes: cls(el).slice(0, 700),
    text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
    style: pick(cs),
  };
  for (const a of ['role', 'aria-label', 'data-state', 'data-active', 'aria-checked', 'aria-selected', 'data-context-menu']) if (el.hasAttribute(a)) (out.attrs ||= {})[a] = el.getAttribute(a);
  for (const pe of ['::before', '::after']) {
    const p = getComputedStyle(el, pe);
    if (p.content && p.content !== 'none' && p.content !== 'normal') {
      out[pe] = { content: p.content.slice(0, 40), width: p.width, height: p.height, position: p.position, backgroundColor: p.backgroundColor, backgroundImage: p.backgroundImage.slice(0, 200), boxShadow: p.boxShadow, borderTopWidth: p.borderTopWidth, borderTopStyle: p.borderTopStyle, borderTopColor: p.borderTopColor, borderRadius: p.borderRadius, inset: `${p.top} ${p.right} ${p.bottom} ${p.left}`, opacity: p.opacity, transition: p.transition };
    }
  }
  const paint = [];
  const nodes = [el, ...el.querySelectorAll('*')].slice(0, 400);
  for (const n of nodes) {
    if (paint.length >= 14) break;
    if (n.closest('svg') && n.tagName.toLowerCase() !== 'svg') continue;
    const nr = n.getBoundingClientRect();
    if (nr.width < 1 || nr.height < 1) continue;
    for (const pe of [null, '::before', '::after']) {
      const c = getComputedStyle(n, pe);
      if (pe && (c.content === 'none' || c.content === 'normal')) continue;
      if (c.visibility !== 'visible') continue;
      const bw = ['Top', 'Right', 'Bottom', 'Left'].map((sd) => (parseFloat(c[`border${sd}Width`]) > 0 && c[`border${sd}Style`] !== 'none' ? `${sd[0]}:${c[`border${sd}Width`]} ${c[`border${sd}Style`]} ${c[`border${sd}Color`]}` : '')).filter(Boolean);
      const bg = c.backgroundColor !== 'rgba(0, 0, 0, 0)' ? c.backgroundColor : '';
      const bgi = c.backgroundImage !== 'none' && !/^url\("?https?:/.test(c.backgroundImage) ? c.backgroundImage.replace(/url\("data:[^)]{60,}\)/g, 'url(data:…)').slice(0, 200) : '';
      const sh = c.boxShadow !== 'none' ? c.boxShadow : '';
      const ol = c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 ? `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor} offset ${c.outlineOffset}` : '';
      if (!(bw.length || bg || bgi || sh || ol)) continue;
      if (n.tagName === 'IMG' && !bw.length && !sh) continue;
      paint.push({ node: short(n) + (pe || ''), size: pe ? `${c.width}x${c.height}` : `${nr.width.toFixed(1)}x${nr.height.toFixed(1)}`, border: bw.join(' | ') || undefined, bg: bg || undefined, bgImage: bgi || undefined, shadow: sh || undefined, outline: ol || undefined, radius: c.borderRadius !== '0px' ? c.borderRadius : undefined, opacity: c.opacity !== '1' ? c.opacity : undefined });
    }
  }
  if (paint.length) out.paint = paint;
  const anc = [];
  for (let n = el.parentElement, i = 0; n && i < 3; n = n.parentElement, i++) {
    const c = getComputedStyle(n);
    const fill = i < 1 && c.backgroundColor !== 'rgba(0, 0, 0, 0)';
    if (fill || c.boxShadow !== 'none' || (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 && c.outlineColor !== 'rgba(0, 0, 0, 0)')) anc.push({ up: i + 1, node: short(n), shadow: c.boxShadow !== 'none' ? c.boxShadow : undefined, outline: c.outlineStyle !== 'none' ? `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor}` : undefined, radius: c.borderRadius, bg: c.backgroundColor });
  }
  if (anc.length) out.ancestors = anc;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent.trim() && t.parentElement && t.parentElement.getBoundingClientRect().width > 1 && getComputedStyle(t.parentElement).visibility === 'visible' ? 1 : 3) });
  const tn = walker.nextNode();
  if (tn && tn.parentElement !== el) {
    const t = tn.parentElement;
    const tc = getComputedStyle(t);
    out.textStyle = { node: short(t), text: tn.textContent.trim().slice(0, 40), fontFamily: tc.fontFamily, fontSize: tc.fontSize, lineHeight: tc.lineHeight, fontWeight: tc.fontWeight, letterSpacing: tc.letterSpacing, color: tc.color, textDecorationLine: tc.textDecorationLine, textTransform: tc.textTransform };
  }
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.querySelector('input')) {
    const f = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el : el.querySelector('input');
    const ph = getComputedStyle(f, '::placeholder');
    out.placeholder = { text: f.getAttribute('placeholder'), color: ph.color, opacity: ph.opacity, fontSize: ph.fontSize, lineHeight: ph.lineHeight };
  }
  const pp = el.querySelector('[contenteditable=true] p[data-placeholder], [contenteditable=true] p.is-editor-empty') || (el.matches('p[data-placeholder]') ? el : null);
  if (pp) {
    const b = getComputedStyle(pp, '::before');
    out.placeholder = { text: pp.getAttribute('data-placeholder') || b.content, color: b.color, opacity: b.opacity, fontSize: b.fontSize, lineHeight: b.lineHeight, float: b.cssFloat, height: b.height };
  }
  const svg = el.tagName.toLowerCase() === 'svg' ? el : [...el.querySelectorAll('svg')].find((s) => s.getBoundingClientRect().width > 1);
  if (svg) {
    const sr = svg.getBoundingClientRect();
    const scs = getComputedStyle(svg);
    out.icon = { w: +sr.width.toFixed(2), h: +sr.height.toFixed(2), fill: scs.fill, stroke: scs.stroke, color: scs.color, strokeWidth: scs.strokeWidth, classes: (svg.getAttribute('class') || '').slice(0, 80) };
  }
  // Design tokens: every var(--x) named in the classes of the element and the first painted or
  // texted nodes inside it, resolved on the element in the current theme.
  const names = new Set();
  for (const n of [el, ...el.querySelectorAll('*')].slice(0, 60)) for (const m of cls(n).matchAll(/var\((--[\w-]+)/g)) names.add(m[1]);
  if (names.size) {
    out.vars = {};
    const root = getComputedStyle(el);
    for (const n of [...names].sort()) out.vars[n] = root.getPropertyValue(n).trim();
  }
  return out;
}

// ---------------------------------------------------------------- specs
//
// Each spec: key, group, title, desc, snap (the snapshot), find (a finder function), states, and
// optional `extra` states: { name: { snap?, find } } for another element or snapshot captured in
// that state (they are measured at rest, then with their own `states` if given). `pad` is the crop
// padding (8 by default); `crop: false` skips the crop.
const ALL = ['default', 'hover', 'focus-visible'];
const HV = ['default', 'hover'];
const R = ['default'];

const SPECS = [
  // ---------------- Sidebar
  { key: 'sidebar', group: 'Sidebar', title: 'Sidebar (expanded)', snap: 'home-dark', find: () => Q('nav'), states: R, pad: 0, desc: '300 wide, full height, its own --background-nav fill; a 1px rule drawn by nav::after at the inline end.' },
  { key: 'sidebar-logo-row', group: 'Sidebar', title: 'Sidebar logo row', snap: 'home-dark', find: () => Q('nav').querySelector('div > div'), states: R, desc: '48 tall: the mark and wordmark at the start, search and collapse icon buttons at the end.' },
  { key: 'sidebar-logo', group: 'Sidebar', title: 'Sidebar logo (mark and wordmark)', snap: 'home-dark', find: () => K('clickable', 0, Q('nav')), states: HV },
  { key: 'sidebar-search-button', group: 'Sidebar', title: 'Sidebar search icon button', snap: 'home-dark', find: () => C(Q('nav .lucide-search'), '.cursor-pointer'), states: HV, desc: '32x32, radius 6, the hover fill is --fill-tsp-white-light.' },
  { key: 'sidebar-collapse-button', group: 'Sidebar', title: 'Sidebar collapse icon button', snap: 'home-dark', find: () => C(Q('nav .lucide-panel-left'), '.cursor-pointer'), states: HV },
  {
    key: 'nav-tab', group: 'Sidebar', title: 'Nav tab', snap: 'home-dark', find: () => CK(T('New task', Q('nav')), 'group/nav-tab'), states: HV,
    desc: 'A `.group/nav-tab` row, 36 tall at this density, an 18px icon in a 20px box and 14px text. Hover reveals the shortcut hint (⌘⇧O). The current page gets a filled row (`active`, from the Library snapshot).',
    extra: { active: { snap: 'library-dark', find: () => CK(T('Library', Q('nav')), 'group/nav-tab'), states: ['hover'] } },
  },
  { key: 'nav-tab-shortcut', group: 'Sidebar', title: 'Nav tab shortcut hint', snap: 'home-dark', find: () => CK(T('New task', Q('nav')), 'group/nav-tab').querySelector('.ms-auto'), hoverOn: () => CK(T('New task', Q('nav')), 'group/nav-tab'), states: ['hover'], desc: 'Opacity 0 at rest, shown with group-hover; measured while its row is hovered.' },
  { key: 'nav-badge-cue', group: 'Sidebar', title: 'Nav badge (Cue!)', snap: 'home-dark', find: () => CK(T('Agents', Q('nav')), 'group/nav-tab').querySelector('span.rounded-full'), states: R },
  { key: 'nav-section-header', group: 'Sidebar', title: 'Nav section header (Projects)', snap: 'home-dark', find: () => C(T('Projects', Q('nav')), '[role=button]'), states: HV, desc: 'A label in --text-tertiary; hover fills the row and reveals its action buttons (new project, more).' },
  { key: 'nav-section-header-tasks', group: 'Sidebar', title: 'Nav section header (Tasks)', snap: 'home-dark', find: () => C(T('Tasks', Q('nav')), '[role=button]'), states: HV, desc: 'Same row; three actions on hover (filter, sort, new).' },
  { key: 'nav-section-action', group: 'Sidebar', title: 'Nav section action button', snap: 'home-dark', find: () => C(T('Tasks', Q('nav')), '[role=button]').querySelector('.h-7.w-7'), states: ['hover'], desc: 'A 28x28 icon button shown once the section header is hovered (hovering it also hovers the header).' },
  { key: 'nav-project-row', group: 'Sidebar', title: 'Project row', snap: 'home-dark', find: () => Q('.nav-bar-project-item-header'), states: ALL, desc: 'The folder icon swaps for a chevron on hover, and a more button appears at the end.' },
  { key: 'nav-task-row', group: 'Sidebar', title: 'Task row', snap: 'home-dark', find: () => K('group/nav-tab', 0, Q('[data-context-menu=session]')), states: HV, desc: 'Inside `[data-context-menu=session]`; the title is masked at the end by a scroll-shadow gradient, not an ellipsis.', extra: { active: { snap: 'task-dark-completed', find: () => painted(document.querySelectorAll('nav [data-context-menu=session] .group\\/nav-tab')) } } },
  { key: 'nav-task-icon', group: 'Sidebar', title: 'Task row icon', snap: 'home-dark', find: () => Q('[data-context-menu=session] .nav-bar-density-icon-glyph'), states: R, desc: 'An 18px glyph tinted grey with a CSS filter on an <img>.' },
  { key: 'nav-task-running', group: 'Sidebar', title: 'Task row status spinner (running task)', snap: 'home-dark', find: () => CK(TS('Best AI Coding Plans Under', Q('nav')), 'group/nav-tab').querySelector('.nav-bar-density-icon-glyph'), states: R, desc: 'A dotted amber ring in place of the task icon.' },
  { key: 'nav-skeleton', group: 'Sidebar', title: 'Task list loading skeleton', snap: 'home-dark', find: () => K('animate-pulse', 0, Q('nav')), prep: () => { const sc = Q('nav .simplebar-content-wrapper'); sc.scrollTop = sc.scrollHeight; }, states: R, desc: 'Pulsing rows at the end of the task list while more load; the list is scrolled to its end to show them.' },
  { key: 'share-banner', group: 'Sidebar', title: 'Share banner ("Share Manus with a friend")', snap: 'home-dark', find: () => Q('.onboarding-primary-action').parentElement, states: ALL, desc: 'Radius 12, a 0.5px --border-dark hairline, --background-mask-white fill; serif title over a 12px grey line, a chevron at the end.' },
  { key: 'sidebar-footer', group: 'Sidebar', title: 'Sidebar footer account row', snap: 'home-dark', find: () => W(T('Learner', Q('nav')), 284), states: R, desc: 'Avatar, name, then the desktop and bell icon buttons.' },
  { key: 'sidebar-account', group: 'Sidebar', title: 'Account button (avatar and name)', snap: 'home-dark', find: () => C(T('Learner', Q('nav')), '.clickable') || T('Learner', Q('nav')).parentElement, states: HV },
  { key: 'sidebar-avatar', group: 'Sidebar', title: 'Avatar (letter)', snap: 'home-dark', find: () => K('rounded-full overflow-hidden font-bold', 0, Q('nav')), states: R },
  { key: 'sidebar-desktop-button', group: 'Sidebar', title: 'Desktop app icon button', snap: 'home-dark', find: () => K('size-[28px] rounded-[8px]', 0, Q('nav')), states: HV },
  { key: 'sidebar-bell-button', group: 'Sidebar', title: 'Notifications bell button', snap: 'home-dark', find: () => Q('#js-update-notification-button'), states: HV, extra: { open: { snap: 'home-dark-notifications', find: () => Q('#js-update-notification-button') } } },
  { key: 'sidebar-collapsed', group: 'Sidebar', title: 'Sidebar collapsed to a rail', snap: 'home-dark-sidebar-collapsed', find: () => Q('nav'), states: R, pad: 0, desc: '52 wide: icon-only nav tabs (36x36), a 28px divider in place of the sections, the footer buttons stacked.' },
  { key: 'sidebar-collapsed-tab', group: 'Sidebar', title: 'Collapsed rail nav tab', snap: 'home-dark-sidebar-collapsed', find: () => K('group/nav-tab', 0, Q('nav')), states: HV },

  // ---------------- Top bar
  { key: 'model-picker', group: 'Top bar', title: 'Model picker trigger', snap: 'home-dark', find: () => C(T('Manus 2.0 Lite', M()), '.clickable'), states: HV, desc: 'Title-size 18/22 500 text and a 16px chevron that turns 180° when the menu is open.', extra: { open: { snap: 'home-dark-model-menu', find: () => C(T('Manus 2.0 Lite', M()), '.clickable') } } },
  { key: 'plan-chip', group: 'Top bar', title: 'Plan chip (Free plan | Upgrade)', snap: 'home-dark', find: () => CK(T('Free plan'), 'rounded-[8px]'), states: R },
  { key: 'upgrade-link', group: 'Top bar', title: 'Upgrade link in the plan chip', snap: 'home-dark', find: () => C(T('Upgrade', M()), 'button'), states: ALL, desc: 'Blue text, hover drops opacity to 0.8.' },
  { key: 'credits-pill', group: 'Top bar', title: 'Credits pill', snap: 'home-dark', find: () => C(T('341', M()), '.clickable'), states: HV },
  { key: 'upgrade-button-task', group: 'Top bar', title: 'Upgrade button (task page)', snap: 'task-dark-completed', find: () => C(T('Upgrade', M()), 'button'), states: ALL, desc: 'On a task the plan chip collapses to one tinted Upgrade button.' },
  { key: 'share-button', group: 'Top bar', title: 'Share button', snap: 'task-dark-completed', find: () => C(T('Share', M()), 'button'), states: ALL },
  { key: 'topbar-more-button', group: 'Top bar', title: 'More (…) button', snap: 'task-dark-completed', find: () => C(at(1376, 24), '.cursor-pointer'), states: HV },
  { key: 'panel-toggle', group: 'Top bar', title: 'Side panel toggle', snap: 'task-dark-completed', find: () => C(at(1412, 24), '.cursor-pointer'), states: HV },

  // ---------------- Home
  { key: 'home-logo', group: 'Home', title: 'Home logo (mark and wordmark)', snap: 'home-dark', find: () => Q('h1', 0, M()), states: R, desc: 'An h1 holding two SVGs, 376x64, with "Manus Studio" as sr-only text.' },
  { key: 'promo-card', group: 'Home', title: 'Promo carousel card', snap: 'home-dark', find: () => C(T('Turn your idea into a game'), 'button'), states: ALL, desc: 'Black (--background-game-promo) radius 12, 56 tall; a framed 38x30 preview, a serif 13/18 bold title and a 12/16 subtitle in white.' },
  { key: 'promo-dot', group: 'Home', title: 'Promo carousel dot', snap: 'home-dark', find: () => Q('button.w-\\[14px\\]', 0), states: ['default', 'focus-visible'], desc: 'A 5px track in --fill-tsp-white-dark with an --icon-secondary fill that grows as the slide plays; the dots stack vertically at the card end.', extra: { inactive: { find: () => Q('button.w-\\[14px\\]', 1) } } },
  { key: 'build-card', group: 'Home', title: 'Build card', snap: 'home-dark', find: () => C(T('Build', M()), 'button'), states: ALL, desc: '490x130, --fill-tsp-white-light, hover --fill-tsp-white-main; a 16/22 500 title with a chevron, a 14/20 grey line, an illustration bleeding off the end.' },
  { key: 'create-card', group: 'Home', title: 'Create card', snap: 'home-dark', find: () => C(T('Create', M()), 'button'), states: HV },
  { key: 'local-file-card', group: 'Home', title: 'Start from a local file card', snap: 'home-dark', find: () => C(T('Start from a local file'), 'button'), states: HV },
  { key: 'studio-only-badge', group: 'Home', title: 'Studio only badge', snap: 'home-dark', find: () => T('Studio only'), states: R },
  { key: 'composer', group: 'Composer', title: 'Composer', snap: 'home-dark', find: () => P(Q('[contenteditable=true]')), focusOn: () => Q('[contenteditable=true]'), states: ['default', 'focus-visible'], desc: '768 wide, radius from --ui-density-composer-radius, --background-menu-white fill; a 50 tall editor above a 32px tool row.', extra: { typed: { snap: 'home-dark-composer-typed', find: () => P(Q('[contenteditable=true]')) }, task: { snap: 'task-dark-completed', find: () => P(Q('[contenteditable=true]')) } } },
  { key: 'composer-placeholder', group: 'Composer', title: 'Composer placeholder', snap: 'home-dark', find: () => Q('[contenteditable=true] p'), states: R, desc: 'Tiptap draws it with p.is-editor-empty::before from data-placeholder.' },
  { key: 'composer-text', group: 'Composer', title: 'Composer typed text', snap: 'home-dark-composer-typed', find: () => Q('[contenteditable=true] p'), states: R },
  { key: 'composer-plus', group: 'Composer', title: 'Composer + button', snap: 'home-dark', find: () => P(Q('[contenteditable=true]')).querySelectorAll('button')[0], states: ALL, desc: 'A 32px circle with a 1px --border-main ring.', extra: { open: { snap: 'home-dark-attach-menu', find: () => P(Q('[contenteditable=true]')).querySelectorAll('button')[0].parentElement } } },
  { key: 'composer-connectors', group: 'Composer', title: 'Connector chips button', snap: 'home-dark', find: () => P(Q('[contenteditable=true]')).querySelectorAll('button')[1], states: ALL, desc: 'Overlapping 16px app icons in a pill.' },
  { key: 'composer-desktop-chip', group: 'Composer', title: 'Manus Desktop chip', snap: 'home-dark', find: () => C(T('Manus Desktop'), 'button'), states: ALL },
  { key: 'composer-skill-button', group: 'Composer', title: 'Composer agent-mode icon button', snap: 'home-dark', find: () => K('rounded-full clickable px-2', 0, P(Q('[contenteditable=true]'))), states: HV },
  { key: 'composer-mic', group: 'Composer', title: 'Composer microphone button', snap: 'home-dark', find: () => K('flex-shrink-0 rounded-full cursor-pointer', 0, P(Q('[contenteditable=true]'))), states: HV },
  { key: 'composer-send', group: 'Composer', title: 'Composer send button', snap: 'home-dark', find: () => { const b = P(Q('[contenteditable=true]')).querySelectorAll('button'); return b[b.length - 1]; }, states: R, desc: 'Disabled (opacity 0.5) while the composer is empty; `enabled` once text is typed.', extra: { enabled: { snap: 'home-dark-composer-typed', find: () => { const b = P(Q('[contenteditable=true]')).querySelectorAll('button'); return b[b.length - 1]; }, states: ['hover', 'focus-visible'] } } },
  { key: 'disclaimer', group: 'Composer', title: 'Footer disclaimer', snap: 'task-dark-completed', find: () => TS('Manus is an AI Agent and can make mistakes'), states: R, desc: 'Present but `invisible` on the home page; shown under the composer on a task.' },

  // ---------------- Menus and dialogs
  { key: 'model-menu', group: 'Menus and dialogs', title: 'Model menu', snap: 'home-dark-model-menu', find: () => D().firstElementChild, states: R, desc: '366 wide, 4px padding, --background-menu-white, shadow-menu, a 40px backdrop blur.' },
  { key: 'model-menu-item', group: 'Menus and dialogs', title: 'Model menu item', snap: 'home-dark-model-menu', find: () => C(TS('Versatile agent', D()), '[role=button]'), states: HV, desc: 'Title 14/20 with a serif Pro badge, a 12px description in --text-tertiary. The current model carries a check (`checked`).', extra: { checked: { find: () => C(T('Manus 2.0 Lite', D()), '[role=button]'), states: ['hover'] } } },
  { key: 'model-menu-pro-badge', group: 'Menus and dialogs', title: 'Pro badge', snap: 'home-dark-model-menu', find: () => T('Pro', D()), states: R },
  { key: 'model-menu-beta-badge', group: 'Menus and dialogs', title: 'Beta badge', snap: 'home-dark-model-menu', find: () => T('Beta', D()), states: R },
  { key: 'attach-menu', group: 'Menus and dialogs', title: 'Attach (+) menu', snap: 'home-dark-attach-menu', find: () => D().firstElementChild, states: R },
  { key: 'menu-item', group: 'Menus and dialogs', title: 'Menu item (attach menu)', snap: 'home-dark-attach-menu', find: () => CK(T('Add from Google Drive', D()), 'rounded-[8px]'), states: HV, desc: 'The shared menu row: 36 tall, 8px horizontal padding, an icon then 14px text, radius 8, hover --fill-tsp-white-main.' },
  { key: 'menu-divider', group: 'Menus and dialogs', title: 'Menu divider', snap: 'home-dark-attach-menu', find: () => K('h-[1px]', 0, D()), states: R },
  { key: 'search-dialog', group: 'Menus and dialogs', title: 'Search tasks dialog', snap: 'home-dark-search', find: () => D(), states: R, desc: '680 wide, centred, over a transparent overlay (no dim).' },
  { key: 'search-input', group: 'Menus and dialogs', title: 'Search dialog field row', snap: 'home-dark-search', find: () => C(Q('input[placeholder="Search tasks..."]'), 'h3'), focusOn: () => Q('input[placeholder="Search tasks..."]'), states: ['default', 'focus-visible'] },
  { key: 'search-result', group: 'Menus and dialogs', title: 'Search result row', snap: 'home-dark-search', find: () => Q('li.clickable', 1, D()), states: HV, extra: { selected: { find: () => Q('li.clickable', 0, D()) } } },
  { key: 'search-group-label', group: 'Menus and dialogs', title: 'Search group label (Older)', snap: 'home-dark-search', find: () => T('Older', D()), states: R },
  { key: 'notifications-panel', group: 'Menus and dialogs', title: 'Notifications popover', snap: 'home-dark-notifications', find: () => D().firstElementChild, states: R, desc: '400x600, radius 12, a 0.5px border, the All/Updates/Messages tabs, then entries split by rules.' },
  { key: 'notification-item', group: 'Menus and dialogs', title: 'Notification entry', snap: 'home-dark-notifications', find: () => K('space-y-3 py-4', 0, D()), states: R },
  { key: 'tooltip', group: 'Menus and dialogs', title: 'Tooltip', snap: 'home-dark-notifications', find: () => Q('[role=tooltip]'), states: R },
  { key: 'view-options-menu', group: 'Menus and dialogs', title: 'View options menu', snap: 'library-dark-images-grid-view-options', find: () => D().firstElementChild, states: R, desc: '192 wide; a 13px grey heading, then Group by task and Favorites only. No item carries a check in this capture.' },
  { key: 'view-options-item', group: 'Menus and dialogs', title: 'View options item', snap: 'library-dark-images-grid-view-options', find: () => C(T('Group by task', D()), '[role=button]'), states: HV, extra: { second: { find: () => C(T('Favorites only', D()), '[role=button]') } } },
  { key: 'row-menu', group: 'Menus and dialogs', title: 'Library row menu', snap: 'library-dark-row-menu', find: () => D().firstElementChild, states: R, desc: '280 min width; Download, Save to, Share, a divider, Locate in task, Add to favorites, Send to Manus.' },
  { key: 'row-menu-item', group: 'Menus and dialogs', title: 'Library row menu item', snap: 'library-dark-row-menu', find: () => CK(T('Download', D()), 'rounded-[8px]'), states: HV },
  { key: 'user-menu', group: 'Menus and dialogs', title: 'Account menu', snap: 'library-dark-user-menu', find: () => D().firstElementChild, states: R, desc: '284 wide, opening above the account row.' },
  { key: 'user-menu-header', group: 'Menus and dialogs', title: 'Account menu header (avatar, name, workspace)', snap: 'library-dark-user-menu', find: () => C(T('Personal', D()), '.clickable'), states: HV },
  { key: 'user-menu-plan', group: 'Menus and dialogs', title: 'Account menu plan card', snap: 'library-dark-user-menu', find: () => K('rounded-[8px] bg-[var(--fill-tsp-white-light)]', 0, D()), states: R },
  { key: 'user-menu-upgrade', group: 'Menus and dialogs', title: 'Account menu Upgrade button', snap: 'library-dark-user-menu', find: () => C(T('Upgrade', D()), 'button'), states: ALL },
  { key: 'user-menu-item', group: 'Menus and dialogs', title: 'Account menu item', snap: 'library-dark-user-menu', find: () => K('group/profileMenuItem', 0, D()) && CK(T('Settings', D()), 'group/profileMenuItem'), states: HV, desc: 'Hover also shows the shortcut hint (⌘⇧,).', extra: { link: { find: () => C(T('Docs', D()), 'a'), states: ['focus-visible'] } } },
  { key: 'context-menu', group: 'Menus and dialogs', title: 'Project context menu', snap: 'plugins-dark-project-context-menu', find: () => D().firstElementChild, states: R },
  { key: 'context-menu-item-danger', group: 'Menus and dialogs', title: 'Context menu Delete item', snap: 'plugins-dark-project-context-menu', find: () => CK(T('Delete', D()), 'rounded-[8px]'), states: HV },
  { key: 'more-menu', group: 'Menus and dialogs', title: 'Sidebar More menu', snap: 'plugins-dark-more-menu', find: () => D().firstElementChild, states: R, desc: 'The one menu on --background-menu-gray rather than --background-menu-white.' },
  { key: 'more-menu-item', group: 'Menus and dialogs', title: 'Sidebar More menu item', snap: 'plugins-dark-more-menu', find: () => CK(T('Skills', D()), 'rounded-[8px]'), states: HV },
  { key: 'task-menu', group: 'Menus and dialogs', title: 'Sidebar task menu', snap: 'task-dark-sidebar-task-menu', find: () => D().firstElementChild, states: R },
  { key: 'task-menu-item-danger', group: 'Menus and dialogs', title: 'Sidebar task menu Delete item', snap: 'task-dark-sidebar-task-menu', find: () => CK(T('Delete', D()), 'rounded-[8px]'), states: HV },
  { key: 'files-dialog', group: 'Menus and dialogs', title: 'Files in this task dialog', snap: 'task-dark-files-dialog', find: () => D(), states: R, desc: '600x680, radius 16, --background-gray-main over --background-dialog-mask with a 4px blur.' },
  { key: 'files-dialog-row', group: 'Menus and dialogs', title: 'Files dialog file row', snap: 'task-dark-files-dialog', find: () => C(T('pasted_content.txt', D()), '.clickable'), states: HV },
  { key: 'dialog-mask', group: 'Menus and dialogs', title: 'Dialog backdrop', snap: 'task-dark-files-dialog', find: () => K('fixed inset-0 backdrop-blur-[4px]'), states: R, crop: false },
  { key: 'dialog-close', group: 'Menus and dialogs', title: 'Dialog close button (files dialog)', snap: 'task-dark-files-dialog', find: () => K('cursor-pointer rounded-md', 1, D()), states: HV },

  // ---------------- Library
  { key: 'page-title', group: 'Library', title: 'Page title (h1)', snap: 'library-dark', find: () => Q('h1', 0, M()), states: R, desc: '18/24 500 in --text-primary, in a 112 tall header band.' },
  { key: 'library-search', group: 'Library', title: 'Search field', snap: 'library-dark', find: () => C(Q('input[placeholder="Search files"]'), '.group'), focusOn: () => Q('input[placeholder="Search files"]'), states: ALL },
  { key: 'view-options-button', group: 'Library', title: 'View options button', snap: 'library-dark', find: () => K('size-8 rounded-lg border', 0, M()), states: ALL },
  { key: 'view-toggle', group: 'Library', title: 'Grid/list segmented control', snap: 'library-dark', find: () => K('h-8 p-[1px] items-stretch', 0, M()), states: R, desc: '68x32, radius 8, 1px --border-main, --fill-tsp-gray-main; a white thumb (radius 6, a 0.5px-offset shadow) slides under the active option.' },
  { key: 'view-toggle-option', group: 'Library', title: 'Segmented control option', snap: 'library-dark', find: () => K('h-8 p-[1px] items-stretch', 0, M()).querySelectorAll('button')[0], states: ALL, extra: { active: { find: () => K('h-8 p-[1px] items-stretch', 0, M()).querySelectorAll('button')[1] } } },
  { key: 'view-toggle-thumb', group: 'Library', title: 'Segmented control thumb', snap: 'library-dark', find: () => K('absolute inset-0 rounded-[6px]', 0, K('h-8 p-[1px] items-stretch', 0, M())), states: R },
  { key: 'type-tab', group: 'Library', title: 'Type tab', snap: 'library-dark', find: () => C(T('Text & PDF', M()), 'button'), states: ALL, desc: '32 tall, radius 8, 14px; the label is drawn twice (a hidden 500-weight copy reserves the width, so selecting does not shift the row).', extra: { selected: { find: () => C(T('All', M()), 'button'), states: ['hover'] } } },
  { key: 'date-heading', group: 'Library', title: 'Date group heading with count', snap: 'library-dark', find: () => Q('h2', 0, M()), states: R },
  { key: 'file-row', group: 'Library', title: 'File list row', snap: 'library-dark', find: () => C(Q('time', 0, M()), '[role=button]'), states: HV, desc: '67 tall; the hover fill extends 12px past the column on both sides (radius 8); a 1px --border-main rule under the inner row.' },
  { key: 'file-row-icon', group: 'Library', title: 'File row icon', snap: 'library-dark', find: () => C(Q('time', 0, M()), '[role=button]').querySelector('svg, img'), states: R },
  { key: 'file-row-title', group: 'Library', title: 'File row title', snap: 'library-dark', find: () => TS('Competitor Deep Dive', M()), states: R },
  { key: 'file-row-source', group: 'Library', title: 'File row source task', snap: 'library-dark', find: () => K('max-w-full truncate text-[13px]', 0, M()), states: R },
  { key: 'file-row-time', group: 'Library', title: 'File row time', snap: 'library-dark', find: () => Q('time', 0, M()), states: R },
  { key: 'file-row-menu', group: 'Library', title: 'File row more button', snap: 'library-dark', find: () => C(Q('time', 0, M()), '[role=button]').querySelector('button'), states: ALL, extra: { open: { snap: 'library-dark-row-menu', find: () => C(Q('time', 0, M()), '[role=button]').querySelector('button') } } },
  { key: 'grid-card', group: 'Library', title: 'Grid card', snap: 'library-dark-images-grid', find: () => CK(T('dealer_flow', M()), 'rounded-[12px]'), states: HV, desc: '323x258, radius 12, a 0.5px --border-dark hairline on --background-menu-white; a title row (icon, name, extension, source, more) over the thumbnail.' },
  { key: 'grid-card-thumb', group: 'Library', title: 'Grid card thumbnail area', snap: 'library-dark-images-grid', find: () => { const c = CK(T('dealer_flow', M()), 'rounded-[12px]'); return [...c.children].sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]; }, states: R },
  { key: 'grid-card-title', group: 'Library', title: 'Grid card name and extension', snap: 'library-dark-images-grid', find: () => T('dealer_flow', M()).parentElement, states: R },
  { key: 'task-group-heading', group: 'Library', title: 'Group-by-task heading', snap: 'library-dark-images-grid-by-task', find: () => Q('a[href*="/app/"]', 0, M()).parentElement, states: R, desc: 'The task name as a 16/22 500 link (underline on hover) with its date at the end.' },
  { key: 'task-group-link', group: 'Library', title: 'Group-by-task heading link', snap: 'library-dark-images-grid-by-task', find: () => Q('a[href*="/app/"]', 0, M()), states: ALL },
  { key: 'previewer', group: 'Document previewer', title: 'Document previewer', snap: 'library-dark-preview-doc', find: () => H(T('Last modified: May 3'), 800), states: R, pad: 0, desc: '1200x820 at 1440 (inset 120/40), --background-gray-main, over --background-dialog-mask with a 4px blur.' },
  { key: 'previewer-header', group: 'Document previewer', title: 'Previewer header', snap: 'library-dark-preview-doc', find: () => CK(T('Last modified: May 3'), 'h-[48px]'), states: R },
  { key: 'previewer-title', group: 'Document previewer', title: 'Previewer title', snap: 'library-dark-preview-doc', find: () => TS('Competitor Deep Dive', CK(T('Last modified: May 3'), 'h-[48px]')), states: R },
  { key: 'previewer-meta', group: 'Document previewer', title: 'Previewer last-modified line', snap: 'library-dark-preview-doc', find: () => T('Last modified: May 3'), states: R },
  { key: 'previewer-tool', group: 'Document previewer', title: 'Previewer toolbar icon button', snap: 'library-dark-preview-doc', find: () => K('size-[28px] rounded-[8px]', 0, CK(T('Last modified: May 3'), 'h-[48px]')), states: HV },
  { key: 'previewer-body', group: 'Document previewer', title: 'Previewer document column', snap: 'library-dark-preview-doc', find: () => Q('[role=textbox][contenteditable=true]'), states: R, desc: '712 wide, centred in the scroll area.' },
  { key: 'doc-h1', group: 'Document previewer', title: 'Document h1', snap: 'library-dark-preview-doc', find: () => Q('[role=textbox] h1'), states: R },
  { key: 'doc-h2', group: 'Document previewer', title: 'Document h2', snap: 'library-dark-preview-doc', find: () => Q('[role=textbox] h2'), states: R },
  { key: 'doc-h3', group: 'Document previewer', title: 'Document h3', snap: 'library-dark-preview-doc', find: () => Q('[role=textbox] h3'), states: R },
  { key: 'doc-paragraph', group: 'Document previewer', title: 'Document paragraph', snap: 'library-dark-preview-doc', find: () => C(TS('This report provides', Q('[role=textbox]')), 'p, div') , states: R },
  { key: 'doc-bullet', group: 'Document previewer', title: 'Document bullet', snap: 'library-dark-preview-doc', find: () => Q('[role=textbox] .li-decorator'), states: R },
  { key: 'doc-rule', group: 'Document previewer', title: 'Document horizontal rule', snap: 'library-dark-preview-doc', find: () => K('w-full h-[1px]', 0, Q('[role=textbox]')), states: R },

  // ---------------- Settings
  { key: 'settings-dialog', group: 'Settings', title: 'Settings dialog', snap: 'settings-dark-general', find: () => D(), states: R, pad: 0, desc: '1152x810 at 1440, radius 16, shadow-menu; a 221 nav column with a right rule, the content column scrolls.' },
  { key: 'settings-close', group: 'Settings', title: 'Settings close button', snap: 'settings-dark-general', find: () => K('h-7 w-7 cursor-pointer', 0, D()), states: HV },
  { key: 'settings-account', group: 'Settings', title: 'Settings account header', snap: 'settings-dark-general', find: () => W(T('Personal', D()), 180), states: HV },
  { key: 'settings-search', group: 'Settings', title: 'Settings search field', snap: 'settings-dark-general', find: () => C(Q('input[placeholder=Search]', 0, D()), 'div'), focusOn: () => Q('input[placeholder=Search]', 0, D()), states: ALL },
  { key: 'settings-nav-label', group: 'Settings', title: 'Settings nav section label', snap: 'settings-dark-general', find: () => K('hidden md:block', 0, D()), states: R },
  { key: 'settings-nav-item', group: 'Settings', title: 'Settings nav item', snap: 'settings-dark-general', find: () => C(T('Account', D()), 'button'), states: ALL, extra: { active: { find: () => C(T('General', D()), 'button'), states: ['hover'] } } },
  { key: 'settings-title', group: 'Settings', title: 'Settings page title', snap: 'settings-dark-general', find: () => Q('h1', 0, D()), states: R },
  { key: 'settings-section-title', group: 'Settings', title: 'Settings section title', snap: 'settings-dark-general', find: () => T('Appearance', D()), states: R },
  { key: 'settings-field-label', group: 'Settings', title: 'Settings field label', snap: 'settings-dark-general', find: () => T('Language', D()), states: R },
  { key: 'language-select', group: 'Settings', title: 'Language select', snap: 'settings-dark-general', find: () => C(T('English', D()), 'button'), states: ALL },
  { key: 'theme-card', group: 'Settings', title: 'Theme option card', snap: 'settings-dark-general', find: () => C(T('Light', D()), 'button'), states: ALL, desc: '110x62 with a small preview glyph over the label.', extra: { selected: { find: () => C(T('Auto', D()), 'button') } } },
  { key: 'settings-select', group: 'Settings', title: 'Settings inline select (Send without interrupting)', snap: 'settings-dark-general', find: () => CK(T('Send without interrupting', D()), 'clickable'), states: HV },
  { key: 'settings-row-title', group: 'Settings', title: 'Settings row title', snap: 'settings-dark-general', find: () => T('Browser notifications', D()), states: R },
  { key: 'settings-row-desc', group: 'Settings', title: 'Settings row description', snap: 'settings-dark-general', find: () => TS('Get notified in your browser', D()), states: R },
  { key: 'toggle', group: 'Settings', title: 'Toggle switch', snap: 'settings-dark-general', find: () => Q('[role=switch]', 0, D()), states: ALL, desc: '26x16 track, a 14px white knob that slides 10px; off --icon-disable, on --icon-blue.', extra: { on: { find: () => Q('[role=switch]', 2, D()) }, disabled: { find: () => Q('[role=switch]', 1, D()) } } },
  { key: 'settings-rule', group: 'Settings', title: 'Settings section rule', snap: 'settings-dark-general', find: () => K('w-full h-[1px]', 0, D()), states: R },
  { key: 'shortcut-row', group: 'Settings', title: 'Shortcut row', snap: 'settings-dark-shortcuts', find: () => W(T('Voice input', D()), 760), states: R },
  { key: 'shortcut-field', group: 'Settings', title: 'Shortcut key field', snap: 'settings-dark-shortcuts', find: () => CK(T('D', D()), 'rounded-lg'), states: HV },
  { key: 'keycap', group: 'Settings', title: 'Keycap', snap: 'settings-dark-shortcuts', find: () => T('D', D()), states: R },
  { key: 'shortcut-clear', group: 'Settings', title: 'Shortcut clear button', snap: 'settings-dark-shortcuts', find: () => { const b = CK(T('D', D()), 'rounded-lg').querySelectorAll('button'); return b[b.length - 1]; }, states: ALL },
  { key: 'reset-button', group: 'Settings', title: 'Reset to defaults button (outline)', snap: 'settings-dark-shortcuts', find: () => C(T('Reset to defaults', D()), 'button'), states: ALL },

  // ---------------- Creations
  { key: 'creations-search', group: 'Creations', title: 'Creations search field', snap: 'creations-dark', find: () => C(Q('input[placeholder="Search creations"]'), '.group'), states: R },
  { key: 'creation-card', group: 'Creations', title: 'Creation card', snap: 'creations-dark', find: () => CK(T('UnidBox AI', M()), 'group/website'), states: HV, desc: '1000 wide, radius 12, 0.5px --border-dark, --background-menu-white, 12 padding: a 232x131 thumbnail, the title, "Created in", the URL chip and three actions.' },
  { key: 'creation-thumb', group: 'Creations', title: 'Creation thumbnail', snap: 'creations-dark', find: () => CK(T('UnidBox AI', M()), 'group/website').querySelector('button'), states: HV },
  { key: 'creation-url', group: 'Creations', title: 'Creation URL chip', snap: 'creations-dark', find: () => Q('a[href*="manus.space"]', 0, M()), states: ALL },
  { key: 'creation-action-primary', group: 'Creations', title: 'Locate in task (filled small button)', snap: 'creations-dark', find: () => C(T('Locate in task', M()), 'button'), states: ALL },
  { key: 'creation-action', group: 'Creations', title: 'Edit in new task (ghost small button)', snap: 'creations-dark', find: () => C(T('Edit in new task', M()), 'button'), states: ALL },
  { key: 'creation-star', group: 'Creations', title: 'Creation favourite (star) button', snap: 'creations-dark', find: () => K('size-7 rounded-lg', 0, CK(T('UnidBox AI', M()), 'group/website')), states: ALL },

  // ---------------- Computers
  { key: 'computers-cta', group: 'Computers', title: 'Create cloud computer button', snap: 'computers-dark', find: () => C(T('Create cloud computer', M()), 'button'), states: ALL },
  { key: 'computers-heading', group: 'Computers', title: 'Computers section heading', snap: 'computers-dark', find: () => Q('h2', 0, M()), states: R },
  { key: 'setup-card', group: 'Computers', title: 'Setup card', snap: 'computers-dark', find: () => C(T('Run automations', M()), 'button'), states: ALL, desc: '312x299, radius 12, 1px --border-main on --background-menu-white; a 173 tall illustration band on --fill-tsp-gray-main, title, two-line description and OS badges.' },
  { key: 'setup-badge', group: 'Computers', title: 'OS badge', snap: 'computers-dark', find: () => T('Linux', M()), states: R },
  { key: 'computers-customize', group: 'Computers', title: 'Customize band (bottom CTA)', snap: 'computers-dark', find: () => C(T('Have a setup in mind?', M()), 'button'), states: ALL },
  { key: 'computers-connect', group: 'Computers', title: 'Connect your devices band', snap: 'computers-dark', find: () => C(T('Connect your devices', M()), 'section'), states: R },
  { key: 'computers-small-button', group: 'Computers', title: 'Connect new computer (outline small button)', snap: 'computers-dark', find: () => C(T('Connect new computer', M()), 'button'), states: ALL },

  // ---------------- Agents
  { key: 'cue-title', group: 'Agents', title: 'Meet Cue title', snap: 'agents-dark', find: () => Q('h1', 0, M()), states: R },
  { key: 'cue-video', group: 'Agents', title: 'Cue video frame', snap: 'agents-dark', find: () => K('aspect-video rounded-[14px]', 0, M()), states: R },
  { key: 'cue-play', group: 'Agents', title: 'Play video button', snap: 'agents-dark', find: () => C(T('Play video', M()), 'button'), states: ALL },
  { key: 'cue-download', group: 'Agents', title: 'Download for desktop (primary)', snap: 'agents-dark', find: () => C(T('Download for desktop', M()), 'a'), states: ALL },
  { key: 'cue-mobile', group: 'Agents', title: 'Get the mobile app (black)', snap: 'agents-dark', find: () => C(T('Get the mobile app', M()), 'button'), states: ALL },
  { key: 'waitlist-banner', group: 'Agents', title: 'Waitlist banner', snap: 'agents-dark', find: () => W(C(T('Join waitlist', M()), 'button'), 560), states: R },
  { key: 'waitlist-button', group: 'Agents', title: 'Join waitlist button', snap: 'agents-dark', find: () => C(T('Join waitlist', M()), 'button'), states: ALL },
  { key: 'cue-link', group: 'Agents', title: 'Visit our website link', snap: 'agents-dark', find: () => Q('a[href="https://cue.im/"]', 0, M()), states: ALL },

  // ---------------- Automations
  { key: 'automations-heading', group: 'Automations', title: 'Create your first automation heading', snap: 'automations-dark', find: () => Q('h2', 0, M()), states: R },
  { key: 'automation-card', group: 'Automations', title: 'Automation example card', snap: 'automations-dark', find: () => CK(T('Schedule', M()), 'max-w-[400px]'), states: HV, desc: '312x421, radius 12, 1px --border-main; an animated illustration band over a 16/22 title and a description.' },
  { key: 'automation-card-title', group: 'Automations', title: 'Automation card title', snap: 'automations-dark', find: () => T('Schedule', M()), states: R },
  { key: 'get-started', group: 'Automations', title: 'Get started button (black)', snap: 'automations-dark', find: () => C(T('Get started', M()), 'button'), states: ALL },

  // ---------------- Plugins
  { key: 'plugins-header-button', group: 'Plugins', title: 'Manage Connectors (outline)', snap: 'plugins-dark', find: () => C(T('Manage Connectors', M()), 'button'), states: ALL },
  { key: 'plugins-header-primary', group: 'Plugins', title: 'Header primary button', snap: 'plugins-dark', find: () => C(T('Manage Connectors', M()), 'button').nextElementSibling, states: ALL },
  { key: 'plugin-promo', group: 'Plugins', title: 'Plugin promo card', snap: 'plugins-dark', find: () => CK(TS('Bring email, docs', M()), 'w-[280px]'), states: R },
  { key: 'carousel-forward', group: 'Plugins', title: 'Carousel scroll-forward button', snap: 'plugins-dark', find: () => M().querySelector('[aria-label="Scroll forward"]'), states: HV, desc: 'Held at opacity 0 until the carousel is hovered; measured as found, then hovered.' },
  { key: 'plugins-search', group: 'Plugins', title: 'Plugins search field', snap: 'plugins-dark', find: () => C(Q('input[placeholder=Search]', 0, M()), 'div'), focusOn: () => Q('input[placeholder=Search]', 0, M()), states: ALL },
  { key: 'category-tab', group: 'Plugins', title: 'Category tab', snap: 'plugins-dark', find: () => C(T('Productivity', M()), 'button'), states: HV, extra: { selected: { find: () => C(T('All', M()), 'button') } } },
  { key: 'plugin-row', group: 'Plugins', title: 'Plugin row', snap: 'plugins-dark', find: () => CK(T('Instagram', M()), 'h-[76px]'), states: HV, desc: '378x76, radius 12, 1px --border-main, hover --fill-tsp-white-light; a 40px icon tile, name and two-line description, a 28px add button for plugins not yet added.' },
  { key: 'plugin-icon', group: 'Plugins', title: 'Plugin icon tile', snap: 'plugins-dark', find: () => K('size-10', 0, CK(T('Instagram', M()), 'h-[76px]')), states: R },
  { key: 'plugin-name', group: 'Plugins', title: 'Plugin name', snap: 'plugins-dark', find: () => T('Instagram', M()), states: R },
  { key: 'plugin-desc', group: 'Plugins', title: 'Plugin description', snap: 'plugins-dark', find: () => TS('Generate and publish Posts', M()), states: R },
  { key: 'plugin-add', group: 'Plugins', title: 'Plugin add (+) button', snap: 'plugins-dark', find: () => K('size-7', 0, CK(T('Instagram', M()), 'h-[76px]')), states: HV },

  // ---------------- Project
  { key: 'project-icon', group: 'Project', title: 'Project icon tile', snap: 'project-dark', find: () => K('p-[12px] rounded-[12px]', 0, M()), states: HV },
  { key: 'project-title', group: 'Project', title: 'Project title', snap: 'project-dark', find: () => T('Hackathons', M()), states: HV },
  { key: 'project-meta', group: 'Project', title: 'Project meta line', snap: 'project-dark', find: () => T('Created by Learner', M()).parentElement, states: R },
  { key: 'project-recent-label', group: 'Project', title: 'Recent label', snap: 'project-dark', find: () => T('Recent', M()), states: R },
  { key: 'project-session', group: 'Project', title: 'Project task row', snap: 'project-dark', find: () => Q('.session-item', 0, M()), states: HV },
  { key: 'project-rail-card', group: 'Project', title: 'Right rail card (Instructions, Connectors)', snap: 'project-dark', find: () => CK(T('Instructions', M()), 'rounded-[12px]'), states: R, desc: '320 wide, radius 12, 1px --border-main, clickable sections that fill on hover.' },
  { key: 'project-rail-section', group: 'Project', title: 'Right rail card section', snap: 'project-dark', find: () => CK(T('Instructions', M()), 'clickable'), states: HV },
  { key: 'project-add-button', group: 'Project', title: 'Rail Add button (outline small)', snap: 'project-dark', find: () => C(T('Add', CK(T('Instructions', M()), 'rounded-[12px]')), 'button'), states: ALL },
  { key: 'project-connectors', group: 'Project', title: 'Connectors row', snap: 'project-dark', find: () => CK(T('Connectors', M()), 'clickable'), states: HV },
  { key: 'project-composer', group: 'Project', title: 'Project composer', snap: 'project-dark', find: () => P(Q('[contenteditable=true]')), states: R },

  // ---------------- Task
  { key: 'user-bubble', group: 'Task', title: 'User message bubble', snap: 'task-dark-thread-top', find: () => CK(TS('This is for my singapore', Q('.group\\/turn')), 'max-w-full overflow-hidden'), states: R, desc: 'Right-aligned, at most 662 wide, radius from --ui-density-card-radius on --fill-tsp-white-main.' },
  { key: 'user-attachment', group: 'Task', title: 'Attachment chip (in the thread)', snap: 'task-dark-thread-top', find: () => CK(T('CourseOutline_2026.docx', M()), 'group/attach'), states: HV },
  { key: 'message-time', group: 'Task', title: 'Message time', snap: 'task-dark-thread-top', find: () => Q('.group\\/turn').querySelector('.float-right'), hoverOn: () => CK(TS('This is for my singapore', Q('.group\\/turn')), 'max-w-full overflow-hidden'), states: ['hover'], desc: 'Shown with the copy button only while the message is hovered.' },
  { key: 'assistant-header', group: 'Task', title: 'Assistant turn header (logo, wordmark, Lite tag)', snap: 'task-dark-thread-top', find: () => T('Lite', M()).parentElement, states: R },
  { key: 'lite-tag', group: 'Task', title: 'Lite tag', snap: 'task-dark-thread-top', find: () => T('Lite', M()), states: R },
  { key: 'assistant-text', group: 'Task', title: 'Assistant message text', snap: 'task-dark-thread-top', find: () => TS("I've received your course outline", M()), states: R },
  { key: 'step-row', group: 'Task', title: 'Plan step row', snap: 'task-dark-thread-top', find: () => C(TS('Extract and analyze the Economy', M()), 'button'), states: ALL, desc: '28 tall, 14px --text-secondary, a 17px round dot on --fill-tsp-white-dark holding a check; the time shows on hover.' },
  { key: 'step-dot', group: 'Task', title: 'Plan step dot', snap: 'task-dark-thread-top', find: () => K('rounded-full size-[17px]', 0, C(TS('Extract and analyze the Economy', M()), 'button')), states: R },
  { key: 'message-action', group: 'Task', title: 'Message action icon button', snap: 'task-dark-thread-top', find: () => C(at(516, 472), '.cursor-pointer'), states: HV },
  { key: 'deliverable-card', group: 'Task', title: 'Deliverable card', snap: 'task-dark-completed', find: () => K('border-solid rounded-[12px] overflow-hidden', 0, M()), states: HV, desc: '570 wide, radius 12, a 0.5px --border-dark hairline on --background-menu-white; a 61 tall header (icon, 14px 500 title, download and more) over a 16:9 preview.' },
  { key: 'deliverable-header', group: 'Task', title: 'Deliverable card header', snap: 'task-dark-completed', find: () => K('border-solid rounded-[12px] overflow-hidden', 0, M()).firstElementChild, states: R },
  { key: 'deliverable-menu', group: 'Task', title: 'Deliverable more button', snap: 'task-dark-completed', find: () => { const b = K('border-solid rounded-[12px] overflow-hidden', 0, M()).firstElementChild.querySelectorAll('button'); return b[b.length - 1]; }, states: ALL },
  { key: 'deliverable-doc', group: 'Task', title: 'Deliverable card (document preview)', snap: 'task-dark-thread-top', find: () => K('border-solid rounded-[12px] overflow-hidden', 0, M()), states: R },
  { key: 'file-chip', group: 'Task', title: 'File chip', snap: 'task-dark-completed', find: () => CK(T('Markdown · 9.64 KB', M()), 'group/attach'), states: HV, desc: '280x56, radius 12, 0.5px border; a 32px file icon, name over type and size, a download button that appears on hover.' },
  { key: 'view-all-files', group: 'Task', title: 'View all files in this task button', snap: 'task-dark-completed', find: () => CK(T('View all files in this task', M()), 'cursor-pointer'), states: HV },
  { key: 'task-completed', group: 'Task', title: 'Task completed status', snap: 'task-dark-completed', find: () => CK(T('Task completed', M()), 'rounded-full'), states: R },
  { key: 'rating', group: 'Task', title: 'Rating row (How was this result?)', snap: 'task-dark-completed', find: () => T('How was this result?', M()).parentElement, states: R },
  { key: 'rating-star', group: 'Task', title: 'Rating star', snap: 'task-dark-completed', find: () => { const s = T('How was this result?', M()).parentElement.querySelector('svg'); return C(s, 'button, [role=button], span, div') || s; }, states: HV },
  { key: 'suggestion-row', group: 'Task', title: 'Follow-up suggestion row', snap: 'task-dark-completed', find: () => CK(TS('Make the process we used', M()), 'clickable'), states: HV },
  { key: 'step-footer', group: 'Task', title: 'Step footer above the composer', snap: 'task-dark-completed', find: () => CK(T('Step 4/4', M()), 'rounded-t-[22px] border'), states: R, desc: 'A rounded-top (22) card on --background-card-gray tucked 20px under the composer, with a thumbnail of the computer, the current step and "Step 4/4".' },
  { key: 'step-footer-row', group: 'Task', title: 'Step footer row', snap: 'task-dark-completed', find: () => CK(T('Step 4/4', M()), 'clickable group'), states: HV },
  { key: 'step-footer-count', group: 'Task', title: 'Step count', snap: 'task-dark-completed', find: () => T('Step 4/4', M()), states: R },
  { key: 'side-panel', group: 'Task', title: 'Side panel', snap: 'task-dark-side-panel', find: () => W(at(1150, 500), 569), states: R, pad: 0, desc: '570 wide at 1440, beside a 570 thread column, split by a 1px handle that widens to 5px blue on hover.' },
  { key: 'side-panel-tabbar', group: 'Task', title: 'Side panel tab bar', snap: 'task-dark-side-panel', find: () => CK(Q('[data-context-menu=sidebar-tab]'), 'h-[48px]'), states: R },
  { key: 'side-panel-tab', group: 'Task', title: 'Side panel tab', snap: 'task-dark-side-panel', find: () => Q('[data-context-menu=sidebar-tab]'), states: HV },
  { key: 'side-panel-launcher', group: 'Task', title: 'New tab launcher (+ and chevron)', snap: 'task-dark-side-panel', find: () => K('group/launcher'), states: HV },
  { key: 'new-tab-empty', group: 'Task', title: 'New tab empty state', snap: 'task-dark-side-panel', find: () => T('New tab').parentElement, states: R },
  { key: 'start-tile', group: 'Task', title: 'Start from scratch tile', snap: 'task-dark-side-panel', find: () => CK(T('Files'), 'min-h-[72px]'), states: HV },
  { key: 'resize-handle', group: 'Task', title: 'Thread/panel resize handle', snap: 'task-dark-side-panel', find: () => K('mx-auto h-full w-px'), hoverOn: () => K('mx-auto h-full w-px').parentElement, states: HV, crop: false },
  { key: 'file-tree', group: 'Task', title: 'Files tab tree', snap: 'task-dark-files-tab', find: () => Q('aside'), states: R },
  { key: 'file-tree-header', group: 'Task', title: 'Files tab tree header', snap: 'task-dark-files-tab', find: () => C(T('Files in this task', Q('aside')), 'button'), states: ALL },
  { key: 'file-tree-item', group: 'Task', title: 'Files tab tree item', snap: 'task-dark-files-tab', find: () => Q('[data-context-menu=file-preview-sidebar-file]'), states: ALL },
  { key: 'preview-empty', group: 'Task', title: 'Select a file to preview', snap: 'task-dark-files-tab', find: () => T('Select a file to preview').parentElement, states: R },

  // ---------------- Mobile
  { key: 'm-app-banner', group: 'Mobile', title: 'App banner', snap: 'mobile-home-dark', find: () => CK(T('Manus app'), 'fixed'), states: R },
  { key: 'm-open-app', group: 'Mobile', title: 'Open app button', snap: 'mobile-home-dark', find: () => C(T('Open app'), 'button'), states: R },
  { key: 'm-header', group: 'Mobile', title: 'Mobile header row', snap: 'mobile-home-dark', find: () => W(C(T('Manus 2.0 Lite', M()), '.clickable'), 358), states: R },
  { key: 'm-hero-title', group: 'Mobile', title: 'Hero title (serif)', snap: 'mobile-home-dark', find: () => Q('h1', 0, M()), states: R },
  { key: 'm-composer', group: 'Mobile', title: 'Mobile composer', snap: 'mobile-home-dark', find: () => P(Q('[contenteditable=true]')), states: R },
  { key: 'm-chip', group: 'Mobile', title: 'Suggestion chip', snap: 'mobile-home-dark', find: () => Q('[role=button].rounded-full', 0, M()), states: R },
  { key: 'm-carousel-card', group: 'Mobile', title: 'Carousel card', snap: 'mobile-home-dark', find: () => CK(TS('Personalize your', M()), 'w-[540px]'), states: R },
  { key: 'm-carousel-dot', group: 'Mobile', title: 'Carousel dot', snap: 'mobile-home-dark', find: () => Q('button.size-2'), states: R, extra: { active: { find: () => [...document.querySelectorAll('button.size-2')].find((b) => /icon-disable/.test(b.className)) } } },
  { key: 'm-drawer', group: 'Mobile', title: 'Drawer', snap: 'mobile-home-dark-drawer', find: () => Q('nav'), states: R, pad: 0 },
  { key: 'm-drawer-scrim', group: 'Mobile', title: 'Drawer scrim', snap: 'mobile-home-dark-drawer', find: () => K('absolute inset-0 z-[15]', 0, M()), states: R, crop: false },
  { key: 'm-library-header', group: 'Mobile', title: 'Mobile Library header', snap: 'mobile-library-dark', find: () => CK(Q('h1', 0, M()), '@container'), states: R },
  { key: 'm-type-dropdown', group: 'Mobile', title: 'Type dropdown button', snap: 'mobile-library-dark', find: () => C(T('All', M()), 'button'), states: R, extra: { open: { snap: 'mobile-library-dark-type-menu', find: () => C(T('All', M()), 'button') } } },
  { key: 'm-type-menu', group: 'Mobile', title: 'Type menu', snap: 'mobile-library-dark-type-menu', find: () => D().firstElementChild, states: R },
  { key: 'm-type-menu-item', group: 'Mobile', title: 'Type menu item', snap: 'mobile-library-dark-type-menu', find: () => CK(T('Slides', D()), 'rounded-[8px]'), states: R, extra: { checked: { find: () => CK(T('All', D()), 'rounded-[8px]') } } },
  { key: 'm-file-row', group: 'Mobile', title: 'Mobile file row', snap: 'mobile-library-dark', find: () => Q('[role=button].group', 0, M()), states: R },
  { key: 'm-task-deliverable', group: 'Mobile', title: 'Mobile deliverable card', snap: 'mobile-task-dark', find: () => K('border-solid rounded-[12px] overflow-hidden', 0, M()), prep: () => K('border-solid rounded-[12px] overflow-hidden', 0, M()).scrollIntoView({ block: 'center', behavior: 'instant' }), states: R, desc: 'Scrolled to the middle of the viewport first: at the captured scroll it sits under the fixed app banner.' },
  { key: 'm-app-gate', group: 'Mobile', title: 'App gate screen', snap: 'mobile-home-dark-app-gate', find: () => K('fixed inset-0 z-[1]'), states: R, pad: 0 },
  { key: 'm-gate-download', group: 'Mobile', title: 'Download app button (large black)', snap: 'mobile-home-dark-app-gate', find: () => C(T('Download app'), 'button'), states: R },
  { key: 'm-gate-continue', group: 'Mobile', title: 'Continue with web link', snap: 'mobile-home-dark-app-gate', find: () => C(T('Continue with web'), 'button'), states: R },
];

// ---------------------------------------------------------------- jobs

function jobsFor(spec) {
  const out = [];
  for (const st of spec.states) out.push({ state: st, base: st, snap: spec.snap, find: spec.find, hoverOn: spec.hoverOn, focusOn: spec.focusOn, prep: spec.prep });
  for (const [name, v] of Object.entries(spec.extra || {})) {
    out.push({ state: name, base: 'default', snap: v.snap || spec.snap, find: v.find, variant: true });
    for (const st of v.states || []) out.push({ state: `${name}-${st}`, base: st, snap: v.snap || spec.snap, find: v.find, variant: true });
  }
  return out;
}

const MOBILE = (label) => label.startsWith('mobile-');

async function measureSnap(browser, label, specs, out) {
  const meta = metaOf(label);
  const ctx = await newContext(browser, meta);
  await ctx.addInitScript(HELPERS);
  let page;
  try {
    page = await openSnap(ctx, label);
  } catch (e) {
    log('  ! open failed', label, e.message.split('\n')[0]);
    await ctx.close();
    return;
  }
  const rest = { x: meta.w - 2, y: Math.round(meta.h / 2) };
  await page.evaluate(() => window.__saveScroll());
  const resetPage = async () => {
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await page.mouse.move(rest.x, rest.y);
    await page.evaluate(() => { window.__restoreScroll(); window.__freeze(); });
    await page.waitForTimeout(200);
  };
  const tag = async (fn, name) => {
    if (!fn) return null;
    const h = await page.evaluateHandle(`(() => { try { return (${fn.toString()})(); } catch (e) { return null; } })()`);
    const el = h.asElement();
    if (!el) return null;
    await el.evaluate((e, n) => e.setAttribute(`data-mt-${n}`, ''), name);
    return page.locator(`[data-mt-${name}]`).first();
  };
  const untag = () => page.evaluate(() => document.querySelectorAll('*').forEach((n) => { for (const a of [...n.attributes]) if (a.name.startsWith('data-mt-')) n.removeAttribute(a.name); }));
  const ensureVisible = (loc) => loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) el.scrollIntoView({ block: r.height > innerHeight ? 'start' : 'center', inline: 'nearest', behavior: 'instant' });
  });
  const pointOf = (loc) => loc.evaluate((el) => {
    const r = [...el.getClientRects()].find((x) => x.width > 0 && x.height > 0) || el.getBoundingClientRect();
    return { x: r.x + Math.min(r.width / 2, 40), y: r.y + Math.min(r.height / 2, 20) };
  });
  const kbFocus = async (loc) => {
    const ok0 = await loc.evaluate((el) => window.__isFocusable(el));
    if (!ok0) return { ok: false, how: 'not focusable in the static copy (no tabindex)' };
    await loc.evaluate((el) => el.focus());
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    let ok = await loc.evaluate((el) => document.activeElement === el);
    let how = 'keyboard: focus(), Shift+Tab, Tab';
    if (!ok) {
      await page.keyboard.press('Shift');
      await loc.evaluate((el) => el.focus());
      ok = await loc.evaluate((el) => document.activeElement === el);
      how = 'keyboard: Shift keydown, then focus()';
    }
    await page.waitForTimeout(350);
    return { ok, how, matches: await loc.evaluate((el) => el.matches(':focus-visible')) };
  };
  const crop = async (loc, name, pad) => {
    const vp = page.viewportSize();
    const box = await loc.boundingBox();
    if (!box) throw new Error('no box');
    const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad) };
    clip.width = Math.min(vp.width, box.x + box.width + pad) - clip.x;
    clip.height = Math.min(vp.height, box.y + box.height + pad) - clip.y;
    if (clip.width < 1 || clip.height < 1) throw new Error('off screen');
    const file = path.join(CROPS, `${name}.png`);
    await page.screenshot({ path: file, clip, animations: 'allow' });
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nf=sys.argv[1]\nim=Image.open(f).convert("RGB")\nif im.width>1600: im=im.resize((im.width//2, im.height//2), Image.LANCZOS)\nim.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True)', file]);
    return path.relative(REF, file);
  };

  for (const theme of ['dark', 'light']) {
    if (theme === 'light') {
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
      await page.waitForTimeout(600);
    }
    for (const { spec, job } of specs) {
      const state = theme === 'dark' ? job.state : job.state === 'default' ? 'light' : `light-${job.state}`;
      const c = out.components[spec.key];
      const name = `${spec.key}-${state}`;
      if (MOBILE(label) && job.base === 'hover') continue;
      try {
        await resetPage();
        if (job.prep) { await page.evaluate(`(${job.prep.toString()})()`); await page.waitForTimeout(250); }
        const loc = await tag(job.find, 'el');
        if (!loc) throw new Error('element not found');
        await ensureVisible(loc);
        let via = job.variant && job.base === 'default' ? `at rest, captured ${job.state}` : 'at rest';
        let focus;
        if (job.base === 'hover') {
          const hl = (job.hoverOn && (await tag(job.hoverOn, 'hv'))) || loc;
          const p = await pointOf(hl);
          await page.mouse.move(p.x, p.y, { steps: 4 });
          // A second, sub-pixel move: an element revealed by group-hover only takes :hover itself
          // once the pointer moves again.
          await page.waitForTimeout(80);
          await page.mouse.move(p.x + 0.5, p.y);
          await page.waitForTimeout(450);
          via = job.hoverOn ? 'mouse hover on its row' : 'mouse hover';
        } else if (job.base === 'focus-visible') {
          let fl = job.focusOn ? await tag(job.focusOn, 'fo') : null;
          if (!fl) {
            const h = await loc.evaluateHandle((el) => window.__focusTarget(el));
            if (h.asElement()) { await h.asElement().evaluate((e) => e.setAttribute('data-mt-fo', '')); fl = page.locator('[data-mt-fo]').first(); }
          }
          focus = fl ? await kbFocus(fl) : { ok: false, how: 'not focusable in the static copy (no tabindex)' };
          if (!focus.ok) { c.states[state] = { theme, snapshot: label, skipped: focus.how }; log('  -', name, 'skipped:', focus.how); continue; }
          via = focus.how + (fl && !(await fl.evaluate((e) => e.hasAttribute('data-mt-el'))) ? ' (on the field inside)' : '');
        }
        const s = await loc.evaluate(styleOf, PROPS);
        if (focus) s.focus = focus;
        // Is something else painted over the element's centre? (Then its crop shows that instead.)
        const hit = await loc.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const x = Math.min(Math.max(r.x + r.width / 2, 1), innerWidth - 1);
          const y = Math.min(Math.max(r.y + r.height / 2, 1), innerHeight - 1);
          const h = document.elementFromPoint(x, y);
          if (!h || el.contains(h) || h.contains(el)) return null;
          return h.tagName.toLowerCase() + '.' + String(h.className).split(/\s+/).slice(0, 3).join('.');
        });
        if (hit) { s.occludedBy = hit.slice(0, 120); log('  ?', name, 'centre covered by', hit.slice(0, 80)); }
        if (spec.crop !== false) {
          try { s.crop = await crop(loc, name, spec.pad ?? 8); } catch (e) { s.cropError = String(e.message || e).slice(0, 120); }
        }
        c.states[state] = { theme, snapshot: label, ...s, via };
        if (job.find !== spec.find) (c.selectors ||= {})[state] = job.find.toString();
        log('  ', name, `${s.rect.w}x${s.rect.h}`, via.slice(0, 50));
      } catch (e) {
        c.states[state] = { theme, snapshot: label, error: String(e.message || e).slice(0, 200) };
        log('  !', name, String(e.message || e).slice(0, 120));
      } finally {
        await page.mouse.move(rest.x, rest.y).catch(() => {});
        await untag().catch(() => {});
      }
    }
  }
  await ctx.close();
}

// ---------------------------------------------------------------- main

const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const labels = [...new Set(SPECS.flatMap((s) => jobsFor(s).map((j) => j.snap)))].filter((l) => !ONLY.length || ONLY.includes(l));
out._meta = {
  read: new Date().toISOString().slice(0, 10),
  source: 'Static, redacted DOM snapshots of the signed-in manus.im app (tools/capture/signed-in/snapshot.js), loaded from file:// in headless Chromium; Manus\'s stylesheets, fonts and images come from its CDN through a local cache. Nothing was requested from manus.im.',
  viewport: '1440x900 (the mobile-* snapshots 390x844), deviceScaleFactor 2',
  themes: 'Each snapshot was captured in the dark theme. Dark states have plain names; light states (`light`, `light-<state>`) were read from the same DOM with the `dark` class removed from <html>. Every state records `theme` and `snapshot`.',
  states: {
    default: 'at rest, as captured',
    hover: 'real mouse hover (page.mouse.move), 450ms settle; not measured on the 390 snapshots',
    'focus-visible': 'real keyboard focus (focus, Shift+Tab, Tab) on the element or its first focusable descendant; recorded as skipped where the element cannot take focus',
    other: 'active / selected / checked / open / typed / enabled / ... are other elements or snapshots captured in that state',
  },
  tokens: '`vars` lists every var(--x) named in the classes of the element and its first descendants, resolved in that state\'s theme.',
  snapshots: { ...(out._meta && out._meta.snapshots), ...Object.fromEntries(labels.map((l) => { const m = metaOf(l); return [l, { url: m.url, title: m.title, w: m.w, h: m.h, ...(SCROLL[l] ? { scroll: SCROLL[l] } : {}) }]; })) },
};
out.components ??= {};
fs.mkdirSync(CROPS, { recursive: true });

// Build the per-snapshot job lists, resetting the states that will be re-measured.
const bySnap = new Map();
for (const spec of SPECS) {
  const c = (out.components[spec.key] ??= { states: {} });
  Object.assign(c, { group: spec.group, title: spec.title, desc: spec.desc, page: spec.snap, selector: spec.find.toString() });
  const jobs = jobsFor(spec);
  c.pages = [...new Set(jobs.map((j) => j.snap))];
  for (const job of jobs) {
    if (!labels.includes(job.snap)) continue;
    delete c.states[job.state];
    delete c.states[job.state === 'default' ? 'light' : `light-${job.state}`];
    if (!bySnap.has(job.snap)) bySnap.set(job.snap, []);
    bySnap.get(job.snap).push({ spec, job });
  }
}

const browser = await chromium.launch();
const queue = [...bySnap.keys()].sort();
const save = () => {
  // Stable order: components in SPECS order, states in the order the spec lists them, dark then light.
  const comps = {};
  for (const spec of SPECS) {
    const c = out.components[spec.key];
    const names = jobsFor(spec).map((j) => j.state);
    const ordered = {};
    for (const n of names) if (c.states[n]) ordered[n] = c.states[n];
    for (const n of names) { const l = n === 'default' ? 'light' : `light-${n}`; if (c.states[l]) ordered[l] = c.states[l]; }
    comps[spec.key] = { ...c, states: ordered };
  }
  fs.writeFileSync(OUT, JSON.stringify({ _meta: out._meta, components: comps }, null, 1) + '\n');
};
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, async () => {
  while (queue.length) {
    const label = queue.shift();
    log('open', label, `(${bySnap.get(label).length} jobs x 2 themes)`);
    await measureSnap(browser, label, bySnap.get(label), out);
    save();
  }
}));
await browser.close();
save();
const all = SPECS.map((sp) => out.components[sp.key]);
const states = all.flatMap((c) => Object.values(c.states));
log(`${all.length} components, ${states.length} states (${states.filter((s) => s.error).length} errors, ${states.filter((s) => s.skipped).length} skipped)`);
