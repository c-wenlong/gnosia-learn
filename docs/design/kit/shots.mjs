// Screenshot routes of a running build at desktop and phone size, in both themes,
// so a page can be compared against its hi-fi frame (docs/design/hifi/*.svg).
//
// usage: node docs/design/kit/shots.mjs <base-url> <out-dir> [route ...]
//   node docs/design/kit/shots.mjs http://localhost:3121 /tmp/shots / /courses /review
//
// Writes <out-dir>/<slug>-<desktop|phone>-<theme>.png (a system mode adds the
// scheme it resolved under: `-system-light`, `-gnosia-system-dark`), where slug is the
// route with slashes turned into dashes ("courses", "courses-cp4281", "root").
// Desktop is 1440x900 and phone 390x844, the hi-fi frame sizes. Each shot is
// the full page, so content below the fold is in the picture too.
//
// A theme is the `gnosia-theme` cookie the root layout reads, set before
// the page loads, so there is no light flash in the capture. Light sets the
// cookie to `light`, so a dark preference row in the database cannot leak in.
// The browser's colour scheme is dark for `dark` and `gnosia-dark`, so the
// two system modes resolve light unless SHOTS_COLOR_SCHEME says otherwise.
//
// Options (environment):
//   SHOTS_VIEWPORTS=desktop,phone   which sizes (default both)
//   SHOTS_THEMES=light,dark,...     any of the six modes: light, dark, system,
//                                   gnosia, gnosia-dark, gnosia-system
//                                   (default light,dark)
//   SHOTS_COLOR_SCHEME=dark         force the emulated prefers-color-scheme,
//                                   to see a system mode resolve dark
//   SHOTS_VIEWPORT_ONLY=1           capture the viewport only, not the full page
//   PLAYWRIGHT_CORE=<path>          playwright-core's index.mjs, when the tldrawkc
//                                   submodule in this checkout is not installed
//   CHROMIUM=<path>                 the browser binary, when not in the Playwright cache
//
// Like svg2png.mjs, it borrows playwright-core from the tldrawkc submodule and the
// Chromium Playwright caches, so nothing new is installed for it.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base, outDir, ...given] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node docs/design/kit/shots.mjs <base-url> <out-dir> [route ...]');
  process.exit(2);
}
const routes = given.length ? given : ['/courses'];

const corePath = process.env.PLAYWRIGHT_CORE ?? join(here, '../../../tools/tldrawkc/node_modules/playwright-core/index.mjs');
if (!existsSync(corePath)) {
  console.error(`playwright-core not found at ${corePath}. Install the tldrawkc submodule (npm ci inside tools/tldrawkc) or set PLAYWRIGHT_CORE.`);
  process.exit(2);
}
const { chromium } = await import(pathToFileURL(corePath).href);

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dir = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop() : undefined;
  if (!dir) return undefined; // let Playwright look for its own
  return join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false },
  phone: { width: 390, height: 844, isMobile: true },
};
const pick = (value, all) => (value ? value.split(',').map((s) => s.trim()).filter((s) => all.includes(s)) : all);
const sizes = pick(process.env.SHOTS_VIEWPORTS, Object.keys(VIEWPORTS));
// The six cookie values, THEME_MODES in packages/schema/src/shared.ts.
const MODES = ['light', 'dark', 'system', 'gnosia', 'gnosia-dark', 'gnosia-system'];
const themes = process.env.SHOTS_THEMES ? pick(process.env.SHOTS_THEMES, MODES) : ['light', 'dark'];
const schemeFor = (theme) => process.env.SHOTS_COLOR_SCHEME ?? (theme === 'dark' || theme.endsWith('-dark') ? 'dark' : 'light');
// A system mode's picture depends on the emulated scheme, so its file name
// carries it (`gnosia-system-dark`) and a light and a dark run of the same
// mode can share an output directory.
const label = (theme) => (theme.endsWith('system') ? `${theme}-${schemeFor(theme)}` : theme);
const fullPage = !process.env.SHOTS_VIEWPORT_ONLY;

mkdirSync(outDir, { recursive: true });
const origin = new URL(base);
const browser = await chromium.launch({ executablePath: findChromium() });
let failed = 0;
try {
  for (const size of sizes) {
    const { width, height, isMobile } = VIEWPORTS[size];
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        isMobile,
        hasTouch: isMobile,
        colorScheme: schemeFor(theme),
      });
      await context.addCookies([{ name: 'gnosia-theme', value: theme, domain: origin.hostname, path: '/' }]);
      const page = await context.newPage();
      for (const route of routes) {
        const slug = route.replace(/^\/+|\/+$/g, '').replace(/[/?&=#]+/g, '-') || 'root';
        const file = join(outDir, `${slug}-${size}-${label(theme)}.png`);
        try {
          const response = await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' });
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: file, fullPage });
          const status = response?.status() ?? 0;
          console.log(`${status} ${route} ${size} ${theme} -> ${file}`);
          if (status >= 400) failed += 1;
        } catch (error) {
          failed += 1;
          console.error(`FAIL ${route} ${size} ${theme}: ${error.message}`);
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
