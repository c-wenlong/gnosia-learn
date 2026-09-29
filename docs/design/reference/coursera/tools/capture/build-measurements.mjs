// Builds raw/measurements.md from raw/components-computed.json and
// raw/css-vars.json. Every colour, shadow, radius and type style is matched
// against the --cds-* tokens (the light value of each light-dark() pair).
//
//   node build-measurements.mjs
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const RAW = path.resolve(HERE, '..', '..', 'raw');
const REF = path.resolve(RAW, '..');
const data = JSON.parse(fs.readFileSync(path.join(RAW, 'components-computed.json'), 'utf8'));
const vars = JSON.parse(fs.readFileSync(path.join(RAW, 'css-vars.json'), 'utf8'));
const C = data.components;

// The hand-written head of measurements.md: how it was read, and the facts
// that matter most for a rebuild.
const INTRO = `# Raw measurements (computed styles, CSS px), coursera.org, captured {{captured}}

{{components}} components, {{states}} component states, {{crops}} crops in [components/crops/](../components/crops/). Every value below was read from the live public pages with \`getComputedStyle\` and \`getBoundingClientRect\`; nothing is estimated. The machine-readable copy is [components-computed.json](components-computed.json), keyed by component, then state. Tokens are matched against [css-vars.json](css-vars.json) (the light half of each \`light-dark()\` pair).

## How it was read

- Pages: \`/search?query=machine%20learning\`, \`/learn/machine-learning\`, \`/specializations/machine-learning-introduction\`, \`/\` (header, mega menu, footer).
- Headless Chromium (Playwright 1.63), desktop Chrome user agent, 1440x900 at deviceScaleFactor 2, 6.5s settle after \`domcontentloaded\`, one slow scroll through each page so lazy sections mount. The cookie banner is removed and the AI coach side panel is closed with its own close button (it opens by default and squeezes \`<main>\` to 1024px).
- States: \`hover\` is a real mouse hover with a 450ms settle. \`focus-visible\` is a real keyboard focus (focus, Shift+Tab, Tab), so CDS's \`cds-buttonBase-focusVisible\` class and the browser's \`:focus-visible\` both apply. \`pressed\` is \`:active:hover\` forced with the DevTools protocol (\`CSS.forcePseudoState\`); no mouse button is ever pressed, so no link, submit or Enroll button fires. \`expanded\`, \`opened\`, \`checked\` and \`selected\` come from clicking UI toggles only (accordions, the Explore menu, a filter checkbox with View never pressed, the select, the (i) help button). Nothing was signed into, enrolled in or submitted.
- Scripts: [tools/capture/measure.mjs](../tools/capture/measure.mjs) (measure and crop), [tools/capture/lib.mjs](../tools/capture/lib.mjs) (computed-style reader, crop and quantize), [tools/capture/build-measurements.mjs](../tools/capture/build-measurements.mjs) (this file), [tools/capture/explore.mjs](../tools/capture/explore.mjs) (class inventory pass).
- Hooks: most sections carry \`data-testid\`; the hero, its title, the Enroll button and the stats slot carry \`data-e2e\` instead (\`[data-e2e=hero-module]\`, \`[data-e2e=hero-title]\`, \`[data-e2e=enroll-button]\`, \`[data-e2e=key-information]\`). Several blocks exist twice in the DOM (a hidden mobile copy at 0x0 and the visible one); every measurement takes the visible one.

## Ten facts for a Coursera-style course list and course page

1. Type is one family, Source Sans Pro, at weights 400 / 600 / 700. Body is 16/24 400 (\`--cds-typography-body1\`), secondary lines 14/20 in \`#48546e\` (\`--cds-color-neutral-primary-weak\`), card metadata 12/18. Headings are 600 with slight negative tracking: hero title 44/52 -0.1px (\`--cds-typography-display2\`), section headings 20/28 or 20/24, "Build your subject-matter expertise" 28/36, module titles 20/28, FAQ questions and card titles 16/20 -0.048px. Primary text is \`#0d0f12\` (\`--cds-color-grey-975\`), not black.
2. Buttons are 8px radius (\`--cds-border-radius-100\`) with +0.01em label tracking; labels are 600, except the header's Log In and Explore ghosts (400) and Join for Free (700). Medium is 36px tall, padding 8px 16px, 14/20; large is 48px, padding 12px 24px, 16/24. Primary is \`#0056d2\` (\`--cds-color-interactive-primary\`), hover \`#0b408b\`, pressed \`#3c0f8a\` (a purple, \`--cds-color-interactive-primary-pressed\`). State changes are instant: the computed transition on every button is \`none\`.
3. The secondary (outlined) button draws its 1px edge with \`box-shadow: inset 0 0 0 1px\` in the label colour (its CSS border is 0): white fill and \`#0056d2\` at rest, \`#f0f6ff\` fill and \`#0b408b\` on hover, \`#f9f5ff\` and \`#3c0f8a\` pressed. Ghost buttons are transparent blue text that underlines on hover; the header's Explore/Degrees ghosts are grey \`#48546e\` and gain a \`#f0f6ff\` pill on hover and while the menu is open.
4. "Enroll for free" is the same primary button at 256x64: padding 11px 80px 13px, "Enroll for free" 16/24 600 over "Starts Sep 29" 12.8/16 600, both white. The sticky-nav copy is 180x60 with 32px side padding.
5. Focus ring (all CDS controls): two 1px rings outside the element, \`0 0 0 1px #804ee4, 0 0 0 2px #f0f6ff\` (\`--cds-color-interactive-stroke-primary-focus\` then \`...-focus-invert\`), painted on an \`::after\` inset -2px with the control's own radius, plus a transparent 1px outline for forced-colours mode. Links put the same two-ring box-shadow straight on the \`<a>\` with a 4px radius; the checkbox adds a 2px white gap first; the in-page tabs instead use \`outline: 1px solid #0056d2; outline-offset: -1px\`. The search results' filter pills are not CDS and fall back to the browser's blue \`auto\` outline.
6. Search product card: 335x416, white, 1px \`#c1cbdb\` border (\`--cds-color-neutral-stroke-primary-weak\`), 16px radius (\`--cds-border-radius-200\`), no shadow at rest. Hover adds \`0 0 4px 0 #e9eef7, 0 4px 12px 4px rgba(15,17,20,.1)\` (the geometry of \`--cds-elevation-level2\` with a grey-50 first layer), \`transition: all .3s cubic-bezier(0,0,.5,1)\`. The 16:9 image is inset 8px with an 8px radius. Four cards per row at 1440 with a 12px gutter; three at 1024, two at 768, one at 390.
7. Card contents: 38px partner logo in a 1px-bordered 5px-radius square, partner name 16/24, title 16/20 600, "Skills you'll gain" 12/18 \`#48546e\` clamped to three lines, metadata "★ 4.9 (39K) · Beginner · Specialization · 1 - 3 Months" 12/18 \`#48546e\`, then pill tags 20px tall, 14/18 600: Free trial \`#f0f6ff\` on \`#0d2f60\`, Top AI program \`#e8d6ff\` on \`#2c0b65\`.
8. Course hero: a full-bleed 2880x524 band at \`rgba(0,86,210,.05)\` (sampled \`#f2f6fd\` on white; no token) with a 566x465 decorative Coursera-C at the right in \`#e3eeff\` and \`#6d7c99\`. Partner logos 36px tall split by a 2x32 \`#a7b4c9\` rule; "Top Instructor" is 16/20 600 \`#0d2f60\` on \`#cfe2ff\`, radius 4, padding 1px 5px.
9. The stats card overlaps the hero bottom (\`margin-top: -76px\`): 1344x114, white, 1px \`#e9eef7\` border, 8px radius, \`box-shadow: 0 8px 16px rgba(15,17,20,.2)\` (no elevation token), cells separated by 1px \`#e9eef7\` left borders; values 20/24 600, sub-lines 14/20 \`#48546e\`.
10. Tab bar: 44px tall tabs, padding 10px 12px, 16/24 600, radius 4. Selected is \`#0056d2\` underlined text on \`#f2f5fa\`; hover is \`#f0f6ff\`. Past the hero a fixed 146px white sticky nav appears (\`0 2px 12px rgba(0,0,0,.24)\`), with title row, compact Enroll and the same tabs under a 2px \`#e9eef7\` rule. The module list sits in a 2px \`#e9eef7\` bordered, 8px-radius box with 2px \`#e9eef7\` rules between items; module headers are full-width 76px ghost buttons (hover \`#f0f6ff\`). FAQ items are split by 1px \`#e9eef7\` rules, with a leading 24px chevron that rotates in \`150ms ease-in-out\`.

## Gaps

- No left filter panel exists on the search page any more. Filters are pill dropdowns in a sticky bar (Topic, Duration, Learning Product, Language, Level, AI topic pills) opening a checkbox popover, plus a Filter & Sort side sheet. There is no sort dropdown: sort is the "Sort by" radio group (Best Match / Newest) at the top of that sheet, measured as \`radio\` and \`filter-accordion\`.
- \`pill\` hover: the home-page partner pills sit in a horizontal carousel and Playwright reports the pill outside the viewport even when centred, so only default and focus-visible were read.
- \`select-option\` focus-visible: after ArrowDown in the open select no option carried \`:focus\`, \`data-focus-visible\` or \`data-focused\`, so that state is missing; selected and hover are measured.
- The overflow chevron at the end of the in-page tab bar is not reported visible to Playwright at 1440, so it has no entry; its two gradient fades are in the \`tab-bar\` paint list.
- The contextual (i) next to "Recommended experience" opens a modal dialog, not a hover tooltip; both are measured (\`help-dialog\`, \`tooltip\`, \`tooltip-icon\`).
- No disabled primary button appeared on these pages; disabled ghost and disabled secondary were measured in the filter popover and sheet.
- The AI coach panel, cookie banner, sign-in and enrollment flows were deliberately not measured.
`;

