// Measures ChatGPT's signed-in components from the static page copies (see render.mjs, unsnap.py),
// in both themes and in every state CSS can reach once scripts are gone.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs SNAPS=<dir of page copies> node tools/capture/signed-in/measure.mjs [label ...] [--jobs N]
//
// With labels, only the components (and states) that live on those copies are re-measured and
// merged into the existing JSON. Writes raw/components-computed.json and one crop per component
// and state into components/crops/<component>-<state>.png (2x, 256 colours, halved when wider than
// 1600px). raw/measurements.md is then built from the JSON by build-measurements.mjs.
//
// Themes: ChatGPT declares its light palette on `html, .light, .dark .light` and its dark one on
// `.dark`, and puts `dark` on <html> and again on each message's markdown body, so each copy
// (captured in dark) is measured once as captured and once with every `dark` class removed, which
// is what render.mjs does for the light screenshots. Dark states keep their plain names
// (`default`, `hover`, ...); light states are `light`, `light-hover`, `light-focus-visible`, ...
// and every state records `theme`.
//
// States:
//   default        at rest, as captured
//   hover          real mouse hover (page.mouse.move), 450ms settle; Tailwind's hover: variants
//                  are plain CSS, so they apply on the static copy
//   focus-visible  real keyboard focus: focus(), Shift+Tab, Tab (or a Shift keydown then focus()),
//                  on the element or its first focusable descendant; ChatGPT draws most focus
//                  rings from `keyboard-focused:` variants that its script switches on, so many
//                  record the plain :focus-visible look only
//   anything else  another element, or another copy, captured in that state: `active` (the
//                  current page or chat), `selected`, `checked`, `open`, `typed`, ...
// No click is dispatched anywhere; the copies have no scripts and every request off the asset
// hosts is refused (lib.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, REF, RAW, CROPS, SNAPS, SCROLL, metaOf, newContext, openSnap, toLight } from './lib.mjs';

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
//   D()               the last visible [role=dialog];  M() main#main;  S() the sidebar;  RAIL() the tiny rail
//   PW(el, w)         el's first painted ancestor at least `w` px wide (a popover or dialog panel)
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
    M: () => document.querySelector('main#main') || document.querySelector('main'),
    // The expanded sidebar (the phone drawer on the 390 copies) and the tiny rail behind it.
    S: () => document.querySelector('#stage-slideover-sidebar') || document.querySelector('#stage-popover-sidebar'),
    RAIL: () => document.querySelector('#stage-sidebar-tiny-bar'),
    // el's first ancestor at least `w` wide that paints a fill, border or shadow (a popover panel).
    PW: (el, w) => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (n.getBoundingClientRect().width >= w - 0.5 && paints(n)) return n; return null; },
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
  // ChatGPT names its tokens three ways in a class: `bg-token-text-primary` (Tailwind theme keys
  // that read `--text-primary`), `bg-(--sidebar-surface-primary)` and `[var(--x)]`; the inline
  // `--menu-item-*` variables a row sets are read too.
  for (const n of [el, ...el.querySelectorAll('*')].slice(0, 60)) {
    const c = cls(n);
    for (const m of c.matchAll(/var\((--[\w-]+)/g)) names.add(m[1]);
    for (const m of c.matchAll(/\((--[\w-]+)\)/g)) names.add(m[1]);
    for (const m of c.matchAll(/(?:^|[\s:!])[a-z-]*?-?token-([a-z0-9-]+?)(?:\/\d+)?(?=\s|$|!)/g)) names.add('--' + m[1]);
    const st = n.getAttribute && n.getAttribute('style');
    if (st) for (const m of st.matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1]);
  }
  if (names.size) {
    out.vars = {};
    const root = getComputedStyle(el);
    for (const n of [...names].sort()) { const v = root.getPropertyValue(n).trim(); if (v) out.vars[n] = v; }
    if (!Object.keys(out.vars).length) delete out.vars;
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
  { key: 'sidebar', group: 'Sidebar', title: 'Sidebar (expanded)', snap: 'home-dark', find: () => S(), states: R, pad: 0, desc: '`#stage-slideover-sidebar`, 260 wide (`--sidebar-width`), `--sidebar-surface-primary` fill and a 1px `--border-extra-light` rule at the inline end. The header and the account row are sticky inside it.' },
  { key: 'sidebar-header', group: 'Sidebar', title: 'Sidebar header row', snap: 'home-dark', find: () => Q('#sidebar-header', 0, S()), states: R, desc: '52 tall (`--header-height`): the ChatGPT wordmark at the start, search and close icon buttons at the end.' },
  { key: 'sidebar-wordmark', group: 'Sidebar', title: 'Wordmark link (ChatGPT)', snap: 'home-dark', find: () => C(T('ChatGPT', S()), 'a'), states: ALL, desc: 'The only place the UI sets OpenAI Sans: `.header-wordmark`, 600 weight, -0.015em tracking.' },
  { key: 'sidebar-icon-button', group: 'Sidebar', title: 'Sidebar icon button (Search)', snap: 'home-dark', find: () => Q('button[aria-label="Search"]', 0, S()), states: ALL, desc: '36x36, radius 8, `--text-tertiary` icon; hover fills with `--surface-hover`.' },
  { key: 'sidebar-close-button', group: 'Sidebar', title: 'Close sidebar button', snap: 'home-dark', find: () => Q('[data-testid=close-sidebar-button]', 0, S()), states: HV },
  {
    key: 'nav-row', group: 'Sidebar', title: 'Nav row (Images)', snap: 'home-dark', find: () => Q('[data-testid=sidebar-item-library]', 0, S()), states: ALL,
    desc: 'A `.__menu-item` row, 36 tall, radius 10, 20px icon and 14/20 text, inset 6px from the sidebar edges. Its fills come from inline `--menu-item-*` variables pointing at `--interactive-bg-secondary-*`. The current page gets the selected fill (`active`).',
    extra: { active: { find: () => Q('[data-testid=create-new-chat-button]', 0, S()), states: ['hover'] }, 'active-library': { snap: 'library-dark', find: () => Q('[data-testid=sidebar-item-recall]', 0, S()) } },
  },
  { key: 'nav-row-icon', group: 'Sidebar', title: 'Nav row icon', snap: 'home-dark', find: () => Q('[data-testid=sidebar-item-library] svg', 0, S()), states: R, desc: 'A sprite `<use>` icon, drawn in currentColor.' },
  { key: 'section-label', group: 'Sidebar', title: 'Section label (Pinned)', snap: 'home-dark', find: () => C(T('Pinned', S()), 'button'), states: ALL, desc: 'A collapsible header: `.__menu-label` text in `--text-tertiary`; the row shows a chevron on hover.' },
  { key: 'section-label-text', group: 'Sidebar', title: 'Section label text', snap: 'home-dark', find: () => Q('h2.__menu-label', 0, S()), states: R },
  {
    key: 'chat-row', group: 'Sidebar', title: 'Chat row (pinned)', snap: 'home-dark', find: () => C(T('[CTX] Internship Reflections', S()), 'a'), states: ALL,
    desc: 'Pinned chats carry a speech-bubble icon; plain history rows (Chats) have none. Hover reveals the options button at the end. The open chat gets the selected fill (`active`).',
    extra: { active: { snap: 'thread-dark-table', find: () => C(T('[P] KL Hikes', S()), 'a') } },
  },
  { key: 'history-row', group: 'Sidebar', title: 'History row (Chats)', snap: 'home-dark', find: () => C(T('List Singapore celebrations', S()), 'a'), states: HV },
  { key: 'chat-row-options', group: 'Sidebar', title: 'Chat row options button', snap: 'home-dark', find: () => S().querySelector('[data-testid=history-item-0-options]'), hoverOn: () => C(T('List Singapore celebrations', S()), 'a'), states: ['hover'], desc: 'Hidden until its row is hovered; measured while the row is hovered.' },
  { key: 'project-row', group: 'Sidebar', title: 'Project row', snap: 'home-dark', find: () => C(T('Introspection', S()), '[role=button]'), states: ALL, desc: 'Each project keeps its own icon and colour; hover reveals "Open project home" and options.', extra: { active: { snap: 'project-dark', find: () => C(T('Research', S()), '[role=button]') } } },
  { key: 'account-row', group: 'Sidebar', title: 'Account row', snap: 'home-dark', find: () => Q('[data-testid=accounts-profile-button]', 0, S()), states: HV, desc: '52 tall: a 24px avatar, the name over the plan in `--text-tertiary`, and the Upgrade pill at the end; sticky at the bottom over a hairline.', extra: { open: { snap: 'home-dark-user-menu', find: () => Q('[data-testid=accounts-profile-button]', 0, S()) } } },
  { key: 'avatar', group: 'Sidebar', title: 'Avatar', snap: 'home-dark', find: () => Q('[data-testid=accounts-profile-button] .rounded-full', 0, S()), states: R, desc: 'Redacted to a grey disc with an L; the real one is the account photo at 24px.' },
  { key: 'sidebar-upgrade', group: 'Sidebar', title: 'Upgrade pill (account row)', snap: 'home-dark', find: () => C(T('Upgrade', S()), 'button'), states: ALL, desc: 'An outline pill: a `--border-default` ring, 13px 500 text.' },
  { key: 'sidebar-rail', group: 'Sidebar', title: 'Sidebar collapsed to the tiny rail', snap: 'home-dark-sidebar-collapsed', find: () => RAIL(), states: R, pad: 0, desc: '`#stage-sidebar-tiny-bar`, 52 wide (`--sidebar-rail-width`, 13 spacing units): open sidebar, new chat, search, images, library, then the avatar at the bottom.' },
  { key: 'rail-button', group: 'Sidebar', title: 'Rail button (New chat)', snap: 'home-dark-sidebar-collapsed', find: () => Q('[data-testid=create-new-chat-button]', 0, RAIL()), states: ALL },
  { key: 'rail-open-sidebar', group: 'Sidebar', title: 'Rail open-sidebar button', snap: 'home-dark-sidebar-collapsed', find: () => Q('button[aria-label="Open sidebar"]', 0, RAIL()), states: HV },

  // ---------------- Top bar
  { key: 'page-header', group: 'Top bar', title: 'Page header', snap: 'home-dark', find: () => Q('#page-header'), states: R, pad: 0, desc: '52 tall, sticky, 8px padding; the mode toggle centred, actions at the end.' },
  { key: 'mode-toggle', group: 'Top bar', title: 'Chat / Work segmented toggle', snap: 'home-dark', find: () => P(Q('#page-header [role=radio]').parentElement), states: R, desc: 'A pill track with two 130x36 radio segments; the selected one carries a filled thumb.' },
  { key: 'mode-segment', group: 'Top bar', title: 'Mode segment (Work, not selected)', snap: 'home-dark', find: () => Q('#page-header [role=radio][aria-checked=false]'), states: ALL, desc: 'Work is drawn in the accent blue with a sparkle.', extra: { selected: { find: () => Q('#page-header [role=radio][aria-checked=true]'), states: ['hover'] } } },
  { key: 'header-upgrade', group: 'Top bar', title: 'Upgrade button (header)', snap: 'home-dark', find: () => Q('#page-header .button-glimmer-cta'), states: ALL, desc: 'Transparent pill, accent-blue sparkle and label (`.button-glimmer-cta`).' },
  { key: 'header-icon-button', group: 'Top bar', title: 'Header icon button (Temporary chat)', snap: 'home-dark', find: () => Q('#page-header button[aria-label="Temporary chat"]'), states: ALL },
  { key: 'share-button', group: 'Top bar', title: 'Share button (thread)', snap: 'thread-dark-table', find: () => Q('[data-testid=share-chat-button]'), states: ALL },
  { key: 'conversation-options', group: 'Top bar', title: 'Conversation options (…) button', snap: 'thread-dark-table', find: () => Q('[data-testid=conversation-options-button]'), states: HV },

  // ---------------- Home and composer
  { key: 'home-heading', group: 'Home', title: 'Home heading', snap: 'home-dark', find: () => Q('h1', 0, M()), states: R, desc: '`text-heading-2` at 400 weight (28/34 here), centred over the composer.' },
  {
    key: 'composer', group: 'Composer', title: 'Composer', snap: 'home-dark', find: () => P(Q('#prompt-textarea')), focusOn: () => Q('#prompt-textarea'), states: ['default', 'focus-visible'],
    desc: 'A pill on the home page (radius 28, 768 wide, `--composer-bar_width`), one row: + button, the ProseMirror field, Think chip, dictation, voice. `--bg-primary` fill (#212121 dark) with a hairline shadow.',
    extra: { typed: { snap: 'home-dark-composer-typed', find: () => P(Q('#prompt-textarea')) }, thread: { snap: 'thread-dark-bottom', find: () => P(Q('#prompt-textarea')) }, project: { snap: 'project-dark', find: () => P(Q('#prompt-textarea')) }, images: { snap: 'images-dark', find: () => P(Q('#prompt-textarea')) } },
  },
  { key: 'composer-placeholder', group: 'Composer', title: 'Composer placeholder', snap: 'home-dark', find: () => Q('#prompt-textarea p'), states: R, desc: '"Ask anything", drawn by `p[data-placeholder]::before`.' },
  { key: 'composer-plus', group: 'Composer', title: 'Composer + button', snap: 'home-dark', find: () => Q('#composer-plus-btn'), states: ALL, desc: '36x36 round `.composer-btn`.' },
  { key: 'think-chip', group: 'Composer', title: 'Think chip', snap: 'home-dark', find: () => Q('.__composer-pill'), states: ALL, desc: '`.__composer-pill--neutral`: 36 tall, full radius, brain icon and 16px label.', extra: { thread: { snap: 'thread-dark-bottom', find: () => Q('.__composer-pill') } } },
  { key: 'dictation-button', group: 'Composer', title: 'Dictation button', snap: 'home-dark', find: () => Q('button[aria-label="Start dictation"]'), states: HV },
  { key: 'voice-button', group: 'Composer', title: 'Voice button', snap: 'home-dark', find: () => Q('button[aria-label="Start Voice"]'), states: ALL, desc: '36x36 circle in `--theme-submit-btn-bg`, the accent (blue-500 dark, blue-400 light).' },
  { key: 'send-button', group: 'Composer', title: 'Send button (typed)', snap: 'home-dark-composer-typed', find: () => Q('[data-testid=send-button]'), states: ALL, desc: 'Replaces the voice button once there is text: same circle and accent, an up arrow.' },
  { key: 'suggestion-row', group: 'Home', title: 'Suggestion row', snap: 'home-dark', find: () => C(T('Create an image or sticker'), 'button'), states: ALL, desc: '768x52 rows under the composer, icon and 16px secondary text; hover fills with `text-primary` at 3%.' },

  // ---------------- Thread
  { key: 'user-bubble', group: 'Thread', title: 'User message bubble', snap: 'thread-dark-user-turn', find: () => P(TS('Compile these into')), states: R, desc: 'Right-aligned, max 70% (`--user-chat-width`), radius 22, padding 10/16, with `--theme-user-msg-bg` / `--theme-user-msg-text`: the blue accent paints it blue-700 on blue-25 dark, blue-50 on blue-900 light. `data-ds-colored-user-message-bubbles` on <html> switches the colouring on.' },
  { key: 'markdown', group: 'Thread', title: 'Assistant markdown body', snap: 'thread-dark-table', find: () => Q('.markdown'), states: R, pad: 0, desc: 'The `.markdown.prose` block, 768 wide, 16/28 body.' },
  { key: 'md-paragraph', group: 'Thread', title: 'Markdown paragraph', snap: 'thread-dark-table', find: () => Q('.markdown p'), states: R },
  { key: 'md-h3', group: 'Thread', title: 'Markdown h3', snap: 'thread-dark-table', find: () => Q('.markdown h3'), states: R },
  { key: 'md-strong', group: 'Thread', title: 'Markdown strong', snap: 'thread-dark-table', find: () => Q('.markdown strong'), states: R },
  { key: 'md-table', group: 'Thread', title: 'Markdown table', snap: 'thread-dark-table', find: () => Q('.markdown table'), states: R },
  { key: 'md-th', group: 'Thread', title: 'Table header cell', snap: 'thread-dark-table', find: () => Q('.markdown th'), states: R },
  { key: 'md-td', group: 'Thread', title: 'Table cell', snap: 'thread-dark-table', find: () => Q('.markdown td'), states: R },
  { key: 'citation-pill', group: 'Thread', title: 'Citation pill', snap: 'thread-dark-table', find: () => Q('[data-testid=webpage-citation-pill]'), states: HV, desc: 'Inline source chip after a sentence: favicon, domain and a +n count.' },
  { key: 'worked-for', group: 'Thread', title: '"Worked for 22s" disclosure', snap: 'thread-dark-user-turn', find: () => C(TS('Worked for'), 'button') || TS('Worked for'), states: HV, desc: 'The collapsed reasoning header above an answer, secondary text and a chevron.' },
  { key: 'map-widget', group: 'Thread', title: 'Map widget (iframe, kept as a box)', snap: 'thread-dark-user-turn', find: () => Q('[data-testid=businesses-map-widget]'), states: R, desc: 'An iframe in the product; the copy keeps a same-size dark box. Its frame and radius are real, its contents are not.' },
  { key: 'turn-action', group: 'Thread', title: 'Turn action button (Copy)', snap: 'thread-dark-bottom', find: () => document.querySelector('[data-testid=copy-turn-action-button]'), hoverOn: () => C(document.querySelector('[data-testid=copy-turn-action-button]'), 'section'), states: ['hover'], desc: 'Copy, read aloud, share and more sit under an answer at opacity 0 and appear when the turn is hovered; measured while the turn is hovered.' },
  { key: 'thread-disclaimer', group: 'Thread', title: 'Thread disclaimer', snap: 'thread-dark-bottom', find: () => Q('[data-testid=thread-disclaimer]'), states: R },

  // ---------------- Menus
  { key: 'plus-menu', group: 'Menus', title: 'Composer + menu', snap: 'home-dark-plus-menu', find: () => C(T('Add photos & files'), '.popover'), states: R, desc: 'Opens below the composer at its full width: a row per action with a title and a grey hint, then the installed plugins, then "Type to search…".' },
  { key: 'plus-menu-item', group: 'Menus', title: '+ menu item', snap: 'home-dark-plus-menu', find: () => C(T('Add from library'), '.__menu-item'), states: HV, desc: '36 tall, radius 12, inset 8px; the first row opens highlighted with the `--interactive-bg-secondary-hover` fill.', extra: { highlighted: { find: () => C(T('Add photos & files'), '.__menu-item') } } },
  { key: 'chat-menu', group: 'Menus', title: 'Chat row menu', snap: 'home-dark-chat-menu', find: () => Q('[role=menu]'), states: R, desc: '`.popover`, `--main-surface-primary` fill (#353535 in dark), radius 16; Share, Rename, Pin chat, Archive, Delete (danger), Move to project.' },
  { key: 'menu-item', group: 'Menus', title: 'Menu item', snap: 'home-dark-chat-menu', find: () => Q('[role=menu] [role=menuitem]', 1), states: HV, desc: '`.__menu-item`, 36 tall, radius 10, icon and 14px label.' },
  { key: 'menu-item-danger', group: 'Menus', title: 'Menu item (danger)', snap: 'home-dark-chat-menu', find: () => Q('[data-testid=delete-chat-menu-item]'), states: HV },
  { key: 'menu-separator', group: 'Menus', title: 'Menu separator', snap: 'home-dark-chat-menu', find: () => Q('[role=menu] [role=separator]'), states: R },
  { key: 'user-menu', group: 'Menus', title: 'User menu', snap: 'home-dark-user-menu', find: () => Q('[role=menu]'), states: R, desc: 'Opens upward over the account row at its width: the account, Upgrade plan, Personalization, Profile, Settings, Help, Log out.' },
  { key: 'accent-menu', group: 'Menus', title: 'Accent colour menu', snap: 'settings-dark-accent-menu', find: () => C(T('Purple'), '[role=menu],[role=listbox]'), states: R, desc: 'Default, Blue, Green, Yellow, Pink, Orange, Purple, White (`data-chat-theme="black"`), each with a 10px dot.' },
  { key: 'accent-option', group: 'Menus', title: 'Accent option', snap: 'settings-dark-accent-menu', find: () => C(T('Green'), '[role=menuitemradio],[role=option],[role=menuitem]'), states: HV, extra: { checked: { find: () => C(T('Blue', C(T('Purple'), '[role=menu],[role=listbox]')), '[role=menuitemradio],[role=option],[role=menuitem]') } } },
  { key: 'model-menu', group: 'Menus', title: 'Model menu (phone)', snap: 'mobile-thread-dark-model-menu', find: () => C(T('ChatGPT Plus'), '[role=menu]'), states: R, desc: 'ChatGPT Plus with an Upgrade pill, and ChatGPT (checked).' },

  // ---------------- Search dialog
  { key: 'search-dialog', group: 'Search', title: 'Search dialog', snap: 'home-dark-search', find: () => C(Q('#global-search-modal-input'), '.popover'), states: R, desc: 'A centred 718 wide panel: the input row, then "Recent chats" rows.' },
  { key: 'search-input', group: 'Search', title: 'Search input', snap: 'home-dark-search', find: () => Q('#global-search-modal-input'), states: R },
  { key: 'search-section-title', group: 'Search', title: 'Search section title', snap: 'home-dark-search', find: () => Q('[data-testid=modal-global-search] h3'), states: R },
  { key: 'search-result', group: 'Search', title: 'Search result row', snap: 'home-dark-search', find: () => Q('[data-testid=modal-global-search] a', 1), states: HV, extra: { first: { find: () => Q('[data-testid=modal-global-search] a', 0) } } },

  // ---------------- Settings
  { key: 'settings-dialog', group: 'Settings', title: 'Settings dialog', snap: 'settings-dark-general', find: () => C(T('Appearance'), '[role=dialog]'), states: R, desc: 'Centred, radius 16 (`--radius-2xl`), `--bg-elevated-primary` fill: a left nav column and the pane.' },
  { key: 'settings-close', group: 'Settings', title: 'Settings close button', snap: 'settings-dark-general', find: () => C(Q('[data-testid=modal-settings] [data-testid=close-button]'), 'button') || Q('[data-testid=modal-settings] [data-testid=close-button]'), states: HV },
  { key: 'settings-search', group: 'Settings', title: 'Settings search field', snap: 'settings-dark-general', find: () => P(Q('[data-testid=modal-settings] input')), focusOn: () => Q('[data-testid=modal-settings] input'), states: ['default', 'focus-visible'] },
  { key: 'settings-tab', group: 'Settings', title: 'Settings nav tab', snap: 'settings-dark-general', find: () => Q('[data-testid=notifications-tab]') || C(T('Notifications', D()), '[role=tab],button'), states: ALL, extra: { selected: { find: () => C(T('General', Q('[data-testid=modal-settings] [role=tablist]')), '[role=tab],button') } } },
  { key: 'settings-pane-title', group: 'Settings', title: 'Settings pane title', snap: 'settings-dark-general', find: () => [...document.querySelectorAll('[data-testid=modal-settings] h3, [data-testid=modal-settings] h2')].find((e) => e.innerText.trim() === 'General'), states: R },
  { key: 'settings-row', group: 'Settings', title: 'Settings row (Appearance)', snap: 'settings-dark-general', find: () => CK(T('Appearance'), 'min-h-15'), states: R, desc: 'A label at the start and a control at the end, divided by a hairline.' },
  { key: 'settings-select', group: 'Settings', title: 'Settings select button', snap: 'settings-dark-general', find: () => C(T('System', CK(T('Appearance'), 'min-h-15')), 'button'), states: ALL, extra: { open: { snap: 'settings-dark-accent-menu', find: () => C(T('Blue', CK(T('Accent color'), 'min-h-15')), 'button') } } },
  { key: 'settings-toggle', group: 'Settings', title: 'Settings toggle (on)', snap: 'settings-dark-general', find: () => Q('[data-testid=modal-settings] [role=switch]'), states: ALL, desc: 'Accent-filled track when on, white thumb.' },
  { key: 'settings-description', group: 'Settings', title: 'Settings row description', snap: 'settings-dark-general', find: () => T('Use dictation in the chat composer.'), states: R },

  // ---------------- Library
  { key: 'library-title', group: 'Library', title: 'Library page title', snap: 'library-dark', find: () => T('Library', M()), states: R },
  { key: 'library-tab', group: 'Library', title: 'Library tab', snap: 'library-dark', find: () => C(T('Favorites', M()), 'button,[role=tab],a'), states: ALL, desc: 'Pill tabs; the selected one is filled with `--bg-secondary`.', extra: { selected: { find: () => C(T('Suggested', M()), 'button,[role=tab],a') } } },
  { key: 'library-icon-button', group: 'Library', title: 'Library toolbar icon button (grid view)', snap: 'library-dark', find: () => Q('button[aria-label="Grid view"]', 0, M()), states: ALL, desc: '36x36, radius full; the current view (List) is filled with `--bg-secondary`.', extra: { selected: { find: () => Q('button[aria-label="List view"]', 0, M()) } } },
  { key: 'library-search', group: 'Library', title: 'Library search field', snap: 'library-dark', find: () => P(Q('input[placeholder="Search library"]')), focusOn: () => Q('input[placeholder="Search library"]'), states: ['default', 'focus-visible'] },
  { key: 'library-new', group: 'Library', title: 'New button (Library)', snap: 'library-dark', find: () => C(T('New', M()), 'button'), states: ALL, desc: 'The one inverted control on the page: `--interactive-bg-primary-default` (white in dark) with a chevron.' },
  { key: 'library-list-header', group: 'Library', title: 'Library list header', snap: 'library-dark', find: () => Q('[data-testid=artifacts-surface-library-list-header]'), states: R },
  { key: 'library-row', group: 'Library', title: 'Library row', snap: 'library-dark', find: () => W(T('Futuristic Glass Media Icon Concepts.png', M()), 1000), states: HV, desc: 'Grid row: a 32px tile (thumbnail or type icon), the file name, the last activity; a hairline between rows.' },
  { key: 'library-row-icon', group: 'Library', title: 'Library row type icon (text file)', snap: 'library-dark', find: () => P(Q('svg', 0, W(T('Pasted text(5).txt', M()), 1000))), states: R },
  { key: 'library-row-date', group: 'Library', title: 'Library row date', snap: 'library-dark', find: () => TS('Modified 3w ago', M()), states: R },

  // ---------------- Images
  { key: 'images-title', group: 'Images', title: 'Images page title', snap: 'images-dark', find: () => T('Images', M()), states: R },
  { key: 'images-tab', group: 'Images', title: 'Images tab', snap: 'images-dark', find: () => C(T('Templates', M()), 'button,[role=tab],a'), states: ALL, extra: { selected: { find: () => C(T('Trending', M()), 'button,[role=tab],a') } } },
  { key: 'template-card', group: 'Images', title: 'Template card', snap: 'images-dark', find: () => C(T('Aerial view', M()), 'button,a,[role=button]'), states: ALL, desc: 'A tall tile with radius 24, a photo, and a label over a dark gradient at the bottom.', extra: { blank: { find: () => C(T('Caricature', M()), 'button,a,[role=button]') } } },

  // ---------------- Plugins
  { key: 'plugins-title', group: 'Plugins', title: 'Plugins page title', snap: 'plugins-dark', find: () => Q('h1', 0, M()), states: R, desc: '`text-heading-app` (28/34), 500.' },
  { key: 'plugins-subtitle', group: 'Plugins', title: 'Plugins subtitle', snap: 'plugins-dark', find: () => T('Work with ChatGPT across your favorite tools.'), states: R },
  { key: 'plugins-search', group: 'Plugins', title: 'Plugins search field', snap: 'plugins-dark', find: () => P(Q('input[placeholder="Search plugins"]')), focusOn: () => Q('input[placeholder="Search plugins"]'), states: ['default', 'focus-visible'] },
  { key: 'plugins-add', group: 'Plugins', title: 'Round + button (beside search)', snap: 'plugins-dark', find: () => Q('button[aria-label="Add plugin"]', 0, M()), states: ALL },
  { key: 'plugins-section', group: 'Plugins', title: 'Plugins section title (Popular)', snap: 'plugins-dark', find: () => T('Popular', M()), states: R },
  { key: 'plugin-row', group: 'Plugins', title: 'Plugin row', snap: 'plugins-dark', find: () => Q('a[aria-label="Open Gmail"]').parentElement, states: ALL, desc: '384x56 (two columns): a 40px icon tile, name over a one-line description, a + at the end; the whole row is a link.' },
  { key: 'plugin-icon', group: 'Plugins', title: 'Plugin icon tile', snap: 'plugins-dark', find: () => Q('[data-testid=plugin-icon-wrapper]', 0, Q('a[aria-label="Open Gmail"]').parentElement), states: R },
  { key: 'plugin-add', group: 'Plugins', title: 'Plugin row + button', snap: 'plugins-dark', find: () => Q('button', 0, Q('a[aria-label="Open Gmail"]').parentElement), states: ALL },
  { key: 'plugins-see-more', group: 'Plugins', title: '"See Outlook Email, Notion, and more" link', snap: 'plugins-dark', find: () => C(TS('See Outlook'), 'a'), states: ALL },

  // ---------------- Project
  { key: 'project-title', group: 'Project', title: 'Project title', snap: 'project-dark', find: () => Q('h1', 0, M()), states: R },
  { key: 'project-share', group: 'Project', title: 'Project Share button', snap: 'project-dark', find: () => C(T('Share', M()), 'button'), states: ALL },
  { key: 'project-more', group: 'Project', title: 'Project details (…) button', snap: 'project-dark', find: () => Q('button[aria-label="Show project details"]', 0, M()), states: ALL },
  { key: 'project-tab', group: 'Project', title: 'Project tab (Sources)', snap: 'project-dark', find: () => C(T('Sources', M()), 'button,[role=tab],a'), states: ALL, extra: { selected: { find: () => C(T('Chats', M()), 'button,[role=tab],a') } } },
  { key: 'project-chat-row', group: 'Project', title: 'Project chat row', snap: 'project-dark', find: () => W(T('Skill Trends and Pay', M()), 740), states: HV, desc: 'Title over a one-line preview of the last message, a date at the end, hairlines between rows.' },
  { key: 'project-chat-date', group: 'Project', title: 'Project chat date', snap: 'project-dark', find: () => Q('[data-testid=project-conversation-overflow-date]'), states: R },

  // ---------------- Mobile
  { key: 'm-header', group: 'Mobile', title: 'Phone header', snap: 'mobile-home-dark', find: () => Q('#page-header') || Q('header'), states: R, pad: 0, desc: 'Menu button, the ChatGPT model switcher with a chevron, Upgrade and the temporary-chat button.' },
  { key: 'm-open-sidebar', group: 'Mobile', title: 'Phone open-sidebar button', snap: 'mobile-home-dark', find: () => Q('[data-testid=open-sidebar-button]'), states: R },
  { key: 'm-model-switcher', group: 'Mobile', title: 'Phone model switcher', snap: 'mobile-home-dark', find: () => Q('[data-testid=model-switcher-dropdown-button]'), states: R, extra: { open: { snap: 'mobile-thread-dark-model-menu', find: () => Q('[data-testid=model-switcher-dropdown-button]') } } },
  { key: 'm-composer', group: 'Mobile', title: 'Phone composer', snap: 'mobile-home-dark', find: () => P(Q('#prompt-textarea')), states: R, desc: 'Two rows on a phone: the field over the tool row (+, dictation, voice), radius 28.' },
  { key: 'm-drawer', group: 'Mobile', title: 'Phone drawer', snap: 'mobile-home-dark-drawer', find: () => C(Q('[data-testid=create-new-chat-button]', 0, Q('#stage-popover-sidebar')), '[role=dialog]'), states: R, pad: 0, desc: 'The same sidebar in `#stage-popover-sidebar`, sliding over the page; the slide-in transform was set to its end state by hand before the copy.' },
  { key: 'm-drawer-row', group: 'Mobile', title: 'Phone drawer row', snap: 'mobile-home-dark-drawer', find: () => Q('[data-testid=create-new-chat-button]', 0, Q('#stage-popover-sidebar')), states: R },
  { key: 'm-user-bubble', group: 'Mobile', title: 'Phone user bubble', snap: 'mobile-thread-dark', find: () => P(TS('Compile these into')), states: R },
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
      await toLight(page);
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
  // The day the copies were taken (the oldest copy's local date), not the day this script ran.
  read: (() => { const t = new Date(Math.min(...labels.map((l) => fs.statSync(path.join(SNAPS, `${l}.html`)).mtimeMs))); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })(),
  source: 'Static, redacted page copies of the signed-in chatgpt.com app (tools/capture/signed-in/snapshot.js), loaded from file:// in headless Chromium; the stylesheets and icon sprites are inlined in each copy, fonts and a few images come from OpenAI\'s asset hosts through a local cache. Nothing was requested from chatgpt.com itself.',
  viewport: '1440x900 (the mobile-* snapshots 390x844), deviceScaleFactor 2',
  themes: 'Each copy was captured in the dark theme with the blue accent. Dark states have plain names; light states (`light`, `light-<state>`) were read from the same DOM with every `dark` class removed (on <html> and on each markdown body). Every state records `theme` and `snapshot`.',
  states: {
    default: 'at rest, as captured',
    hover: 'real mouse hover (page.mouse.move), 450ms settle; not measured on the 390 snapshots',
    'focus-visible': 'real keyboard focus (focus, Shift+Tab, Tab) on the element or its first focusable descendant; recorded as skipped where the element cannot take focus',
    other: 'active / selected / checked / open / typed / enabled / ... are other elements or snapshots captured in that state',
  },
  tokens: '`vars` lists every var(--x) named in the classes of the element and its first descendants, resolved in that state\'s theme.',
  snapshots: { ...(out._meta && out._meta.snapshots), ...Object.fromEntries(labels.map((l) => { const m = metaOf(l); return [l, { url: m.url.replace(/\/c\/[0-9a-f-]+/, '/c/<id>').replace(/\/g\/g-p-[^/]+/, '/g/<project>'), title: m.title.replace(/^.* - ChatGPT$/, '<chat title> - ChatGPT'), w: m.w, h: m.h, ...(SCROLL[l] ? { scroll: SCROLL[l] } : {}) }]; })) },
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
