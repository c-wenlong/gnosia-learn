// Captures Gauth's public pages into RAW (full-colour PNGs); quantize.py turns them into screenshots/.
//
//   RAW=/some/scratch/dir PLAYWRIGHT=/path/to/playwright/index.mjs node public.mjs [page,page,...]
//
// Names are {page}-light-{state}.png; mobile ones get a `mobile-` prefix. Gauth ships one theme, so there
// is no dark run. Desktop shots are 1440x900 at 1x, mobile shots 390x844 at 2x, `*-full` shots 1x. A page
// taller than one GPU texture is saved as name.partN.png tiles, which quantize.py stitches back together.
// Nothing is sent, created or signed into: the only presses are dialog dismissals, tabs, Show more, the
// lesson's own Not now, Continue (the audio gate), Pause, Settings and chapters, and a story card's
// Explore, which opens a published story.
import fs from 'fs';
import { M, closePromo, openStory, chromium, UA, UA_MOBILE, BASE } from './lib.mjs';

const RAW = process.env.RAW || new URL('../../raw/full/', import.meta.url).pathname;
fs.mkdirSync(RAW, { recursive: true });
const pageArg = (process.argv[2] || '').split(',').filter(Boolean);
const log = (...a) => console.log(...a);
const wait = (p, ms) => p.waitForTimeout(ms);

async function lazyScroll(p) {
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) { await p.evaluate((y) => scrollTo(0, y), y); await wait(p, 200); }
  await p.evaluate(() => scrollTo(0, 0)); await wait(p, 900);
}

class Shooter {
  constructor(p, prefix, vw, dpr) { this.p = p; this.prefix = prefix; this.vw = vw; this.dpr = dpr; this.count = 0; }
  async view(name) { await this.p.screenshot({ path: `${RAW}/${this.prefix}-${name}.png` }); this.count++; log('  shot', name); }
  async full(name = 'full') {
    const p = this.p;
    await lazyScroll(p);
    const H = await p.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const chunk = Math.floor(14000 / this.dpr);
    const f = `${RAW}/${this.prefix}-${name}`;
    if (H <= chunk) await p.screenshot({ path: f + '.png', fullPage: true });
    else for (let i = 0, y = 0; y < H; i++, y += chunk) await p.screenshot({ path: `${f}.part${i}.png`, fullPage: true, clip: { x: 0, y, width: this.vw, height: Math.min(chunk, H - y) } });
    this.count++; log('  shot', name, 'H=' + H);
    await p.evaluate(() => scrollTo(0, 0)); await wait(p, 500);
  }
}
const step = async (label, fn) => { try { await fn(); } catch (e) { log('  FAILED', label, String(e.message).split('\n')[0]); } };
const notNow = async (p) => { const b = p.getByRole('button', { name: 'Not now' }); if (await b.count()) { await b.click(); await wait(p, 1200); } };
const gate = async (p) => { const b = p.getByRole('button', { name: 'Continue', exact: true }); if (await b.count()) { await b.click(); await wait(p, 4000); } };
const pause = async (p) => { const b = p.getByRole('button', { name: /^Pause/ }); if (await b.count()) { await b.first().click().catch(() => {}); await wait(p, 600); } };