// ---------- token matching ----------

// Replace every light-dark(a, b) with a (nested-paren aware).
function lightOf(v) {
  let out = '';
  let i = 0;
  while (i < v.length) {
    const j = v.indexOf('light-dark(', i);
    if (j < 0) { out += v.slice(i); break; }
    out += v.slice(i, j);
    let k = j + 'light-dark('.length;
    let depth = 1;
    let comma = -1;
    for (; k < v.length && depth; k++) {
      if (v[k] === '(') depth++;
      else if (v[k] === ')') depth--;
      else if (v[k] === ',' && depth === 1 && comma < 0) comma = k;
    }
    out += v.slice(j + 'light-dark('.length, comma).trim();
    i = k;
  }
  return out.trim();
}

function rgba(v) {
  if (!v) return null;
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, 1]; }
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
  m = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], +a.toFixed(3)];
  }
  return null;
}
const key = (c) => c && `${c[0]},${c[1]},${c[2]},${+c[3].toFixed(2)}`;

const colorTokens = {};
for (const [n, raw] of Object.entries(vars.resolved)) {
  const c = rgba(lightOf(raw));
  if (!c) continue;
  (colorTokens[key(c)] ||= []).push(n);
}

function colorTok(css, role = 'fg') {
  const c = rgba(css);
  if (!c) return '';
  if (c[3] === 0) return 'transparent';
  const names = colorTokens[key(c)] || [];
  if (!names.length) return 'no token';
  const score = (n) => {
    let s = 0;
    if (/-color-(interactive|neutral|feedback|callouts|emphasis|utility)/.test(n)) s += 10;
    if (role === 'bg' && /background/.test(n)) s += 5;
    if (role === 'border' && /stroke/.test(n)) s += 5;
    if (role === 'fg' && !/background|stroke/.test(n)) s += 5;
    if (/interactive/.test(n)) s += 2;
    if (/neutral/.test(n)) s += 1;
    if (/invert|weak|pressed|selected|disabled/.test(n)) s -= 1;
    return s;
  };
  const sem = names.filter((n) => !/-color-(grey|blue|red|green|yellow|purple|pink|darken|lighten|white)-/.test(n)).sort((a, b) => score(b) - score(a));
  const pal = names.filter((n) => /-color-(grey|blue|red|green|yellow|purple|pink|darken|lighten|white)-/.test(n));
  return [sem[0], pal[0]].filter(Boolean).map((n) => '`' + n + '`').join(' / ');
}

