// Record a browser video of one interaction, for a PR: the built app against a
// scratch catalog built from seed/, driven by a scenario script in a real
// Chromium with a visible pointer, written out as an mp4.
//
// usage: npm run demo:record -- --scenario <file.mjs> --out <file.mp4> [--root <checkout>] [--keep]
//
// What it does, in order:
//   1. Builds a scratch SQLite catalog from seed/ under the OS temp dir, the
//      way scripts/e2e.mjs does (scripts/lib/app-harness.mjs).
//   2. Starts `next start` from the checkout's build on a free port, with the
//      e2e test password and every provider key blank. It builds nothing: run
//      `npm run build` first.
//   3. Signs in outside the recording, so the video opens on the page itself.
//   4. Records the scenario, then converts Playwright's webm to an mp4 with
//      ffmpeg (H.264, yuv420p, faststart, so GitHub and a phone play it).
//
// A scenario is an ES module exporting `async run({ page, base, cursor,
// routeChat, routeJson })`:
//   page       the Playwright page being recorded
//   base       the server's URL, `http://localhost:<port>`
//   cursor     `click(locator)`, `type(locator, text)` and `pause(ms)`, which
//              move the visible pointer and leave time to see each step
//   routeChat  `routeChat(replies)` answers POST /api/agent/chat from a list,
//              in order, with the body the route sends; each reply is
//              `{ content, check?, sources?, delayMs? }`. There is no provider
//              key, so every tutor turn in a video is scripted.
//   routeJson  `routeJson(pattern, bodies, { delayMs })` answers any other
//              route (the judge, say) from a list of JSON bodies, in order.
// A request past the end of a list gets a 500. Everything else is the real
// app: the page, the cards and the writes into the scratch catalog. Examples
// are in scripts/demo-scenarios/.
//
// Options:
//   --scenario <file>  the scenario module (required)
//   --out <file.mp4>   where the video goes (required); refused inside the
//                      checkout, so a video is never an untracked file there
//   --root <checkout>  the checkout whose build, seed and next to run; this
//                      script's own by default. Lets a PR's worktree that
//                      predates this script be recorded from main's copy.
//   --keep             leave the scratch directory (catalog, server log, webm)
//                      behind and print where it is
//
// Environment: PLAYWRIGHT_CORE and CHROMIUM, as for scripts/e2e.mjs. It
// borrows playwright-core from the tldrawkc submodule and the Chromium in the
// Playwright cache, and needs ffmpeg on PATH. It writes nothing into the
// tracked tree.
//
// Exit codes: 0 the video was written, 1 the scenario or the run failed, 2 a
// prerequisite is missing or the command line is wrong.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import {
  buildSeedDatabase,
  findChromium,
  freePort,
  playwrightCorePath,
  seedEnv,
  startServer,
  stopGroup,
  tail,
  TEST_PASSWORD,
} from './lib/app-harness.mjs';

const USAGE = 'usage: npm run demo:record -- --scenario <file.mjs> --out <file.mp4> [--root <checkout>] [--keep]';

function missing(message) {
  console.error(`demo: ${message}`);
  process.exit(2);
}

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      scenario: { type: 'string' },
      out: { type: 'string' },
      root: { type: 'string' },
      keep: { type: 'boolean', default: false },
    },
  }));
} catch (error) {
  missing(`${error.message}\n${USAGE}`);
}
if (!options.scenario || !options.out) missing(`--scenario and --out are both required\n${USAGE}`);

