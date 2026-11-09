// WCAG 2 luminance checks for the actual CSS values, including blended site
// surfaces. Run `node scripts/brand-contrast.mjs` to refresh BRAND.md's tables.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const css = readFileSync(new URL('apps/web/src/app/globals.css', root), 'utf8');

function tokens(selector) {
  const result = {};
  for (const match of css.matchAll(/(?:^|\n)(:root|\.dark|\.gnosia|\.gnosia\.dark) \{([^}]+)\}/g)) {
    if (match[1] !== selector) continue;
    for (const [, name, value] of match[2].matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)) result[name] = value;
  }
  return result;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const blend = (fg, bg, alpha) => '#' + rgb(fg).map((v, i) => Math.round((v * alpha + rgb(bg)[i] * (1 - alpha)) * 255).toString(16).padStart(2, '0')).join('');
function luminance(hex) {
  return rgb(hex).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(a, b) {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
}

const appPairs = [
  ...['page', 'surface', 'surface2', 'tint'].flatMap((bg) => ['text', 'text2', 'text3', 'accent-text'].map((fg) => [fg, bg, 4.5])),
  ['btn-text', 'btn-face', 4.5], ['#ffffff', 'accent', 4.5], ['on-tone', 'accent', 4.5],
  ['on-tone', 'streak', 4.5], ['ok-text', 'ok-tint', 4.5], ['ok-text', 'page', 4.5],
  ['warn-text', 'warn-tint', 4.5], ['warn-text', 'page', 4.5], ['warn-on', 'warn', 4.5],
  ['ok-on', 'ok', 4.5], ['danger', 'surface', 4.5], ['danger', 'page', 4.5],
  ...['surface', 'page', 'tint', 'track'].map((bg) => ['accent', bg, 3]),
  ...['m-hi', 'm-mid'].flatMap((fg) => ['surface', 'page', 'track'].map((bg) => [fg, bg, 3])),
  ['streak', 'page', 3], ['streak', 'surface', 3], ['m-hi-on', 'm-hi', 3], ['#ffffff', 'm-mid', 3],
  ['track', 'surface', 0], ['track', 'page', 0], ['border', 'surface', 0], ['border', 'page', 0],
  ['m-hi', 'm-mid', 0], ['m-mid', 'm-lo', 0],
  // Existing limitation: no page uses an ok-tone bar; this remains reported.
  ['ok', 'track', 0],
];

function appRows(selector) {
  const t = tokens(selector);
  return appPairs.map(([fg, bg, minimum]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(t[fg] ?? fg, t[bg] ?? bg), minimum }));
}

function siteRows(dark) {
  const t = { ...tokens(':root'), ...(dark ? tokens('.dark') : {}) };
  const ground = t[dark ? 'brand-earth' : 'brand-cream'];
  // Both washes at their strongest at once: a conservative overlap bound.
  const glow = blend(t['brand-terracotta'], blend(t['brand-clay-soft'], ground, dark ? 0.06 : 0.20), dark ? 0.16 : 0.06);
  const surfaces = {
    ground, glow,
    glass: blend(dark ? t['brand-terracotta'] : '#ffffff', ground, dark ? 0.07 : 0.62),
    'glass over glow': blend(dark ? t['brand-terracotta'] : '#ffffff', glow, dark ? 0.07 : 0.62),
    paper: dark ? blend(t['brand-cream'], ground, 0.06) : '#fffdf8',
    'terracotta panel': blend(t['brand-terracotta'], ground, dark ? 0.13 : 0.12),
    'clay panel': blend(t[dark ? 'brand-clay' : 'brand-clay-soft'], ground, dark ? 0.11 : 0.42),
    'mist panel': blend(t['brand-mist'], ground, dark ? 0.12 : 0.11),
  };
  const rows = Object.entries(surfaces).flatMap(([name, bg]) => ['ink', 'mist', 'terracotta'].map((fg) => ({
    pair: `${fg} on ${name}`, ratio: contrast(t[`brand-${fg}`], bg), minimum: 4.5,
  })));
  rows.push({ pair: 'button label on face', ratio: contrast(t[dark ? 'brand-earth' : 'brand-cream'], t['brand-terracotta']), minimum: 4.5 });
  rows.push({ pair: 'supplied mark on its cream ground', ratio: contrast('#c2603f', '#faf6ec'), minimum: 3 });
  return rows;
}

export const audits = {
  'Public brand': [siteRows(false), siteRows(true)],
  'Gnosia app': [appRows('.gnosia'), appRows('.gnosia.dark')],
};

export function markdownTables() {
  return Object.entries(audits).map(([name, [light, dark]]) => `### ${name}: contrast\n\n| Pair | Light | Dark | Needs |\n| --- | --- | --- | --- |\n` + light.map((row, i) => `| ${row.pair} | ${row.ratio.toFixed(2)} | ${dark[i].ratio.toFixed(2)} | ${row.minimum || '(gap / reported)'} |`).join('\n')).join('\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(markdownTables());
  const failures = Object.values(audits).flat(2).filter((row) => row.ratio < row.minimum);
  if (failures.length) {
    console.error(failures);
    process.exitCode = 1;
  }
}