function hex(css) {
  const c = rgba(css);
  if (!c) return css;
  if (c[3] === 0) return 'transparent';
  const h = '#' + c.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('');
  return c[3] === 1 ? h : `${h} @ ${c[3]}`;
}
const col = (css, role) => {
  if (!css) return '';
  const c = rgba(css);
  if (c && c[3] === 0) return 'transparent';
  const t = colorTok(css, role);
  return `${hex(css)}${t ? ' ' + t : ''}`;
};

// Shadows: normalise to "x y blur spread r,g,b,a" lists.
function shadows(v) {
  if (!v || v === 'none') return [];
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => {
    const cm = p.match(/rgba?\([^)]*\)|#[0-9a-f]{3,6}/i);
    const c = cm ? rgba(cm[0]) : null;
    const nums = p.replace(cm ? cm[0] : '', '').match(/-?[\d.]+px/g) || [];
    const inset = /inset/.test(p);
    return `${inset ? 'inset ' : ''}${nums.map((n) => parseFloat(n)).join(' ')} ${key(c)}`;
  });
}
const elevation = {};
for (const n of Object.keys(vars.resolved).filter((n) => n.startsWith('--cds-elevation'))) elevation[n] = shadows(lightOf(vars.resolved[n])).join(' | ');
function shadowTok(v) {
  const s = shadows(v).join(' | ');
  for (const [n, e] of Object.entries(elevation)) if (e === s) return '`' + n + '`';
  return '';
}
const fmtShadow = (v) => {
  if (!v || v === 'none') return 'none';
  const t = shadowTok(v);
  const pretty = v.replace(/rgba?\([^)]*\)/g, (m) => hex(m));
  return `${pretty}${t ? ' = ' + t : ' (no elevation token)'}`;
};

