// Render SVG files to PNG at their declared size with headless Chromium.
// usage: node svg2png.mjs out_dir file.svg [file.svg ...]
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '../../../tools/tldrawkc/node_modules/playwright-core/index.mjs'));
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const dir = readdirSync(cache).filter(d => d.startsWith('chromium-')).sort().pop();
const exe = join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const [outDir, ...files] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
for (const f of files) {
  const svg = readFileSync(f, 'utf8');
  const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/);
  const w = Math.ceil(+m[1]), h = Math.ceil(+m[2]);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
  await page.screenshot({ path: join(outDir, basename(f).replace(/\.svg$/, '.png')), clip: { x: 0, y: 0, width: w, height: h } });
  console.log(basename(f), w + 'x' + h);
}
await browser.close();
