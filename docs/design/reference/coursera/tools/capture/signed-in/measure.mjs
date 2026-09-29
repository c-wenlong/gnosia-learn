// Measures Coursera's signed-in learner components (My Learning, the course
// home, and the video, reading, assignment, grades and course info views)
// from the redacted static snapshots in raw/snapshots/, in every state CSS can
// reach once scripts are gone.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs node measure.mjs [--md-only] [page ...]
//
// SNAP_DIR may point at a directory that already holds the gunzipped
// snapshots (<label>.html + <label>.json); otherwise they are gunzipped into a
// temporary directory outside the repository and removed afterwards.
//
// Writes raw/components-signed-in.json (merged, so a subset of pages can be
// re-run), raw/measurements-signed-in.md (built from that JSON, so --md-only
// rebuilds it without a browser), and one crop per component and state into
// components/crops/signed-in/, quantized to 256 colours.
//
// States:
//   default            at rest, as captured
//   hover              real mouse hover, 450ms settle for transitions
//   focus-visible      keyboard: focus(), Shift+Tab, Tab, so Chromium's own
//                      :focus-visible heuristic sees a keyboard focus. This is
//                      only what native :focus-visible rules paint.
//   focus-visible-cds  the same keyboard focus plus the class CDS's JavaScript
//                      adds on a keyboard focus (cds-buttonBase-focusVisible,
//                      cds-button-focusVisible, cds-link-focusVisible,
//                      cds-tab-focusVisible, Mui-focusVisible). Scripts are
//                      stripped from the snapshots, so nothing adds it by
//                      itself; the script adds only the classes whose rules in
//                      the page's own stylesheet name the element's Emotion
//                      class, so what is measured is Coursera's authored CSS
//                      for that state. It is marked as emulated everywhere.
//   pressed            real mouse button held down over the element (:active),
//                      released over the page ground. Every click is
//                      preventDefault()ed and every navigation away from the
//                      file is aborted, so no link or form can fire.
//   selected / current / expanded / collapsed / ...  another element on the
//                      same page that was captured in that state.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const REF = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const RAW = path.join(REF, 'raw');
const CROPS = path.join(REF, 'components', 'crops', 'signed-in');
const OUT_JSON = path.join(RAW, 'components-signed-in.json');
const OUT_MD = path.join(RAW, 'measurements-signed-in.md');
const VARS = JSON.parse(fs.readFileSync(path.join(RAW, 'css-vars.json'), 'utf8'));

const args = process.argv.slice(2);
const MD_ONLY = args.includes('--md-only');
const ONLY = args.filter((a) => !a.startsWith('--'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const PAGES = {
  home: 'learn-home-module-in-progress',
  notstarted: 'learn-home-module-not-started',
  objectives: 'learn-home-objectives-expanded',
  grades: 'learn-grades-default',
  info: 'learn-info-default',
  video: 'learn-video-default',
  transcript: 'learn-video-transcript-open',
  reading: 'learn-reading-default',
  assignment: 'learn-assignment-submitted',
  ml: 'my-learning-default',
  mlc: 'my-learning-completed',
};

// ---------------------------------------------------------------- tokens

function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function lightOf(v) {
  const m = /^light-dark\((.*)\)$/s.exec(v.trim());
  return m ? splitTop(m[1])[0] : v.trim();
}
function parseColor(c) {
  if (!c) return null;
  c = c.trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? +(n(6) / 255).toFixed(2) : 1];
  }
  m = /^rgba?\(([^)]*)\)$/.exec(c);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return [+parts[0], +parts[1], +parts[2], +a.toFixed(2)];
}
const ckey = (c) => (c ? c.join(',') : '');
const PALETTE = /^--cds-color-(grey|blue|purple|green|red|yellow|pink|darken|lighten|white|black|neutral-white|neutral-black)(-\d+)?$/;

const colorIdx = new Map();
const pxIdx = { spacing: new Map(), radius: new Map(), size: new Map(), lh: new Map() };
const typoIdx = new Map();
for (const [name, raw] of Object.entries(VARS.resolved)) {
  const light = lightOf(raw);
  const c = parseColor(light);
  if (c && name.startsWith('--cds-color')) {
    if (!colorIdx.has(ckey(c))) colorIdx.set(ckey(c), []);
    colorIdx.get(ckey(c)).push(name);
    continue;
  }
  const px = /^(-?[\d.]+)(px|rem)$/.exec(light);
  if (px) {
    const v = +(px[2] === 'rem' ? +px[1] * 16 : +px[1]).toFixed(2);
    const bucket = name.startsWith('--cds-spacing') ? 'spacing' : name.startsWith('--cds-border-radius') ? 'radius' : name.startsWith('--cds-font-size') ? 'size' : name.startsWith('--cds-line-height') ? 'lh' : null;
    if (bucket) {
      if (!pxIdx[bucket].has(v)) pxIdx[bucket].set(v, []);
      pxIdx[bucket].get(v).push(name);
    }
  }
  const ty = /^(\d+) ([\d.]+)rem\/([\d.]+)rem/.exec(light);
  if (ty && name.startsWith('--cds-typography')) {
    const k = `${ty[1]} ${+(+ty[2] * 16).toFixed(2)}/${+(+ty[3] * 16).toFixed(2)}`;
    if (!typoIdx.has(k)) typoIdx.set(k, []);
    typoIdx.get(k).push(name);
  }
}
for (const list of [...colorIdx.values(), ...typoIdx.values(), ...Object.values(pxIdx).flatMap((m) => [...m.values()])]) {
  list.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

// Ranks the tokens that share a colour so the name that fits the property
// comes first: background names for a background, stroke names for a border,
// the rest for text and icons. The palette token is always listed last.
function colorTokens(value, prop = 'color') {
  const c = parseColor(value);
  if (!c || c[3] === 0) return [];
  const names = colorIdx.get(ckey(c)) || [];
  const want = prop === 'bg' ? /background/ : prop === 'border' ? /stroke|border|divider/ : /^(?!.*(background|stroke)).*$/;
  const sem = names.filter((n) => !PALETTE.test(n));
  const pal = names.filter((n) => PALETTE.test(n));
  sem.sort((a, b) => (want.test(b) ? 1 : 0) - (want.test(a) ? 1 : 0) || a.length - b.length);
  return [...sem.slice(0, 2), ...pal.slice(0, 1)];
}
function hex(value) {
  const c = parseColor(value);
  if (!c) return value;
  if (c[3] === 0) return 'transparent';
  const h = '#' + c.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('');
  return c[3] === 1 ? h : `rgba(${c.slice(0, 3).join(',')},${c[3]})`;
}
function pxToken(v, bucket) {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n === 0) return null;
  const list = pxIdx[bucket].get(+n.toFixed(2));
  return list ? list[0].replace('--cds-', '') : null;
}
function typoToken(st) {
  const list = typoIdx.get(`${st.fontWeight} ${parseFloat(st.fontSize)}/${parseFloat(st.lineHeight)}`) || [];
  const plain = list.filter((n) => !/-(xs|sm|md|lg)(-|$)/.test(n));
  return (plain.length ? plain : list).slice(0, 2);
}
function shadowLayers(s) {
  if (!s || s === 'none') return [];
  return splitTop(s).map((layer) => {
    const col = /(rgba?\([^)]*\)|#[0-9a-f]+)/i.exec(layer);
    const nums = layer.replace(col ? col[0] : '', '').match(/-?[\d.]+px/g) || [];
    return `${nums.map((n) => parseFloat(n)).join(' ')} ${ckey(parseColor(col ? col[0] : 'rgb(0,0,0)'))}`;
  });
}
const elevIdx = Object.entries(VARS.resolved).filter(([n]) => n.startsWith('--cds-elevation')).map(([n, v]) => [n, shadowLayers(v.replace(/light-dark\(([^,]*\([^)]*\)|[^,]*),[^)]*\)\)?/g, '$1'))]);
function shadowToken(s) {
  const l = shadowLayers(s).join('|');
  const hit = elevIdx.find(([, v]) => v.join('|') === l);
  return hit ? hit[0] : null;
}
function tokensFor(st) {
  if (!st || !st.style) return {};
  const s = st.style;
  const t = {};
  const put = (k, v) => { if (v && (!Array.isArray(v) || v.length)) t[k] = v; };
  put('color', colorTokens(s.color, 'color'));
  put('backgroundColor', colorTokens(s.backgroundColor, 'bg'));
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none') put(`border${side}Color`, colorTokens(s[`border${side}Color`], 'border'));
  }
  put('typography', typoToken(s));
  put('fontSize', pxToken(s.fontSize, 'size'));
  put('lineHeight', pxToken(s.lineHeight, 'lh'));
  put('borderRadius', pxToken(s.borderTopLeftRadius, 'radius'));
  put('boxShadow', shadowToken(s.boxShadow));
  for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap']) put(p, pxToken(s[p], 'spacing'));
  if (st.icon) put('iconColor', colorTokens(st.icon.fill !== 'none' && st.icon.fill !== 'rgb(0, 0, 0)' ? st.icon.fill : st.icon.color, 'color'));
  return t;
}

// ---------------------------------------------------------------- specs

const ALL = ['default', 'hover', 'focus-visible', 'focus-visible-cds', 'pressed'];
const HOVER = ['default', 'hover'];
const R = ['default'];

// Each spec: key, page, name, desc, find (a JS expression run in the page with
// the helpers in __m), states, and optional hover/focus/press/crop
// expressions (defaulting to the found element), variants (other elements on
// the same page in another captured state), extra (a page function
// `(el) => ({...})` whose result is stored under `extra`).
const q = (sel, i = 0) => `__m.q(${JSON.stringify(sel)}, ${i})`;

// Cards are found by what paints at a point inside each column's padding, so
// the measured element is the one that draws the white card.
const SHELL_COURSE = `(el) => __m.shell([
  ['sidebar', __m.cardAt(24, 860)],
  ['main', __m.cardAt(340, 860)],
  ['rail-goal', __m.cardAt(1068, 70)],
  ['rail-timeline', __m.q('[data-testid=course-timeline-card]')],
])`;
const SHELL_ITEM = `(el) => __m.shell([
  ['outline-clip', __m.q('[data-testid=left-nav]')],
  ['outline', __m.q('[data-testid=left-nav] > div')],
  ['item-clip', __m.q('[data-testid=item-tool-panel-layout-main-content-panel]')],
  ['item', __m.roundAt(400, 72)],
  ['tool-pane', __m.q('[data-testid=item-tool-panel-layout-tool-content-panel]')],
  ['separator', __m.q('[role=separator]')],
  ['tool-strip', __m.q('[data-testid=item-tool-panel-layout-toolbar-button-container-content]') && __m.q('[data-testid=item-tool-panel-layout-toolbar-button-container-content]').parentElement],
  ['tool-strip-inner', __m.q('[data-testid=item-tool-panel-layout-toolbar-button-container-content]')],
])`;