const radiusTok = {};
for (const n of Object.keys(vars.resolved).filter((n) => n.startsWith('--cds-border-radius'))) radiusTok[vars.resolved[n]] = n;
const radius = (s) => {
  const r = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
  const same = r.every((x) => x === r[0]);
  const v = same ? r[0] : r.join(' ');
  const t = same && radiusTok[r[0]] ? ' `' + radiusTok[r[0]] + '`' : '';
  return v + t;
};

const typo = [];
for (const [n, v] of Object.entries(vars.resolved)) {
  if (!n.startsWith('--cds-typography-')) continue;
  const m = v.match(/^(\d+)\s+([\d.]+)rem\/([\d.]+)rem/);
  if (m) typo.push({ n, w: m[1], size: +m[2] * 16, lh: +m[3] * 16 });
}
function typoTok(s) {
  const size = parseFloat(s.fontSize);
  const lh = parseFloat(s.lineHeight);
  const hits = typo.filter((t) => t.w === s.fontWeight && t.size === size && t.lh === lh).map((t) => t.n);
  if (!hits.length) return '';
  hits.sort((a, b) => a.length - b.length);
  return hits.slice(0, 2).map((h) => '`' + h + '`').join(', ');
}
const family = (f) => (f || '').split(',')[0].replace(/"/g, '');
const font = (s) => `${family(s.fontFamily)} ${parseFloat(s.fontSize)}/${s.lineHeight === 'normal' ? 'normal' : parseFloat(s.lineHeight)} ${s.fontWeight}`;

const box4 = (a, b, c, d) => {
  const v = [a, b, c, d].map((x) => (x === '0px' ? '0' : x));
  if (v.every((x) => x === v[0])) return v[0];
  if (v[0] === v[2] && v[1] === v[3]) return `${v[0]} ${v[1]}`;
  return v.join(' ');
};
function border(s) {
  const sides = ['Top', 'Right', 'Bottom', 'Left'].map((sd) => (parseFloat(s[`border${sd}Width`]) > 0 && s[`border${sd}Style`] !== 'none' ? `${s[`border${sd}Width`]} ${s[`border${sd}Style`]} ${col(s[`border${sd}Color`], 'border')}` : 'none'));
  if (sides.every((x) => x === sides[0])) return sides[0];
  return ['T', 'R', 'B', 'L'].map((l, i) => `${l}: ${sides[i]}`).filter((x) => !x.endsWith('none')).join('; ');
}
const transition = (s) => {
  if (!s.transitionDuration || s.transitionDuration.split(',').every((d) => d.trim() === '0s')) return 'none';
  const p = s.transitionProperty.split(',').map((x) => x.trim());
  const d = s.transitionDuration.split(',').map((x) => x.trim());
  const e = s.transitionTimingFunction.split(/,(?![^(]*\))/).map((x) => x.trim());
  const dl = (s.transitionDelay || '').split(',').map((x) => x.trim());
  return p.map((pp, i) => `${pp} ${d[i % d.length]} ${e[i % e.length]}${dl[i % dl.length] && dl[i % dl.length] !== '0s' ? ' ' + dl[i % dl.length] : ''}`).join(', ');
};
const deco = (s) => {
  if (!s.textDecorationLine || s.textDecorationLine === 'none') return 'none';
  return `${s.textDecorationLine}${s.textDecorationThickness && s.textDecorationThickness !== 'auto' ? ' ' + s.textDecorationThickness : ''}${s.textUnderlineOffset && s.textUnderlineOffset !== 'auto' ? ' offset ' + s.textUnderlineOffset : ''}`;
};
const pseudo = (p) => (p ? `${parseFloat(p.width).toFixed(1)} x ${parseFloat(p.height).toFixed(1)}, inset ${p.inset}, radius ${p.borderRadius}, shadow ${fmtShadow(p.boxShadow)}${p.backgroundColor && rgba(p.backgroundColor)?.[3] ? ', bg ' + col(p.backgroundColor, 'bg') : ''}${p.borderTopStyle !== 'none' && parseFloat(p.borderTopWidth) ? `, border ${p.borderTopWidth} ${p.borderTopStyle} ${col(p.borderTopColor, 'border')}` : ''}` : '');

const ROWS = [
  ['Size (w x h)', (v) => `${v.rect.w} x ${v.rect.h}`],
  ['Padding', (v, s) => box4(s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft)],
  ['Margin', (v, s) => box4(s.marginTop, s.marginRight, s.marginBottom, s.marginLeft)],
  ['Gap', (v, s) => (s.gap === 'normal' ? 'normal' : s.gap)],
  ['Display', (v, s) => `${s.display}${s.display.includes('flex') ? ' ' + s.flexDirection + ', align ' + s.alignItems + ', justify ' + s.justifyContent : ''}`],
  ['Border', (v, s) => border(s)],
  ['Radius', (v, s) => radius(s)],
  ['Background', (v, s) => col(s.backgroundColor, 'bg') + (s.backgroundImage !== 'none' ? ` + ${s.backgroundImage.slice(0, 160)}` : '')],
  ['Box shadow', (v, s) => fmtShadow(s.boxShadow)],
  ['Outline', (v, s) => (s.outlineStyle === 'none' ? 'none' : `${s.outlineWidth} ${s.outlineStyle} ${col(s.outlineColor)} offset ${s.outlineOffset}`)],
  ['Font', (v, s) => `${font(s)}${typoTok(s) ? ' ' + typoTok(s) : ''}`],
  ['Letter spacing', (v, s) => s.letterSpacing],
  ['Text node font', (v) => (v.textStyle ? `${v.textStyle.node}: ${font(v.textStyle)}${typoTok(v.textStyle) ? ' ' + typoTok(v.textStyle) : ''}, ls ${v.textStyle.letterSpacing}` : '')],
  ['Text node colour', (v) => (v.textStyle ? col(v.textStyle.color, 'fg') + (v.textStyle.textDecorationLine !== 'none' ? ', ' + v.textStyle.textDecorationLine : '') : '')],
  ['Colour', (v, s) => col(s.color, 'fg')],
  ['Text decoration', (v, s) => deco(s)],
  ['Transition', (v, s) => transition(s)],
  ['Cursor', (v, s) => s.cursor],
  ['Opacity', (v, s) => s.opacity],
  ['Transform', (v, s) => (s.transform === 'matrix(1, 0, 0, 1, 0, 0)' ? 'none' : s.transform)],
  ['Icon', (v) => (v.icon ? `${v.icon.w} x ${v.icon.h}, colour ${col(v.icon.color)}` : '')],
  ['::before', (v) => pseudo(v['::before'])],
  ['::after', (v) => pseudo(v['::after'])],
  ['Placeholder', (v) => (v.placeholder ? `${col(v.placeholder.color)}, opacity ${v.placeholder.opacity}` : '')],
];
const DEFAULTS = { 'Text node font': '', 'Text node colour': '', Margin: '0', Gap: 'normal', Outline: 'none', 'Letter spacing': 'normal', Opacity: '1', Transform: 'none', Icon: '', '::before': '', '::after': '', Placeholder: '', 'Text decoration': 'none', Cursor: 'auto', 'Box shadow': 'none', Border: 'none', Transition: 'none' };

const esc = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(c) {
  const sts = Object.entries(c.states).filter(([, v]) => v && v.style);
  if (!sts.length) return '';
  const head = ['Property', ...sts.map(([k]) => k)];
  const lines = [];
  for (const [name, fn] of ROWS) {
    const vals = sts.map(([, v]) => { try { return fn(v, v.style) ?? ''; } catch { return ''; } });
    if (vals.every((x) => x === '' || x === DEFAULTS[name])) continue;
    const cells = vals.map((x, i) => (i > 0 && x === vals[0] ? 'same' : x));
    lines.push(`| ${name} | ${cells.map(esc).join(' | ')} |`);
  }
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...lines].join('\n');
}