const ROOT = resolve(options.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const SCENARIO = resolve(options.scenario);
const OUT = resolve(options.out);

const inside = (dir, path) => {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
};
if (!OUT.endsWith('.mp4')) missing(`--out must name an .mp4 file, not ${OUT}`);
if (!existsSync(dirname(OUT))) missing(`the directory for --out does not exist: ${dirname(OUT)}`);
// Real paths on both sides, so a symlink to the checkout is caught too.
const realRoot = existsSync(ROOT) ? realpathSync(ROOT) : ROOT;
if (inside(realRoot, join(realpathSync(dirname(OUT)), basename(OUT)))) {
  missing(`--out ${OUT} is inside the checkout ${ROOT}; write the video somewhere outside it, such as a scratch directory`);
}
if (!existsSync(SCENARIO)) missing(`no scenario at ${SCENARIO}`);
if (!existsSync(join(ROOT, 'apps/web/.next/BUILD_ID'))) {
  missing(`no production build at ${join(ROOT, 'apps/web/.next')}. Run \`npm run build\` there first; this script never builds.`);
}
const corePath = playwrightCorePath(ROOT);
if (!existsSync(corePath)) {
  missing(
    `playwright-core not found at ${corePath}. It comes from the tldrawkc submodule: ` +
      '`git submodule update --init tools/tldrawkc && (cd tools/tldrawkc && npm ci)`, or set PLAYWRIGHT_CORE to its index.mjs.',
  );
}
const chromiumPath = findChromium();
if (chromiumPath !== undefined && !existsSync(chromiumPath)) {
  missing(`Chromium not found at ${chromiumPath}. Run \`npx playwright install chromium\` inside tools/tldrawkc, or set CHROMIUM.`);
}
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  missing('ffmpeg is not on PATH (`brew install ffmpeg`); it converts the recording to mp4.');
}

const scenario = await import(pathToFileURL(SCENARIO).href);
if (typeof scenario.run !== 'function') missing(`${SCENARIO} exports no run() function`);
const { chromium } = await import(pathToFileURL(corePath).href);

const WORK = mkdtempSync(join(tmpdir(), 'gnosia-demo-'));
const DB = join(WORK, 'catalog.db');
const HOME = join(WORK, 'home');
const SERVER_LOG = join(WORK, 'server.log');
const SIZE = { width: 1280, height: 860 };

// ---------------------------------------------------------------------------
// Cleanup, reached from `finally` and from a signal, so an interrupted run
// still stops the server and removes the scratch directory.

const held = { building: null, browser: null, server: null };
let teardown = null;
let failed = false;
function cleanup() {
  teardown ??= (async () => {
    // Let the seed command running now finish before its files are removed;
    // the build starts no other once `interrupted` is set.
    if (held.building !== null) await held.building.catch(() => {});
    const browser = held.browser === null ? null : await held.browser.catch(() => null);
    if (browser !== null) await browser.close().catch(() => {});
    if (held.server !== null && !(await stopGroup(held.server))) {
      console.error(`demo: the server's process group ${held.server.pid} survived SIGKILL`);
    }
    if (options.keep || failed) console.log(`demo: kept ${WORK} (catalog.db, server.log, the webm)`);
    else rmSync(WORK, { recursive: true, force: true });
  })();
  return teardown;
}
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    console.error(`\ndemo: ${signal}, cleaning up`);
    void cleanup().finally(() => process.exit(130));
  });
}

// ---------------------------------------------------------------------------
// What a scenario is handed.

/** A pointer drawn into the page, since a recording shows no cursor. */
function drawPointer() {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.setAttribute('aria-hidden', 'true');
    Object.assign(dot.style, {
      position: 'fixed',
      zIndex: 2147483647,
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      background: 'rgba(217,119,87,.55)',
      border: '2px solid rgba(217,119,87,.95)',
      pointerEvents: 'none',
      transform: 'translate(-50%,-50%)',
      left: '-40px',
      top: '-40px',
      transition: 'width .12s, height .12s',
    });
    document.body.append(dot);
    addEventListener('mousemove', (e) => Object.assign(dot.style, { left: `${e.clientX}px`, top: `${e.clientY}px` }), true);
    addEventListener('mousedown', () => Object.assign(dot.style, { width: '12px', height: '12px' }), true);
    addEventListener('mouseup', () => Object.assign(dot.style, { width: '18px', height: '18px' }), true);
  });
}

