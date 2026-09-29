// Captures Coursera's public pages into RAW (full-colour PNGs); quantize.py turns them into screenshots/.
//
//   RAW=/some/scratch/dir PLAYWRIGHT=/path/to/node_modules/playwright node public.mjs [theme|all] [page,page,...]
//
// Names are {page}-{theme}-{state}.png, mobile ones get a `mobile-` prefix. Dark is a forced token flip
// (see forceTheme), not a Coursera theme. A page taller than one GPU texture is saved as name.partN.png
// tiles, which quantize.py stitches back together.
import fs from 'fs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.default ?? pw;
const RAW = process.env.RAW || new URL('../../raw/full/', import.meta.url).pathname;
fs.mkdirSync(RAW, { recursive: true });
const BASE = 'https://www.coursera.org';
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const themeArg = process.argv[2] || 'all';
const pageArg = (process.argv[3] || '').split(',').filter(Boolean);
const log = (...a) => console.log(...a);
const wait = (p, ms) => p.waitForTimeout(ms);

// Coursera puts data-color-theme="light" on <html> and writes every colour as light-dark(), so flipping the
// attribute plus color-scheme re-renders the whole page in the dark half of each token.
async function forceTheme(p, theme) {
  await p.evaluate(t => { document.documentElement.dataset.colorTheme = t; document.documentElement.style.colorScheme = t; }, theme);
  await wait(p, 600);
}

// Hide the OneTrust banner (declining non-essential first when a reject button is showing) and close the
// right-hand AI chat side panel, which the site opens by default on course-like pages.
async function prep(p, { closeChat = true, waitChat = false } = {}) {
  try {
    const rej = await p.$('#onetrust-reject-all-handler');
    if (rej && await rej.isVisible()) { await rej.click(); await wait(p, 500); }
  } catch { /* optional */ }
  await p.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
  if (closeChat) {
    // the panel is injected after hydration on course-like pages, sometimes past the 6 s settle wait
    if (waitChat) await p.waitForSelector('[data-testid=coach-close]', { state: 'visible', timeout: 8000 }).catch(() => {});
    // coach-close is the panel's own X. The header sparkle (two-panel-chat-trigger) toggles, so it is only
    // clicked while the panel is showing, or a second call would open the panel again.
    const x = await p.$('[data-testid=coach-close]');
    if (x && await x.isVisible()) { await x.click().catch(() => {}); await wait(p, 900); }
    else {
      const t = await p.$('[data-testid=two-panel-chat-trigger]');
      const open = await p.evaluate(() => { const a = document.querySelector('aside'); return !!a && a.getBoundingClientRect().width > 200; });
      if (t && open && await t.isVisible()) { await t.click().catch(() => {}); await wait(p, 900); }
    }
  }
}

async function lazyScroll(p) {
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) { await p.evaluate(y => scrollTo(0, y), y); await wait(p, 200); }
  await p.evaluate(() => scrollTo(0, 0)); await wait(p, 900);
}

async function scrollToEl(p, sel, offset = 170) {
  const ok = await p.evaluate(([sel, offset]) => {
    const e = document.querySelector(sel); if (!e) return false;
    const y = e.getBoundingClientRect().top + scrollY - offset; scrollTo(0, Math.max(0, y)); return true;
  }, [sel, offset]);
  await wait(p, 900); return ok;
}

// Scroll to the first element whose own text matches `re` (tag list narrows the search).
async function scrollToText(p, tags, re, offset = 170) {
  const ok = await p.evaluate(([tags, re, offset]) => {
    const rx = new RegExp(re, 'i');
    const e = [...document.querySelectorAll(tags)].find(x => rx.test((x.textContent || '').trim()) && x.getBoundingClientRect().height > 0);
    if (!e) return false;
    scrollTo(0, Math.max(0, e.getBoundingClientRect().top + scrollY - offset)); return true;
  }, [tags, re.source, offset]);
  await wait(p, 900); return ok;
}

class Shooter {
  constructor(p, prefix, vw, dpr) { this.p = p; this.prefix = prefix; this.vw = vw; this.dpr = dpr; this.count = 0; }
  async view(name) { await this.p.screenshot({ path: `${RAW}/${this.prefix}-${name}.png` }); this.count++; log('  shot', name); }
  async full(name) {
    const p = this.p;
    await lazyScroll(p);
    const H = await p.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const chunk = Math.floor(14000 / this.dpr);
    const f = `${RAW}/${this.prefix}-${name}`;
    if (H <= chunk) await p.screenshot({ path: f + '.png', fullPage: true });
    else {
      for (let i = 0, y = 0; y < H; i++, y += chunk) {
        await p.screenshot({ path: `${f}.part${i}.png`, fullPage: true, clip: { x: 0, y, width: this.vw, height: Math.min(chunk, H - y) } });
      }
    }
    this.count++; log('  shot', name, 'H=' + H);
    await p.evaluate(() => scrollTo(0, 0)); await wait(p, 500);
  }
}