function paintNotes(c) {
  const out = [];
  let prev = null;
  for (const v of Object.values(c.states)) {
    if (!v || !v.paint) continue;
    const s = JSON.stringify(v.paint);
    if (s === prev) continue;
    prev = s;
    const items = v.paint.slice(0, 6).map((p) => {
      const bits = [p.node, p.size];
      if (p.bg) bits.push('bg ' + col(p.bg, 'bg'));
      if (p.bgImage) bits.push('bg-image ' + p.bgImage.slice(0, 120));
      if (p.border) {
        const sides = p.border.split(' | ').map((x) => x.slice(2));
        const b = sides.length === 4 && sides.every((x) => x === sides[0]) ? sides[0] : p.border;
        bits.push('border ' + b.replace(/rgba?\([^)]*\)/g, (m) => col(m, 'border')));
      }
      if (p.shadow) bits.push('shadow ' + fmtShadow(p.shadow));
      if (p.outline) bits.push('outline ' + p.outline.replace(/rgba?\([^)]*\)/g, (m) => hex(m)));
      if (p.radius) bits.push('radius ' + p.radius);
      if (p.inset) bits.push('inset ' + p.inset);
      return bits.join(', ');
    });
    if (v.ancestors) items.push(...v.ancestors.map((a) => `ancestor +${a.up} ${a.node}${a.shadow ? ', shadow ' + fmtShadow(a.shadow) : ''}${a.outline ? ', outline ' + a.outline.replace(/rgba?\([^)]*\)/g, (m) => hex(m)) : ''}${a.bg && hex(a.bg) !== 'transparent' ? ', bg ' + col(a.bg, 'bg') : ''}, radius ${a.radius}`));
    out.push(`- Painted in \`${st}\`: ${items.map(esc).join('; ')}`);
  }
  return out.join('\n');
}

