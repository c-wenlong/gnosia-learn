// Shared helpers for measuring the static Manus snapshots (measure.mjs and ../layout.mjs).
//
// A snapshot is a copy of the signed-in page whose stylesheets, fonts and images are still
// <link>/<img> URLs on Manus's CDN (files.manuscdn.com, plus a CloudFront bucket for task
// thumbnails). Loading 18 stylesheets per page from the network made the layout come up
// unstyled every so often, so every CDN response is kept in a local cache directory
// (CDN_CACHE, default <SNAPS>/../cdn-cache) the first time it is fetched and served from
// there afterwards: a re-run is offline and identical. Nothing is ever requested from
// manus.im itself (favicons, canonical links): those requests are aborted.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
export const { chromium } = pw.default ?? pw;

export const HERE = path.dirname(new URL(import.meta.url).pathname);
export const REF = path.resolve(HERE, '..', '..', '..');
export const RAW = path.join(REF, 'raw');
export const CROPS = path.join(REF, 'components', 'crops');
export const SNAPS = process.env.SNAPS ? path.resolve(process.env.SNAPS) : null;
export const CACHE = process.env.CDN_CACHE ? path.resolve(process.env.CDN_CACHE) : SNAPS && path.join(path.dirname(SNAPS), 'cdn-cache');

// The scroll rule each task snapshot needs (see render.mjs): the thread is a virtualised list
// inside an inner scroller, so nothing is drawn until that scroller sits where it was captured.
export const SCROLL = {
  'task-dark-completed': 'max', 'task-dark-files-dialog': 'max', 'task-dark-sidebar-task-menu': 'max', 'mobile-task-dark': 'max',
  'task-dark-thread-mid': '4200', 'task-dark-thread-top': '0', 'task-dark-side-panel': 'auto', 'task-dark-files-tab': 'auto',
};

const CDN = /^https:\/\/(files\.manuscdn\.com|[a-z0-9]+\.cloudfront\.net)\//;
export async function routeCdn(ctx) {
  fs.mkdirSync(CACHE, { recursive: true });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (!CDN.test(url) || route.request().method() !== 'GET') return route.abort();
    const key = crypto.createHash('sha1').update(url).digest('hex');
    const body = path.join(CACHE, key);
    const meta = body + '.json';
    if (fs.existsSync(meta)) {
      const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
      return route.fulfill({ status: m.status, headers: m.headers, body: fs.readFileSync(body) });
    }
    try {
      const res = await route.fetch({ timeout: 30000 });
      const buf = await res.body();
      const headers = { 'content-type': res.headers()['content-type'] || 'application/octet-stream', 'access-control-allow-origin': '*' };
      if (res.status() === 200) {
        fs.writeFileSync(body, buf);
        fs.writeFileSync(meta, JSON.stringify({ url, status: 200, headers }));
      }
      return route.fulfill({ status: res.status(), headers, body: buf });
    } catch {
      return route.abort();
    }
  });
}

// Opens a snapshot: file:// URL, the inner scroll restored, and the layout checked for having
// come up styled (Manus's shell is a 100vh flex box, so a document taller than twice the
// viewport means a stylesheet did not apply); up to two reloads are tried before giving up.
export async function openSnap(ctx, label, { light = false } = {}) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(`file://${SNAPS}/${label}.html`, { waitUntil: 'load', timeout: 90000 });
    } catch (e) {
      // A network error while the CDN cache is cold: retry once more before giving up.
      if (attempt === 2) throw e;
      continue;
    }
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(2500);
    const ok = await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight * 2 && [...document.styleSheets].length >= 10);
    if (ok) break;
    if (attempt === 2) throw new Error(`${label}: layout did not come up styled`);
  }
  if (light) await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await applyScroll(page, label);
  await page.addStyleTag({ content: '*{caret-color:transparent!important}' });
  await page.waitForTimeout(500);
  return page;
}

export async function applyScroll(page, label) {
  const flag = SCROLL[label];
  if (!flag) return;
  await page.evaluate((flag) => {
    const all = [...document.querySelectorAll('*')].filter((e) => !e.closest('nav') && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20);
    const sc = all.find((e) => e.querySelector('.group\\/turn')) || all.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    const turn = sc && sc.querySelector('.group\\/turn');
    if (sc && flag === 'auto' && turn) sc.scrollTop = turn.getBoundingClientRect().top - sc.getBoundingClientRect().top - 16;
    else if (sc) sc.scrollTop = flag === 'max' ? sc.scrollHeight : Number(flag);
  }, flag);
  await page.waitForTimeout(600);
}

export function metaOf(label) {
  return JSON.parse(fs.readFileSync(path.join(SNAPS, `${label}.json`), 'utf8'));
}

export async function newContext(browser, meta, light = false) {
  // No isMobile/hasTouch for the 390 snapshots, matching render.mjs (which made the PNGs): the
  // phone captures are the same DOM at a narrow viewport.
  const ctx = await browser.newContext({
    viewport: { width: meta.w, height: meta.h }, deviceScaleFactor: 2, locale: 'en-US',
    colorScheme: light ? 'light' : 'dark', reducedMotion: 'no-preference',
  });
  await routeCdn(ctx);
  return ctx;
}