const step = async (label, fn) => { try { await fn(); } catch (e) { log('  FAILED', label, String(e.message).split('\n')[0]); } };

async function clickFirstVisible(p, sel, filter) {
  const els = await p.$$(sel);
  for (const e of els) {
    if (!(await e.isVisible())) continue;
    if (filter && !(await e.evaluate(filter.fn, filter.arg))) continue;
    await e.scrollIntoViewIfNeeded(); await e.click(); return e;
  }
  return null;
}

const MODULE_TEXT = { fn: (el, rx) => new RegExp(rx).test(el.innerText || ''), arg: '^(Week|Module) \\d|Module \\d' };

async function expandModule(p, S, name) {
  await scrollToEl(p, '#modules', 120);
  const b = await clickFirstVisible(p, '#modules button[aria-expanded]', MODULE_TEXT);
  if (!b) throw new Error('no module accordion');
  await wait(p, 1000);
  await b.evaluate(e => scrollTo(0, e.getBoundingClientRect().top + scrollY - 200)); await wait(p, 600);
  await S.view(name);
  return b;
}

async function moduleDetails(p, S, name) {
  const cta = await clickFirstVisible(p, '#modules button[id$="-cta"]');
  if (!cta) throw new Error('no per-module show-more button');
  await wait(p, 900); await S.view(name);
}

const desktop = {
  home: async (p, S) => {
    await S.view('default'); await S.full('full');
    await step('explore', async () => {
      await p.evaluate(() => scrollTo(0, 0)); await wait(p, 400);
      await p.click('[data-testid=megamenu-explore-button]'); await wait(p, 1200); await S.view('explore-menu');
      await p.keyboard.press('Escape'); await wait(p, 300);
    });
  },
  search: async (p, S) => {
    await S.view('default'); await S.full('full');
    await p.evaluate(() => scrollTo(0, 0)); await wait(p, 500);
    await step('card-hover', async () => {
      const card = await p.evaluateHandle(() => [...document.querySelectorAll('[class*="ProductCard-base"]')].find(e => e.getBoundingClientRect().top > 300));
      const box = await card.asElement().boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await wait(p, 700); await S.view('card-hover');
      await p.mouse.move(5, 5);
    });
    await step('filter-dropdown', async () => {
      await p.click('[data-testid=filter-dropdown-productTypeDescription]'); await wait(p, 900); await S.view('filter-dropdown');
      await p.keyboard.press('Escape'); await wait(p, 400);
    });
    await step('filter-panel', async () => {
      await p.click('[data-testid=filter-and-sort-button]'); await wait(p, 1200); await S.view('filtered');
    });
    await step('chip-applied', async () => {
      await p.keyboard.press('Escape'); await wait(p, 400);
      await p.goto(`${BASE}/search?query=machine%20learning`, { waitUntil: 'domcontentloaded' }); await wait(p, 6000);
      await prep(p); await forceTheme(p, S.theme);
      const chip = await p.$('[data-testid=chip-button-inactive]');
      await chip.click(); await wait(p, 3500); await S.view('chip-applied');
    });
  },
  browse: async (p, S) => { await S.view('default'); await S.full('full'); },
  course: async (p, S, theme) => {
    // default state has the AI panel open, so take that first and close it afterwards
    await S.view('ai-panel');
    await prep(p); await forceTheme(p, theme);
    await S.view('default'); await S.full('full');
    const names = await p.evaluate(() => {
      const known = ['About', 'Outcomes', 'Modules', 'Courses', 'Recommendations', 'Testimonials', 'Reviews'];
      return [...new Set([...document.querySelectorAll('a[href^="#"]')].map(a => (a.innerText || '').trim()).filter(t => known.includes(t)))];
    });
    log('  tabs', names.join(','));
    for (const n of names) await step('tab ' + n, async () => {
      await p.evaluate(() => scrollTo(0, 0)); await wait(p, 500);
      await clickFirstVisible(p, 'a[href^="#"]', { fn: (el, t) => (el.innerText || '').trim() === t, arg: n });
      await wait(p, 1500); await S.view('tab-' + n.toLowerCase());
    });
    await step('module-expanded', async () => { await expandModule(p, S, 'module-expanded'); await step('module-details', () => moduleDetails(p, S, 'module-details')); });
    await step('instructors', async () => {
      if (!await scrollToText(p, 'h3', /^Instructors$/, 150)) throw new Error('no instructors heading'); await S.view('instructors');
      await scrollToText(p, 'h3', /^Offered by$/, 150); await S.view('offered-by');
    });
    await step('sticky', async () => { await p.evaluate(() => scrollTo(0, 1500)); await wait(p, 1000); await S.view('sticky'); });
  },
  specialization: async (p, S) => {
    await prep(p); await forceTheme(p, S.theme);
    await S.view('default'); await S.full('full');
    await step('courses-expanded', async () => {
      await scrollToText(p, 'h2', /course series/i, 120);
      const btns = await p.$$('button[aria-label^="Course details for"]');
      for (const b of btns) { await b.scrollIntoViewIfNeeded(); await b.click(); await wait(p, 500); }
      await scrollToText(p, 'h2', /course series/i, 120); await S.view('courses-expanded');
      await p.evaluate(() => scrollBy(0, 700)); await wait(p, 600); await S.view('courses-expanded-2');
      await S.full('full-courses-expanded');
    });
  },
  certificate: async (p, S) => {
    await prep(p); await forceTheme(p, S.theme);
    await S.view('default'); await S.full('full');
    await step('courses-expanded', async () => {
      await scrollToText(p, 'h2', /course series/i, 120);
      const b = (await p.$$('button[aria-label^="Course details for"]'))[0];
      await b.scrollIntoViewIfNeeded(); await b.click(); await wait(p, 800);
      await scrollToText(p, 'h2', /course series/i, 120); await S.view('courses-expanded');
    });
  },
  course2: async (p, S) => {
    await prep(p); await forceTheme(p, S.theme);
    await S.view('default'); await S.full('full');
    await step('modules', async () => { await expandModule(p, S, 'modules-expanded'); await step('module-details', () => moduleDetails(p, S, 'module-details')); });
  },
};