function extraNotes(c) {
  const out = [];
  let prevExtra = null;
  for (const v of Object.values(c.states)) {
    const ex = v && v.extra ? JSON.stringify(v.extra) : null;
    if (ex && ex === prevExtra) { if (v && v.via && !['at rest'].includes(v.via)) out.push(`- \`${st}\` reached by: ${v.via}`); continue; }
    prevExtra = ex || prevExtra;
    if (v && v.extra) out.push(`- Extra (\`${st}\`): \`${JSON.stringify(v.extra).replace(/rgba?\([^)]*\)/g, (m) => hex(m)).replace(/"Source Sans Pro\\", Arial, sans-serif/g, 'SSP').slice(0, 900)}\``);
    if (v && v.error) out.push(`- \`${st}\` not captured: ${v.error.split('\n')[0].slice(0, 160)}`);
    if (v && v.via && !['at rest'].includes(v.via)) out.push(`- \`${st}\` reached by: ${v.via}`);
  }
  if (c.repeat) out.push(`- Repeated items: ${c.repeat.count} measured, sizes ${c.repeat.sizes.join(', ')}, gaps ${c.repeat.gaps.map((g) => (g.dx !== undefined ? `dx ${g.dx}` : `dy ${g.dy}`)).join(', ')}`);
  if (c.grid) out.push(`- Grid: \`${JSON.stringify(c.grid)}\``);
  if (c.columns) out.push(`- Columns: ${c.columns.count}, sizes ${c.columns.sizes.join(', ')}, gaps ${c.columns.gaps.map((g) => (g.dx !== undefined ? `dx ${g.dx}` : `dy ${g.dy}`)).join(', ')}`);
  return out.join('\n');
}

// ---------- sections ----------

const GROUPS = [
  ['Global header', /^(header-|button-ghost-nav|mega-menu|search-|icon-button-search|icon-button-ghost)/],
  ['Buttons', /^(button-|icon-button-close|icon-button-dialog|show-more|contextual-help-button|spec-course-toggle)/],
  ['Links and breadcrumbs', /^(link-|breadcrumb|instructor-name|spec-course-title-link)/],
  ['Search results: filters', /^(chip-suggestion|filter-|checkbox|radio|select)/],
  ['Product cards and tags', /^(product-card|tag-)/],
  ['Chips and pills', /^(chip|pill|skill-chip)/],
  ['Course hero and stats card', /^(course-hero|hero-|badge-|stats-card|spec-hero|help-dialog|tooltip)/],
  ['In-page tab bar and sticky nav', /^(tab|sticky-nav)/],
  ['About: learn, skills, details', /^(learn-|section-heading|details-|heading-lg|outcomes-|bullet-list)/],
  ['Modules and course list', /^(module|spec-course-accordion|credits)/],
  ['Instructors, testimonials, reviews, FAQ', /^(instructor|testimonial|ratings|review|faq|more-questions|promo-band)/],
  ['Footer', /^(footer)/],
];
const placed = new Set();
const groups = GROUPS.map(([g, re]) => {
  const keys = Object.keys(C).filter((k) => !placed.has(k) && re.test(k));
  keys.forEach((k) => placed.add(k));
  return [g, keys];
});
const rest = Object.keys(C).filter((k) => !placed.has(k));
if (rest.length) groups.push(['Other', rest]);

// cds class inventory
const allClasses = new Set();
for (const s of Object.values(data._meta.sheets || {})) for (const c of s.classes) allClasses.add(c);
const numbered = [...allClasses].filter((c) => /^cds-\d+$/.test(c)).length;
const byComp = {};
for (const c of [...allClasses].filter((c) => !/^cds-\d+$/.test(c)).sort()) {
  const m = c.match(/^cds-([A-Za-z]+?)(?:-(.*))?$/);
  (byComp[m[1]] ||= []).push(m[2] || '(root)');
}