const desktop = {
  home: { path: '/', promo: 'keep', run: async (p, S) => {
    await S.view('promo');
    await closePromo(p);
    await S.view('default');
    await S.full();
    await step('question-focused', async () => { await p.locator(M('pc_input')).first().click(); await wait(p, 500); await S.view('question-focused'); await p.mouse.click(1400, 600); });
    await step('sidebar-folded', async () => { await p.locator(M('side-menu_sidebar-collapse')).first().click(); await wait(p, 900); await S.view('sidebar-folded'); });
  } },
  'academy-science': { path: '/course/science', run: async (p, S) => { await S.view('default'); await S.full(); } },
  'academy-math': { path: '/course/math', run: async (p, S) => {
    await S.view('default');
    await step('show-more', async () => {
      const b = p.locator(M('catalog_expandButton')).first();
      await b.click(); await wait(p, 1200);
      await p.evaluate(() => scrollTo(0, 420)); await wait(p, 700);
      await S.view('show-more');
    });
  } },
  'academy-history': { path: '/course/history', run: async (p, S) => { await S.view('default'); } },
  'academy-my': { path: '/course/my', run: async (p, S) => {
    await S.view('default');
    await step('create-dialog', async () => { await p.locator(M('catalog_createButton')).first().click(); await wait(p, 2500); await S.view('create-dialog'); });
  } },
  unit: { path: '/course/math/algebra-1?unit=real-numbers-and-sets', run: async (p, S) => {
    await S.view('default');
    await step('path', async () => { await p.evaluate(() => scrollTo(0, 700)); await wait(p, 1000); await S.view('path'); });
    await step('unit-2', async () => { await p.evaluate(() => scrollTo(0, 0)); await p.locator(M('math-course-detail_unitButton')).nth(1).click(); await wait(p, 1500); await S.view('unit-2'); });
  } },
  'lesson-science': { path: '/course/science/how-things-work-1/learn?entry_source=start&from=science', wait: 7000, run: async (p, S) => {
    await S.view('audio-dialog');
    await notNow(p);
    await S.view('default');
    await step('settings', async () => { await p.getByRole('button', { name: 'Settings' }).click(); await wait(p, 1000); await S.view('settings'); await p.keyboard.press('Escape'); await wait(p, 500); });
    await step('ask-tutor', async () => { await pause(p); await p.locator('[aria-label="Ask Tutor"]').first().click(); await wait(p, 1500); await S.view('ask-tutor'); await p.keyboard.press('Escape'); await p.mouse.click(700, 500); await wait(p, 500); });
    await step('figure', async () => {
      const play = p.getByRole('button', { name: 'Play' }); if (await play.count()) await play.click();
      for (let i = 0; i < 60; i++) { const ok = await p.evaluate(() => { const e = document.querySelector('ol[class*="canvas_list__"]'); if (!e) return false; const r = e.getBoundingClientRect(); return r.bottom < innerHeight - 20 && r.top > 60; }); if (ok) break; await wait(p, 1500); }
      await pause(p); await S.view('figure');
      const play2 = p.getByRole('button', { name: 'Play' }); if (await play2.count()) await play2.click();
    });
    await step('quiz', async () => {
      for (let i = 0; i < 110; i++) { if (await p.locator('[aria-label="Close quiz and continue"]').count()) break; await wait(p, 2000); }
      await S.view('quiz');
    });
  } },
  'lesson-math': { path: '/course/math/algebra-1/fundamentals-of-set-theory/learn?entry_source=start&return_to=course_detail', wait: 8000, run: async (p, S) => {
    await S.view('audio-gate');
    await gate(p);
    await S.view('default');
    await step('chapters', async () => { await p.getByRole('button', { name: 'Open lesson chapters' }).click(); await wait(p, 1200); await S.view('chapters'); });
  } },
  'lesson-history': { path: '/course/history/crossing-the-ocean-wall/learn?entry_source=start&from=history', wait: 8000, run: async (p, S) => {
    await S.view('default');
    await step('chapters', async () => { await p.locator(M('lesson_chapterMenuButton')).first().click(); await wait(p, 1200); await S.view('chapters'); });
  } },
  atlas: { path: '/atlas', run: async (p, S) => {
    await S.view('default');
    await S.full();
    await step('story', async () => {
      const card = p.locator(M('user-cases_card')).filter({ hasText: 'Apollo 11' }).first();
      await card.scrollIntoViewIfNeeded(); await card.click(); await wait(p, 3000);
      await S.view('story-preview');
      await p.locator(M('user-cases_exploreButton')).first().click(); await wait(p, 10000);
      await p.mouse.move(700, 880); await wait(p, 600);
      await S.view('story');
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /Generate Video/.test(e.innerText || '') && e.getBoundingClientRect().top < 40); if (b) b.setAttribute('data-m', 'gen'); });
      await p.locator('[data-m="gen"]').hover(); await wait(p, 1500);
      await S.view('story-video-settings');
    });
  } },
  news: { path: '/news', run: async (p, S) => { await S.view('default'); await S.full(); } },
};

const mobile = {
  home: { path: '/', promo: 'keep', run: async (p, S) => { await S.view('promo'); await closePromo(p); await S.view('default'); await S.full(); } },
  academy: { path: '/course/math', run: async (p, S) => { await S.view('default'); await S.full(); } },
  unit: { path: '/course/math/algebra-1?unit=real-numbers-and-sets', run: async (p, S) => { await S.view('default'); await step('path', async () => { await p.evaluate(() => scrollTo(0, 700)); await wait(p, 900); await S.view('path'); }); } },
  'lesson-math': { path: '/course/math/algebra-1/fundamentals-of-set-theory/learn?entry_source=start&return_to=course_detail', wait: 8000, run: async (p, S) => { await S.view('audio-gate'); await gate(p); await S.view('default'); } },
  atlas: { path: '/atlas', run: async (p, S) => { await S.view('default'); await step('story', async () => { await openStory(p, 'Artemis II'); await S.view('story'); }); } },
};

const b = await chromium.launch();
let total = 0;
const runs = [...Object.keys(desktop).map((k) => ({ k, mob: false })), ...Object.keys(mobile).map((k) => ({ k, mob: true }))];
for (const { k, mob } of runs) {
  const name = (mob ? 'mobile-' : '') + k;
  if (pageArg.length && !pageArg.includes(name)) continue;
  const spec = (mob ? mobile : desktop)[k];
  const vw = mob ? 390 : 1440, vh = mob ? 844 : 900, dpr = mob ? 2 : 1;
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, userAgent: mob ? UA_MOBILE : UA, isMobile: mob, hasTouch: mob, locale: 'en-US' });
  const p = await ctx.newPage();
  log(name);
  const S = new Shooter(p, `${name}-light`, vw, dpr);
  try {
    await p.goto(BASE + spec.path, { waitUntil: 'load', timeout: 90000 });
    await wait(p, spec.wait || 6000);
    if (spec.promo !== 'keep') await closePromo(p);
    await spec.run(p, S);
  } catch (e) { log('  PAGE FAILED', name, e.message.split('\n')[0]); }
  total += S.count;
  await ctx.close();
}
log('done', total, 'screenshots ->', RAW);
await b.close();