const mobile = {
  home: async (p, S) => { await S.view('default'); await S.full('full'); },
  search: async (p, S) => { await S.view('default'); await S.full('full'); },
  course: async (p, S) => {
    await S.view('default'); await S.full('full');
    // on a phone the weeks are rows that open a sheet, not accordions
    await step('modules', async () => {
      await scrollToEl(p, '#modules', 80);
      if (!await clickFirstVisible(p, '#modules button', MODULE_TEXT)) throw new Error('no module row');
      await wait(p, 1200); await S.view('modules-expanded');
    });
  },
  specialization: async (p, S) => {
    await S.view('default'); await S.full('full');
    await step('courses-expanded', async () => {
      await scrollToEl(p, '#courses', 80);
      const rows = await p.$$('#courses button');
      let hit = null;
      for (const r of rows) if (await r.isVisible() && /Course \d/.test(await r.innerText())) { hit = r; break; }
      if (!hit) throw new Error('no course row');
      await hit.scrollIntoViewIfNeeded(); await hit.click(); await wait(p, 1200); await S.view('courses-expanded');
    });
  },
};

const paths = {
  home: '/', search: '/search?query=machine%20learning', browse: '/browse/data-science',
  course: '/learn/machine-learning', specialization: '/specializations/machine-learning-introduction',
  certificate: '/professional-certificates/google-data-analytics', course2: '/learn/learning-how-to-learn',
};

const b = await chromium.launch();
let total = 0;
const runs = [];
for (const theme of themeArg === 'all' ? ['light', 'dark'] : [themeArg]) for (const k of Object.keys(desktop)) runs.push({ k, theme, mob: false });
if (themeArg === 'all' || themeArg === 'light') for (const k of Object.keys(mobile)) runs.push({ k, theme: 'light', mob: true });
for (const { k, theme, mob } of runs) {
  if (pageArg.length && !pageArg.includes(mob ? 'mobile-' + k : k)) continue;
  const vw = mob ? 390 : 1440, vh = mob ? 844 : 900, dpr = 2;
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, userAgent: mob ? UA_MOBILE : UA_DESKTOP, isMobile: mob, hasTouch: mob, locale: 'en-US' });
  const p = await ctx.newPage();
  log(mob ? 'mobile' : 'desktop', k, theme);
  const prefix = `${mob ? 'mobile-' : ''}${k}-${theme}`;
  const S = new Shooter(p, prefix, vw, dpr); S.theme = theme;
  try {
    await p.goto(BASE + paths[k], { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(p, 6000);
    if (k !== 'course' || mob) { await prep(p, { closeChat: true, waitChat: !mob && ['specialization', 'certificate', 'course2'].includes(k) }); }
    await forceTheme(p, theme);
    await (mob ? mobile : desktop)[k](p, S, theme);
  } catch (e) { log('  PAGE FAILED', k, e.message.split('\n')[0]); }
  total += S.count;
  await ctx.close();
}
log('done', total, 'screenshots ->', RAW);
await b.close();
