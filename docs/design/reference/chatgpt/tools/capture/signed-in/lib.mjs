// Shared helpers for measuring the static ChatGPT page copies (measure.mjs and ../layout.mjs).
//
// A page copy has every stylesheet inlined, every icon sprite inlined, and its fonts and a few
// images still as URLs on OpenAI's asset hosts (cdn.openai.com, persistent.oaistatic.com,
// chatgpt.com/cdn/assets). Each of those responses is kept in a local cache directory (CDN_CACHE,
// default <SNAPS>/../cdn-cache) the first time it is fetched and served from there afterwards, so
// a re-run is offline and identical. Everything else is refused: chatgpt.com's own pages and every
// /backend-api/ URL (the account photo, file thumbnails), so nothing signed in is ever requested.
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

// The scroll each thread copy needs, from shots.tsv: the thread is a virtualised list inside an
// inner scroller, and only the turns near the captured position exist in the copy.
export const SCROLL = {};
for (const line of fs.readFileSync(path.join(HERE, 'shots.tsv'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [label, flags = ''] = line.split('\t');
  const m = flags.match(/scroll=(\S+)/);
  if (m) SCROLL[label] = m[1];
}

// files.openai.com serves the plugin icons; www.google.com/s2/favicons the citation favicons.
const CDN = /^https:\/\/(cdn\.openai\.com|persistent\.oaistatic\.com|files\.openai\.com|chatgpt\.com\/cdn\/|www\.google\.com\/s2\/favicons)/;
export async function routeCdn(ctx) {
  fs.mkdirSync(CACHE, { recursive: true });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (!CDN.test(url) || url.includes('/backend-api/') || route.request().method() !== 'GET') return route.abort();
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

// The light theme, exactly as render.mjs makes it: ChatGPT paints dark from a `dark` class on
// <html> and on each message's markdown body, so every `dark` class is removed and color-scheme set.
export const toLight = (page) => page.evaluate(() => {
  document.querySelectorAll('.dark').forEach((n) => n.classList.remove('dark'));
  document.documentElement.style.colorScheme = 'light';
});

// Opens a copy from file://, waits for the fonts, restores the inner scrollers (the marks
// snapshot.js left, or the shots.tsv flag) and hides the caret.
export async function openSnap(ctx, label, { light = false } = {}) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(`file://${SNAPS}/${label}.html`, { waitUntil: 'load', timeout: 90000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(1500);
  if (light) await toLight(page);
  await applyScroll(page, label);
  await page.addStyleTag({ content: '*{caret-color:transparent!important}' });
  await page.waitForTimeout(400);
  return page;
}

export async function applyScroll(page, label) {
  const flag = SCROLL[label];
  await page.evaluate((flag) => {
    const marked = document.querySelectorAll('[data-snap-scroll]');
    if (marked.length && !flag) {
      marked.forEach((n) => { const [t, l] = n.getAttribute('data-snap-scroll').split(',').map(Number); n.scrollTop = t; n.scrollLeft = l; });
      return;
    }
    if (!flag) return;
    const all = [...document.querySelectorAll('*')].filter((e) => !e.closest('nav') && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20);
    const sc = all.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (sc) sc.scrollTop = flag === 'max' ? sc.scrollHeight : Number(flag);
  }, flag);
  await page.waitForTimeout(500);
}

export function metaOf(label) {
  return JSON.parse(fs.readFileSync(path.join(SNAPS, `${label}.json`), 'utf8'));
}

export async function newContext(browser, meta, light = false) {
  // No isMobile/hasTouch for the 390 copies, matching render.mjs (which made the PNGs): the phone
  // captures are the same DOM at a narrow viewport.
  const ctx = await browser.newContext({
    viewport: { width: meta.w, height: meta.h }, deviceScaleFactor: 2, locale: 'en-US',
    colorScheme: light ? 'light' : 'dark', reducedMotion: 'no-preference',
  });
  await routeCdn(ctx);
  return ctx;
}