// motion: from computed styles of measured components, plus stylesheet rules
const motion = {};
for (const [k, c] of Object.entries(C)) {
  for (const v of Object.values(c.states)) {
    if (!v || !v.style) continue;
    const t = transition(v.style);
    if (t === 'none') continue;
    for (const part of t.split(/, (?=[a-z-]+ [\d.]+m?s)/)) {
      const m = part.match(/^([a-z-]+) ([\d.]+m?s) (.+)$/);
      if (!m) continue;
      const kk = `${m[2]} | ${m[3]}`;
      (motion[kk] ||= { props: new Set(), where: new Set() });
      motion[kk].props.add(m[1]);
      motion[kk].where.add(k);
    }
  }
}
const sheetMotion = {};
for (const s of Object.values(data._meta.sheets || {})) {
  for (const r of s.transitions) {
    const t = r.transition || '';
    const durs = t.match(/[\d.]+m?s/g) || [];
    const eases = t.match(/cubic-bezier\([^)]*\)|ease-in-out|ease-out|ease-in|linear|ease|steps\([^)]*\)/g) || ['ease'];
    if (!durs.length) continue;
    const cls = (r.selector.match(/\.(css-[a-z0-9]+)/) || [])[1];
    const cds = (r.selector.match(/\.(cds-[A-Za-z0-9_-]+)/) || [])[1] || (cls && s.emo[cls] ? s.emo[cls].join(' ') : null);
    if (!cds) continue;
    const kk = `${durs[0]} | ${eases[0]}`;
    (sheetMotion[kk] ||= new Set()).add(`${cds} (${t.slice(0, 80)})`);
  }
}

// focus rings
function ring(k) {
  const v = C[k]?.states?.['focus-visible'];
  if (!v || !v.style) return 'not captured';
  const s = v.style;
  const bits = [];
  if (s.outlineStyle !== 'none') bits.push(hex(s.outlineColor) === 'transparent' ? `transparent ${s.outlineWidth} ${s.outlineStyle} outline, offset ${s.outlineOffset} (visible only in forced-colors mode)` : `outline ${s.outlineWidth} ${s.outlineStyle} ${hex(s.outlineColor)} offset ${s.outlineOffset}`);
  if (s.boxShadow !== 'none') bits.push(`box-shadow ${fmtShadow(s.boxShadow)}`);
  if (v['::after']) bits.push(`::after ${pseudo(v['::after'])}`);
  if (v['::before']) bits.push(`::before ${pseudo(v['::before'])}`);
  const inner = (v.paint || []).filter((p) => p.shadow && /128, 78, 228/.test(p.shadow));
  if (!v['::after'] && !v['::before'] && inner.length) bits.push(`on ${inner[0].node}${inner[0].inset ? ' (inset ' + inner[0].inset + ')' : ''}: ${fmtShadow(inner[0].shadow)}, radius ${inner[0].radius || 0}`);
  const anc = (v.ancestors || []).filter((a) => a.shadow && /128, 78, 228/.test(a.shadow));
  if (anc.length) bits.push(`on ancestor +${anc[0].up} ${anc[0].node}: ${fmtShadow(anc[0].shadow)}, radius ${anc[0].radius}`);
  return bits.join('; ') || 'no visible ring on the element itself';
}