const SPECS = [
  // ---------------- page shells
  { key: 'shell-course-home', page: 'home', name: 'Page shell: course home (module page)', desc: 'Three white cards on a grey ground under a 64px header: course sidebar, main module column, right rail of two stacked cards. The body is a fixed 100vh layout; the sidebar, main column and rail scroll inside it.', find: '__m.ground()', states: R, crop: 'viewport', extra: SHELL_COURSE },
  { key: 'shell-course-grades', page: 'grades', name: 'Page shell: grades', desc: 'Two cards: sidebar and a wide main card; no right rail.', find: '__m.ground()', states: R, crop: 'viewport', extra: SHELL_COURSE },
  { key: 'shell-course-info', page: 'info', name: 'Page shell: course info', desc: 'Same two-card layout as grades.', find: '__m.ground()', states: R, crop: 'viewport', extra: SHELL_COURSE },
  { key: 'shell-item-video', page: 'video', name: 'Page shell: video item', desc: 'Item view: collapsible outline card on the left, the item card, then a tool strip (Transcript, Notes, Files) at the right edge. The header drops the search and shows the partner logo instead.', find: '__m.ground()', states: R, crop: 'viewport', extra: SHELL_ITEM },
  { key: 'shell-item-video-transcript', page: 'transcript', name: 'Page shell: video item with the transcript open', desc: 'The tool pane opens between the item and the tool strip, behind a 10px drag separator.', find: '__m.ground()', states: R, crop: 'viewport', extra: SHELL_ITEM },
  { key: 'shell-item-reading', page: 'reading', name: 'Page shell: reading item', desc: 'Outline card plus one wide item card; the reading column is centred inside it.', find: '__m.ground()', states: R, crop: 'viewport', extra: SHELL_ITEM },
  { key: 'shell-item-assignment', page: 'assignment', name: 'Page shell: assignment item', desc: 'Outline card plus the item card holding the assignment cover.', find: '__m.ground()', states: R, crop: 'viewport', extra: SHELL_ITEM },
  {
    key: 'shell-my-learning', page: 'ml', name: 'Page shell: My Learning', desc: 'White page, full-width sticky header with a bottom rule, a greeting band, tabs, then a two-column grid: course cards on the left, calendar/stats and certificates cards on the right.', find: '__m.ground()', states: R, crop: 'viewport',
    extra: `(el) => __m.shell([
      ['container', __m.q('main > div + div > div')],
      ['left-column', __m.q('[role=tabpanel] > div > div')],
      ['right-column', __m.q('[role=tabpanel] > div > div', 1)],
      ['program-card', __m.q('.pathway-card-container')],
      ['course-card', __m.q('.rc-CourseCardModule > div')],
      ['calendar-card', __m.q('[aria-label="Previous month"]').closest('.cds-grid-item')],
      ['certificates-card', __m.text('span', 'Recent Certificates').closest('.cds-grid-item')],
      ['header', __m.q('.rc-GlobalPageHeaderContainer')],
    ])`,
  },

  // ---------------- course top bar
  { key: 'topbar-course', page: 'home', name: 'Course top bar', desc: 'The in-course header: app switcher, Coursera wordmark, a 1px divider, the programme badge, the "Search in course" input with an attached Search button, and help, language, bell, AI and avatar icon buttons on the right. It sits on the grey ground with no bottom rule.', find: q('[data-testid=page-header-wrapper]'), states: R, pad: 0, extra: '(el) => __m.kids(el, "button, a, input, [aria-label=\\"Example University\\"], [data-testid=home-logo] > div > div:nth-child(2)")' },
  { key: 'topbar-switcher', page: 'home', name: 'Top bar: app switcher (9-dot grid)', desc: 'Ghost small icon button, 32x32 with a 24px icon.', find: q('[data-testid=SwitcherButton]'), states: ALL },
  { key: 'topbar-logo', page: 'home', name: 'Top bar: logo link', desc: 'Coursera wordmark (127x32 svg), a 1x26 divider, then the programme badge. One link.', find: q('[data-testid=home-logo]'), states: ['default', 'hover', 'focus-visible', 'focus-visible-cds'], extra: '(el) => ({ divider: __m.box(el.querySelector("div > div:nth-child(2)")), wordmark: __m.box(el.querySelector("svg")) })' },
  { key: 'topbar-program-badge', page: 'home', name: 'Top bar: programme badge', desc: 'Round 32px navy disc with the programme initial.', find: q('[aria-label="Example University"]'), states: R, extra: '(el) => ({ text: __m.box(el.querySelector("span")) })' },
  { key: 'topbar-course-search-input', page: 'home', name: 'Top bar: "Search in course" input', desc: 'Square-cornered 300x36 input; its right edge meets the Search button.', find: q('#rc-InCourseSearchBarInput-input'), states: ['default', 'hover', 'focus-visible'], crop: `${q('#rc-InCourseSearchBarInput-input')}.closest('form')`, extra: '(el) => ({ wrapper: __m.box(el.parentElement), form: __m.box(el.closest("form")) })' },
  { key: 'topbar-course-search-button', page: 'home', name: 'Top bar: attached Search button', desc: 'Primary button, 36px tall, joined to the input.', find: q('[data-track-component=search_button_click]'), states: ALL, crop: `${q('#rc-InCourseSearchBarInput-input')}.closest('form')` },
  { key: 'topbar-icon-button', page: 'home', name: 'Top bar: help icon button', desc: 'Ghost small icon button (help, language, bell and avatar share it): 32x32, 24px icon.', find: q('[data-testid=header-help-button]'), states: ALL, extra: '(el) => ({ siblings: ["[data-testid=language-switcher-button]", "[data-testid=notification-icon-button]", "[data-testid=coach-chat-launcher-button]", "[data-e2e=header-profile]"].map((s) => __m.box(document.querySelector(s))) })' },
  { key: 'topbar-ai-button', page: 'home', name: 'Top bar: Coursera AI launcher', desc: 'Ghost medium icon button, 36x36, holding a 24px sparkle image.', find: q('[data-testid=coach-chat-launcher-button]'), states: HOVER },
  { key: 'topbar-avatar', page: 'home', name: 'Top bar: avatar menu', desc: 'User avatar, 24px navy disc with the initial, inside a 32px ghost icon button.', find: q('[data-e2e=header-profile]'), states: ['default', 'hover', 'focus-visible', 'focus-visible-cds'], extra: '(el) => ({ avatar: __m.box(el.querySelector("[data-testid=user-avatar]")), initial: __m.box(el.querySelector(".cds-Avatar-initialText")) })' },
  { key: 'topbar-item', page: 'video', name: 'Item top bar', desc: 'On item pages the header keeps only the wordmark, a divider and the partner logo on the left, and help, language, AI and avatar on the right.', find: q('[data-testid=page-header-wrapper]'), states: R, pad: 0, extra: '(el) => __m.kids(el, "button, a, img")' },

  // ---------------- My Learning top bar
  { key: 'topbar-ml', page: 'ml', name: 'My Learning top bar', desc: 'White sticky header with a 1px bottom rule: switcher, wordmark, Explore menu button, My Learning (current), Degrees, a pill search field with a round search button, then help, career goal link, language, bell and avatar.', find: q('.rc-GlobalPageHeaderContainer'), states: R, pad: 0, extra: '(el) => __m.kids(el, "button, a, input, p")' },
  { key: 'topbar-ml-explore', page: 'ml', name: 'Top bar: Explore', desc: 'Ghost button with a 20px chevron end icon.', find: q('[data-testid=megamenu-explore-button]'), states: ALL },
  { key: 'topbar-ml-nav-link', page: 'ml', name: 'Top bar: nav link (Degrees; My Learning is the current one)', desc: 'Ghost buttons rendered as links. The current page (My Learning) is marked isCurrent and aria-current=page.', find: q('[data-testid=nav-link-grid-item-degrees]'), states: ALL, variants: { current: { find: q('[data-testid=nav-link-grid-item-my_learning]'), states: ['default', 'hover'] } } },
  { key: 'topbar-ml-search', page: 'ml', name: 'Top bar: catalog search', desc: 'Pill search field (cds-Search) 476x44, notched outline, with a round primary icon button at the right end.', find: `${q('#search-autocomplete-input')}.parentElement`, states: ['default', 'hover', 'focus-visible'], hover: q('#search-autocomplete-input'), focus: q('#search-autocomplete-input'), extra: '(el) => ({ input: __m.box(el.querySelector("input")), outline: __m.box(el.querySelector("fieldset")), placeholder: getComputedStyle(el.querySelector("input"), "::placeholder").color })' },
  { key: 'topbar-ml-search-button', page: 'ml', name: 'Top bar: round search button', desc: 'Primary small icon button, 36x36, 20px magnifier, fully round.', find: q('[data-testid=search-autocomplete] button[aria-label=Search]'), states: ALL },
  { key: 'topbar-ml-career-goal', page: 'ml', name: 'Top bar: career goal link', desc: '"Career goal:" label followed by an underlined link.', find: q('[data-testid=career-goal-link]'), states: ALL, crop: `${q('[data-testid=career-goal-link]')}.closest('p')`, extra: '(el) => ({ label: __m.box(el.closest("p")) })' },

  // ---------------- course sidebar
  { key: 'sidebar-card', page: 'home', name: 'Course sidebar card', desc: 'White card on the grey ground holding the partner row, the course title and the navigation.', find: `__m.paintUp(${q('[data-e2e=courseNavigation]')})`, states: R, extra: '(el) => ({ moduleRows: __m.gaps("[data-testid=rc-WeekNavigationItem]"), navLinks: __m.gaps("nav[aria-label=\\"Course navigation\\"] > ul > li") })' },
  { key: 'sidebar-partner', page: 'home', name: 'Sidebar: partner logo row', desc: 'Organisation avatar (38px bordered square holding a 32px logo) and the partner name.', find: `${q('[data-e2e=courseNavigation] .cds-Avatar-organization')}.parentElement`, states: R, extra: '(el) => ({ avatar: __m.box(el.querySelector(".cds-Avatar-organization")), logo: __m.box(el.querySelector("img")), name: __m.box(el.querySelector("span")) })' },
  { key: 'sidebar-course-title', page: 'home', name: 'Sidebar: course title', desc: 'Course name, h2.', find: q('[data-e2e=courseNavigation] h2'), states: R },
  { key: 'sidebar-course-material', page: 'home', name: 'Sidebar: "Course Material" collapsible heading', desc: 'Full-width button with the label and a 20px chevron at the right; it opens and closes the module list.', find: q('[data-testid=week-collection-navigation-item] button'), states: ALL, extra: '(el) => ({ label: __m.box(el.querySelector("span")), chevron: __m.box(el.querySelector("svg")) })' },
  { key: 'sidebar-course-material', page: 'grades', find: q('[data-testid=week-collection-navigation-item] button'), states: [], variants: { collapsed: { find: q('[data-testid=week-collection-navigation-item] button'), states: [] } } },
  { key: 'sidebar-module-row', page: 'home', name: 'Sidebar: module row', desc: 'Module link with a 16px progress circle at the left. The current module gets a tinted background and a heavier, larger label.', find: q('[data-testid=rc-WeekNavigationItem] a', 1), states: ALL, variants: { selected: { find: q('[data-testid=rc-WeekNavigationItem] a[aria-current=page]'), states: ['hover', 'focus-visible', 'focus-visible-cds'] } }, extra: '(el) => ({ circle: __m.box(el.querySelector("span > span")), circleWrap: __m.box(el.querySelector("span")), label: __m.box(el.querySelector("div > span")) })' },
  { key: 'sidebar-progress-circle', page: 'home', name: 'Sidebar: module progress circle (not started)', desc: 'The 16px ring drawn inside a 20px box before each module name.', find: `${q('[data-testid=rc-WeekNavigationItem] a', 1)}.querySelector('span > span')`, states: R, variants: { selected: { find: `${q('[data-testid=rc-WeekNavigationItem] a[aria-current=page]')}.querySelector('span > span')`, states: [] } }, pad: 6 },
  { key: 'sidebar-nav-link', page: 'home', name: 'Sidebar: secondary nav link (Grades, Notes, Discussion Forums, Messages, Course Info)', desc: 'Plain full-width links under Course Material, 40px rows.', find: q('[data-e2e=gradesNavigationItem] a'), states: ALL },
  { key: 'sidebar-nav-link', page: 'grades', find: q('[data-e2e=notesNavigationItem] a'), states: [], variants: { 'selected-grades': { find: q('[data-e2e=gradesNavigationItem] a'), states: ['hover', 'focus-visible', 'focus-visible-cds'] } } },
  { key: 'sidebar-nav-link', page: 'info', find: q('[data-e2e=notesNavigationItem] a'), states: [], variants: { 'selected-course-info': { find: q('[data-e2e=courseInfoNavigationItem] a'), states: [] } } },

  // ---------------- module page
  { key: 'module-title', page: 'home', name: 'Module page: module title', desc: 'Module name, h2 at the top of the main card.', find: q('section.rc-ModuleSection h2'), states: R },
  { key: 'module-meta-row', page: 'home', name: 'Module page: meta row', desc: '"2h 8m of videos left • 5 min of readings left • 1 graded assessment left": each part is a 16px outline icon and a label; parts after the first are preceded by a bullet.', find: `${q('section.rc-ModuleSection h2')}.parentElement.nextElementSibling`, states: R, extra: '(el) => ({ parts: [...el.children].map((c) => ({ ...__m.box(c), icon: __m.box(c.querySelector("svg")), text: __m.box(c.querySelector("span")), before: __m.pseudo(c, "::before"), after: __m.pseudo(c, "::after") })) })' },
  { key: 'module-description', page: 'home', name: 'Module page: description', desc: 'Instructor note under the meta row.', find: q('[data-testid=instructor-note-body]'), states: R },
  { key: 'module-objectives-toggle', page: 'home', name: 'Module page: "Show Learning Objectives" toggle', desc: 'Ghost secondary button (cds-ShowMoreContainer) with a 16px chevron end icon.', find: q('.rc-InstructorModuleNote .cds-ShowMoreContainer-ctaButton'), states: ALL },
  { key: 'module-objectives-toggle', page: 'objectives', find: q('.rc-InstructorModuleNote .cds-ShowMoreContainer-ctaButton'), states: [], variants: { expanded: { find: q('.rc-InstructorModuleNote .cds-ShowMoreContainer-ctaButton'), states: [] } } },
  { key: 'module-objectives-list', page: 'objectives', name: 'Module page: learning objectives list (expanded)', desc: 'Numbered list; the number and its period are separate spans in an 8px gutter.', find: q('.cds-ShowMoreContainer-content ol'), states: R, crop: `${q('.rc-InstructorModuleNote')}`, extra: '(el) => ({ items: __m.gaps(".cds-ShowMoreContainer-content ol > li"), li: __m.box(el.querySelector("li")), number: __m.box(el.querySelector("li > span")), text: __m.box(el.querySelector("li > span + span")) })' },
  { key: 'lesson-header', page: 'home', name: 'Module page: lesson group header', desc: 'Collapsible header for a lesson group: label and a 20px chevron, full width, 40px tall.', find: q('[data-testid=rc-ItemGroupLesson] h2 button'), states: ALL, extra: '(el) => ({ label: __m.box(el.querySelector("[data-testid=item-group-lesson-label]")), chevron: __m.box(el.querySelector("svg")), h2: __m.box(el.closest("h2")) })' },
  { key: 'lesson-header-tag', page: 'notstarted', name: 'Module page: "1 graded assessment left" tag in a lesson header', desc: 'Small status tag (cds-tag-small, secondary, default) before the chevron.', find: q('[data-testid=rc-ItemGroupLesson] h2 [data-testid=tag-root]'), states: R, extra: '(el) => ({ text: __m.box(el.querySelector("span")) })' },
  { key: 'lesson-divider', page: 'home', name: 'Module page: divider between lesson groups', desc: 'A presentational <li> holding an <hr>.', find: q('[data-testid=named-item-list-list] > li[role=presentation]'), states: R, extra: '(el) => ({ hr: __m.box(el.querySelector("hr")) })' },
  { key: 'item-row', page: 'home', name: 'Module page: item row', desc: 'One learning item: a 20px status icon (green check when done, the item-type icon otherwise), title, and a meta line ("Video • 5 min"). The whole row is a link.', find: q('.rc-WeekSingleItemDisplayRefresh a'), states: ALL, extra: '(el) => ({ rows: __m.gaps(".rc-ItemGroupLesson:first-child .rc-WeekSingleItemDisplayRefresh"), icon: __m.box(el.querySelector("svg")), iconBox: __m.box(el.querySelector(":scope > span")), title: __m.box(el.querySelector("div > span")), meta: __m.box(el.querySelector("div > div > span")), li: __m.box(el.closest("li")) })' },
  { key: 'item-row', page: 'home', find: q('.rc-WeekSingleItemDisplayRefresh a'), states: [], variants: { current: { find: q('.rc-WeekSingleItemDisplayRefresh a[aria-current=page]'), states: ['hover', 'focus-visible', 'focus-visible-cds', 'pressed'] } }, extra: '(el) => ({ rows: __m.gaps(".rc-ItemGroupLesson:first-child .rc-WeekSingleItemDisplayRefresh"), icon: __m.box(el.querySelector("svg")), iconBox: __m.box(el.querySelector(":scope > span")), title: __m.box(el.querySelector("div > span")), meta: __m.box(el.querySelector("div > div > span")), li: __m.box(el.closest("li")) })' },
  { key: 'item-row', page: 'notstarted', find: q('.rc-WeekSingleItemDisplayRefresh a'), states: [], variants: { 'not-started': { find: q('.rc-WeekSingleItemDisplayRefresh a'), states: [] } } },
  { key: 'item-resume-button', page: 'home', name: 'Module page: "Resume" button on the current item', desc: 'Primary button (a span with role=button inside the row link) at the right end of the current item.', find: q('.rc-WeekSingleItemDisplayRefresh a[aria-current=page] [role=button]'), states: ['default', 'hover', 'pressed'] },
  { key: 'item-status-icon', page: 'home', name: 'Module page: item status icons', desc: 'Completed check (filled green circle), and the outline type icons shown before an item is done.', find: `${q('.rc-WeekSingleItemDisplayRefresh a')}.querySelector('svg')`, states: [], variants: {
    completed: { find: `${q('.rc-WeekSingleItemDisplayRefresh a')}.querySelector('svg')`, states: [] },
    'reading-current': { find: `${q('.rc-WeekSingleItemDisplayRefresh a[aria-current=page]')}.querySelector('svg')`, states: [] },
  }, pad: 4 },
  { key: 'item-status-icon', page: 'notstarted', find: q('.rc-WeekSingleItemDisplayRefresh svg'), states: [], pad: 4, variants: {
    video: { find: `${q('[data-testid=WeekSingleItemDisplay-lecture] a')}.querySelector('svg')`, states: [] },
    practice: { find: `${q('[data-testid=WeekSingleItemDisplay-ungradedAssignment] a')}.querySelector('svg')`, states: [] },
    graded: { find: `${q('[data-testid=WeekSingleItemDisplay-staffGraded] a')}.querySelector('svg')`, states: [] },
    lab: { find: `${q('[data-testid=WeekSingleItemDisplay-ungradedLab] a')}.querySelector('svg')`, states: [] },
  } },
  { key: 'item-due-tag', page: 'home', name: 'Module page: due-date tag on a graded item', desc: '"Due, Sep 30, 11:59 PM +08" as a small status tag inline after the meta text.', find: q('.rc-WeekSingleItemDisplayRefresh [data-testid=tag-root]'), states: R, crop: `${q('.rc-WeekSingleItemDisplayRefresh [data-testid=tag-root]')}.closest('a')`, extra: '(el) => ({ text: __m.box(el.querySelector("span")), meta: __m.box(el.previousElementSibling) })' },

  // ---------------- right rail
  { key: 'rail-goal-card', page: 'home', name: 'Right rail: weekly learning target card', desc: 'White card: heading, a sentence, seven day circles, and an "Edit my weekly learning target" link button.', find: `__m.paintUp(${q('[data-testid=unified-goal-card] section')})`, states: R, extra: '(el) => ({ heading: __m.box(el.querySelector("h2")), text: __m.box(el.querySelector("p")), days: __m.gaps("[data-testid^=non-completed-]") })' },
  { key: 'rail-day-circle', page: 'home', name: 'Right rail: day circle', desc: '22px ringed circle with the weekday initial. Today (Tuesday) is marked only in its hidden label.', find: q('[data-testid=non-completed-mo]'), states: R, pad: 6, variants: { today: { find: q('[data-testid=non-completed-tu]'), states: [] } }, extra: '(el) => ({ letter: __m.box(el.querySelector("p")) })' },
  { key: 'rail-goal-edit', page: 'home', name: 'Right rail: "Edit my weekly learning target"', desc: 'Link-styled button.', find: q('[data-testid=goal-card-edit-goal-cta]'), states: ALL },
  { key: 'rail-timeline-card', page: 'home', name: 'Right rail: course timeline card', desc: 'Heading, a green "Right on schedule!" callout, then a timeline: start date, the next two deadlines (link, due tag, type), estimated end date, joined by a dashed vertical line between two 16px icons.', find: q('[data-testid=course-timeline-card]'), states: R, extra: '(el) => ({ heading: __m.box(el.querySelector("h2")), timeline: __m.box(el.querySelector("section + div")), startIcon: __m.box(el.querySelector("section + div svg")), line: __m.box(el.querySelector("section + div > div:nth-child(2)")), lineBefore: __m.pseudo(el.querySelector("section + div > div:nth-child(2)"), "::before"), lineAfter: __m.pseudo(el.querySelector("section + div > div:nth-child(2)"), "::after"), startText: __m.box(el.querySelector("section + div p")), nextLabel: __m.box(el.querySelectorAll("section + div p")[1]), typeText: __m.box(el.querySelector("[data-testid=tag-root] + span")), deadlines: __m.gaps("[data-testid=course-timeline-card] section + div > div:nth-child(5) > div") })' },
  { key: 'rail-timeline-callout', page: 'home', name: 'Right rail: "Right on schedule!" callout', desc: 'Green tinted box with a bold heading and a muted sentence.', find: q('[data-testid=course-timeline-card] section'), states: R, extra: '(el) => ({ heading: __m.box(el.querySelector("p")), text: __m.box(el.querySelector("span")) })' },
  { key: 'rail-timeline-line', page: 'home', name: 'Right rail: timeline dashed line', desc: 'The 16px-wide column between the start and end icons that draws the dashed rule.', find: `${q('[data-testid=course-timeline-card] section + div')}.children[1]`, states: R, pad: 4 },
  { key: 'rail-deadline-link', page: 'home', name: 'Right rail: deadline link', desc: 'Underlined blue link to the graded item.', find: q('[data-testid=schedule-card-deadline-link]'), states: ALL },
  { key: 'rail-due-tag', page: 'home', name: 'Right rail: due tag', desc: 'Medium status tag, highlight1 (blue tint): "Due tomorrow by 11:59 PM +08" wraps to two lines in the rail; "Due in 3 days" fits on one.', find: q('[data-testid=course-timeline-card] [data-testid=tag-root]', 1), states: R, variants: { 'two-line': { find: q('[data-testid=course-timeline-card] [data-testid=tag-root]'), states: [] } }, extra: '(el) => ({ text: __m.box(el.querySelector("span")) })' },

  // ---------------- grades
  { key: 'grades-title', page: 'grades', name: 'Grades: page title', desc: 'h1 "Grades".', find: q('[data-testid=assignments-page] h1'), states: R },
  { key: 'grades-table', page: 'grades', name: 'Grades: table', desc: 'Rounded bordered table (div role=table): a grey header row, then one 68px row per graded item. Columns: Item, Status, Due, Weight, Grade.', find: q('[role=table]'), states: R, extra: '(el) => ({ wrapper: __m.box(el.parentElement), columns: [...el.querySelectorAll("[role=columnheader]")].map((c) => ({ text: c.innerText.trim(), ...__m.box(c), label: __m.box(c.querySelector("span")) })), rows: __m.gaps("[role=table] [role=rowgroup] + [role=rowgroup] > [role=row]") })' },
  { key: 'grades-header-row', page: 'grades', name: 'Grades: header row', desc: 'Grey band with the column labels.', find: q('[role=table] [role=row]'), states: R, extra: '(el) => ({ cell: __m.box(el.querySelector("[role=columnheader]")), label: __m.box(el.querySelector("[role=columnheader] span")), weight: __m.box(el.querySelectorAll("[role=columnheader]")[3]) })' },
  { key: 'grades-row', page: 'grades', name: 'Grades: row', desc: 'One graded item: title link and type on the left, then status, due date (date over time), weight and grade.', find: q('[data-testid=ungrouped-non-peer-assignment-row]'), states: HOVER, extra: '(el) => ({ rowheader: __m.box(el.querySelector("[role=rowheader]")), type: __m.box(el.querySelector("[role=rowheader] span")), status: __m.box(el.querySelector("[data-testid=assignment-item-status]")), due: __m.box(el.querySelector("[data-testid=assignment-item-due]")), dueTime: __m.box(el.querySelector("[data-testid=assignment-item-due] + span")), weight: __m.box(el.querySelector("[data-testid=assignment-item-weight] span")), grade: __m.box(el.querySelector("[data-testid=assignment-item-grade] span")) })' },
  { key: 'grades-item-link', page: 'grades', name: 'Grades: item title link', desc: 'Link styled as plain text (cds Link, no underline at rest).', find: q('[data-testid=item-title-text] a'), states: ALL },

  // ---------------- course info
  { key: 'info-title', page: 'info', name: 'Course info: title and byline', desc: 'Course name (h1) and "by Duke University".', find: q('section.rc-CourseInfoPage2016 h1'), states: R, crop: `${q('section.rc-CourseInfoPage2016 h1')}.parentElement`, extra: '(el) => ({ byline: __m.box(el.nextElementSibling) })' },
  { key: 'info-about', page: 'info', name: 'Course info: About this Course', desc: 'h2, a paragraph clamped to three lines, and a "Show more" ghost button.', find: q('.rc-AboutBox'), states: R, extra: '(el) => ({ heading: __m.box(el.querySelector("h2 span")), text: __m.box(el.querySelector("p")), clamp: getComputedStyle(el.querySelector("p")).webkitLineClamp })' },
  { key: 'info-show-more', page: 'info', name: 'Course info: "Show more" button', desc: 'Ghost button, 48px tall, blue label.', find: q('.rc-AboutBox button'), states: ALL },
  { key: 'info-instructor', page: 'info', name: 'Course info: instructor row', desc: '32px round photo, name link over a muted title line.', find: q('.rc-InstructorInfo'), states: R, extra: '(el) => ({ rows: __m.gaps("[data-testid=rc-InstructorsSection] li"), label: __m.box(document.querySelector("[data-testid=rc-InstructorsSection] > p")), avatar: __m.box(el.querySelector(".cds-Avatar-base")), name: __m.box(el.querySelector("a span")), title: __m.box(el.querySelector("p")) })' },
  { key: 'info-instructor-link', page: 'info', name: 'Course info: instructor name link', desc: 'Bold link styled as text.', find: q('.rc-InstructorInfo a'), states: ALL },
  { key: 'info-details', page: 'info', name: 'Course info: details box', desc: 'Rounded bordered box of label/value rows (Level, Commitment, Language, How To Pass, User Ratings) split by 1px rules; each label has a 20px icon.', find: `${q('#basic-info-row-label-level')}.parentElement.parentElement`, states: R, extra: '(el) => ({ rows: __m.gaps("[role=group]"), row: __m.box(el.querySelector("[role=group]")), label: __m.box(el.querySelector("#basic-info-row-label-level")), icon: __m.box(el.querySelector("svg")), value: __m.box(el.querySelector("[role=group] > div + div")), rule: __m.box(el.querySelector("hr")), rating: __m.box(el.querySelector(".cds-RatingStat-meter")), star: __m.box(el.querySelector(".cds-RatingStat-meter svg")) })' },
  { key: 'info-syllabus-module', page: 'info', name: 'Course info: syllabus module card', desc: 'Bordered card with a grey header strip ("Module 1"), then the module title, description, a "23 videos, 3 readings" disclosure and the graded item.', find: `${q('[data-testid=rc-WeekView]')}.firstElementChild`, states: R, extra: '(el) => ({ heading: __m.box(document.querySelector(".rc-Syllabus") && document.querySelector(".rc-Syllabus").parentElement.querySelector("h2")), header: __m.box(el.firstElementChild), headerText: __m.box(el.querySelector("h3 span")), title: __m.box(el.querySelector("h4")), text: __m.box(el.querySelector("[data-testid=rc-ModuleView] p")), disclosure: __m.box(el.querySelector(".cds-ShowMoreContainer-ctaButton")), graded: __m.box(el.querySelector("[data-testid=rc-ModuleSummary] > div + div")) })' },
  { key: 'info-catalog-button', page: 'info', name: 'Course info: "View the course in catalog"', desc: 'Secondary (outlined) button, 48px tall.', find: q('a.cds-button-secondary'), states: ALL },

  // ---------------- video item page
  { key: 'outline-panel', page: 'video', name: 'Item outline panel', desc: 'Left card on item pages: course title with a close (collapse) button, the "Today\'s goal" accordion, then one accordion per module listing lesson headings and item rows.', find: `__m.paintUp(${q('[data-testid=left-nav] > div')})`, states: R, extra: '(el) => ({ header: __m.box(el.querySelector("div")), headerRule: __m.box(el.querySelector(":scope > div > div:first-child")), items: __m.gaps("[data-testid=left-nav] ul > li") })' },
  { key: 'outline-course-link', page: 'video', name: 'Outline: course title link', desc: 'Course name at the top of the outline, a link back to the course home.', find: q('[data-testid=left-nav] a'), states: ALL },
  { key: 'outline-close', page: 'video', name: 'Outline: collapse button (X)', desc: 'Ghost small icon button, 36x36 with a 20px icon.', find: q('[aria-label="Collapse course outline"]'), states: ALL },
  { key: 'outline-goal-card', page: 'video', name: 'Outline: "Today\'s goal" accordion', desc: 'Standard CDS accordion with a 1px border: header "Today\'s goal • 0/3 items" plus a flag illustration and chevron; body "Complete 3 items today to stay at a good pace!".', find: q('.cds-AccordionRoot-standard'), states: R, extra: '(el) => ({ header: __m.box(el.querySelector(".cds-AccordionHeader-button")), label: __m.box(el.querySelector(".cds-AccordionHeader-labelDetails span")), illustration: __m.box(el.querySelector("[data-testid=daily-goals-empty-illustration]")), chevron: __m.box(el.querySelector(".cds-AccordionHeader-button > svg, .cds-AccordionHeader-button svg[id]")), body: __m.box(el.querySelector("[data-testid=daily-goals-tracker-body]")), bodyText: __m.box(el.querySelector("[data-testid=daily-goals-tracker-body] p")), focusContainer: __m.box(el.parentElement) })' },
  { key: 'outline-goal-header', page: 'video', name: 'Outline: "Today\'s goal" accordion header', desc: 'The accordion header button.', find: q('[data-testid=daily-goals-tracker-header] button'), states: ALL },
  { key: 'outline-module-header', page: 'video', name: 'Outline: module accordion header', desc: 'Silent CDS accordion header: "Module 1" small label over the module title, 24px chevron.', find: q('.cds-AccordionRoot-silent h3 button'), states: ALL, variants: { collapsed: { find: `[...document.querySelectorAll('.cds-AccordionRoot-silent h3 button')].find((b) => b.getAttribute('aria-expanded') === 'false')`, states: [] } }, extra: '(el) => ({ number: __m.box(el.querySelector("[data-testid=module-number-heading]")), title: __m.box(el.querySelector(".cds-AccordionHeader-labelDetails span")), chevron: __m.box(el.querySelector(":scope > svg")) })' },
  { key: 'outline-lesson-heading', page: 'video', name: 'Outline: lesson heading', desc: 'h4 above each lesson\'s item rows, flush with the card edge.', find: q('[data-testid=left-nav] h4'), states: R },
  { key: 'outline-item', page: 'video', name: 'Outline: item row', desc: 'Item link: 20px status icon, title, and a type • duration line. The link spans the card; the visible row (tint, radius) is its inner content wrapper, which is what is measured here. The current item is tinted.', find: q('[data-testid=left-nav] ul li a .outline-single-item-content-wrapper'), hover: q('[data-testid=left-nav] ul li a'), focus: q('[data-testid=left-nav] ul li a'), states: ALL, variants: { selected: { find: `${q('[data-testid=left-nav] a[aria-label^="selected link"]')}.querySelector('.outline-single-item-content-wrapper')`, hover: q('[data-testid=left-nav] a[aria-label^="selected link"]'), focus: q('[data-testid=left-nav] a[aria-label^="selected link"]'), states: ['hover', 'focus-visible', 'focus-visible-cds'] }, 'not-started': { find: `[...document.querySelectorAll('[data-testid=left-nav] ul li a')].find((a) => !a.querySelector('[data-testid=learn-item-success-icon]')).querySelector('.outline-single-item-content-wrapper')`, states: [] } }, extra: '(el) => ({ link: __m.box(el.closest("a")), icon: __m.box(el.querySelector("svg")), title: __m.box(el.querySelector(":scope > div + div > div > div")), meta: __m.box(el.querySelector(":scope > div + div > div > div + div")), duration: __m.box(el.querySelector(":scope > div + div > div > div + div > span")) })' },
  { key: 'outline-divider', page: 'video', name: 'Outline: rule between lessons', desc: '1px rule inset 16px at each side.', find: `${q('[data-testid=left-nav] h4')}.parentElement.lastElementChild`, states: R },
  { key: 'video-player', page: 'video', name: 'Video player frame', desc: 'The player container (the video itself is a poster frame in the snapshot): centre play button, control bar with a progress rail.', find: q('[data-testid=playerContainer]'), states: R, extra: '(el) => ({ video: __m.box(el.querySelector("video")), play: __m.box(el.querySelector("[data-testid=action-feedback-icon-container]")), playIcon: __m.box(el.querySelector("[data-testid=action-feedback-icon-container] svg")), controls: __m.box(el.querySelector("[data-testid=video-control-bar]")), rail: __m.box(el.querySelector(".video-player-progress-bar-rail")), track: __m.box(el.querySelector(".video-player-progress-bar-track")), thumb: __m.box(el.querySelector(".video-player-progress-bar-thumb")), controlButton: __m.box(el.querySelector("[data-testid=playToggle]")), time: __m.box(el.querySelector(".current-time-display")) })' },
  { key: 'video-play-button', page: 'video', name: 'Video: centre play button', desc: 'Full-frame button; the visible part is a 74px dark disc with a 70px play glyph.', find: q('[data-testid=centerPlayButton]'), states: HOVER, crop: q('[data-testid=action-feedback-icon-container]'), extra: '(el) => ({ disc: __m.box(el.querySelector("[data-testid=action-feedback-icon-container]")) })' },
  { key: 'video-title', page: 'video', name: 'Video: item title', desc: 'h1.video-name under the player.', find: q('h1.video-name'), states: R },
  { key: 'video-save-note', page: 'video', name: 'Video: "Save note"', desc: 'Ghost button, 48px tall, 16px pencil start icon.', find: q('#save-note-button'), states: ALL },
  { key: 'ai-panel', page: 'video', name: 'Video: "Dive deeper on this topic" AI panel', desc: 'Grey rounded disclosure: sparkle icon and heading, chevron at the right, then the suggestion chips.', find: q('.disclosure.brandUpdate'), states: R, extra: '(el) => ({ header: __m.box(el.querySelector(".disclosure-header")), icon: __m.box(el.querySelector(".disclosure-header svg")), heading: __m.box(el.querySelector(".disclosure-header p")), toggle: __m.box(el.querySelector(".disclosure-toggle svg")), footer: __m.box(el.querySelector(".disclosure-footer")), group: __m.box(el.querySelector("[role=group]")), chips: __m.gaps(".coach-secondary-button") })' },
  { key: 'ai-panel-header', page: 'video', name: 'AI panel: header', desc: 'The disclosure header (role=button).', find: q('.disclosure-header'), states: ['default', 'hover', 'focus-visible', 'pressed'] },
  { key: 'ai-chip', page: 'video', name: 'AI panel: suggestion chip', desc: 'Secondary button (outlined) used as a chip: "Give me practice questions".', find: q('.coach-secondary-button'), states: ALL },
  { key: 'item-feedback-icon', page: 'video', name: 'Item feedback icon button (like, dislike, flag)', desc: 'Ghost-secondary small icon buttons, 36x36 with 20px icons, in a row under the AI panel.', find: q('[data-testid=like-button] button'), states: ALL, extra: '(el) => ({ row: __m.box(el.closest(".rc-ItemFeedback")), dislike: __m.box(document.querySelector("[data-testid=dislike-button] button")), flag: __m.box(document.querySelector("[aria-label=\\"Report an issue\\"]")) })' },
  { key: 'next-item-button', page: 'video', name: '"Go to next item" (footer)', desc: 'Primary button with a 20px arrow end icon, bottom right of the item card.', find: q('button[aria-label="Go to next item"]'), states: ALL, extra: '(el) => ({ footer: __m.box(el.closest(".cds-134, [data-testid=course-frame-footer-wrapper]") || el.parentElement.parentElement) })' },
  { key: 'tool-strip', page: 'video', name: 'Tool strip (Transcript, Notes, Files)', desc: 'Right-edge column of 72x72 buttons: a 20px icon over a small label.', find: q('[role=toolbar][aria-label="Item actions"]'), states: R, extra: '(el) => ({ buttons: __m.gaps("[role=toolbar][aria-label=\\"Item actions\\"] button"), icon: __m.box(el.querySelector(".icon-wrapper")), label: __m.box(el.querySelector(".label")) })' },
  { key: 'tool-strip-button', page: 'video', name: 'Tool strip button', desc: '72x72 button, icon over label. The open tool gets a tinted square.', find: q('[data-testid=item-tool-panel-button-notes]'), states: ALL, extra: '(el) => ({ icon: __m.box(el.querySelector(".icon-wrapper")), label: __m.box(el.querySelector(".label")) })' },
  { key: 'tool-strip-button', page: 'transcript', find: q('[data-testid=item-tool-panel-button-notes]'), states: [], variants: { selected: { find: q('[data-testid=item-tool-panel-button-transcript]'), states: ['hover', 'focus-visible'] } } },

  // ---------------- transcript
  { key: 'transcript-panel', page: 'transcript', name: 'Transcript panel', desc: 'Tool pane: "Transcript" heading, close button, "Language: English" silent select, then the interactive transcript (a timestamp per paragraph, phrases as inline buttons).', find: q('[data-testid=item-tool-panel-layout-tool-content-panel]'), states: R, crop: 'pane', extra: '(el) => ({ heading: __m.box(el.querySelector("h2")), close: __m.box(el.querySelector("[aria-label=\\"Close panel\\"]")), select: __m.box(el.querySelector("[data-testid=track-chooser-select]")), selectLabel: __m.box(el.querySelector(".cds-silentSelect-label")), selectValue: __m.box(el.querySelector(".cds-silentSelect-filled > span + span span")), body: __m.box(el.querySelector(".rc-Transcript")), paragraph: __m.box(el.querySelector(".rc-Paragraph")), paragraphs: __m.gaps(".rc-Paragraph") })' },
  { key: 'transcript-close', page: 'transcript', name: 'Transcript: close button', desc: 'Ghost-secondary small icon button, 36x36 with a 20px X.', find: q('[aria-label="Close panel"]'), states: ALL },
  { key: 'transcript-language', page: 'transcript', name: 'Transcript: language select', desc: 'Silent select: bold label and value, 24px chevron, no visible box.', find: q('[data-testid=track-chooser-select]'), states: ['default', 'hover', 'focus-visible'], focus: q('[data-testid=track-chooser-select] [role=button]') },
  { key: 'transcript-timestamp', page: 'transcript', name: 'Transcript: timestamp', desc: 'Paragraph timestamp as a button ("0:00").', find: q('button.timestamp'), states: ALL },
  { key: 'transcript-phrase', page: 'transcript', name: 'Transcript: phrase', desc: 'Each sentence fragment is an inline role=button span. The current phrase gets a 1px blue outline box; hover tints a phrase.', find: q('.rc-Phrase', 5), states: ['default', 'hover', 'focus-visible', 'pressed'], variants: { current: { find: `[...document.querySelectorAll('.rc-Phrase')].find((p) => p.className !== document.querySelectorAll('.rc-Phrase')[5].className)`, states: [] } } },
  { key: 'tool-panel-separator', page: 'transcript', name: 'Tool pane separator', desc: '10px drag handle (role=separator) between the item and the transcript pane.', find: q('[role=separator]'), states: HOVER, crop: false, extra: '(el) => ({ before: __m.pseudo(el, "::before"), after: __m.pseudo(el, "::after"), children: [...el.querySelectorAll("*")].slice(0, 3).map((c) => __m.box(c)) })' },

  // ---------------- reading
  { key: 'reading-title', page: 'reading', name: 'Reading: title', desc: 'Large h1 (cds Typography display) over the reading column.', find: q('.reading-title h1'), states: R, extra: '(el) => ({ column: __m.box(el.closest(".rc-ReadingItem")), columnParent: __m.box(el.closest(".rc-ReadingItem").parentElement) })' },
  { key: 'reading-audio-player', page: 'reading', name: 'Reading: audio player', desc: 'Grey pill bar: play button, time, a progress rail with a thumb, playback rate, mute and settings.', find: q('[data-testid=audio-player]'), states: R, extra: '(el) => ({ controls: __m.box(el.querySelector("[data-testid=audio-player-controls]")), play: __m.box(el.querySelector("button")), playIcon: __m.box(el.querySelector("button svg")), time: __m.box(el.querySelector("[data-testid=audio-player-controls] > div span")), rail: __m.box(el.querySelector(".audio-player-slider-rail")), thumb: __m.box(el.querySelector(".audio-player-slider-thumb")), rate: __m.box(el.querySelector("[aria-label=\\"Playback rate\\"] span")) })' },
  { key: 'reading-body', page: 'reading', name: 'Reading: body paragraph', desc: 'CML paragraph. This reading has no subheadings or lists, so only the paragraph and link styles are on the page.', find: q('[data-testid=cml-viewer] p'), states: R, extra: '(el) => ({ span: __m.box(el.querySelector("span span")), probe: __m.cmlProbe(), sheetRules: __m.cmlRules() })' },
  { key: 'reading-link', page: 'reading', name: 'Reading: inline link', desc: 'Underlined blue link with a 16px external-link icon after it.', find: q('[data-testid=cml-viewer] a'), states: ALL, extra: '(el) => ({ icon: __m.box(el.querySelector("svg")), text: __m.box(el.querySelector("span span")) })' },
  { key: 'reading-next-button', page: 'reading', name: 'Reading: "Go to next item" (large)', desc: 'Primary large button (48px) at the end of the reading, followed by a green "Completed" check.', find: q('[data-testid=next-item]'), states: ALL, crop: q('[data-testid=reading-complete-container]') },
  { key: 'reading-completed', page: 'reading', name: 'Reading: "Completed" marker', desc: '24px check and an h3 label in the success colour.', find: q('[data-testid=completed-text]'), states: R, extra: '(el) => ({ icon: __m.box(el.querySelector("svg")), label: __m.box(el.querySelector("h3")) })' },
  { key: 'reading-feedback-row', page: 'reading', name: 'Reading: feedback row (Like, Dislike, Report an issue)', desc: 'Below a top rule, ghost buttons with 20px start icons.', find: `${q('.rc-ReadingItem')}.children[1]`, states: R, extra: '(el) => ({ buttons: __m.gaps(".rc-ItemFeedback button") })' },
  { key: 'item-feedback-text-button', page: 'reading', name: 'Item feedback text button (Like)', desc: 'Ghost button with a 20px start icon, 36px tall.', find: q('[data-testid=like-button] button'), states: ALL },
  { key: 'item-footer', page: 'reading', name: 'Item footer bar', desc: 'The 68px footer that holds "Go to next item" at the bottom right of the item card.', find: q('[data-testid=course-frame-footer-wrapper]'), states: R },

  // ---------------- assignment
  { key: 'assignment-cover', page: 'assignment', name: 'Assignment: cover', desc: 'Rounded bordered article: a blue-tinted header (type, title, primary action, AI button, illustration), then a white body with the result banner, "What to expect" card and Report an issue.', find: q('[data-testid=assignment-cover-redesign]'), states: R, extra: '(el) => ({ header: __m.box(el.querySelector("[data-testid=cover-page-header]")), body: __m.box(el.querySelector("[data-testid=cover-page-header] + div")), illustration: __m.box(el.querySelector("[data-testid=cover-page-header] svg")) })' },
  { key: 'assignment-type', page: 'assignment', name: 'Assignment: type eyebrow', desc: '"Practice Assignment" over the title.', find: q('[data-testid=cover-page-header-assignment-type]'), states: R },
  { key: 'assignment-title', page: 'assignment', name: 'Assignment: title', desc: 'h1 in the cover header.', find: q('[data-testid=cover-page-header] h1'), states: R },
  { key: 'assignment-primary', page: 'assignment', name: 'Assignment: "Try again"', desc: 'Primary large button (48px).', find: q('[data-testid=CoverPageActionButton]'), states: ALL },
  { key: 'assignment-ai-button', page: 'assignment', name: 'Assignment: "Help me practice"', desc: 'Ghost large button with a 24px sparkle start icon, dark label.', find: q('[aria-label^="Help me practice"]'), states: ALL },
  { key: 'assignment-result-banner', page: 'assignment', name: 'Assignment: result banner', desc: 'Blue-tinted box: "Submitted — results pending", two secondary-neutral buttons, and the submission time.', find: q('[data-testid=result-banner]'), states: R, extra: '(el) => ({ heading: __m.box(el.querySelector("p")), note: __m.box(el.querySelectorAll("p")[1]) })' },
  { key: 'assignment-secondary-button', page: 'assignment', name: 'Assignment: "View submission" (secondary neutral)', desc: 'White outlined button with a dark label, 36px tall.', find: q('[data-testid=view-submission-button]'), states: ALL, variants: { disabled: { find: q('[data-testid=view-feedback-button]'), states: ['hover'] } } },
  { key: 'assignment-expect-card', page: 'assignment', name: 'Assignment: "What to expect" card', desc: 'Bordered card: heading, then rows of a 20px icon and a line of text.', find: q('[data-testid=what-to-expect-card]'), states: R, extra: '(el) => ({ heading: __m.box(el.querySelector("h2")), rows: __m.gaps("[data-testid=cover-page-row]"), icon: __m.box(el.querySelector("[data-testid=cover-page-row] svg")), text: __m.box(el.querySelector("[data-testid=content]")) })' },
  { key: 'assignment-report', page: 'assignment', name: 'Assignment: "Report an issue"', desc: 'Ghost-secondary button with a 20px flag start icon.', find: q('[data-testid=rc-CoverPageContainer] [aria-label="Report an issue"]'), states: ALL },

  // ---------------- My Learning
  { key: 'ml-greeting', page: 'ml', name: 'My Learning: greeting', desc: '64px navy avatar with the initial, "Good morning, Learner" (h1), and the career goal line with an underlined link and an "Edit goal" ghost button. An isometric illustration sits at the right.', find: `${q('main h1')}.parentElement.parentElement`, states: R, extra: '(el) => ({ avatar: __m.box(document.querySelector("main [data-testid=user-avatar]")), initial: __m.box(document.querySelector("main .cds-Avatar-initialText")), heading: __m.box(document.querySelector("main h1")), goal: __m.box(document.querySelector("[data-testid=career-goal-message] > span")), illustration: __m.box(document.querySelector("[data-testid=career-goal-illustration]")) })' },
  { key: 'ml-career-goal-link', page: 'ml', name: 'My Learning: career goal link', desc: 'Underlined dark link inside the sentence.', find: q('[data-testid=career-goal-message] a'), states: ALL },
  { key: 'ml-edit-goal', page: 'ml', name: 'My Learning: "Edit goal"', desc: 'Ghost button with no padding, blue label.', find: `${q('[data-testid=career-goal-message]')}.nextElementSibling`, states: ALL },
  { key: 'ml-tabs', page: 'ml', name: 'My Learning: tab bar', desc: 'In Progress / Completed / Certificates: text tabs over a full-width 1px rule; the selected tab has a 4px dark indicator.', find: q('[data-testid=tabs-root]'), states: R, extra: '(el) => ({ list: __m.box(el.querySelector("[role=tablist]")), scroller: __m.box(el.querySelector(".cds-tab-list-scrollable + .cds-tab-list-scrollable, .cds-tab-list-scrollable:not([style*=\\"-9\\"])")), indicator: __m.box(el.querySelector(".cds-tab-list-indicator")), tabs: __m.gaps("[role=tab]") })' },
  { key: 'ml-tab', page: 'ml', name: 'My Learning: tab', desc: 'Unselected tab ("Completed"); the selected one is "In Progress".', find: q('[role=tab][aria-selected=false]'), states: ALL, variants: { selected: { find: q('[role=tab][aria-selected=true]'), states: ['hover', 'focus-visible', 'focus-visible-cds', 'pressed'] } }, extra: '(el) => ({ label: __m.box(el.querySelector(".cds-tab-wrapper")) })' },
  { key: 'ml-tab', page: 'mlc', find: q('[role=tab][aria-selected=false]'), states: [], variants: { 'selected-completed': { find: q('[role=tab][aria-selected=true]'), states: [] } } },
  { key: 'ml-program-header', page: 'ml', name: 'My Learning: programme (specialization) header', desc: '30px partner logo, the programme title (h3) and "Offered by ..." above its card.', find: q('.rc-PathwayCardModule .pathway-card-title'), states: R, extra: '(el) => ({ logo: __m.box(el.querySelector(".cds-Avatar-base")), title: __m.box(el.querySelector("h3")), offered: __m.box(el.querySelector("p")) })' },
  { key: 'ml-program-card', page: 'ml', name: 'My Learning: programme card', desc: 'Bordered rounded card holding one row per course in the programme, split by 1px rules.', find: q('.pathway-card-container'), states: R, crop: 'visible', extra: '(el) => ({ rows: __m.gaps(".pathway-card-container > [data-testid=course-card]") })' },
  { key: 'ml-course-row', page: 'ml', name: 'My Learning: programme course row', desc: 'Title link, then "Course 2 of 9 · Not started"; the overflow button at the right. The first row also has a progress bar and the next-item card.', find: q('.rc-PathwayCardCourseItemModule', 1), states: HOVER, variants: { 'in-progress': { find: q('.rc-PathwayCardCourseItemModule'), states: ['hover'] } }, extra: '(el) => ({ left: __m.box(el.firstElementChild), title: __m.box(el.querySelector(".rc-PathwayCourseMetadata a span")), meta: __m.box(el.querySelector(".rc-PathwayCourseMetadata a + div p")), dot: __m.box(el.querySelectorAll(".rc-PathwayCourseMetadata a + div p")[1]) })' },
  { key: 'ml-course-title-link', page: 'ml', name: 'My Learning: course title link', desc: 'Course name as a link, bold, dark, no underline at rest.', find: q('.rc-PathwayCourseMetadata a'), states: ALL },
  { key: 'ml-progress-bar', page: 'ml', name: 'My Learning: progress bar', desc: 'Pill track with a purple fill ("3% complete"); 8px tall.', find: q('[data-testid=progress-bar]'), states: R, crop: `${q('[data-testid=progress-bar]')}.parentElement`, variants: { 'course-card': { find: q('[data-testid=progress-bar]', 1), states: [] } }, extra: '(el) => ({ track: __m.box(el.parentElement), trackPaint: __m.paint(el.parentElement) })' },
  { key: 'ml-next-item-card', page: 'ml', name: 'My Learning: next-item inset card', desc: 'Bordered inset card inside a course row: next item title, a 16px type icon and "Reading (4 minutes)", and the Resume / Get started button.', find: q('.rc-PathwayCardCourseItemModule section'), states: HOVER, extra: '(el) => ({ title: __m.box(el.querySelector("p span")), icon: __m.box(el.querySelector("svg")), meta: __m.box(el.querySelector("svg + p")), duration: __m.box(el.querySelector("svg + p span")), button: __m.box(el.querySelector("a")) })' },
  { key: 'ml-resume-button', page: 'ml', name: 'My Learning: Resume / Get started', desc: 'Primary button, 36px tall.', find: q('a[aria-label^="Resume"]'), states: ALL, variants: { 'get-started': { find: q('a[aria-label^="Get started"]'), states: [] } } },
  { key: 'ml-overflow-button', page: 'ml', name: 'My Learning: overflow "…" button', desc: 'Ghost medium icon button, 48x48 with a 24px blue dots icon.', find: q('[data-e2e=dropdown-menu]'), states: ALL },
  { key: 'ml-course-card', page: 'ml', name: 'My Learning: standalone course card', desc: 'Bordered rounded card: partner logo and name, "Offered by", course title link, "Course · 9% complete · Estimated completion", progress bar, next-item card and overflow button.', find: q('.rc-CourseCardModule > div'), states: HOVER, variants: { 'with-progress': { find: q('.rc-CourseCardModule > div', 1), states: [] } }, extra: '(el) => ({ cards: __m.gaps(".rc-CourseCardModule"), logo: __m.box(el.querySelector(".cds-Avatar-base")), partner: __m.box(el.querySelector(".rc-CourseMetadata section span")), offered: __m.box(el.querySelector(".rc-CourseMetadata section p")), title: __m.box(el.querySelector(".rc-CourseMetadata a span")), meta: __m.box(el.querySelector(".rc-CourseMetadata section + section + section p")) })' },
  { key: 'ml-calendar', page: 'ml', name: 'My Learning: calendar and stats card', desc: 'Bordered card: month title with previous/next icon buttons, a 7-column grid (weekday header row, 32px day cells, today ringed), a legend, a rule, then "Last 4 weeks" with three stats.', find: `${q('[aria-label="Previous month"]')}.closest('.cds-grid-item')`, states: R, extra: '(el) => ({ month: __m.box(el.querySelector("h2")), weekday: __m.box(el.querySelector("[role=none] > div span")), weekdayCell: __m.box(el.querySelector("[role=none] > div")), dayCells: __m.gaps("[role=none] > div"), legendDot: __m.box(__m.text("span", "1+ daily goals completed").previousElementSibling), legendLine: __m.box(__m.text("span", "All daily goals completed").previousElementSibling), legendText: __m.box(__m.text("span", "1+ daily goals completed")), rule: __m.box(el.querySelector("hr")), statsHeading: __m.box(el.querySelector("h3")), statNumber: __m.box(el.querySelector("span[role=presentation]")), statLabel: __m.box(el.querySelector("span[role=presentation] + span")) })' },
  { key: 'ml-calendar-nav', page: 'ml', name: 'My Learning: calendar previous/next', desc: 'Ghost small icon buttons, 36x36 with 20px chevrons.', find: q('[aria-label="Next month"]'), states: ALL },
  { key: 'ml-calendar-day', page: 'ml', name: 'My Learning: calendar day cell', desc: '32px circle cell with the date; today (29) gets a purple ring and a heavier number.', find: `${q('[data-testid=day-28]')}.parentElement`, states: R, pad: 6, variants: { today: { find: `${q('[data-testid=day-29]')}.parentElement`, states: [] } }, extra: '(el) => ({ number: __m.box(el.querySelector("span")) })' },
  { key: 'ml-certificates-card', page: 'ml', name: 'My Learning: recent certificates card', desc: 'Bordered card: heading, then rows of a 48px logo in a 60px tile, the course name, an "Add to LinkedIn" ghost-invert button and a "View certificate" link.', find: `${`__m.text('span', 'Recent Certificates')`}.closest('.cds-grid-item')`, states: R, extra: '(el) => ({ heading: __m.box(__m.text("span", "Recent Certificates")), rows: __m.gaps("[data-testid=add-to-linkedin-button]"), tile: __m.box(el.querySelector("img").parentElement), logo: __m.box(el.querySelector("img")), title: __m.box(el.querySelector("img").parentElement.nextElementSibling.querySelector("span")) })' },
  { key: 'ml-cert-linkedin', page: 'ml', name: 'My Learning: "Add to LinkedIn" (ghost invert, compact)', desc: 'Ghost-invert button with no padding, 24px tall.', find: q('[data-testid=add-to-linkedin-button]'), states: ALL },
  { key: 'ml-cert-view', page: 'ml', name: 'My Learning: "View certificate" link', desc: 'cds Link, bold blue.', find: `${q('[data-testid=add-to-linkedin-button]')}.nextElementSibling`, states: ALL },
  { key: 'mlc-course-card', page: 'mlc', name: 'My Learning, Completed tab: course card', desc: 'Wide bordered card: a 26px green check disc, partner, title and "Course · 100% complete"; the actions (Add to LinkedIn primary, View certificate, or Purchase Certificate) and the overflow button at the right.', find: q('.rc-CourseCardModule > div'), states: HOVER, extra: '(el) => ({ cards: __m.gaps(".rc-CourseCardModule"), check: __m.box(el.querySelector(".rc-CourseMetadata > div:first-child")), checkIcon: __m.box(el.querySelector(".rc-CourseMetadata > div:first-child svg")), partner: __m.box(el.querySelector(".rc-CourseMetadata section span")), title: __m.box(el.querySelector(".rc-CourseMetadata a span")), meta: __m.box(el.querySelector(".rc-CourseMetadata section + section + section p")), ctas: __m.box(el.querySelector("[data-testid=bff-completed-course-ctas]")) })' },
  { key: 'mlc-linkedin-button', page: 'mlc', name: 'Completed tab: "Add to LinkedIn" (primary)', desc: 'Primary button, 36px tall.', find: q('a[data-track-component=add_to_linkedin]'), states: ALL },
  { key: 'mlc-view-certificate', page: 'mlc', name: 'Completed tab: "View certificate"', desc: 'Legacy link button (primary invert classes, not a cds-button): blue text, no fill.', find: q('.card-action-button-viewcertificate'), states: ALL },
  { key: 'mlc-purchase', page: 'mlc', name: 'Completed tab: "Purchase Certificate"', desc: 'Primary button.', find: q('a[data-track-component=purchase_certificate]'), states: HOVER },
];

