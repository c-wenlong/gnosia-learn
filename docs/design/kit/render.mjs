// Render an SVG or HTML file to PNG with headless Chromium, waiting for fonts, optionally on a transparent ground.
// usage: PLAYWRIGHT_CORE=<playwright-core/index.mjs> node docs/design/kit/render.mjs in.svg out.png [width height] [--transparent]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Same browser discovery as svg2png.mjs, plus a PLAYWRIGHT_CORE override for a
// checkout (or worktree) whose tldrawkc submodule is not installed.
const here = fileURLToPath(new URL('.', import.meta.url));
const core = process.env.PLAYWRIGHT_CORE ?? join(here, '../../../tools/tldrawkc/node_modules/playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(core).href);
// CHROMIUM wins outright; the macOS Playwright cache is only consulted without
// it, so a Linux machine with its own browser never reads a folder it lacks.
function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dir = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
  return join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}
const exe = findChromium();

const args = process.argv.slice(2);
const transparent = args.includes('--transparent');
const [inp, out, w0, h0] = args.filter((a) => !a.startsWith('--'));
if (!inp || !out) {
  console.error('usage: node render.mjs in.svg|in.html out.png [width height] [--transparent]');
  process.exit(2);
}
const src = readFileSync(inp, 'utf8');
let w = Number(w0);
let h = Number(h0);
if (!w) {
  const m = src.match(/width="([\d.]+)" height="([\d.]+)"/);
  w = Math.ceil(Number(m[1]));
  h = Math.ceil(Number(m[2]));
}
const html = inp.endsWith('.svg')
  ? `<html><body style="margin:0;background:${transparent ? 'transparent' : '#fff'}">${src}</body></html>`
  : src;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: transparent });
console.log(out, `${w}x${h}`);
await browser.close();