// layout
function layoutTable() {
  const L = data._meta.layout || {};
  const rows = Object.entries(L).map(([w, r]) => {
    const sg = r.searchGrid;
    const cols = sg ? new Set(sg.items.filter((i) => i.y === sg.items[0].y).map((i) => i.x)).size : '';
    return `| ${w} | ${r.container?.maxWidth} | ${r.container?.paddingLeft} / ${r.container?.paddingRight} | ${r.row?.marginLeft} | ${r.items?.[0]?.paddingLeft} | ${r.row ? (r.row.x + parseFloat(r.items?.[0]?.paddingLeft || 0)) : ''} | ${r.aboutColumn ? r.aboutColumn.w + ' (' + r.aboutColumn.maxWidth + ')' : ''} | ${cols} | ${sg ? sg.items.slice(0, 2).map((i) => i.w).join(', ') : ''} | ${r.header ? r.header.paddingLeft + ' / ' + r.header.maxWidth : ''} |`;
  });
  return ['| Viewport | Container max-width | Container padding L / R | Row margin | Column padding (half gutter) | Content starts at x | Main column (about) | Search cards per row | Search card li widths | Header bar padding / max |', '|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}

// ---------- write ----------

const crops = fs.readdirSync(path.join(REF, 'components', 'crops')).filter((f) => f.endsWith('.png'));
const stateCount = Object.values(C).reduce((n, c) => n + Object.values(c.states).filter((v) => v && v.style).length, 0);
const intro = INTRO;

let md = intro
  .replace('{{components}}', String(Object.keys(C).length))
  .replace('{{states}}', String(stateCount))
  .replace('{{crops}}', String(crops.length))
  .replace('{{captured}}', data._meta.capturedAt || '');

md += '\n## Focus rings\n\nRead in `focus-visible` (keyboard) state. CDS paints its ring on an absolutely positioned `::after`, so the element\'s own `outline` stays `none` unless the browser adds one.\n\n| Element | Component | Ring |\n|---|---|---|\n';
for (const [label, k] of [['Button (secondary)', 'button-secondary'], ['Button (primary)', 'button-primary'], ['Ghost button (link element)', 'button-ghost'], ['Icon button', 'icon-button-search'], ['Inline link', 'link-inline'], ['Standalone link', 'link-standalone'], ['Product card (focus on title link)', 'product-card'], ['Product card title link', 'product-card-title-link'], ['Search input', 'search-input'], ['Select', 'select'], ['Checkbox glyph', 'checkbox-box'], ['Tab', 'tab'], ['Chip', 'chip'], ['Skill chip', 'skill-chip'], ['Accordion header', 'module-accordion-header'], ['FAQ header', 'faq-accordion-header']]) {
  md += `| ${label} | \`${k}\` | ${esc(ring(k))} |\n`;
}

md += '\n## Motion\n\nEvery distinct transition on the measured components (computed style, any state), then every transition declared on a CDS rule in the stylesheets.\n\n| Duration | Easing | Properties | Components |\n|---|---|---|---|\n';
for (const [kk, v] of Object.entries(motion).sort()) {
  const [d, e] = kk.split(' | ');
  md += `| ${d} | ${esc(e)} | ${[...v.props].join(', ')} | ${[...v.where].slice(0, 14).join(', ')} |\n`;
}
md += '\nDeclared on stylesheet rules (selector attributed to its `cds-*` class):\n\n| Duration | Easing | Where (first 6) |\n|---|---|---|\n';
for (const [kk, v] of Object.entries(sheetMotion).sort()) {
  const [d, e] = kk.split(' | ');
  md += `| ${d} | ${esc(e)} | ${[...v].slice(0, 6).map(esc).join('<br>')} |\n`;
}

md += '\n## Layout grid\n\nRead on the course page (`.xdp-page-grid-container` > `.cds-9` row > `.cds-grid-item` columns) and the search grid, in fresh headless windows at each width.\n\n' + layoutTable() + '\n';

md += '\n## Components\n\nEach table has one column per state. "same" means unchanged from the first state. Colours are hex, then the `--cds-*` token whose light value matches (semantic first, palette second); "no token" means nothing in the dump matches. Fonts are family size/line-height weight, with the matching `--cds-typography-*` tokens. The "Painted" lines list every node inside the component that draws a background, border, shadow or outline, because CDS often paints borders on a child or pseudo-element.\n';
for (const [g, keys] of groups) {
  if (!keys.length) continue;
  md += `\n### ${g}\n`;
  for (const k of keys) {
    const c = C[k];
    const sts = Object.keys(c.states);
    md += `\n#### ${k}\n\n${c.description || ''}\n\nPage: ${c.page} (${c.url}). Selector: \`${c.selector || ''}\`. States: ${sts.join(', ')}.\n`;
    const cr = sts.map((s) => c.states[s]?.crop).filter(Boolean);
    if (cr.length) md += `Crops: ${cr.map((f) => '`' + path.basename(f) + '`').join(', ')}.\n`;
    md += '\n' + table(c) + '\n';
    const p = paintNotes(c);
    if (p) md += '\n' + p + '\n';
    const e = extraNotes(c);
    if (e) md += '\n' + e + '\n';
  }
}

md += `\n## CDS class names in the stylesheets\n\nUnion of every \`cds-*\` class named in a stylesheet selector on the four pages (${allClasses.size} names; ${numbered} of them are numbered \`cds-<n>\` Emotion labels with no component meaning, not listed). Grouped by component, modifiers after the colon.\n\n`;
for (const [k, v] of Object.entries(byComp).sort((a, b) => a[0].localeCompare(b[0]))) md += `- \`cds-${k}\`: ${v.join(', ')}\n`;

fs.writeFileSync(path.join(RAW, 'measurements.md'), md);
console.log('wrote measurements.md', md.length, 'chars;', Object.keys(C).length, 'components,', stateCount, 'states,', crops.length, 'crops');