// ---------------------------------------------------------------- page helpers (run in the page)

const HELPERS = () => {
  const box = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const o = {
      tag: el.tagName.toLowerCase(),
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
      font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily.split(',')[0].replace(/"/g, '')}`,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
    };
    const add = (k, v, skip) => { if (v !== skip && v !== undefined) o[k] = v; };
    add('text', (el.innerText || '').trim().slice(0, 60) || undefined, undefined);
    add('bg', cs.backgroundColor, 'rgba(0, 0, 0, 0)');
    add('bgImage', cs.backgroundImage === 'none' ? undefined : cs.backgroundImage.slice(0, 160));
    add('padding', cs.padding, '0px');
    add('margin', cs.margin, '0px');
    add('gap', cs.gap, 'normal');
    add('radius', cs.borderRadius, '0px');
    add('boxShadow', cs.boxShadow, 'none');
    add('textDecoration', cs.textDecorationLine, 'none');
    add('textTransform', cs.textTransform, 'none');
    add('opacity', cs.opacity, '1');
    add('display', cs.display);
    add('overflowY', cs.overflowY, 'visible');
    const b = ['Top', 'Right', 'Bottom', 'Left'].map((s) => (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' ? `${s[0]}:${cs[`border${s}Width`]} ${cs[`border${s}Style`]} ${cs[`border${s}Color`]}` : '')).filter(Boolean);
    if (b.length) o.border = b.join(' | ');
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) o.outline = `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} offset ${cs.outlineOffset}`;
    if (el.tagName === 'svg' || el.tagName === 'SVG' || el instanceof SVGElement) { o.fill = cs.fill; o.stroke = cs.stroke; }
    return o;
  };
  const pseudo = (el, pe) => {
    if (!el) return null;
    const p = getComputedStyle(el, pe);
    if (!p.content || p.content === 'none' || p.content === 'normal') return null;
    return { content: p.content, width: p.width, height: p.height, position: p.position, inset: `${p.top} ${p.right} ${p.bottom} ${p.left}`, bg: p.backgroundColor, border: `${p.borderTopWidth} ${p.borderTopStyle} ${p.borderTopColor}`, borderLeft: `${p.borderLeftWidth} ${p.borderLeftStyle} ${p.borderLeftColor}`, radius: p.borderRadius, margin: p.margin, color: p.color, font: `${p.fontWeight} ${p.fontSize}/${p.lineHeight}`, boxShadow: p.boxShadow, bgImage: p.backgroundImage.slice(0, 200) };
  };
  const paintUp = (el) => {
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none')) return el;
      el = el.parentElement;
    }
    return el;
  };
  const gaps = (sel) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).slice(0, 10);
    const r = els.map((e) => e.getBoundingClientRect());
    const out = [];
    for (let i = 1; i < r.length; i++) {
      const sameRow = Math.abs(r[i].top - r[i - 1].top) < 2;
      out.push(sameRow ? { dx: +(r[i].left - r[i - 1].right).toFixed(1) } : { dy: +(r[i].top - r[i - 1].bottom).toFixed(1), pitch: +(r[i].top - r[i - 1].top).toFixed(1) });
    }
    return { count: document.querySelectorAll(sel).length, sizes: r.slice(0, 4).map((x) => `${x.width.toFixed(1)}x${x.height.toFixed(1)}`), gaps: out };
  };
  const paint = (el) => {
    const outp = [];
    for (const n of [el, ...el.querySelectorAll('*')].slice(0, 40)) {
      for (const pe of [null, '::before', '::after']) {
        const c = getComputedStyle(n, pe);
        if (pe && (c.content === 'none' || c.content === 'normal')) continue;
        if (c.backgroundColor === 'rgba(0, 0, 0, 0)' && c.backgroundImage === 'none' && !(parseFloat(c.borderTopWidth) > 0)) continue;
        const r = n.getBoundingClientRect();
        outp.push({ node: n.tagName.toLowerCase() + (pe || ''), size: pe ? `${c.width}x${c.height}` : `${r.width.toFixed(1)}x${r.height.toFixed(1)}`, bg: c.backgroundColor, bgImage: c.backgroundImage === 'none' ? undefined : c.backgroundImage.slice(0, 160), radius: c.borderRadius, border: parseFloat(c.borderTopWidth) > 0 ? `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}` : undefined });
      }
    }
    return outp.slice(0, 8);
  };
  const scrollers = () => [...document.querySelectorAll('*')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20).map((e) => ({ ...box(e), scrollHeight: e.scrollHeight }));
  window.__m = {
    box, pseudo, paintUp, gaps, paint,
    q: (sel, i = 0) => document.querySelectorAll(sel)[i] || null,
    // The element that paints the page ground, read at the left gutter.
    // Walks up from the element at a point to the first one that paints a
    // background with a rounded corner.
    roundAt: (x, y) => { let e = document.elementFromPoint(x, y); while (e && e !== document.body) { const cs = getComputedStyle(e); if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.borderRadius !== '0px') return e; e = e.parentElement; } return null; },
    cardAt: (x, y) => document.elementsFromPoint(x, y).find((e) => { const cs = getComputedStyle(e); return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none'); }) || null,
    ground: () => document.elementsFromPoint(6, 450).find((e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)') || document.body,
    text: (sel, t) => [...document.querySelectorAll(sel)].find((e) => (e.innerText || '').trim() === t) || null,
    kids: (el, sel) => ({ bar: box(el), children: [...el.querySelectorAll(sel)].filter((c) => c.getBoundingClientRect().width > 1).map((c) => ({ label: c.getAttribute('aria-label') || c.getAttribute('data-testid') || (c.innerText || '').trim().slice(0, 30) || c.tagName.toLowerCase(), ...box(c) })) }),
    shell: (list) => {
      const ground = paintUp(document.querySelector('main') || document.body.firstElementChild);
      const cards = list.filter(([, e]) => e).map(([name, e]) => ({ name, ...box(e) }));
      const byX = cards.filter((c) => c.rect.w > 0).slice().sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y);
      const colGaps = [];
      for (let i = 1; i < byX.length; i++) {
        const a = byX[i - 1];
        const b = byX[i];
        if (b.rect.x >= a.rect.x + a.rect.w - 1) colGaps.push({ between: `${a.name} → ${b.name}`, dx: +(b.rect.x - (a.rect.x + a.rect.w)).toFixed(1) });
        else if (b.rect.y >= a.rect.y + a.rect.h - 1) colGaps.push({ between: `${a.name} ↓ ${b.name}`, dy: +(b.rect.y - (a.rect.y + a.rect.h)).toFixed(1) });
      }
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        documentHeight: document.documentElement.scrollHeight,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        ground: ground && { ...box(ground) },
        header: box(document.querySelector('[data-testid=page-header-wrapper]')),
        cards,
        gaps: colGaps,
        scrollContainers: scrollers().slice(0, 6),
      };
    },
    // Rules the stylesheet writes for CML content (headings, lists, links,
    // code), so the reading typography is recorded even where this one reading
    // has no such element.
    cmlRules: () => {
      const out = [];
      // Emotion classes on the CML viewer and the ancestors that scope it.
      const scope = new Set();
      for (let n = document.querySelector('[data-testid=cml-viewer]'), i = 0; n && i < 8; n = n.parentElement, i++) for (const c of n.classList) scope.add(c);
      const walk = (rules) => {
        for (const r of rules) {
          if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
          const s = r.selectorText || '';
          const scoped = /cml/i.test(s) || [...s.matchAll(/\.([\w-]+)/g)].some((m) => scope.has(m[1]));
          if (scoped && /(^|[\s>+~,(])(h[1-6]|ul|ol|li|a|code|pre|blockquote|table|th|td|p|strong|em|img|hr|figure)\b/.test(s)) out.push(r.cssText.replace(/\s+/g, ' ').slice(0, 300));
        }
      };
      for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch { /* cross-origin sheet */ } }
      return out.slice(0, 60);
    },
    // The reading measured here has no subheadings, lists, code or tables.
    // To record what Coursera's CML stylesheet does to them, a probe block of
    // those elements is appended inside the CML viewer, measured, and removed.
    // These are computed from the page's own rules, but the elements are the
    // script's, not the reading's; the output says so.
    cmlProbe: () => {
      const host = document.querySelector('[data-testid=cml-viewer]');
      if (!host) return null;
      const d = document.createElement('div');
      d.innerHTML = '<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4><p>Paragraph</p><ul><li><p>Bullet item</p></li><li><p>Bullet item</p></li></ul><ol><li><p>Numbered item</p></li></ol><pre><code>code()</code></pre><table><thead><tr><th><p>Head</p></th></tr></thead><tbody><tr><td><p>Cell</p></td></tr></tbody></table>';
      host.appendChild(d);
      const pick = (sel) => {
        const e = d.querySelector(sel);
        const cs = getComputedStyle(e);
        return { ...box(e), marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingLeft: cs.paddingLeft, listStyleType: cs.listStyleType };
      };
      const out = { note: 'probe elements inserted by measure.mjs into the CML viewer; not in the captured reading' };
      for (const sel of ['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ul li', 'ol', 'ol li', 'pre', 'code', 'table', 'th', 'td']) out[sel] = pick(sel);
      d.remove();
      return out;
    },
    // Authored state rules for an element: every rule whose selector, with
    // its state pseudo-classes and CDS state classes removed, matches it.
    rules: (el) => {
      const out = [];
      const STATE = /:hover|:active|:focus-visible|:focus-within|:focus|::?before|::?after|\.cds-[\w-]*focusVisible|\.Mui-focusVisible|\.Mui-selected|\.Mui-disabled|\.isCurrent/g;
      const walk = (rules, media) => {
        for (const r of rules) {
          if (r.cssRules && !r.selectorText) { walk(r.cssRules, r.conditionText || media); continue; }
          const s = r.selectorText;
          if (!s || !/:hover|:active|:focus|focusVisible|selected|isCurrent|aria-current|aria-selected|aria-expanded/.test(s)) continue;
          for (const part of s.split(',')) {
            if (!/:hover|:active|:focus|focusVisible|selected|isCurrent|aria-current|aria-selected|aria-expanded/.test(part)) continue;
            const bare = part.replace(STATE, '').replace(/:not\(\)/g, '').trim();
            let hit = false;
            try { hit = !!bare && el.matches(bare); } catch { hit = false; }
            if (hit) { out.push((media ? `@media ${media} ` : '') + r.cssText.replace(/\s+/g, ' ').slice(0, 420)); break; }
          }
          if (out.length >= 24) return;
        }
      };
      for (const ss of document.styleSheets) { try { walk(ss.cssRules, ''); } catch { /* cross-origin sheet */ } }
      return out;
    },
    // Classes CDS's JavaScript would add to this element (or its nearest
    // ancestors) on a keyboard focus, read from the stylesheet: a class is
    // returned only when a rule pairs it with an Emotion class the node has.
    cdsFocus: (el) => {
      const pairs = [];
      const walk = (rules) => {
        for (const r of rules) {
          if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
          const s = r.selectorText || '';
          for (const m of s.matchAll(/\.(css-[\w-]+)[^\s,]*?\.((?:cds-[\w-]*focusVisible)|Mui-focusVisible)/g)) pairs.push([m[1], m[2]]);
        }
      };
      for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch { /* cross-origin sheet */ } }
      const added = [];
      let n = el;
      for (let depth = 0; n && depth < 3; depth++, n = n.parentElement) {
        for (const [emo, cls] of pairs) {
          if (n.classList.contains(emo) && !n.classList.contains(cls)) { n.classList.add(cls); n.setAttribute('data-m-cds', (n.getAttribute('data-m-cds') || '') + ' ' + cls); added.push(`${n.tagName.toLowerCase()}.${emo}+.${cls}`); }
        }
        if (added.length) break;
      }
      return [...new Set(added)];
    },
    uncdsFocus: () => document.querySelectorAll('[data-m-cds]').forEach((n) => { for (const c of n.getAttribute('data-m-cds').trim().split(/\s+/)) n.classList.remove(c); n.removeAttribute('data-m-cds'); }),
  };
  // No link, button or form in a snapshot may leave the file.
  document.addEventListener('click', (e) => e.preventDefault(), true);
  document.addEventListener('submit', (e) => e.preventDefault(), true);
};

