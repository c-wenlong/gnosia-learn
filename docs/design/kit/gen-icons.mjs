// Write the flat Gnosia mark as SVG tiles (512 rounded, 180 full-bleed) from the paths in GnosiaMark.ts, for render.mjs.
// usage: node docs/design/kit/gen-icons.mjs <out-dir>   (the shipped icon.png and apple-icon.png are cut from the owner's art, not from this)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node gen-icons.mjs <out-dir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

// Read the paths from the component so this can never draw a different mark.
const tsx = readFileSync(join(here, '../../../apps/web/src/components/brand/GnosiaMark.ts'), 'utf8');
const constant = (name) => {
  const m = tsx.match(new RegExp(`export const ${name} =([^;]+);`));
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]).join('');
};
const G = constant('MARK_G');
const BOOK = constant('MARK_BOOK');
const STAR = constant('MARK_STAR');

// Dark values from docs/design/BRAND.md: a light teal ribbon reads on the navy tile.
const C = { navy: '#0a1621', tealDeep: '#0f5f61', ribbon: '#5cbab3', cream: '#f4ecdc', gold: '#e2b95e' };
function tile(size, radius, scale) {
  const m = (size * scale) / 64;
  const off = (size - 64 * m) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.navy}"/><stop offset="1" stop-color="${C.tealDeep}"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <g transform="translate(${off} ${off}) scale(${m})"><path d="${G}" fill="${C.ribbon}"/><path d="${BOOK}" fill="${C.cream}"/><path d="${STAR}" fill="${C.gold}"/></g>
</svg>`;
}
writeFileSync(join(outDir, 'mark-512.svg'), tile(512, 112, 0.74));
writeFileSync(join(outDir, 'mark-180.svg'), tile(180, 0, 0.7));
console.log(`wrote mark-512.svg and mark-180.svg to ${outDir}`);
