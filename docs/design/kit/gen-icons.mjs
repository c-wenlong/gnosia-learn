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
const RINGS = constant('MARK_RINGS');
const CREAM = constant('MARK_CREAM');

// The supplied 8-5 colours and contours, without a gradient or a redrawn mark.
function tile(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#faf6ec"/>
  <path d="${RINGS}" fill="#c2603f"/><path d="${CREAM}" fill="#faf6ec" fill-rule="evenodd"/>
</svg>`;
}
writeFileSync(join(outDir, 'mark-512.svg'), tile(512));
writeFileSync(join(outDir, 'mark-180.svg'), tile(180));
console.log(`wrote mark-512.svg and mark-180.svg to ${outDir}`);
