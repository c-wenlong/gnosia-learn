// Writes raw/measurements.md from raw/components-computed.json: a summary of the values the
// components share (computed from the readings, not typed), then every component with one table
// per theme (a column per state, a row per property). Deterministic; no browser, no network.
//
//   node tools/capture/signed-in/build-measurements.mjs
import fs from 'node:fs';
import path from 'node:path';

const REF = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const J = JSON.parse(fs.readFileSync(path.join(REF, 'raw', 'components-computed.json'), 'utf8'));

const hex = (c) => {
  if (!c) return c;
  return String(c).replace(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g, (m, r, g, b, a) => {
    const h = '#' + [r, g, b].map((v) => (+v).toString(16).padStart(2, '0')).join('');
    return a === undefined || +a === 1 ? h : `${h} @ ${+a}`;
  }).replace(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g, (m, r, g, b, a) => {
    const h = '#' + [r, g, b].map((v) => Math.round(+v * 255).toString(16).padStart(2, '0')).join('');
    return a === undefined ? h : `${h} @ ${+a}`;
  }).replace(/oklch\([^)]*\)/g, (m) => m);
};
const sides = (t, r, b, l) => (t === r && r === b && b === l ? t : t === b && r === l ? `${t} ${r}` : `${t} ${r} ${b} ${l}`);
const fam = (f) => (f || '').split(',')[0].replace(/"/g, '');
const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const isClear = (c) => !c || c === 'rgba(0, 0, 0, 0)' || hex(c) === '#000000 @ 0';

function props(v) {
  const s = v.style || {};
  const o = {};
  o['Size (w x h)'] = `${v.rect.w} x ${v.rect.h}`;
  o.Padding = sides(s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft);
  if (s.gap && s.gap !== 'normal') o.Gap = s.gap;
  const bd = ['Top', 'Right', 'Bottom', 'Left'].map((d) => (parseFloat(s[`border${d}Width`]) > 0 && s[`border${d}Style`] !== 'none' ? `${s[`border${d}Width`]} ${s[`border${d}Style`]} ${hex(s[`border${d}Color`])}` : 'none'));
  o.Border = bd.every((x) => x === bd[0]) ? bd[0] : bd.map((x, i) => `${'TRBL'[i]}: ${x}`).join('; ');
  o.Radius = sides(s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius);
  o.Background = isClear(s.backgroundColor) ? 'transparent' : hex(s.backgroundColor);
  if (s.backgroundImage && s.backgroundImage !== 'none') o['Background image'] = hex(s.backgroundImage.replace(/url\("?[^)]*\)/g, 'url(…)')).slice(0, 200);
  o['Box shadow'] = s.boxShadow === 'none' ? 'none' : hex(s.boxShadow);
  if (s.backdropFilter && s.backdropFilter !== 'none') o['Backdrop filter'] = s.backdropFilter;
  if (s.filter && s.filter !== 'none') o.Filter = s.filter.slice(0, 160);
  o.Outline = s.outlineStyle === 'none' || parseFloat(s.outlineWidth) === 0 ? 'none' : `${s.outlineWidth} ${s.outlineStyle} ${hex(s.outlineColor)} offset ${s.outlineOffset}`;
  o.Font = `${fam(s.fontFamily)} ${s.fontSize}/${s.lineHeight} ${s.fontWeight}`;
  o['Letter spacing'] = s.letterSpacing;
  o.Colour = hex(s.color);
  if (v.textStyle) o['Text node'] = `${v.textStyle.node}: ${fam(v.textStyle.fontFamily)} ${v.textStyle.fontSize}/${v.textStyle.lineHeight} ${v.textStyle.fontWeight}, ${hex(v.textStyle.color)}${v.textStyle.letterSpacing !== 'normal' ? ', ls ' + v.textStyle.letterSpacing : ''}`;
  o.Transition = s.transitionDuration === '0s' || !s.transitionDuration ? 'none' : `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}${s.transitionDelay !== '0s' ? ' delay ' + s.transitionDelay : ''}`;
  if (s.transform && s.transform !== 'none') o.Transform = s.transform;
  if (s.opacity !== '1') o.Opacity = s.opacity;
  if (s.cursor && s.cursor !== 'auto') o.Cursor = s.cursor;
  if (v.icon) o.Icon = `${v.icon.w} x ${v.icon.h}, colour ${hex(v.icon.color)}${v.icon.fill && v.icon.fill !== 'none' && hex(v.icon.fill) !== hex(v.icon.color) ? ', fill ' + hex(v.icon.fill) : ''}${v.icon.stroke && v.icon.stroke !== 'none' ? ', stroke ' + hex(v.icon.stroke) + ' ' + v.icon.strokeWidth : ''}`;
  if (v.placeholder) o.Placeholder = `"${esc(v.placeholder.text).slice(0, 40)}" ${hex(v.placeholder.color)}, opacity ${v.placeholder.opacity}, ${v.placeholder.fontSize}`;
  for (const pe of ['::before', '::after']) if (v[pe]) o[pe] = `${v[pe].width} x ${v[pe].height}, ${v[pe].position}, bg ${hex(v[pe].backgroundColor)}${v[pe].backgroundImage && v[pe].backgroundImage !== 'none' ? ' ' + hex(v[pe].backgroundImage).slice(0, 120) : ''}, radius ${v[pe].borderRadius}${v[pe].boxShadow !== 'none' ? ', shadow ' + hex(v[pe].boxShadow) : ''}`;
  if (v.paint) o['Painted layers'] = v.paint.slice(0, 6).map((p) => [p.node, p.size, p.bg && 'bg ' + hex(p.bg), p.bgImage && 'image ' + hex(p.bgImage).slice(0, 90), p.border && 'border ' + hex(p.border), p.radius && 'r ' + p.radius, p.shadow && 'shadow ' + hex(p.shadow), p.outline && 'outline ' + hex(p.outline), p.opacity && 'opacity ' + p.opacity].filter(Boolean).join(' ')).join('; ');
  if (v.ancestors) o['Ancestor paint'] = v.ancestors.map((a) => `${a.up} up ${a.node}${!isClear(a.bg) ? ' bg ' + hex(a.bg) : ''}${a.shadow ? ' shadow ' + hex(a.shadow) : ''}${a.outline ? ' outline ' + hex(a.outline) : ''}`).join('; ');
  if (v.vars) o.Tokens = Object.entries(v.vars).slice(0, 10).map(([k, val]) => `${k} ${hex(val) || '(unset)'}`).join('; ');
  o.How = v.via || '';
  return o;
}

// ---------------------------------------------------------------- shared values, computed

const comps = Object.entries(J.components);
const allStates = comps.flatMap(([k, c]) => Object.entries(c.states).map(([st, v]) => ({ k, st, v })));
const ok = allStates.filter((x) => x.v.style);
const count = (arr) => { const m = new Map(); for (const a of arr) m.set(a, (m.get(a) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };

function hoverChanges(theme) {
  const out = [];
  for (const [k, c] of comps) {
    const d = c.states[theme === 'dark' ? 'default' : 'light'];
    const h = c.states[theme === 'dark' ? 'hover' : 'light-hover'];
    if (!d || !h || !d.style || !h.style) continue;
    const diff = [];
    for (const p of ['backgroundColor', 'color', 'opacity', 'borderTopColor', 'boxShadow', 'textDecorationLine', 'transform']) if (d.style[p] !== h.style[p]) diff.push(`${p} ${hex(d.style[p])} → ${hex(h.style[p])}`);
    // A fill painted by a child (Manus often hovers an inner layer): compare the first painted layer.
    const pd = (d.paint || [])[0];
    const ph = (h.paint || [])[0];
    if (!diff.length && JSON.stringify(pd) !== JSON.stringify(ph) && ph) diff.push(`layer ${ph.node} ${hex(pd ? pd.bg : 'none')} → ${hex(ph.bg)}`);
    out.push({ k, diff });
  }
  return out;
}

const L = [];
const W = (s = '') => L.push(s);
W('# Manus component measurements');
W('');
W(`Computed styles read on ${J._meta.read} by \`tools/capture/signed-in/measure.mjs\` from static snapshots of the signed-in app (${J._meta.viewport}), and written here by \`tools/capture/signed-in/build-measurements.mjs\` from [components-computed.json](components-computed.json). ${J._meta.themes}`);
W('');
W('Every component has one table per theme: a column per state, a row per property. A cell that repeats the first column reads `=`. Colours are hex, with `@ alpha` when translucent. "Painted layers" lists the first nodes inside the component that paint a fill, border, shadow or outline (Manus often paints a hover or selection on an inner layer, not the element itself); "Ancestor paint" the same for its parents. "Tokens" lists the `var(--x)` names the component\'s Tailwind classes use, with the value each resolved to in that theme.');
W('');
W('States: `hover` is a real pointer hover; `focus-visible` a real keyboard focus (Shift+Tab, Tab), skipped where the element (a div with role=button) cannot take focus; the rest (`active`, `selected`, `checked`, `open`, `typed`, `enabled`, ...) are other elements or snapshots captured in that state. Light states are prefixed `light`. The 390 wide snapshots are measured at rest only.');
W('');
W(`${comps.length} components, ${allStates.length} states (${ok.length} measured, ${allStates.filter((x) => x.v.skipped).length} skipped, ${allStates.filter((x) => x.v.error).length} not found).`);
W('');
W('## Shared values');
W('');
W('Tallied over every measured state by the build script.');
W('');
const radii = count(ok.map((x) => x.v.style.borderTopLeftRadius).filter((r) => r && r !== '0px'));
W(`- **Radius scale** (element radius, times seen): ${radii.slice(0, 14).map(([r, n]) => `${r} (${n})`).join(', ')}.`);
// Splits a comma list at the top level only (a cubic-bezier() keeps its commas).
const splitTop = (str) => { const o = []; let d = 0; let cur = ''; for (const ch of String(str)) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { o.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) o.push(cur.trim()); return o; };
const trans = count(ok.filter((x) => x.v.style.transitionDuration && x.v.style.transitionDuration !== '0s').map((x) => `${splitTop(x.v.style.transitionProperty).join(', ')} ${splitTop(x.v.style.transitionDuration)[0]} ${splitTop(x.v.style.transitionTimingFunction)[0]}`));
W(`- **Transitions**: ${trans.slice(0, 10).map(([t, n]) => `\`${t}\` (${n})`).join(', ')}.`);
const fonts = count(ok.flatMap((x) => [x.v.style.fontFamily, x.v.textStyle && x.v.textStyle.fontFamily].filter(Boolean).map(fam)));
W(`- **Font families**: ${fonts.slice(0, 6).map(([f, n]) => `${f} (${n})`).join(', ')}.`);
const sizes = count(ok.map((x) => `${(x.v.textStyle || x.v.style).fontSize}/${(x.v.textStyle || x.v.style).lineHeight} ${(x.v.textStyle || x.v.style).fontWeight}`));
W(`- **Type sizes** (size/line-height weight of the first text): ${sizes.slice(0, 14).map(([f, n]) => `${f} (${n})`).join(', ')}.`);
// Tailwind writes every shadow as ring layers plus the shadow; the transparent ring layers are dropped.
const cleanShadow = (sh) => splitTop(sh).filter((l) => !/rgba\([^)]*,\s*0\)/.test(l)).map(hex).join(', ');
const shadows = count(ok.flatMap((x) => [x.v.style.boxShadow, ...(x.v.paint || []).map((p) => p.shadow)]).filter((s) => s && s !== 'none').map(cleanShadow).filter(Boolean));
W(`- **Shadows**: ${shadows.slice(0, 6).map(([s, n]) => `\`${s}\` (${n})`).join('; ')}.`);
for (const theme of ['dark', 'light']) {
  const fv = ok.filter((x) => x.v.theme === theme && /focus-visible/.test(x.st));
  const rings = count(fv.map((x) => {
    const s = x.v.style;
    const ol = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? `outline ${s.outlineWidth} ${s.outlineStyle} ${hex(s.outlineColor)} offset ${s.outlineOffset}` : '';
    const sh = s.boxShadow !== 'none' ? `shadow ${hex(s.boxShadow)}` : '';
    return ol || sh || 'nothing painted on the element';
  }));
  W(`- **Focus-visible, ${theme}** (${fv.length} focused states): ${rings.map(([r, n]) => `${r} (${n})`).join('; ')}.`);
}
for (const theme of ['dark', 'light']) {
  const hc = hoverChanges(theme);
  const fills = count(hc.flatMap((h) => h.diff.filter((d) => /^backgroundColor|^layer/.test(d)).map((d) => d.replace(/^layer \S+ /, 'inner layer '))));
  W(`- **Hover changes, ${theme}** (${hc.length} hovered components, ${hc.filter((h) => !h.diff.length).length} with no change on the element or its first painted layer): ${fills.slice(0, 8).map(([f, n]) => `${f} (${n})`).join('; ')}.`);
}
const varVals = {};
for (const x of ok) for (const [k, v] of Object.entries(x.v.vars || {})) ((varVals[k] ||= {})[x.v.theme] ||= new Set()).add(v);
const varRows = Object.entries(varVals).sort((a, b) => a[0].localeCompare(b[0]));
W('');
W('### Tokens the measured components use');
W('');
W('Every `var(--x)` named in a measured component\'s classes, with the value it resolved to in each theme.');
W('');
W('| Token | Dark | Light |');
W('|---|---|---|');
for (const [k, t] of varRows) W(`| \`${k}\` | ${esc([...(t.dark || [])].map(hex).join(', ') || '-')} | ${esc([...(t.light || [])].map(hex).join(', ') || '-')} |`);

// ---------------------------------------------------------------- per component

W('');
W('## Components');
const groups = [];
for (const [, c] of comps) if (!groups.includes(c.group)) groups.push(c.group);
for (const g of groups) {
  W('');
  W(`### ${g}`);
  for (const [k, c] of comps.filter(([, c]) => c.group === g)) {
    W('');
    W(`#### ${k}`);
    W('');
    W(`${c.title}.${c.desc ? ' ' + c.desc : ''}`);
    W('');
    W(`Snapshot: ${c.pages.map((p) => `\`${p}\``).join(', ')}. Finder: \`${esc(c.selector).replace(/`/g, "'")}\`.`);
    for (const theme of ['dark', 'light']) {
      const states = Object.keys(c.states).filter((s) => c.states[s].theme === theme);
      if (!states.length) continue;
      const rows = {};
      for (const st of states) {
        const v = c.states[st];
        if (v.error) { (rows['Not found'] ||= {})[st] = v.error; continue; }
        if (v.skipped) { (rows.Skipped ||= {})[st] = v.skipped; continue; }
        for (const [p, val] of Object.entries(props(v))) (rows[p] ||= {})[st] = val;
      }
      W('');
      W(`${theme === 'dark' ? 'Dark' : 'Light'} theme.`);
      W('');
      W(`| Property | ${states.join(' | ')} |`);
      W(`|---|${states.map(() => '---').join('|')}|`);
      for (const [p, vals] of Object.entries(rows)) {
        const first = vals[states[0]];
        W(`| ${p} | ${states.map((st, i) => (i && vals[st] === first && p !== 'How' ? '=' : esc(vals[st] ?? '-'))).join(' | ')} |`);
      }
    }
    const crops = Object.values(c.states).map((s) => s.crop).filter(Boolean).map((f) => '`' + path.basename(f) + '`');
    const other = c.selectors ? Object.entries(c.selectors).map(([st, src]) => `${st}: \`${esc(src).replace(/`/g, "'")}\``).join('; ') : '';
    W('');
    if (other) { W(`Other finders: ${other}.`); W(''); }
    W(crops.length ? `Crops: ${crops.join(', ')}.` : 'Crops: none.');
  }
}
fs.writeFileSync(path.join(REF, 'raw', 'measurements.md'), L.join('\n') + '\n');
console.log('raw/measurements.md', L.length, 'lines');