function cursorFor(page) {
  const cursor = {
    async click(locator) {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (box === null) throw new Error(`cannot click ${locator}: it has no box on screen`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
      await page.waitForTimeout(250);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(350);
    },
    async type(locator, text) {
      await cursor.click(locator);
      await locator.pressSequentially(text, { delay: 32 });
      await page.waitForTimeout(300);
    },
    pause: (ms) => page.waitForTimeout(ms),
  };
  return cursor;
}

function routesFor(page) {
  const routeJson = async (pattern, bodies, { delayMs = 700 } = {}) => {
    const queue = [...bodies];
    await page.route(pattern, async (route) => {
      if (queue.length === 0) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      const body = queue.shift();
      await new Promise((r) => setTimeout(r, delayMs));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
  };
  const routeChat = async (replies) => {
    const queue = [...replies];
    await page.route('**/api/agent/chat', async (route) => {
      if (queue.length === 0) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      const next = queue.shift();
      await new Promise((r) => setTimeout(r, next.delayMs ?? 900));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: { role: 'assistant', content: next.content },
          check: next.check ?? null,
          sources: next.sources ?? [],
          model: 'scripted',
          provider: 'scripted',
          providerLabel: 'Scripted',
          fallbackAttempts: 0,
        }),
      });
    });
  };
  return { routeChat, routeJson };
}

// ---------------------------------------------------------------------------

async function record() {
  console.log(`demo: building a scratch catalog from seed/ in ${WORK}`);
  const emptyRoot = mkdtempSync(join(WORK, 'no-video-tools-'));
  held.building = buildSeedDatabase(ROOT, seedEnv({ root: ROOT, db: DB, home: HOME, emptyRoot }), { stopped: () => interrupted });
  await held.building;
  if (interrupted) return;
  const base = await startServer({
    root: ROOT,
    port: await freePort(),
    db: DB,
    home: HOME,
    logFile: SERVER_LOG,
    onSpawn: (child) => {
      held.server = child;
    },
  });
  console.log(`demo: next start is answering on ${base}`);
  if (interrupted) return;

  held.browser = chromium.launch({ executablePath: chromiumPath, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
  const browser = await held.browser;

  const auth = await browser.newContext({ viewport: SIZE, colorScheme: 'light' });
  const signin = await auth.newPage();
  await signin.goto(`${base}/sign-in`);
  await signin.getByLabel('Password').fill(TEST_PASSWORD);
  await signin.getByRole('button', { name: 'Sign in' }).click();
  await signin.waitForURL(`${base}/home`);
  const storageState = await auth.storageState();
  await auth.close();

  const context = await browser.newContext({
    viewport: SIZE,
    colorScheme: 'light',
    storageState,
    recordVideo: { dir: join(WORK, 'video'), size: SIZE },
  });
  await context.addInitScript(drawPointer);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  try {
    await scenario.run({ page, base, cursor: cursorFor(page), ...routesFor(page) });
    await page.waitForTimeout(1200);
  } catch (error) {
    const shot = join(WORK, 'failed.png');
    await page.screenshot({ path: shot }).catch(() => {});
    throw new Error(`the scenario failed: ${error.message}\nscreenshot: ${shot}`);
  } finally {
    // Closing the context is what finishes the webm.
    await context.close();
  }
  const webm = await page.video().path();
  const partial = join(dirname(OUT), `.${Date.now().toString(36)}.partial.mp4`);
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', partial]);
  } catch (error) {
    rmSync(partial, { force: true });
    throw new Error(`ffmpeg could not convert ${webm}: ${error.message}`);
  }
  renameSync(partial, OUT);
  console.log(`demo: wrote ${OUT}`);
}

try {
  await record();
} catch (error) {
  // An interrupt is not a failure: the signal handler cleans up and exits 130.
  if (!interrupted) {
    failed = true;
    console.error(`demo: ${error.message}`);
    console.error(`demo: the server log ends:\n${tail(SERVER_LOG)}`);
  }
} finally {
  await cleanup();
}
if (interrupted) await new Promise(() => {});
process.exit(failed ? 1 : 0);