// ---------------------------------------------------------------- measurement

async function run() {
  const pw = await import(process.env.PLAYWRIGHT || 'playwright');
  const { chromium } = pw.default ?? pw;
  const { styleOf } = await import('../lib.mjs');

  let snapDir = process.env.SNAP_DIR;
  let tmp = null;
  if (!snapDir) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coursera-snap-'));
    for (const label of Object.values(PAGES)) {
      fs.writeFileSync(path.join(tmp, `${label}.html`), zlib.gunzipSync(fs.readFileSync(path.join(RAW, 'snapshots', `${label}.html.gz`))));
      fs.copyFileSync(path.join(RAW, 'snapshots', `${label}.json`), path.join(tmp, `${label}.json`));
    }
    snapDir = tmp;
  }

  const out = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : {};
  out._meta = {
    capturedAt: new Date().toISOString(),
    source: 'raw/snapshots/*.html.gz: static, redacted DOM snapshots of signed-in pages, stylesheets inlined from the CSSOM, scripts stripped',
    viewport: '1440x900 @2x, headless Chromium (Playwright), file:// URLs; images load from Coursera\'s CDN',
    states: {
      'default': 'at rest as captured',
      'hover': 'real mouse hover, 450ms settle',
      'focus-visible': 'real keyboard focus (focus, Shift+Tab, Tab); native :focus-visible rules only',
      'focus-visible-cds': 'keyboard focus plus the CDS focusVisible class(es) its JavaScript adds; added by this script from the page\'s own rules (emulated)',
      'pressed': 'real mouse button held down (:active), released over the page ground; clicks preventDefault()ed',
      'other': 'selected / current / expanded / collapsed / ... are other elements captured in that state',
    },
    pages: Object.fromEntries(Object.entries(PAGES).map(([k, v]) => [k, { label: v, ...JSON.parse(fs.readFileSync(path.join(snapDir, `${v}.json`), 'utf8')) }])),
  };
  out.components ??= {};
  fs.mkdirSync(CROPS, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' });
  await ctx.addInitScript(HELPERS);
  await ctx.route('**/*', (route) => {
    const req = route.request();
    if (req.isNavigationRequest() && !req.url().startsWith('file:')) return route.abort();
    return route.continue();
  });

  const pages = Object.keys(PAGES).filter((p) => !ONLY.length || ONLY.includes(p));
  for (const pkey of pages) {
    const label = PAGES[pkey];
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    log('open', pkey, label);
    await page.goto(`file://${snapDir}/${label}.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: '*{caret-color:transparent!important}' });

    const reset = async () => {
      await page.mouse.up().catch(() => {});
      await page.evaluate(() => { window.__m.uncdsFocus(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
      await page.mouse.move(2, 450);
      await page.waitForTimeout(200);
    };
    const tag = async (expr, name) => {
      if (!expr) return null;
      const h = await page.evaluateHandle(`(() => { try { return ${expr}; } catch (e) { return null; } })()`);
      const el = h.asElement();
      if (!el) return null;
      // One attribute per tag, so two roles on one element (hover and focus
      // target) do not overwrite each other.
      await el.evaluate((e, n) => e.setAttribute(`data-mt-${n}`, ''), name);
      return page.locator(`[data-mt-${name}]`).first();
    };
    const untag = () => page.evaluate(() => document.querySelectorAll('*').forEach((n) => { for (const a of [...n.attributes]) if (a.name.startsWith('data-mt-')) n.removeAttribute(a.name); }));
    const centre = async (loc) => {
      await loc.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })).catch(() => {});
      await page.waitForTimeout(300);
    };
    // The point the mouse goes to: the middle of the element's first line box
    // (its first client rect), so an inline element that wraps onto several
    // lines is pointed at on its own text, not at the middle of its bounding
    // box where another element may sit.
    const pointOf = (loc) => loc.evaluate((el) => {
      const r = [...el.getClientRects()].find((x) => x.width > 0 && x.height > 0) || el.getBoundingClientRect();
      return { x: r.x + Math.min(r.width / 2, 40), y: r.y + Math.min(r.height / 2, 20) };
    });
    const kbFocus = async (loc) => {
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
    const crop = async (loc, name, pad, mode) => {
      const file = path.join(CROPS, `${name}.png`);
      if (mode === 'viewport') {
        await page.evaluate(() => document.querySelectorAll('*').forEach((n) => { if (n.scrollTop) n.scrollTop = 0; }));
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(250);
        await page.screenshot({ path: file, animations: 'allow' });
      } else {
        const box = await loc.boundingBox();
        if (!box) throw new Error('no box');
        const vp = page.viewportSize();
        const clip = {
          x: Math.max(0, box.x - pad),
          y: Math.max(0, box.y - pad),
        };
        clip.width = Math.min(vp.width, box.x + box.width + pad) - clip.x;
        clip.height = Math.min(vp.height, box.y + box.height + pad) - clip.y;
        if (clip.width <= 0 || clip.height <= 0) throw new Error('off screen');
        // Sticky headers that do not hold the element are hidden for the shot.
        const hidden = await loc.evaluate((el) => {
          let n = 0;
          document.querySelectorAll('.rc-GlobalPageHeaderContainer').forEach((h) => {
            if (h.contains(el) || getComputedStyle(h).position !== 'sticky') return;
            const r = h.getBoundingClientRect();
            const e = el.getBoundingClientRect();
            if (r.bottom <= e.top - 8) return;
            h.setAttribute('data-m-hidden', '1');
            h.style.setProperty('visibility', 'hidden', 'important');
            n++;
          });
          return n;
        });
        try {
          await page.screenshot({ path: file, clip, animations: 'allow' });
        } finally {
          if (hidden) await page.evaluate(() => document.querySelectorAll('[data-m-hidden]').forEach((h) => { h.style.removeProperty('visibility'); h.removeAttribute('data-m-hidden'); }));
        }
      }
      execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nf=sys.argv[1]\nim=Image.open(f).convert("RGB")\nim.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True)', file]);
      return path.relative(REF, file);
    };

    for (const spec of SPECS.filter((s) => s.page === pkey)) {
      const c = (out.components[spec.key] ??= { states: {} });
      if (spec.name) Object.assign(c, { name: spec.name, description: spec.desc });
      c.pages = [...new Set([...(c.pages || []), pkey])];
      c.selectors ??= {};
      c.selectors[pkey] = spec.find;
      const jobs = [];
      for (const st of spec.states) jobs.push({ state: st, base: st, find: spec.find, hover: spec.hover, focus: spec.focus });
      for (const [vname, v] of Object.entries(spec.variants || {})) {
        jobs.push({ state: vname, base: 'default', find: v.find, variant: true });
        for (const st of v.states || []) jobs.push({ state: `${vname}-${st}`, base: st, find: v.find, variant: true, hover: v.hover, focus: v.focus });
      }
      if (spec.extra) for (const j of jobs) if (j.base === 'default') j.extra = spec.extra;
      for (const job of jobs) {
        const name = `${spec.key}-${job.state}`;
        try {
          await reset();
          const loc = await tag(job.find, name);
          if (!loc) throw new Error('element not found');
          const sameEl = job.find === spec.find;
          const hoverLoc = (job.hover && (await tag(job.hover, `${name}-h`))) || loc;
          const focusLoc = (job.focus && (await tag(job.focus, `${name}-f`))) || loc;
          if (spec.crop !== 'viewport') await centre(loc);
          let via = job.variant && job.base === 'default' ? `at rest, captured ${job.state}` : 'at rest';
          let cdsAdded;
          let focusInfo;
          if (job.base === 'hover') {
            const hp = await pointOf(hoverLoc);
            await page.mouse.move(hp.x, hp.y, { steps: 4 });
            await page.waitForTimeout(450);
            via = 'mouse hover';
          } else if (job.base === 'focus-visible' || job.base === 'focus-visible-cds') {
            focusInfo = await kbFocus(focusLoc);
            via = focusInfo.how;
            if (job.base === 'focus-visible-cds') {
              cdsAdded = await focusLoc.evaluate((el) => window.__m.cdsFocus(el));
              via += cdsAdded.length ? `; emulated CDS JS: added ${cdsAdded.join(', ')}` : '; no CDS focusVisible rule names this element';
              await page.waitForTimeout(300);
            }
          } else if (job.base === 'pressed') {
            const pp = await pointOf(hoverLoc);
            await page.mouse.move(pp.x, pp.y, { steps: 4 });
            await page.waitForTimeout(250);
            await page.mouse.down();
            await page.waitForTimeout(350);
            via = 'mouse button held down (released over the page ground)';
          }
          const s = await styleOf(loc);
          if (job.base === 'focus-visible' || job.base === 'focus-visible-cds') s.focus = { ...focusInfo, cdsAdded };
          s.tokens = tokensFor(s);
          if (job.extra) s.extra = await loc.evaluate((el, src) => (0, eval)(`(${src})`)(el), job.extra);
          if (job.variant && job.base === 'default') s.rules = await loc.evaluate((el) => window.__m.rules(el));
          if (spec.crop !== false) {
            try {
              const mode = spec.crop === 'viewport' ? 'viewport' : null;
              let cl = loc;
              if (typeof spec.crop === 'string' && !['viewport', 'visible', 'pane'].includes(spec.crop) && sameEl) cl = (await tag(spec.crop, `${name}-c`)) || loc;
              s.crop = await crop(cl, name, spec.pad ?? 8, mode);
            } catch (e) {
              s.cropError = String(e.message || e).slice(0, 120);
            }
          }
          s.via = via;
          c.states[job.state] = s;
          if (job.base === 'default' && !job.variant && !c.rules) c.rules = await loc.evaluate((el) => window.__m.rules(el));
          log('  ', name, `${s.rect.w}x${s.rect.h}`, via.slice(0, 60));
        } catch (e) {
          c.states[job.state] = { error: String(e.message || e).slice(0, 200) };
          log('  !', name, String(e.message || e).slice(0, 120));
        } finally {
          await page.mouse.move(2, 450).catch(() => {});
          await page.mouse.up().catch(() => {});
          await untag();
        }
      }
    }
    await page.close();
    fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1));
  }
  await browser.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

// ---------------------------------------------------------------- markdown

// Hand-written summary at the top of the markdown. Every number in it was
// read back from raw/components-signed-in.json after a run; re-check it
// against the tables below if the snapshots are ever recaptured.
const INTRO = `
## Summary for the rebuild

The values that decide whether a rebuilt course list and course page read as Coursera. Each is measured in a table below.

- **Course page grid at 1440.** A 64px header sits on the page ground, #f2f5fa (\`neutral-background-primary-weak\`, grey-25); there is no header rule on course pages. Below it, three white cards with 16px gutters: sidebar 300 (x 16), main 716 (x 332), right rail 360 (x 1064), 16px to the right edge. Grades and Course info drop the rail and the main card grows to 1092. The body is a fixed 100vh layout; the sidebar, main column and rail scroll inside it.
- **Cards.** White, radius 16 (\`border-radius-200\`), no border, no shadow on the course pages. Padding: sidebar 16, main 24 top / 32 sides, rail cards 24, stacked 16 apart. On My Learning the page is white and cards carry the edge instead: 1px #c1cbdb (\`neutral-stroke-primary-weak\`, grey-200), radius 16, padding 24 (course cards 24 / 16), 24 apart.
- **Item pages.** Outline card 360 at x 16 (radius 16 by clipping), item card from x 392: 944 wide on a video (plus an 88px tool strip with a 1px #c1cbdb left rule, radius 0 16 16 0), 1032 on a reading or assignment. With the transcript open: item 700.5, a 10px drag separator, transcript pane 233.5, tool strip 88.
- **My Learning grid.** A 65px sticky white header with a 1px #c1cbdb bottom rule. Content container 1376 (32px margins), split two thirds / one third: left column 917.3, right 458.7, each with 16px inner padding, so cards are 885.3 and 426.7 wide.
- **Item row (module page).** A 668x60 link, padding 8, gap 8, radius 8, rows 2px apart (62px pitch). 20px status icon (completed: green check, #197d12 \`feedback-success\`), title Source Sans Pro 400 16/24 #0d0f12, meta line 400 14/20 #48546e (\`neutral-primary-weak\`), e.g. "Video • 5 min". Hover tints the row #f0f6ff (\`interactive-background-primary-hover-weak\`, blue-25); there is no :active rule, so pressed looks like hover.
- **Current item.** The same #f0f6ff tint at rest, the title goes to 600, and a primary "Resume" button (80.8x36) sits at the right end of the row. In the item outline each row is a 344px-wide wrapper with radius 8 inside a full-width link; the current one gets the #f0f6ff tint and its title steps from 400 14/20 to 600 16/24.
- **Sidebar rows.** Module rows 268x36 (the selected one 268x40), padding 8, radius 8, 2px apart; a 16px ring (1px #8495b0) in a 20px box, label 400 14/20. Selected: #f0f6ff background and the label steps up to 600 16/24. Grades, Notes and the other links are 268x40 rows, 400 16/24, same hover tint; the selected one (Grades, Course Info) gets the tint at rest.
- **Progress bar.** 8px tall, radius 8. Track #f2f5fa with a 1px #f2f5fa border, 425.7 wide under the course title (12px above it); fill #6f29e5 (\`emphasis-quaternary-background-strong\`, purple-750), radius 8.
- **Resume / primary button.** 36px tall, padding 8 / 16, radius 8, Source Sans Pro 600 14/20 with 0.14px tracking, white text. #0056d2 (\`interactive-primary\`, blue-800) at rest; hover #0b408b (\`interactive-primary-hover\`) plus an underline; pressed #3c0f8a (\`interactive-primary-pressed\`, purple-900). A 1px inset shadow in the rest colour; no transition. The large variant (reading, assignment) is 48px tall, padding 12 / 24, 600 16/24 with 0.16px tracking.
- **Tab bar (My Learning).** Tabs 48px tall, padding 12 / 0, 24px apart, label 400 16/24 #404b5e (\`interactive-secondary-inactive\`). The selected tab is 600 16/24 #0d0f12 with 0.16px tracking over a 4px #0d0f12 indicator (radius 2 2 0 0), which sits on a full-width 1px #c1cbdb rule. Hover darkens the label to #232b3a and draws a 4px #c1cbdb bar with the same radius.
- **Focus ring.** CDS buttons and tabs are styled from a class CDS's JavaScript adds on keyboard focus, so it is emulated here (the \`focus-visible-cds\` column): buttons get an ::after ring at inset -2px, radius 8, \`box-shadow: 0 0 0 1px #804ee4, 0 0 0 2px #f0f6ff\` (\`interactive-stroke-primary-focus\`, purple-600, then \`interactive-stroke-primary-focus-invert\`); tabs get a 1px solid #804ee4 outline at offset 2 with radius 8. List links (item rows, sidebar rows) use real \`:focus-visible\`: a 2px solid #804ee4 outline at offset -3.
- **Type scale in use.** Everything is Source Sans Pro. Reading title 400 44/52 (-0.1px); assignment title 600 36/42; My Learning greeting 600 30/36; Grades h1 600 28/36; video title and course info title 600 24/28; module title and sidebar course title 600 20/24; card and rail headings 600 16/20; body 400 16/24; meta and secondary text 400 14/20 in #48546e.

## What could not be reached

The snapshots have no scripts, so anything that needs JavaScript is missing: every menu (app switcher, help, language, notifications, avatar, Explore mega menu, the course overflow "…" menu), the Coursera AI chat panel, opening or closing any accordion or disclosure (only the states captured are measured: Course Material open and closed, objectives shown and hidden, outline modules open and closed), "Show more" expansions, the language select list, calendar month paging, tooltips, the Save note dialog, video playback (the player is a poster frame; the control bar's show/hide is scripted) and the transcript highlight moving. CDS's keyboard focus ring is emulated as described above. The reading in the snapshot has no subheadings, lists, code or tables; their styles come from a probe block the script inserts into the CML viewer (marked as such under "Reading: body paragraph"), plus the authored CML rules listed there. Dark theme was not measured.
`;

const STATE_ORDER = ['default', 'hover', 'focus-visible', 'focus-visible-cds', 'pressed'];
function orderStates(names) {
  return names.slice().sort((a, b) => {
    const ia = STATE_ORDER.indexOf(a);
    const ib = STATE_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return 0;
  });
}
const px = (v) => (v === '0px' ? '0' : v);
function withTok(v, tok) { return tok ? `${v} (${tok})` : v; }
function colorCell(v, prop) {
  if (!v) return '';
  const t = colorTokens(v, prop);
  return withTok(hex(v), t.length ? t.map((n) => n.replace('--cds-color-', '')).join(', ') : 'no token');
}
function paddingCell(s) {
  const vals = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((p) => s[p]);
  if (vals.every((v) => v === '0px')) return '0';
  const uniq = [...new Set(vals)];
  const label = (v) => { const t = pxToken(v, 'spacing'); return t ? `${px(v)} (${t})` : px(v); };
  if (uniq.length === 1) return label(vals[0]);
  if (vals[0] === vals[2] && vals[1] === vals[3]) return `${label(vals[0])} / ${label(vals[1])}`;
  return vals.map(label).join(' ');
}
function borderCell(s) {
  const sides = ['Top', 'Right', 'Bottom', 'Left'].map((d) => (parseFloat(s[`border${d}Width`]) > 0 && s[`border${d}Style`] !== 'none' ? `${s[`border${d}Width`]} ${s[`border${d}Style`]} ${colorCell(s[`border${d}Color`], 'border')}` : 'none'));
  if (sides.every((x) => x === 'none')) return 'none';
  if (new Set(sides).size === 1) return sides[0];
  return ['T', 'R', 'B', 'L'].map((d, i) => `${d}: ${sides[i]}`).filter((x) => !x.endsWith('none')).join('; ');
}
function radiusCell(s) {
  const r = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
  if (r.every((v) => v === '0px')) return '0';
  const u = [...new Set(r)];
  const lab = (v) => { const t = pxToken(v, 'radius'); return t ? `${v} (${t})` : v; };
  return u.length === 1 ? lab(u[0]) : r.map(lab).join(' ');
}
function shadowCell(v) {
  if (!v || v === 'none') return 'none';
  const t = shadowToken(v);
  return withTok(v.replace(/rgba?\([^)]*\)/g, (m) => hex(m)), t ? t.replace('--cds-', '') : null);
}
function fontCell(s) {
  const fam = s.fontFamily.split(',')[0].replace(/"/g, '');
  const t = typoToken(s).map((n) => n.replace('--cds-typography-', 'typography-'));
  return withTok(`${fam} ${s.fontWeight} ${s.fontSize}/${s.lineHeight}${s.letterSpacing !== 'normal' ? `, ${s.letterSpacing}` : ''}`, t.join(', ') || null);
}
function transitionCell(s) {
  if (!s.transitionDuration || /^0s(, 0s)*$/.test(s.transitionDuration)) return 'none';
  const props = s.transitionProperty.split(', ');
  const d = s.transitionDuration.split(', ');
  const f = s.transitionTimingFunction.split(', ');
  return props.map((p, i) => `${p} ${d[i % d.length]} ${f[i % f.length]}`).join(', ');
}
function pseudoCell(st) {
  const p = st['::after'] || st['::before'];
  if (!p) return '';
  const which = st['::after'] ? '::after' : '::before';
  const parts = [`${which} inset ${p.inset}`];
  if (p.boxShadow && p.boxShadow !== 'none') parts.push(`shadow ${p.boxShadow.replace(/rgba?\([^)]*\)/g, (m) => colorCell(m, 'border'))}`);
  if (p.backgroundColor && p.backgroundColor !== 'rgba(0, 0, 0, 0)') parts.push(`bg ${colorCell(p.backgroundColor, 'bg')}`);
  if (parseFloat(p.borderTopWidth) > 0 && p.borderTopStyle !== 'none') parts.push(`border ${p.borderTopWidth} ${p.borderTopStyle} ${colorCell(p.borderTopColor, 'border')}`);
  if (p.borderRadius && p.borderRadius !== '0px') parts.push(`radius ${p.borderRadius}`);
  return parts.join(', ');
}
function paintCell(st) {
  if (!st.paint) return '';
  return st.paint.slice(0, 4).map((p) => `${p.node} ${p.size}${p.bg ? ` bg ${colorCell(p.bg, 'bg')}` : ''}${p.border ? ` border ${p.border.replace(/rgba?\([^)]*\)/g, (m) => colorCell(m, 'border'))}` : ''}${p.radius ? ` r ${p.radius}` : ''}${p.shadow ? ` shadow ${p.shadow}` : ''}${p.outline ? ` outline ${p.outline}` : ''}`).join('; ');
}
function rows(st) {
  const s = st.style;
  const out = {
    'Size (w×h)': `${st.rect.w}×${st.rect.h}`,
    Padding: paddingCell(s),
    Gap: s.gap && s.gap !== 'normal' ? withTok(s.gap, pxToken(s.gap, 'spacing')) : '',
    Border: borderCell(s),
    Radius: radiusCell(s),
    Background: colorCell(s.backgroundColor, 'bg') + (s.backgroundImage !== 'none' ? ` + ${s.backgroundImage.slice(0, 120)}` : ''),
    'Box shadow': shadowCell(s.boxShadow),
    Outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? `${s.outlineWidth} ${s.outlineStyle} ${colorCell(s.outlineColor, 'border')} offset ${s.outlineOffset}` : 'none',
    'Pseudo element': pseudoCell(st),
    'Painted layers': paintCell(st),
    Font: fontCell(s),
    Colour: colorCell(s.color, 'color'),
    'Text decoration': s.textDecorationLine === 'none' ? 'none' : `${s.textDecorationLine} ${s.textDecorationThickness} offset ${s.textUnderlineOffset}`,
    Opacity: s.opacity,
    Transform: s.transform,
    Transition: transitionCell(s),
    Cursor: s.cursor,
    Icon: st.icon && st.rect.w * st.rect.h < 60000 ? `${st.icon.w}×${st.icon.h}, fill ${colorCell(st.icon.fill, 'color')}, color ${colorCell(st.icon.color, 'color')}` : '',
  };
  return out;
}
const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function buildMd(out) {
  const L = [];
  L.push('# Raw measurements (computed styles, CSS px), coursera.org signed-in learner pages, 2026-09-29');
  L.push('');
  L.push('Read from the 11 redacted static snapshots in `raw/snapshots/` (stylesheets inlined from the CSSOM, scripts stripped), rendered by `tools/capture/signed-in/measure.mjs` in headless Chromium at 1440x900 @2x, light theme. The full per-state data, including every painted child layer, the authored state rules that match each element and the `extra` sub-measurements, is in `raw/components-signed-in.json`; crops are in `components/crops/signed-in/<component>-<state>.png` (256 colours).');
  L.push('');
  L.push('Colours are written as hex and mapped to `--cds-color-*` tokens by matching the light value of `light-dark()` in `raw/css-vars.json` (semantic names first, the palette name last; the `--cds-color-` prefix is dropped in the tables). "no token" means no token has that light value. Spacing, radius, font size and typography tokens are matched the same way.');
  L.push('');
  L.push('## States');
  L.push('');
  L.push('| State | How it was reached |');
  L.push('| --- | --- |');
  for (const [k, v] of Object.entries(out._meta.states)) L.push(`| ${k} | ${esc(v)} |`);
  L.push('');
  L.push('`focus-visible-cds` needs a note. CDS does not style `:focus-visible`: its focus ring rules are keyed on classes (`cds-buttonBase-focusVisible`, `cds-button-focusVisible`, `cds-link-focusVisible`, `cds-tab-focusVisible`) that its JavaScript adds on a keyboard focus. With scripts stripped, a real Tab gives only what native `:focus-visible` rules paint, which is the `focus-visible` column. The `focus-visible-cds` column adds the class the stylesheet pairs with the element\'s own Emotion class, so it shows the authored ring, and it is emulated.');
  L.push('');
  L.push('Cells in a state column that repeat the default are written as `=`.');
  L.push('');
  L.push(INTRO.trim());
  L.push('');
  const groups = [
    ['Page shells and grid', /^shell-/],
    ['Top bar', /^topbar-/],
    ['Course sidebar', /^sidebar-/],
    ['Module page', /^(module-|lesson-|item-row|item-resume|item-status|item-due)/],
    ['Right rail', /^rail-/],
    ['Grades', /^grades-/],
    ['Course info', /^info-/],
    ['Item outline panel', /^outline-/],
    ['Video item', /^(video-|ai-|item-feedback-icon|next-item|tool-)/],
    ['Transcript', /^transcript-/],
    ['Reading item', /^(reading-|item-feedback-text|item-footer)/],
    ['Assignment item', /^assignment-/],
    ['My Learning', /^(ml-|mlc-)/],
  ];
  const seen = new Set();
  for (const [title, re] of groups) {
    const keys = Object.keys(out.components).filter((k) => re.test(k) && !seen.has(k));
    if (!keys.length) continue;
    L.push(`## ${title}`);
    L.push('');
    for (const key of keys) {
      seen.add(key);
      const c = out.components[key];
      const names = orderStates(Object.keys(c.states).filter((s) => c.states[s] && !c.states[s].error));
      const errs = Object.entries(c.states).filter(([, v]) => v.error);
      L.push(`### ${c.name || key}`);
      L.push('');
      if (c.description) L.push(c.description);
      L.push('');
      L.push(`Key \`${key}\`. Read from ${Object.entries(c.selectors || {}).map(([p, s]) => `\`${esc(s)}\` on ${out._meta.pages[p] ? out._meta.pages[p].label : p}`).join('; ')}.`);
      L.push('');
      if (!names.length) { L.push(`Not measured: ${errs.map(([s, v]) => `${s}: ${v.error}`).join('; ')}`); L.push(''); continue; }
      const base = c.states.default ? rows(c.states.default) : null;
      const table = names.map((n) => rows(c.states[n]));
      const labels = Object.keys(table[0]).filter((lab) => table.some((t) => t[lab] && t[lab] !== 'none' && t[lab] !== '0' && t[lab] !== '1' && !(lab === 'Cursor' && t[lab] === 'auto') && !(lab === 'Transform' && t[lab] === 'none')));
      L.push(`| Property | ${names.join(' | ')} |`);
      L.push(`| --- | ${names.map(() => '---').join(' | ')} |`);
      for (const lab of labels) {
        const cells = table.map((t, i) => (i > 0 && base && names[i] !== 'default' && t[lab] === base[lab] && !c.states[names[i]].via?.startsWith('at rest, captured') ? '=' : t[lab] || ''));
        L.push(`| ${lab} | ${cells.map(esc).join(' | ')} |`);
      }
      L.push(`| Crop | ${names.map((n) => (c.states[n].crop ? `[png](../${c.states[n].crop})` : c.states[n].cropError ? `none (${esc(c.states[n].cropError)})` : 'none')).join(' | ')} |`);
      L.push('');
      const vias = names.filter((n) => c.states[n].via && !/^at rest$/.test(c.states[n].via)).map((n) => `${n}: ${c.states[n].via}${c.states[n].focus && !c.states[n].focus.matches ? ' (element did not match :focus-visible)' : ''}`);
      if (vias.length) { L.push(`How: ${vias.map(esc).join('; ')}.`); L.push(''); }
      if (errs.length) { L.push(`Could not measure: ${errs.map(([s, v]) => `${s} (${esc(v.error)})`).join('; ')}.`); L.push(''); }
      for (const n of names.filter((x) => c.states[x].extra)) {
        L.push(n === 'default' ? 'Sub-measurements:' : `Sub-measurements, ${n}:`);
        L.push('');
        for (const [k, v] of Object.entries(c.states[n].extra)) {
          if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
            L.push(`- ${k} (${v.length}):`);
            for (const r of v) L.push(`  - \`${esc(r.replace(/`/g, "'"))}\``);
          } else if (v && typeof v === 'object' && !Array.isArray(v) && !v.rect && !v.gaps && Object.values(v).some((x) => x && x.rect)) {
            L.push(`- ${k}:`);
            for (const [kk, vv] of Object.entries(v)) L.push(`  - ${kk}: ${esc(summarise(vv))}`);
          } else L.push(`- ${k}: ${esc(summarise(v))}`);
        }
        L.push('');
      }
      if (c.rules && c.rules.length) {
        L.push(`Authored state rules that match this element (${c.rules.length}, first 6; the rest are in the JSON):`);
        L.push('');
        for (const r of c.rules.slice(0, 6)) L.push(`- \`${esc(r.replace(/`/g, "'").slice(0, 260))}\``);
        L.push('');
      }
    }
  }
  return L.join('\n') + '\n';
}
function summarise(v) {
  if (v == null) return 'none';
  if (Array.isArray(v)) return v.map(summarise).join(' ; ');
  if (typeof v !== 'object') return String(v);
  if (v.rect) {
    const parts = [`${v.tag} ${v.rect.w}×${v.rect.h} at (${v.rect.x}, ${v.rect.y})`];
    if (v.name || v.label) parts.unshift(v.name || v.label);
    if (typeof v.text === 'string' && !v.name && !v.label) parts.push(`"${v.text.slice(0, 40)}"`);
    parts.push(`font ${v.font}${v.letterSpacing !== 'normal' ? ` ls ${v.letterSpacing}` : ''}`);
    parts.push(`colour ${colorCell(v.color, 'color')}`);
    if (v.bg) parts.push(`bg ${colorCell(v.bg, 'bg')}`);
    if (v.bgImage) parts.push(`bg-image ${v.bgImage}`);
    if (v.border) parts.push(`border ${v.border.replace(/rgba?\([^)]*\)/g, (m) => colorCell(m, 'border'))}`);
    if (v.radius) parts.push(`radius ${v.radius}`);
    if (v.padding) parts.push(`padding ${v.padding}`);
    if (v.margin) parts.push(`margin ${v.margin}`);
    if (v.gap) parts.push(`gap ${v.gap}`);
    if (v.boxShadow) parts.push(`shadow ${v.boxShadow.replace(/rgba?\([^)]*\)/g, (m) => hex(m))}`);
    if (v.outline) parts.push(`outline ${v.outline}`);
    if (v.textDecoration) parts.push(`decoration ${v.textDecoration}`);
    if (v.fill) parts.push(`fill ${colorCell(v.fill, 'color')}`);
    if (v.overflowY) parts.push(`overflow-y ${v.overflowY}`);
    if (v.scrollHeight) parts.push(`scrollHeight ${v.scrollHeight}`);
    if (v.marginTop !== undefined) parts.push(`margin-top ${v.marginTop}, margin-bottom ${v.marginBottom}, padding-left ${v.paddingLeft}, list-style ${v.listStyleType}`);
    const BOX = new Set(['tag', 'rect', 'font', 'letterSpacing', 'color', 'text', 'bg', 'bgImage', 'padding', 'margin', 'gap', 'radius', 'boxShadow', 'textDecoration', 'textTransform', 'opacity', 'display', 'overflowY', 'border', 'outline', 'fill', 'stroke', 'name', 'label', 'scrollHeight', 'marginTop', 'marginBottom', 'paddingLeft', 'listStyleType']);
    const nested = Object.entries(v).filter(([k, x]) => (!BOX.has(k) || (k === 'text' && typeof x !== 'string')) && x != null);
    return parts.join(', ') + nested.map(([k, x]) => ` [${k}: ${summarise(x)}]`).join('');
  }
  if (v.gaps && v.sizes) return `${v.count} items, sizes ${v.sizes.join(' ')}, gaps ${v.gaps.map((g) => (g.dx !== undefined ? `dx ${g.dx}` : `dy ${g.dy} (pitch ${g.pitch})`)).join(' ')}`;
  if (v.content) return `${v.content} ${v.width}×${v.height} ${v.position} inset ${v.inset} bg ${colorCell(v.bg, 'bg')} border ${v.border} left ${v.borderLeft} radius ${v.radius}${v.bgImage && v.bgImage !== 'none' ? ` bg-image ${v.bgImage}` : ''}`;
  return Object.entries(v).map(([k, x]) => `${k}: ${summarise(x)}`).join('; ');
}

// ---------------------------------------------------------------- main

let data;
if (MD_ONLY) data = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
else data = await run();
fs.writeFileSync(OUT_MD, buildMd(data));
log('wrote', path.relative(REF, OUT_JSON), path.relative(REF, OUT_MD), `${Object.keys(data.components).length} components`);
