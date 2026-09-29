// Measures Coursera's CDS components on five public pages, in every state
// that can be reached without signing in, enrolling or submitting anything.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs node measure.mjs [home search course spec explore layout]
//
// Writes raw/components-computed.json (merged, so a subset of pages can be
// re-run) and one crop per component and state into components/crops/.
// raw/measurements.md is then built from the JSON by build-measurements.mjs.
//
// States:
//   hover          real mouse hover, 450ms settle for transitions
//   focus-visible  keyboard: focus, Shift+Tab, Tab, so the browser and CDS's
//                  own focusVisible class both see a keyboard focus
//   pressed        CDP CSS.forcePseudoState [active, hover]; no mouse button is
//                  ever pressed, so no link, submit or enroll button can fire
//   expanded / selected / checked / opened   reached by clicking UI toggles
//                  (accordions, menus, a filter checkbox, a select); nothing
//                  that navigates, submits or enrolls is clicked
import fs from 'node:fs';
import path from 'node:path';
import { UA, launch, open, styleOf, crop, centre, RAW } from './lib.mjs';

const URLS = {
  home: 'https://www.coursera.org/',
  search: 'https://www.coursera.org/search?query=machine%20learning',
  course: 'https://www.coursera.org/learn/machine-learning',
  spec: 'https://www.coursera.org/specializations/machine-learning-introduction',
  explore: 'https://www.coursera.org/explore/generative-ai',
};
const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const OUT = process.env.OUT_JSON || path.join(RAW, 'components-computed.json');
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
out._meta ??= {};
out.components ??= {};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let page;
let cdp;
let current;

// ---------- helpers ----------

function comp(key, meta) {
  const c = (out.components[key] ??= { states: {} });
  Object.assign(c, { page: current, url: URLS[current] }, meta);
  c.states ??= {};
  return c;
}

// Finds an element with a function run in the page, tags it data-m=<name>
// and returns a locator for it. Used where the only stable handle is text or
// structure.
async function mark(name, finder, arg) {
  const h = await page.evaluateHandle(finder, arg);
  const el = h.asElement();
  if (!el) throw new Error(`mark ${name}: not found`);
  await el.evaluate((e, n) => e.setAttribute('data-m', n), name);
  return page.locator(`[data-m="${name}"]`);
}

// Clicks a UI toggle (accordion, menu, select). Falls back to a DOM click
// when something (a sticky bar) intercepts the pointer. Only ever used on
// type=button toggles, never on links or submit buttons.
async function toggle(loc) {
  const l = loc.filter({ visible: true }).first();
  const t = await l.evaluate((el) => (el.tagName === 'A' || el.type === 'submit' ? 'refuse' : 'ok'));
  if (t === 'refuse') throw new Error('toggle refused: link or submit');
  await l.click({ timeout: 3000 }).catch(() => l.evaluate((el) => el.click()));
}

async function reset() {
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.mouse.move((page.viewportSize()?.width ?? 1440) - 1, 460);
  await page.waitForTimeout(250);
}

async function kbFocus(loc) {
  await loc.evaluate((el) => el.focus());
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  let ok = await loc.evaluate((el) => document.activeElement === el);
  let how = 'Shift+Tab, Tab';
  if (!ok) {
    await page.keyboard.press('Shift');
    await loc.evaluate((el) => el.focus());
    ok = await loc.evaluate((el) => document.activeElement === el);
    how = 'keydown then focus()';
  }
  await page.waitForTimeout(350);
  return ok ? how : 'focus failed';
}

async function forcePseudo(loc, classes) {
  await page.evaluate(() => document.querySelectorAll('[data-m-force]').forEach((n) => n.removeAttribute('data-m-force')));
  await loc.evaluate((el) => el.setAttribute('data-m-force', '1'));
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-m-force]' });
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: classes });
  await page.waitForTimeout(400);
  return async () => {
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {});
  };
}

// Records one state of one component. `target` is what is measured; `opts.cropLoc`
// what is photographed (defaults to the target); `opts.focusLoc` what receives
// keyboard focus when that is a child (a card's title link).
async function measure(key, state, target, opts = {}) {
  const loc = target.filter({ visible: true }).first();
  const c = (out.components[key] ??= { page: current, url: URLS[current], states: {} });
  try {
    const s = await styleOf(loc);
    let file;
    if (opts.crop !== false) {
      try {
        file = await crop(page, (opts.cropLoc || loc).filter({ visible: true }).first(), `${key}-${state}`, opts.pad ?? 8);
      } catch (e) {
        s.cropError = String(e.message || e).slice(0, 120);
      }
    }
    c.states[state] = { ...s, crop: file, via: opts.via };
    if (opts.extra) c.states[state].extra = await opts.extra(loc);
    log('  ', key, state, s.rect.w + 'x' + s.rect.h);
  } catch (e) {
    c.states[state] = { error: String(e.message || e).slice(0, 200) };
    log('  !', key, state, e.message?.slice(0, 120));
  }
}

// Runs a list of interaction states on one component.
async function states(key, target, list, opts = {}) {
  const loc = target.filter({ visible: true }).first();
  for (const st of list) {
    try {
      await reset();
      await centre(loc);
      let undo;
      let via;
      if (st === 'hover') {
        await (opts.hoverLoc || loc).filter({ visible: true }).first().hover({ timeout: 5000 }).catch(() => (opts.hoverLoc || loc).filter({ visible: true }).first().hover({ timeout: 5000, force: true }));
        await page.waitForTimeout(450);
        via = 'mouse hover';
      } else if (st === 'focus-visible') {
        via = await kbFocus((opts.focusLoc || loc).filter({ visible: true }).first());
      } else if (st === 'pressed') {
        undo = await forcePseudo((opts.pressLoc || loc).filter({ visible: true }).first(), ['active', 'hover']);
        via = 'CDP forcePseudoState :active:hover';
      } else via = 'at rest';
      await measure(key, st, loc, { ...opts, via });
      if (undo) await undo();
    } catch (e) {
      out.components[key].states[st] = { error: String(e.message || e).slice(0, 200) };
      log('  !', key, st, e.message?.slice(0, 120));
    }
  }
  await reset();
}

// Gap between consecutive repeated items (e.g. cards in a grid).
async function repeatGap(sel) {
  return page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).slice(0, 8);
    const r = els.map((e) => e.getBoundingClientRect());
    const gaps = [];
    for (let i = 1; i < r.length; i++) {
      const sameRow = Math.abs(r[i].top - r[i - 1].top) < 2;
      gaps.push(sameRow ? { dx: +(r[i].left - r[i - 1].right).toFixed(1) } : { dy: +(r[i].top - r[i - 1].bottom).toFixed(1) });
    }
    return { count: els.length, gaps, sizes: r.slice(0, 4).map((x) => `${x.width.toFixed(1)}x${x.height.toFixed(1)}`) };
  }, sel);
}

// Gap between an element and its siblings (same parent).
async function siblingGap(sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || !el.parentElement) return null;
    const els = [...el.parentElement.children].filter((e) => e.getBoundingClientRect().width > 0).slice(0, 8);
    const r = els.map((e) => e.getBoundingClientRect());
    const gaps = [];
    for (let i = 1; i < r.length; i++) {
      const sameRow = Math.abs(r[i].top - r[i - 1].top) < 2;
      gaps.push(sameRow ? { dx: +(r[i].left - r[i - 1].right).toFixed(1) } : { dy: +(r[i].top - r[i - 1].bottom).toFixed(1) });
    }
    return { count: els.length, gaps, sizes: r.slice(0, 4).map((x) => `${x.width.toFixed(1)}x${x.height.toFixed(1)}`) };
  }, sel);
}

// Background actually painted at a point (walks the stack under it).
async function bgAt(x, y) {
  return page.evaluate(([x, y]) => {
    for (const el of document.elementsFromPoint(x, y)) {
      const cs = getComputedStyle(el);
      if (cs.backgroundImage !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')) {
        return { tag: el.tagName.toLowerCase(), cls: [...el.classList].join(' ').slice(0, 80), backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage.slice(0, 300) };
      }
    }
    return null;
  }, [x, y]);
}

// All cds-* class names in stylesheet selectors, and every transition /
// animation declared on a rule, with its selector.
async function scanSheets() {
  return page.evaluate(() => {
    const classes = new Set();
    const transitions = [];
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
        const s = r.selectorText || '';
        for (const m of s.matchAll(/\.(cds-[A-Za-z0-9_-]+)/g)) classes.add(m[1]);
        if (r.style) {
          const t = r.style.getPropertyValue('transition') || [r.style.transitionProperty, r.style.transitionDuration, r.style.transitionTimingFunction].filter(Boolean).join(' ');
          const a = r.style.getPropertyValue('animation');
          if (t || a) transitions.push({ selector: s.slice(0, 200), transition: t, animation: a });
        }
      }
    };
    for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch {} }
    // Map Emotion css-* classes to the cds-* names on the same elements, so a
    // rule written against .css-xyz can be attributed to a component.
    const emo = {};
    for (const el of document.querySelectorAll('[class*="cds-"]')) {
      const cds = [...el.classList].filter((c) => c.startsWith('cds-') && !/^cds-\d+$/.test(c));
      if (!cds.length) continue;
      for (const c of el.classList) if (c.startsWith('css-')) (emo[c] ||= new Set(cds.slice(0, 3)));
    }
    const emoObj = {};
    for (const [k, v] of Object.entries(emo)) emoObj[k] = [...v];
    return { classes: [...classes].sort(), transitions, emo: emoObj };
  });
}

async function sheetsFor(key) {
  const s = await scanSheets();
  out._meta.sheets ??= {};
  out._meta.sheets[key] = s;
}

async function newPage(key, context = ctx) {
  current = key;
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  log('open', key);
  await open(page, URLS[key], 6500);
  // Lazy sections load on scroll: walk the page once, then return to the top.
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 700) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(250); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__vis = (sel, root = document) => [...root.querySelectorAll(sel)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); });
  await page.evaluate(() => { const s = document.createElement('style'); s.textContent = '*{caret-color:transparent!important}'; document.head.appendChild(s); });
}

const B4 = ['default', 'hover', 'focus-visible', 'pressed'];

// ---------- pages ----------

async function home() {
  await newPage('home');
  const hdr = '[data-testid=page-header-wrapper]';

  comp('header-top-bar', { description: 'Top audience bar: For Individuals / Businesses / Universities / Governments, dark.', selector: `${hdr} > div:nth-child(1)` });
  await measure('header-top-bar', 'default', page.locator(`${hdr} > div:nth-child(1)`), { pad: 0 });
  comp('header-container', { description: 'The sticky header wrapper (both bars, 105px): white, with a 1px rule on the <nav> underneath.', selector: '.rc-GlobalPageHeaderContainer, nav[data-testid=page-header-wrapper]' });
  await measure('header-container', 'default', page.locator('.rc-GlobalPageHeaderContainer'), { pad: 0, extra: (l) => l.evaluate((el) => { const n = el.querySelector('nav'); const c = getComputedStyle(n); return { nav: { h: n.getBoundingClientRect().height, borderBottom: `${c.borderBottomWidth} ${c.borderBottomStyle} ${c.borderBottomColor}` }, position: getComputedStyle(el).position, top: getComputedStyle(el).top, zIndex: getComputedStyle(el).zIndex }; }) });

  comp('header-audience-link', { description: 'Audience tab in the top bar. The current audience is bold with a white underline bar.', selector: `${hdr} > div:nth-child(1) a` });
  const aud = page.locator(`${hdr} > div:nth-child(1) a`);
  await measure('header-audience-link', 'selected', aud.nth(0), { extra: (l) => l.evaluate((el) => { const a = getComputedStyle(el, '::after'); const b = getComputedStyle(el, '::before'); const s = el.querySelector('span'); return { after: { content: a.content, height: a.height, bottom: a.bottom, bg: a.backgroundColor, width: a.width }, before: { content: b.content, height: b.height, bg: b.backgroundColor }, spanWeight: s && getComputedStyle(s).fontWeight }; }) });
  await states('header-audience-link', aud.nth(1), B4);

  comp('header-main-bar', { description: 'Main white bar: logo, Explore, Degrees, search, AI button, Log In, Join for Free.', selector: `${hdr} > div:nth-child(2) .main-nav-container` });
  await measure('header-main-bar', 'default', page.locator(`${hdr} .main-nav-container`), { pad: 0 });
  comp('header-logo', { description: 'Coursera wordmark (svg) in the main bar.', selector: '[data-testid=home-logo]' });
  await measure('header-logo', 'default', page.locator('[data-testid=home-logo]'));

  comp('button-ghost-nav', { description: 'Explore menu trigger: ghost button with a chevron end icon; turns into a tinted pill when the menu is open.', selector: '[data-testid=megamenu-explore-button]' });
  await states('button-ghost-nav', page.locator('[data-testid=megamenu-explore-button]'), B4);
  comp('header-degrees-link', { description: 'Degrees: a ghost button rendered as a link.', selector: '[data-testid=nav-link-grid-item-degrees]' });
  await states('header-degrees-link', page.locator('[data-testid=nav-link-grid-item-degrees]'), ['default', 'hover', 'focus-visible']);

  comp('button-ghost', { description: 'Ghost button (Log In in the header): no fill, blue label.', selector: `${hdr} a.cds-button-ghost:has-text("Log In")` });
  await states('button-ghost', page.locator(`${hdr} a.cds-button-ghost:has-text("Log In")`), B4);
  comp('button-secondary', { description: 'Secondary outlined button (Join for Free): white fill, 1px blue border, blue label.', selector: `${hdr} a.cds-button-secondary` });
  await states('button-secondary', page.locator(`${hdr} a.cds-button-secondary`), B4);

  // Search field
  const sb = '[data-testid=search-autocomplete]';
  comp('search-input', { description: 'Global search: rounded field (cds-Search-base) with a round primary icon button inside the right end.', selector: sb });
  await states('search-input', page.locator(sb), ['default', 'hover']);
  comp('search-input-outline', { description: 'The notched-outline fieldset that paints the field border.', selector: `${sb} fieldset` });
  await states('search-input-outline', page.locator(`${sb} fieldset`), ['default', 'hover'], { hoverLoc: page.locator(sb), crop: false });
  comp('search-input-field', { description: 'The <input>: text style and placeholder.', selector: `${sb} input` });
  await measure('search-input-field', 'default', page.locator(`${sb} input`), { crop: false });
  // Focus via keyboard lands in the input
  await reset();
  await centre(page.locator(sb));
  const how = await kbFocus(page.locator(`${sb} input`));
  await measure('search-input', 'focus-visible', page.locator(sb), { via: how });
  await measure('search-input-outline', 'focus-visible', page.locator(`${sb} fieldset`), { via: how, crop: false });
  await measure('search-input-field', 'focus-visible', page.locator(`${sb} input`), { via: how, crop: false });
  await page.locator(`${sb} input`).fill('machine learning');
  await page.waitForTimeout(1200);
  await measure('search-input', 'filled', page.locator(sb), { via: 'typed text, not submitted' });
  // autocomplete popup, if any
  const ac = page.locator('[role=listbox]').first();
  if (await ac.isVisible().catch(() => false)) {
    comp('search-autocomplete', { description: 'Autocomplete suggestions under the search field.', selector: '[role=listbox]' });
    await measure('search-autocomplete', 'opened', ac);
    const opt = page.locator('[role=listbox] [role=option]').first();
    if (await opt.count()) {
      comp('search-autocomplete-option', { description: 'One autocomplete suggestion row.', selector: '[role=listbox] [role=option]' });
      await measure('search-autocomplete-option', 'default', opt);
      await opt.hover();
      await page.waitForTimeout(400);
      await measure('search-autocomplete-option', 'hover', opt);
    }
  }
  await page.locator(`${sb} input`).fill('');
  await page.keyboard.press('Escape');
  await reset();

  comp('icon-button-search', { description: 'Round search submit inside the field: cds-iconButton-small primary, 36x36, 20px icon.', selector: `${sb} .cds-Search-actionButtons button` });
  await states('icon-button-search', page.locator(`${sb} .cds-Search-actionButtons button`), B4);

  // Mega menu
  const mb = page.locator('[data-testid=megamenu-explore-button]');
  await reset();
  await toggle(mb);
  await page.waitForTimeout(1500);
  await measure('button-ghost-nav', 'expanded', mb, { via: 'clicked, menu open' });
  comp('mega-menu', { description: 'Explore mega menu: full-width white sheet under the header, four link columns, a divider and a footer line. Page behind is dimmed.', selector: '[data-testid=simplified-megaMenu-container]' });
  await measure('mega-menu', 'expanded', page.locator('[data-testid=simplified-megaMenu-container]'), { pad: 0, extra: async () => ({ scrim: await bgAt(720, 880), section: await styleOf(page.locator('[data-testid=simplified-megaMenu-section]')) }) });
  comp('mega-menu-heading', { description: 'Column heading in the mega menu (Explore roles).', selector: '[data-testid=simplified-megaMenu-section] h2' });
  await measure('mega-menu-heading', 'default', page.locator('[data-testid=simplified-megaMenu-section] h2'));
  comp('mega-menu-link', { description: 'Link in a mega menu column.', selector: 'a.rc-SimpleGoalItem' });
  out.components['mega-menu-link'].repeat = await repeatGap('[data-testid=simplified-megaMenu-section] ul:first-of-type > li');
  await states('mega-menu-link', page.locator('a.rc-SimpleGoalItem'), ['default', 'hover', 'focus-visible']);
  comp('mega-menu-view-all', { description: '"View all" link under a column: underlined.', selector: '[data-testid=simplified-megaMenu-section] a:text-is("View all")' });
  await states('mega-menu-view-all', page.locator('[data-testid=simplified-megaMenu-container] a:text-is("View all")'), ['default', 'hover', 'focus-visible']);
  const hr = await mark('mega-hr', () => { const c = document.querySelector('[data-testid=simplified-megaMenu-container]'); return [...c.querySelectorAll('*')].find((e) => { const cs = getComputedStyle(e); return e.tagName === 'HR' || ((parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0) && e.getBoundingClientRect().height <= 3 && e.getBoundingClientRect().width > 800); }); }).catch(() => null);
  if (hr) { comp('mega-menu-divider', { description: 'Rule between the columns and the footer line of the mega menu.', selector: 'hr in the menu' }); await measure('mega-menu-divider', 'default', hr); }
  await page.keyboard.press('Escape');
  await toggle(mb).catch(() => {});
  await page.waitForTimeout(800);

  // Pills / chips on the home page
  const pill = await mark('pill', () => [...document.querySelectorAll('.cds-Pill-root')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth; })).catch(() => null);
  if (pill) {
    comp('pill', { description: 'cds-Pill-root: partner or domain pill on the home page.', selector: '.cds-Pill-root' });
    await states('pill', pill, ['default', 'hover', 'focus-visible']);
  }
  const chip = page.locator('.cds-Chip-root').first();
  if (await chip.count()) {
    comp('chip-home', { description: 'cds-Chip-root on the home page (collection filter chips).', selector: '.cds-Chip-root' });
    await states('chip-home', chip, ['default']);
  }

  // Footer
  const ft = 'footer.rc-SeoGlobalFooter';
  comp('footer', { description: 'Global footer: link columns (Skills, Certificates, ...), then a bottom row with the copyright, app badges and social icons.', selector: ft });
  await measure('footer', 'default', page.locator(ft), { pad: 0, extra: async (l) => l.evaluate((el) => { const r = el.getBoundingClientRect(); return { bg: getComputedStyle(el).backgroundColor, top: r.top + scrollY, height: r.height }; }) });
  comp('footer-heading', { description: 'Footer column heading.', selector: `${ft} .rc-SubFooterSection__header` });
  await measure('footer-heading', 'default', page.locator(`${ft} .rc-SubFooterSection__header`));
  comp('footer-link', { description: 'Footer column link.', selector: `${ft} .rc-SubFooterSection__content-column-link-text` });
  out.components['footer-link'].repeat = await repeatGap(`${ft} .rc-SubFooterSection:first-of-type li`);
  out.components['footer'].columns = await repeatGap(`${ft} .rc-SubFooterSection`);
  await states('footer-link', page.locator(`${ft} .rc-SubFooterSection__content-column-link-text`), ['default', 'hover', 'focus-visible']);
  const copy = await mark('footer-copyright', () => [...document.querySelectorAll('footer *')].find((e) => e.children.length === 0 && /©\s*20\d\d Coursera/.test(e.textContent))).catch(() => null);
  if (copy) { comp('footer-copyright', { description: 'Copyright line in the footer bottom row.', selector: 'footer text "© 2026 Coursera Inc."' }); await measure('footer-copyright', 'default', copy); }
  const social = await mark('footer-social', () => [...document.querySelectorAll('footer a')].find((a) => /facebook|linkedin|twitter|youtube|instagram/i.test(a.href) && a.querySelector('svg,img'))).catch(() => null);
  if (social) { comp('footer-social-icon', { description: 'Social icon link in the footer bottom row.', selector: 'footer a[href*=facebook]' }); await states('footer-social-icon', social, ['default', 'hover', 'focus-visible']); }

  // Testimonials on the home page
  const tst = page.locator('[data-testid=testimonials]');
  if (await tst.count()) { comp('testimonials-home', { description: 'Home page testimonials band.', selector: '[data-testid=testimonials]' }); await measure('testimonials-home', 'default', tst, { pad: 0 }); }

  await sheetsFor('home');
  await page.close();
}

async function search() {
  await newPage('search');
  comp('search-clear-button', { description: 'Clear (x) button inside a filled search field.', selector: '.cds-SearchClearButton-searchClearButton' });
  await states('search-clear-button', page.locator('.cds-SearchClearButton-searchClearButton'), B4);

  comp('chip-suggestion', { description: '"More to explore" suggestion chip: pill outlined button, 32px tall.', selector: '[data-testid=nl-suggestions] button[data-testid=chip-button-inactive]' });
  out.components['chip-suggestion'].repeat = await repeatGap('[data-testid=nl-suggestions] button[data-testid=chip-button-inactive]');
  await states('chip-suggestion', page.locator('[data-testid=nl-suggestions] button[data-testid=chip-button-inactive]'), B4);
  const lbl = await mark('explore-label', () => [...document.querySelectorAll('[data-testid=nl-suggestions] span')].find((s) => s.textContent.trim() === 'More to explore:'));
  comp('chip-suggestion-label', { description: '"More to explore:" label before the chips.', selector: '[data-testid=nl-suggestions] span' });
  await measure('chip-suggestion-label', 'default', lbl, { crop: false });

  comp('search-results-heading', { description: 'Results for "machine learning" heading.', selector: '.rc-SearchResultsHeader h2' });
  await measure('search-results-heading', 'default', page.locator('.rc-SearchResultsHeader h2'));

  comp('filter-bar', { description: 'Sticky filter bar: Filter & Sort button, a vertical divider, then a pill dropdown per facet and AI-suggested topic pills.', selector: '[data-testid=sticky-filter-bar]' });
  await measure('filter-bar', 'default', page.locator('[data-testid=sticky-filter-bar] .sticky-filter-bar'), { pad: 0 });
  out.components['filter-bar'].repeat = await repeatGap('[data-testid=sticky-filter-bar] button');
  comp('filter-bar-divider', { description: 'Vertical rule after Filter & Sort.', selector: '[data-testid=sticky-filter-bar] hr' });
  await measure('filter-bar-divider', 'default', page.locator('[data-testid=sticky-filter-bar] hr'));
  comp('filter-and-sort-button', { description: 'Filter & Sort: pill outlined button with a 16px sliders icon.', selector: '[data-testid=filter-and-sort-button]' });
  await states('filter-and-sort-button', page.locator('[data-testid=filter-and-sort-button]'), B4);
  comp('filter-dropdown', { description: 'Facet dropdown trigger (Topic, Duration, ...): pill outlined button with a 16px chevron.', selector: '[data-testid=filter-dropdown-topic]' });
  await states('filter-dropdown', page.locator('[data-testid=filter-dropdown-topic]'), B4);
  comp('filter-ai-pill', { description: 'AI-suggested topic pill in the filter bar, with a sparkle prefix icon.', selector: '.sticky-filter-bar button[data-testid=chip-button-inactive]' });
  await states('filter-ai-pill', page.locator('.sticky-filter-bar button[data-testid=chip-button-inactive]'), ['default', 'hover', 'focus-visible']);

  // Product card (grid)
  const card = '[data-testid=product-card-cds] .cds-ProductCard-grid';
  comp('product-card', { description: 'Search result card (cds-ProductCard-grid): bordered white card, 16:9 image inset 8px, partner logo + name, title, skills line, metadata line, tags.', selector: card });
  out.components['product-card'].repeat = await repeatGap('#searchResults ul > li');
  out.components['product-card'].grid = await page.evaluate(() => { const ul = document.querySelector('#searchResults ul'); const cs = getComputedStyle(ul); const li = ul.querySelector('li'); const lcs = getComputedStyle(li); return { ul: { width: ul.getBoundingClientRect().width, margin: cs.margin, gridTemplateColumns: cs.gridTemplateColumns, display: cs.display }, li: { width: li.getBoundingClientRect().width, padding: lcs.padding, flexBasis: lcs.flexBasis, maxWidth: lcs.maxWidth } }; });
  await states('product-card', page.locator(card), ['default', 'hover', 'focus-visible', 'pressed'], { focusLoc: page.locator(`${card} .cds-CommonCard-titleLink`), pressLoc: page.locator(card) });
  const parts = [
    ['product-card-click-area', '.cds-CommonCard-clickArea', 'The inner click area (holds the hover shadow / focus ring).'],
    ['product-card-image-container', '.cds-ProductCard-gridPreviewContainer', 'Image well: 16:9, inset 8px, rounded.'],
    ['product-card-image', '.cds-CommonCard-previewImage', 'Preview image wrapper.'],
    ['product-card-content', '.cds-ProductCard-content', 'Text column under the image.'],
    ['product-card-partner-logo', '.cds-ProductCard-partnerLogos .cds-Avatar-base', 'Partner logo avatar: bordered rounded square.'],
    ['product-card-partner-name', '.cds-ProductCard-partnerNames', 'Partner name next to the logo.'],
    ['product-card-title', '.cds-CommonCard-title', 'Card title (h3).'],
    ['product-card-title-link', '.cds-CommonCard-titleLink', 'The title link (stretched to cover the card).'],
    ['product-card-skills', '.cds-CommonCard-bodyContent p', 'Skills you\'ll gain line: 3-line clamp.'],
    ['product-card-skills-label', '.cds-CommonCard-bodyContent p span', '"Skills you\'ll gain :" bold lead-in.'],
    ['product-card-metadata', '.cds-CommonCard-metadata p', 'Rating and metadata line: ★ 4.9 (39K) · Beginner · Specialization · 1 - 3 Months.'],
    ['product-card-footer', '.cds-ProductCard-footer', 'Footer block holding metadata and tags.'],
  ];
  for (const [k, s, d] of parts) {
    comp(k, { description: d, selector: `${card} ${s}` });
    await centre(page.locator(`${card} ${s}`).first());
    await measure(k, 'default', page.locator(`${card} ${s}`), { crop: !/click-area|title-link|content$|footer/.test(k) });
  }
  await states('product-card-title-link', page.locator(`${card} .cds-CommonCard-titleLink`), ['hover', 'focus-visible'], { cropLoc: page.locator(card) });
  // Hovering the partner logos shows a cds tooltip with the partner names.
  await reset();
  const logos = page.locator(`${card} .cds-ProductCard-partnerLogos`);
  await centre(logos.first());
  await logos.first().hover().catch(() => {});
  await page.waitForTimeout(1200);
  const tt = page.locator('[role=tooltip], .cds-Tooltip-tooltip').filter({ visible: true }).first();
  if (await tt.count()) {
    comp('tooltip', { description: 'cds-Tooltip: dark inverted tooltip shown on hovering the partner logos of a product card.', selector: '[role=tooltip]' });
    await measure('tooltip', 'opened', tt, { pad: 12, via: 'hover on .cds-ProductCard-partnerLogos', extra: (x) => x.evaluate((el) => [el, ...el.querySelectorAll('*')].slice(0, 6).map((e) => ({ tag: e.tagName.toLowerCase(), cls: [...e.classList].filter((c) => !c.startsWith('css-')).join(' '), bg: getComputedStyle(e).backgroundColor, shadow: getComputedStyle(e).boxShadow, radius: getComputedStyle(e).borderRadius, padding: getComputedStyle(e).padding, font: getComputedStyle(e).font, color: getComputedStyle(e).color, maxWidth: getComputedStyle(e).maxWidth, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, transition: getComputedStyle(e).transition, opacity: getComputedStyle(e).opacity }))) });
  }
  await reset();
  const star = await mark('meta-star', () => { const p = document.querySelector('.cds-ProductCard-grid .cds-CommonCard-metadata'); return p && (p.querySelector('svg') || p.querySelector('span')); }).catch(() => null);
  if (star) { comp('product-card-rating-star', { description: 'Star glyph in the metadata line.', selector: '.cds-CommonCard-metadata svg' }); await measure('product-card-rating-star', 'default', star, { crop: false }); }

  // Tags
  const tagDefs = [
    ['tag-free-trial', 'span[data-testid=tag-root].cds-tag-highlight1', '"Free trial" tag: cds-tag-status secondary highlight1.'],
    ['tag-top-ai', 'span[data-testid=tag-root].cds-tag-status:not(.cds-tag-highlight1)', '"Top AI program" status tag.'],
    ['tag-category', 'span[data-testid=tag-root].cds-tag-category', 'Category tag (e.g. "New").'],
  ];
  for (const [k, s, d] of tagDefs) {
    const l = page.locator(`#searchResults ${s}`);
    if (!(await l.count())) continue;
    comp(k, { description: d, selector: s });
    await centre(l.first());
    await measure(k, 'default', l, { extra: (x) => x.evaluate((el) => { const t = el.querySelector('span:not([data-testid=visually-hidden])'); return t ? { text: t.textContent, font: getComputedStyle(t).font, color: getComputedStyle(t).color } : null; }) });
  }
  if (out.components['tag-free-trial']) out.components['tag-free-trial'].repeat = await repeatGap('.cds-ProductCard-grid [data-testid=tag-root]');

  // Topic popover with checkboxes
  await reset();
  const topic = page.locator('[data-testid=filter-dropdown-topic]');
  await centre(topic);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await toggle(topic);
  await page.waitForTimeout(1500);
  await measure('filter-dropdown', 'expanded', topic, { via: 'clicked, popover open' });
  comp('filter-popover', { description: 'Facet popover (cds-popoverDropdown-paper): heading, scrolling checkbox list, footer with View (primary) and Clear All (ghost, disabled until something is checked).', selector: '.cds-popoverDropdown-paper' });
  await measure('filter-popover', 'opened', page.locator('.cds-popoverDropdown-paper'), { pad: 16 });
  comp('filter-popover-heading', { description: 'Popover heading (h3 "Topic").', selector: '.cds-popoverDropdown-paper h3' });
  await measure('filter-popover-heading', 'default', page.locator('.cds-popoverDropdown-paper h3'), { crop: false });
  comp('filter-popover-footer', { description: 'Popover footer row (cds-popoverFooter-root).', selector: '.cds-popoverFooter-root' });
  await measure('filter-popover-footer', 'default', page.locator('.cds-popoverFooter-root'));
  const row = '.cds-popoverDropdown-paper [data-testid^="topic:"]';
  comp('checkbox', { description: 'Filter checkbox row (cds-checkboxAndRadio-label): 18px box, label, count in brackets.', selector: `${row} label` });
  out.components['checkbox'].repeat = await repeatGap(row);
  await states('checkbox', page.locator(`${row} label`), ['default', 'hover', 'focus-visible'], { focusLoc: page.locator(`${row} input`) });
  comp('checkbox-box', { description: 'The 18x18 checkbox glyph (svg) itself.', selector: `${row} label > span:first-child` });
  await states('checkbox-box', page.locator(`${row} label > span:first-child`), ['default', 'hover', 'focus-visible'], { hoverLoc: page.locator(`${row} label`), focusLoc: page.locator(`${row} input`), extra: (l) => l.evaluate((el) => { const s = el.querySelector('svg'); return s ? s.outerHTML.slice(0, 600) : null; }) });
  comp('checkbox-count', { description: '"( 2,841 )" result count after the label.', selector: `${row} .cds-checkboxAndRadio-labelContent span span` });
  await measure('checkbox-count', 'default', page.locator(`${row} .cds-checkboxAndRadio-labelContent span span`), { crop: false });
  comp('checkbox-label', { description: 'Checkbox label text.', selector: `${row} .cds-checkboxAndRadio-labelContent` });
  await measure('checkbox-label', 'default', page.locator(`${row} .cds-checkboxAndRadio-labelContent`), { crop: false });
  comp('button-disabled-ghost', { description: 'Disabled ghost button (Clear All with nothing checked).', selector: '.cds-popoverFooter-root .cds-button-disabled' });
  await measure('button-disabled-ghost', 'disabled', page.locator('.cds-popoverFooter-root .cds-button-disabled'));
  comp('button-primary', { description: 'Primary filled button, medium (View in the filter popover): solid blue, white label, 8px radius.', selector: '[data-testid=filter-view-button]' });
  await states('button-primary', page.locator('[data-testid=filter-view-button]'), B4);
  // check one box (UI only; View is never pressed)
  await reset();
  await page.locator(`${row} label`).first().click();
  await page.waitForTimeout(700);
  await measure('checkbox', 'checked', page.locator(`${row} label`), { via: 'clicked the label; View not pressed' });
  await measure('checkbox-box', 'checked', page.locator(`${row} label > span:first-child`), { via: 'clicked', extra: (l) => l.evaluate((el) => { const s = el.querySelector('svg'); return s ? s.outerHTML.slice(0, 900) : null; }) });
  await kbFocus(page.locator(`${row} input`).first());
  await measure('checkbox-box', 'checked-focus-visible', page.locator(`${row} label > span:first-child`), { via: 'checked, keyboard focus' });
  comp('button-ghost-enabled', { description: 'Clear All once a box is checked: enabled ghost button.', selector: '.cds-popoverFooter-root .cds-button-ghost' });
  await measure('button-ghost-enabled', 'default', page.locator('.cds-popoverFooter-root .cds-button-ghost'));
  await page.locator(`${row} label`).first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  if (await page.locator('.cds-popoverDropdown-paper').isVisible().catch(() => false)) { await toggle(topic).catch(() => {}); await page.waitForTimeout(600); }

  // Filter & Sort side sheet
  await reset();
  await page.locator('[data-testid=filter-and-sort-button]').click();
  await page.waitForTimeout(1600);
  const dlg = '.cds-Dialog-dialog';
  comp('filter-sheet', { description: 'Filter & Sort side sheet (cds-Dialog-dialog): 360px panel from the right, full height, title, rule, accordion per facet (Sort by first, radio), sticky footer with View (primary, full width) and Clear all (secondary, disabled).', selector: dlg });
  await measure('filter-sheet', 'opened', page.locator(dlg), { pad: 0, extra: async () => ({ backdrop: await page.locator('.cds-Modal-backdrop').first().evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, opacity: getComputedStyle(el).opacity, transition: getComputedStyle(el).transition })).catch(() => null), title: await styleOf(page.locator(`${dlg} #dialogHeading`).first()).catch(() => null), hr: await styleOf(page.locator(`${dlg} hr`).first()).catch(() => null) }) });
  comp('icon-button-close', { description: 'Close (x) in the sheet: cds-iconButton-medium ghostSecondary round.', selector: `${dlg} .cds-iconButton-round` });
  await states('icon-button-close', page.locator(`${dlg} .cds-iconButton-round`), B4);
  const acc = `${dlg} .cds-AccordionRoot-container`;
  comp('filter-accordion', { description: 'Facet group in the sheet: cds-AccordionRoot silent, header 48px, chevron at the end.', selector: acc });
  await measure('filter-accordion', 'expanded', page.locator(acc).nth(0), { via: 'Sort by, open by default' });
  await measure('filter-accordion', 'collapsed', page.locator(acc).nth(2));
  comp('filter-accordion-header', { description: 'Accordion header button in the sheet.', selector: `${dlg} .cds-AccordionHeader-button` });
  await states('filter-accordion-header', page.locator(`${dlg} .cds-AccordionHeader-button`).nth(2), B4);
  comp('radio', { description: 'Sort radio (Best Match / Newest): 20px circle.', selector: `${dlg} [role=radiogroup] label` });
  const radio = await mark('radio-checked', () => document.querySelector('.cds-Dialog-dialog .cds-checkboxAndRadio-checked label, .cds-Dialog-dialog .cds-checkboxAndRadio-checked')).catch(() => null);
  if (radio) await measure('radio', 'checked', radio, { extra: (l) => l.evaluate((el) => { const s = el.querySelector('svg'); return s ? s.outerHTML.slice(0, 900) : null; }) });
  const radio2 = await mark('radio-unchecked', () => { const g = document.querySelector('.cds-Dialog-dialog [role=radiogroup]'); return g && g.children[1]; }).catch(() => null);
  if (radio2) await states('radio', radio2, ['default', 'hover', 'focus-visible'], { focusLoc: radio2.locator('input'), extra: (l) => l.evaluate((el) => { const s = el.querySelector('svg'); return s ? s.outerHTML.slice(0, 900) : null; }) });
  // open Topic group to reach Show more
  await page.locator(`${dlg} .cds-AccordionHeader-button`).nth(1).click();
  await page.waitForTimeout(900);
  const more = page.locator(`${dlg} [data-testid=expand-filter-items-button]`);
  if (await more.count()) { comp('button-show-more', { description: '"Show more" under a facet list: ghost button, 24px tall.', selector: '[data-testid=expand-filter-items-button]' }); await states('button-show-more', more, B4); }
  const fbtn = page.locator(`${dlg} .cds-button-primary`).last();
  comp('button-primary-block', { description: 'Full-width primary button at the foot of the sheet (View).', selector: `${dlg} .cds-button-primary` });
  await states('button-primary-block', fbtn, ['default', 'hover', 'focus-visible']);
  comp('button-disabled-secondary', { description: 'Disabled secondary button (Clear all).', selector: `${dlg} .cds-button-secondary.cds-button-disabled` });
  await measure('button-disabled-secondary', 'disabled', page.locator(`${dlg} .cds-button-secondary`).last());
  const foot = await mark('sheet-footer', () => { const b = [...document.querySelectorAll('.cds-Dialog-dialog .cds-button-primary')].pop(); return b && b.parentElement; }).catch(() => null);
  if (foot) { comp('filter-sheet-footer', { description: 'Sheet footer holding the two buttons.', selector: 'parent of the View button' }); await measure('filter-sheet-footer', 'default', foot); }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);

  await sheetsFor('search');
  await page.close();
}

async function course() {
  await newPage('course');
  // Breadcrumbs
  comp('breadcrumbs', { description: 'Breadcrumb trail (cds-breadcrumbs-list): home icon button, chevron separators (20x28), grey links.', selector: '.cds-breadcrumbs-list' });
  await measure('breadcrumbs', 'default', page.locator('.cds-breadcrumbs-list'), { extra: (l) => l.evaluate((el) => { const s = el.querySelector('li:nth-child(2) > svg'); const r = s.getBoundingClientRect(); return { separator: { w: r.width, h: r.height, color: getComputedStyle(s).color, fill: getComputedStyle(s).fill } }; }) });
  out.components['breadcrumbs'].repeat = await repeatGap('.cds-breadcrumbs-listItem');
  comp('breadcrumb-link', { description: 'Breadcrumb link.', selector: '.cds-breadcrumbs-link' });
  await states('breadcrumb-link', page.locator('.cds-breadcrumbs-link'), B4);
  comp('breadcrumb-home', { description: 'Home icon at the start of the trail: cds-iconButton-small ghostSecondary.', selector: '.cds-breadcrumbs-homeIcon' });
  await states('breadcrumb-home', page.locator('.cds-breadcrumbs-homeIcon'), B4);

  // Hero
  comp('course-hero', { description: 'Course hero: pale blue full-bleed band with a large decorative Coursera-C graphic at the right, partner logos, title, part-of line, instructors, the Enroll CTA and the enrolled count.', selector: '[data-e2e=hero-module]' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await measure('course-hero', 'default', page.locator('[data-e2e=hero-module]'), { pad: 0, extra: async () => ({ bgAt_60_300: await bgAt(60, 300), bgAt_1300_500: await bgAt(1300, 500), bgAt_60_140: await bgAt(60, 140) }) });
  const heroBg = await mark('hero-bg', () => [...document.querySelectorAll('div')].find((e) => getComputedStyle(e).zIndex === '-1' && e.getBoundingClientRect().width > 2000 && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)')).catch(() => null);
  if (heroBg) { comp('course-hero-background', { description: 'The hero tint: an absolutely positioned 2880px-wide div at z-index -1 behind the hero grid, filled with the primary blue at 5% alpha (#f2f6fd over white, sampled).', selector: 'div (z-index -1, 2880 wide) behind [data-e2e=hero-module]' }); await measure('course-hero-background', 'default', heroBg, { crop: false }); }
  const art = await mark('hero-art', () => [...document.querySelectorAll('svg')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 400 && r.top + scrollY < 800; })).catch(() => null);
  if (art) { comp('course-hero-art', { description: 'Decorative Coursera-C graphic at the right of the hero (inline svg).', selector: '[data-e2e=hero-module] svg (566 wide)' }); await measure('course-hero-art', 'default', art, { extra: (l) => l.evaluate((el) => [...new Set([...el.querySelectorAll('path')].map((p) => `${getComputedStyle(p).fill} / ${getComputedStyle(p).stroke} / ${getComputedStyle(p).opacity}`))]) }); }
  comp('hero-partner-logo', { description: 'Partner logo in the hero (cds-LogoWrapper mediumPaddingOutside), 36px tall.', selector: '[data-e2e=hero-module] .cds-LogoWrapper-base' });
  await measure('hero-partner-logo', 'default', page.locator('.cds-LogoWrapper-mediumPaddingOutside'));
  comp('hero-partner-divider', { description: 'Vertical rule between two partner logos.', selector: '[data-testid=partner-co-branding-divider]' });
  await measure('hero-partner-divider', 'default', page.locator('[data-testid=partner-co-branding-divider]'));
  out.components['hero-partner-logo'].repeat = await repeatGap('[data-e2e=hero-module] .cds-LogoWrapper-base, [data-e2e=hero-module] [data-testid=partner-co-branding-divider]');
  comp('hero-title', { description: 'Course title h1.', selector: '[data-e2e=hero-title]' });
  await measure('hero-title', 'default', page.locator('[data-e2e=hero-title]'));
  const partOf = await mark('part-of', () => [...document.querySelectorAll('[data-e2e=hero-module] p')].find((p) => /part of/.test(p.textContent)));
  comp('hero-part-of', { description: '"This course is part of <Specialization>" line.', selector: 'hero p containing "part of"' });
  await measure('hero-part-of', 'default', partOf);
  comp('link-inline', { description: 'Inline link in body text (the specialization name in the hero): underlined, inherits colour.', selector: 'hero p a' });
  await states('link-inline', partOf.locator('a'), B4);
  const instr = await mark('hero-instr', () => [...document.querySelectorAll('[data-e2e=hero-module] p')].find((p) => /Instructors?:/.test(p.textContent)).closest('div').parentElement.parentElement);
  comp('hero-instructors', { description: 'Instructor row: overlapping 30px avatars in 36px rings, "Instructors:" label, name link, +3 more, Top Instructor badge.', selector: 'hero row containing "Instructors:"' });
  await measure('hero-instructors', 'default', instr);
  const av = await mark('hero-avatar', () => document.querySelector('[data-e2e=hero-module] img[src*="avatar"], [data-e2e=hero-module] div > div > div > img:not([alt*="logo" i])')).catch(() => null);
  const avs = await mark('hero-avatar-first', () => { const p = [...document.querySelectorAll('[data-e2e=hero-module] p')].find((p) => /Instructors?:/.test(p.textContent)); const row = p.closest('div').parentElement.parentElement; return row.querySelector('img'); });
  comp('hero-avatar', { description: 'Instructor avatar in the hero stack.', selector: 'hero instructor row img' });
  await measure('hero-avatar', 'default', avs, { extra: (l) => l.evaluate((el) => { const w = el.parentElement; const cs = getComputedStyle(w); return { wrapper: { w: w.getBoundingClientRect().width, bg: cs.backgroundColor, border: cs.border, radius: cs.borderRadius, marginLeft: cs.marginLeft, boxShadow: cs.boxShadow }, next: w.nextElementSibling && getComputedStyle(w.nextElementSibling).marginLeft }; }) });
  void av;
  const more3 = page.locator('[data-e2e=hero-module] button.cds-button-ghost:has-text("more")');
  comp('button-ghost-inline', { description: '"+3 more" inline ghost button in the instructor row.', selector: 'hero button.cds-button-ghost' });
  await states('button-ghost-inline', more3, B4);
  const top = await mark('top-instr', () => [...document.querySelectorAll('[data-e2e=hero-module] div')].find((d) => d.children.length === 0 && d.textContent.trim() === 'Top Instructor'));
  comp('badge-top-instructor', { description: '"Top Instructor" badge: light blue fill, dark blue text, 2px radius... see values.', selector: 'hero div "Top Instructor"' });
  await measure('badge-top-instructor', 'default', top, { extra: (l) => l.evaluate((el) => { const p = el.parentElement; const cs = getComputedStyle(p); return { parent: { bg: cs.backgroundColor, padding: cs.padding, radius: cs.borderRadius, w: p.getBoundingClientRect().width, h: p.getBoundingClientRect().height } }; }) });
  const cta = page.locator('#hero-primary-cta button.cds-button-primary');
  comp('button-enroll', { description: '"Enroll for free" large two-line CTA: primary filled, 64px tall, label plus a small "Starts <date>" line. It is a submit button; pressed is forced with CDP, it is never clicked.', selector: '#hero-primary-cta button.cds-button-primary' });
  await states('button-enroll', cta, B4, { extra: (l) => l.evaluate((el) => { const a = el.querySelector('span > div > span'); const b = el.querySelector('[data-testid=start-date-string]'); const bs = b && (b.querySelector('span') || b); return { line1: a && { font: getComputedStyle(a).font, color: getComputedStyle(a).color, letterSpacing: getComputedStyle(a).letterSpacing }, line2: bs && { font: getComputedStyle(bs).font, color: getComputedStyle(bs).color } }; }) });
  const enrolled = await mark('enrolled', () => [...document.querySelectorAll('[data-e2e=hero-module] p')].find((p) => /already enrolled/.test(p.textContent)));
  comp('hero-enrolled-count', { description: '"1,253,410 already enrolled": number bold.', selector: 'hero p "already enrolled"' });
  await measure('hero-enrolled-count', 'default', enrolled, { extra: (l) => l.evaluate((el) => ({ strong: getComputedStyle(el.querySelector('strong')).fontWeight })) });

  // Floating stats card
  const kis = await mark('stats-card', () => { const slot = window.__vis('.xdp-key-information-slot'); return [...slot.querySelectorAll('div')].find((d) => getComputedStyle(d).boxShadow !== 'none') || slot; });
  comp('stats-card', { description: 'Floating stats card that overlaps the bottom of the hero: modules, rating, level, schedule, with vertical dividers; white, rounded, elevated.', selector: '.xdp-key-information-slot div (first with a box-shadow)' });
  await centre(kis);
  await measure('stats-card', 'default', kis, { pad: 20, extra: (l) => l.evaluate((el) => { const cells = [...el.children]; return { cells: cells.map((c) => { const cs = getComputedStyle(c); const r = c.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), padding: cs.padding, borderRight: `${cs.borderRightWidth} ${cs.borderRightStyle} ${cs.borderRightColor}`, borderLeft: `${cs.borderLeftWidth} ${cs.borderLeftStyle} ${cs.borderLeftColor}`, after: getComputedStyle(c, '::after').content !== 'none' ? { bg: getComputedStyle(c, '::after').backgroundColor, w: getComputedStyle(c, '::after').width, h: getComputedStyle(c, '::after').height } : null, before: getComputedStyle(c, '::before').content !== 'none' ? { bg: getComputedStyle(c, '::before').backgroundColor, w: getComputedStyle(c, '::before').width, h: getComputedStyle(c, '::before').height, top: getComputedStyle(c, '::before').top } : null }; }) }; }) });
  const texts = [
    ['stats-card-link', () => window.__vis('.xdp-key-information-slot a'), '"3 modules" heading link (underlined, 20px semibold).'],
    ['stats-card-value', () => [...window.__vis('.xdp-key-information-slot').querySelectorAll('div')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).find((d) => d.children.length === 0 && d.textContent.trim() === 'Beginner level'), '"Beginner level" value line.'],
    ['stats-card-sub', () => [...window.__vis('.xdp-key-information-slot').querySelectorAll('p')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).find((d) => /reviews/.test(d.textContent)), '"32,925 reviews" secondary line.'],
    ['stats-card-rating', () => [...window.__vis('.xdp-key-information-slot').querySelectorAll('span')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).find((d) => /^\d\.\d$/.test(d.textContent.trim())), '"4.9" rating number with a star.'],
  ];
  for (const [k, f, d] of texts) {
    const l = await mark(k, f).catch(() => null);
    if (!l) continue;
    comp(k, { description: d, selector: '.xdp-key-information-slot' });
    await measure(k, 'default', l, { crop: false });
  }
  await states('stats-card-link', page.locator('[data-m=stats-card-link]'), ['hover', 'focus-visible']);
  const star = await mark('stats-star', () => { const s = window.__vis('.xdp-key-information-slot svg'); return s; }).catch(() => null);
  if (star) { comp('stats-card-star', { description: 'Star icon after the rating.', selector: '.xdp-key-information-slot svg' }); await measure('stats-card-star', 'default', star, { crop: false }); }

  // Tooltip from contextual help
  const help = page.locator('.cds-ContextualHelp-helpToggleButton').filter({ visible: true }).first();
  comp('contextual-help-button', { description: 'Info (i) toggle next to "Recommended experience": 20px button, 16px icon.', selector: '.cds-ContextualHelp-helpToggleButton' });
  await states('contextual-help-button', help, B4);
  await reset();
  await centre(help);
  await toggle(help);
  await page.waitForTimeout(1000);
  await measure('contextual-help-button', 'expanded', help);
  const dlgH = page.locator('[role=dialog]').filter({ visible: true }).first();
  if (await dlgH.count()) {
    comp('help-dialog', { description: 'The (i) next to "Recommended experience" opens a small modal dialog (not a hover tooltip): title, level, text, primary OK and a close icon button; the page behind is dimmed.', selector: '[role=dialog]' });
    await measure('help-dialog', 'opened', dlgH, { pad: 12, extra: async (l) => ({ scrim: await bgAt(20, 880), parts: await l.evaluate((el) => [...el.querySelectorAll('h1,h2,h3,p,div,button')].filter((e) => e.children.length === 0 || e.tagName === 'BUTTON').slice(0, 10).map((e) => ({ tag: e.tagName.toLowerCase(), text: e.textContent.trim().slice(0, 40), font: getComputedStyle(e).font, color: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor, radius: getComputedStyle(e).borderRadius, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }))) }) });
    const ok = dlgH.locator('button.cds-button-primary');
    if (await ok.count()) { comp('button-primary-dialog', { description: 'OK in the help dialog: primary button, 48px tall.', selector: '[role=dialog] .cds-button-primary' }); await measure('button-primary-dialog', 'default', ok); }
    const x = dlgH.locator('button.cds-iconButton-medium, button[aria-label*=lose i]').first();
    if (await x.count()) { comp('icon-button-dialog-close', { description: 'Close (x) icon button in the dialog.', selector: '[role=dialog] icon button' }); await states('icon-button-dialog-close', x, ['default', 'hover']); }
    // Close it with its own buttons; Escape alone left the scrim up.
    for (const b of [x, ok]) {
      if (await dlgH.isVisible().catch(() => false)) { await toggle(b).catch(() => {}); await page.waitForTimeout(800); }
    }
    if (await dlgH.isVisible().catch(() => false)) { await page.keyboard.press('Escape'); await page.waitForTimeout(800); }
    out._meta.helpDialogClosed = !(await page.locator('[role=dialog]').filter({ visible: true }).count());
  }
  if (await page.locator('[role=dialog]').filter({ visible: true }).count()) await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Tab bar (in page)
  const bar = '[data-testid=overflow-carousel]';
  const tabs = page.locator(`main ${bar}`).filter({ visible: true }).first();
  comp('tab-bar', { description: 'In-page section nav (About, Outcomes, Modules, ...): links 44px tall; selected tab gets a tinted fill and an underlined blue label. A rule sits under the bar. A chevron button scrolls the overflow.', selector: `.cds-212 nav ${bar}` });
  await measure('tab-bar', 'default', page.locator('main .cds-212'), { extra: (l) => l.evaluate((el) => { const n = el.querySelector('nav'); const all = [el, n, ...n.querySelectorAll(':scope > div, :scope > div > div')]; return all.map((e) => ({ tag: e.tagName.toLowerCase(), borderBottom: `${getComputedStyle(e).borderBottomWidth} ${getComputedStyle(e).borderBottomStyle} ${getComputedStyle(e).borderBottomColor}`, after: getComputedStyle(e, '::after').content !== 'none' ? { bg: getComputedStyle(e, '::after').backgroundColor, h: getComputedStyle(e, '::after').height } : null, h: e.getBoundingClientRect().height })); }) });
  out.components['tab-bar'].repeat = await repeatGap(`main .cds-212 ${bar} [role=listitem]`);
  const tabLinks = tabs.locator('[role=listitem] a');
  comp('tab', { description: 'One section tab link.', selector: `${bar} [role=listitem] a` });
  await measure('tab', 'selected', tabLinks.nth(0), { extra: (l) => l.evaluate((el) => ({ ariaCurrent: el.getAttribute('aria-current'), cls: el.className, parentBg: getComputedStyle(el.parentElement).backgroundColor })) });
  await states('tab', tabLinks.nth(2), B4);
  // The overflow chevron is not reported visible to Playwright at 1440, so it is
  // not measured (see Gaps in measurements.md).

  // Sticky nav after scrolling
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(1500);
  const sticky = page.locator('[data-testid=fixed-page-navigation]');
  comp('sticky-nav', { description: 'Sticky course nav that replaces the header once the hero scrolls away: partner marks + course title, a compact Enroll button at the right, the tab bar under it; white with a drop shadow, fixed at top 0.', selector: '[data-testid=fixed-page-navigation]' });
  await measure('sticky-nav', 'sticky', sticky, { pad: 0, extra: (l) => l.evaluate((el) => { const kids = [el, ...el.querySelectorAll('*')].filter((e) => getComputedStyle(e).boxShadow !== 'none' || getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)').slice(0, 6); return kids.map((e) => ({ tag: e.tagName.toLowerCase(), cls: [...e.classList].join(' ').slice(0, 60), bg: getComputedStyle(e).backgroundColor, shadow: getComputedStyle(e).boxShadow, borderBottom: getComputedStyle(e).borderBottom, h: e.getBoundingClientRect().height, transition: getComputedStyle(e).transition, transform: getComputedStyle(e).transform })); }) });
  comp('sticky-nav-title', { description: 'Course title in the sticky nav.', selector: '[data-testid=fixed-page-navigation] h2' });
  await measure('sticky-nav-title', 'default', sticky.locator('h2'), { crop: false });
  comp('button-enroll-compact', { description: 'Compact Enroll CTA in the sticky nav (180x60).', selector: '[data-testid=fixed-page-navigation] button.cds-button-primary' });
  await measure('button-enroll-compact', 'default', sticky.locator('button.cds-button-primary'), { pad: 6 });
  const selTab = await mark('sticky-selected', () => [...document.querySelectorAll('[data-testid=fixed-page-navigation] [role=listitem] a')].find((a) => getComputedStyle(a).backgroundColor !== 'rgba(0, 0, 0, 0)' || getComputedStyle(a).textDecorationLine === 'underline')).catch(() => null);
  if (selTab) await measure('tab', 'selected-sticky', selTab, { crop: true });
  const dividerSticky = await mark('sticky-rule', () => [...document.querySelectorAll('[data-testid=fixed-page-navigation] *')].find((e) => parseFloat(getComputedStyle(e).borderBottomWidth) > 0)).catch(() => null);
  if (dividerSticky) { comp('sticky-nav-rule', { description: 'Rule between the title row and the tabs in the sticky nav.', selector: 'first bordered child of the sticky nav' }); await measure('sticky-nav-rule', 'default', dividerSticky, { crop: false }); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);

  // What you'll learn
  comp('learn-checklist', { description: '"What you\'ll learn": two-column list, 24px check icon, body text.', selector: '#about ul' });
  await measure('learn-checklist', 'default', page.locator('#about ul'));
  comp('section-heading', { description: 'Section heading h2 (What you\'ll learn).', selector: '#about h2' });
  await measure('section-heading', 'default', page.locator('#about h2'), { crop: false });
  comp('section-heading-small', { description: 'Smaller section heading (Skills you\'ll gain, Details to know).', selector: '#about div > h2:not(.cds-Typography-base)' });
  await measure('section-heading-small', 'default', page.locator('#about h2:not(.cds-Typography-base)'), { crop: false });
  comp('learn-checklist-item', { description: 'One checklist item: icon + text.', selector: '#about ul li > div' });
  await measure('learn-checklist-item', 'default', page.locator('#about ul li > div'), { extra: (l) => l.evaluate((el) => { const s = el.querySelector('svg'); const t = el.querySelector('p') || el.lastElementChild; return { gap: getComputedStyle(el).gap, iconColor: getComputedStyle(s).color, iconFill: getComputedStyle(s).fill, text: t && { font: getComputedStyle(t).font, color: getComputedStyle(t).color } }; }) });
  out.components['learn-checklist'].repeat = await repeatGap('#about ul:first-of-type > li');

  // Skills chips
  const sk = '[data-testid=skills-section] a';
  comp('skill-chip', { description: '"Skills you\'ll gain" chip: grey-filled pill link, 30px tall.', selector: sk });
  out.components['skill-chip'].repeat = await repeatGap('[data-testid=skills-section] li');
  await states('skill-chip', page.locator(sk), B4);
  comp('button-ghost-secondary', { description: 'Ghost secondary button (Show all after the skills): dark text, underlined.', selector: '[data-testid=show-all-skills]' });
  await states('button-ghost-secondary', page.locator('[data-testid=show-all-skills]'), B4);

  // Details to know
  const dtk = await mark('dtk', () => { const h = [...document.querySelectorAll('#about h2')].find((h) => /Details to know/.test(h.textContent)); return h && h.parentElement.nextElementSibling; });
  comp('details-to-know', { description: '"Details to know": 2-column grid of icon tiles (24px icon, title, sub line).', selector: '#about h2 "Details to know" + grid' });
  await measure('details-to-know', 'default', dtk);
  const tile = await mark('dtk-tile', () => document.querySelector('[data-m=dtk] > div'));
  comp('details-tile', { description: 'One tile: icon, title, supporting line.', selector: '[data-m=dtk] > div' });
  await measure('details-tile', 'default', tile, { extra: (l) => l.evaluate((el) => [...el.children].map((c) => ({ tag: c.tagName.toLowerCase(), w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height, font: getComputedStyle(c).font, color: getComputedStyle(c).color, margin: getComputedStyle(c).margin }))) });
  const lang = page.locator('#about button.cds-button-ghost:has-text("languages")');
  if (await lang.count()) { comp('button-ghost-text', { description: 'Text-sized ghost button ("30 languages available").', selector: '#about button.cds-button-ghost' }); await states('button-ghost-text', lang, B4); }

  // Outcomes
  comp('outcomes-section', { description: '"Build your subject-matter expertise": heading, part-of line, bullet list, image at right.', selector: '#outcomes' });
  await measure('outcomes-section', 'default', page.locator('#outcomes .cds-grid-item').nth(1), { pad: 0 });
  comp('heading-lg', { description: 'Large section heading (h2.cds-Typography-base in #outcomes).', selector: '#outcomes h2' });
  await measure('heading-lg', 'default', page.locator('#outcomes h2'), { crop: false });
  comp('outcomes-image', { description: 'Outcomes image.', selector: '#outcomes img' });
  await measure('outcomes-image', 'default', page.locator('#outcomes img'), { crop: false });
  comp('bullet-list', { description: 'Bulleted list under the outcomes heading.', selector: '#outcomes ul' });
  await measure('bullet-list', 'default', page.locator('#outcomes ul'), { extra: (l) => l.evaluate((el) => ({ listStyle: getComputedStyle(el).listStyle, liMargin: getComputedStyle(el.firstElementChild).margin, liFont: getComputedStyle(el.firstElementChild).font })) });
  comp('link-standalone', { description: 'Standalone link in body copy (the specialization link in Outcomes): blue, no underline until hover.', selector: '#outcomes a' });
  await states('link-standalone', page.locator('#outcomes a'), B4);

  // Modules
  comp('modules-heading', { description: '"There are 3 modules in this course" h2.', selector: '#modules h2' });
  await measure('modules-heading', 'default', page.locator('#modules h2'), { crop: false });
  comp('button-text-toggle', { description: 'Legacy "Show more" text toggle (button.bold.body-2-text) under long descriptions and reviews.', selector: '#modules .toggle-button-wrapper button' });
  await states('button-text-toggle', page.locator('#modules .toggle-button-wrapper button'), B4);
  const mbox = await mark('modules-box', () => document.querySelector('#modules [data-testid=accordion-item]').parentElement.parentElement);
  comp('module-list', { description: 'Bordered box holding the module accordions (a card around the list).', selector: '#modules [data-testid=accordion-item] parent x2' });
  await measure('module-list', 'default', mbox, { pad: 10 });
  const item = page.locator('#modules [data-testid=accordion-item]');
  out.components['module-list'].repeat = await repeatGap('#modules [data-testid=accordion-item]');
  comp('module-accordion', { description: 'Module accordion item (cds-AccordionRoot silent): header row is a full-width ghost button with h3, a meta line ("Week 1 • 7 hours to complete"), "Module details" and a chevron. Items are separated by a rule.', selector: '#modules [data-testid=accordion-item]' });
  await measure('module-accordion', 'collapsed', item.nth(0), { extra: (l) => l.evaluate((el) => { const all = [el, ...el.querySelectorAll('div')].slice(0, 6); return all.map((e) => ({ cls: [...e.classList].join(' ').slice(0, 70), borderBottom: `${getComputedStyle(e).borderBottomWidth} ${getComputedStyle(e).borderBottomStyle} ${getComputedStyle(e).borderBottomColor}`, borderTop: `${getComputedStyle(e).borderTopWidth} ${getComputedStyle(e).borderTopStyle} ${getComputedStyle(e).borderTopColor}`, padding: getComputedStyle(e).padding, margin: getComputedStyle(e).margin, h: e.getBoundingClientRect().height })); }) });
  const hdrBtn = item.nth(0).locator('button.cds-button-ghost').first();
  comp('module-accordion-header', { description: 'The header button of a module accordion.', selector: '#modules [data-testid=accordion-item] button.cds-button-ghost' });
  await states('module-accordion-header', hdrBtn, B4, { cropLoc: item.nth(0) });
  comp('module-title', { description: 'Module title h3.', selector: '#modules [data-testid=accordion-item] h3' });
  await measure('module-title', 'default', item.nth(0).locator('h3'), { crop: false });
  const meta = await mark('module-meta', () => document.querySelector('#modules [data-testid=accordion-item] h3').nextElementSibling);
  comp('module-meta', { description: 'Item-count / duration line under the module title.', selector: '#modules h3 + div' });
  await measure('module-meta', 'default', meta, { crop: false });
  const det = await mark('module-details', () => [...document.querySelectorAll('#modules [data-testid=accordion-item] span')].find((s) => s.textContent.trim() === 'Module details'));
  comp('module-details-label', { description: '"Module details" label at the right of the header.', selector: '#modules span "Module details"' });
  await measure('module-details-label', 'default', det, { crop: false });
  comp('module-chevron', { description: 'Chevron (end icon) of a module header.', selector: '#modules .cds-button-endIcon' });
  await measure('module-chevron', 'collapsed', item.nth(0).locator('.cds-button-endIcon').first(), { crop: false });
  // expand
  await reset();
  await centre(hdrBtn);
  await toggle(hdrBtn);
  await page.waitForTimeout(1200);
  await measure('module-accordion', 'expanded', item.nth(0), { pad: 10 });
  await measure('module-accordion-header', 'expanded', hdrBtn, { cropLoc: hdrBtn });
  await measure('module-chevron', 'expanded', item.nth(0).locator('.cds-button-endIcon').first(), { crop: false });
  const panel = item.nth(0).locator('[role=region]').first();
  comp('module-panel', { description: 'Expanded panel: description, "What\'s included" h4, a row of counts with 24px icons, then "Show info about module content".', selector: '#modules [role=region]' });
  await measure('module-panel', 'expanded', panel, { pad: 4 });
  const inc = await mark('included-row', () => { const h = [...document.querySelectorAll('#modules h4')].find((h) => /What's included/.test(h.textContent)); return h && h.parentElement.nextElementSibling; });
  comp('module-included', { description: 'Row of item counts ("20 videos", "1 reading", ...), each a 24px circle icon and label.', selector: '#modules h4 "What\'s included" + p' });
  await measure('module-included', 'default', inc, { extra: (l) => l.evaluate((el) => { const sp = el.children[0]; const s = sp.querySelector('svg'); const circle = s.querySelector('circle'); return { itemGap: getComputedStyle(el).gap, itemMargin: getComputedStyle(sp).marginRight, icon: { w: s.getBoundingClientRect().width, circleFill: circle && getComputedStyle(circle).fill, pathFill: getComputedStyle(s.querySelector('path')).fill }, label: getComputedStyle(sp.lastElementChild).font, labelColor: getComputedStyle(sp.lastElementChild).color }; }) });
  out.components['module-included'].repeat = await repeatGap('[data-m=included-row] > span');
  comp('module-h4', { description: '"What\'s included" h4.', selector: '#modules h4' });
  await measure('module-h4', 'default', page.locator('#modules h4'), { crop: false });
  const smc = item.nth(0).locator('.cds-ShowMoreContainer-ctaButton');
  comp('show-more-container-button', { description: '"Show info about module content": ghostSecondary with a 16px chevron (cds-ShowMoreContainer-ctaButton).', selector: '.cds-ShowMoreContainer-ctaButton' });
  await states('show-more-container-button', smc, B4);
  await reset();
  await toggle(smc);
  await page.waitForTimeout(1200);
  await measure('show-more-container-button', 'expanded', smc);
  const list = await mark('module-items', () => { const r = document.querySelector('#modules .cds-ShowMoreContainer-content'); return r && r.firstElementChild; });
  comp('module-item-list', { description: 'Expanded module content: per type an h5 ("20 videos • Total 147 minutes") with icon, then a list of items "Title • 3 minutes".', selector: '.cds-ShowMoreContainer-content' });
  await measure('module-item-list', 'expanded', list, { extra: (l) => l.evaluate((el) => { const h5 = el.querySelector('h5'); const li = el.querySelector('li'); return { h5: { font: getComputedStyle(h5).font, color: getComputedStyle(h5).color, margin: getComputedStyle(h5).margin }, h5Label: getComputedStyle(h5.querySelector('span span') || h5).font, li: { font: getComputedStyle(li).font, color: getComputedStyle(li).color, padding: getComputedStyle(li).padding, margin: getComputedStyle(li).margin, h: li.getBoundingClientRect().height, listStyle: getComputedStyle(li.parentElement).listStyle, ulPadding: getComputedStyle(li.parentElement).padding }, dur: li.querySelector('span:last-child') && { font: getComputedStyle(li.querySelector('span:last-child')).font, color: getComputedStyle(li.querySelector('span:last-child')).color } }; }), crop: false });
  const listCrop = await mark('module-items-head', () => { const h5 = document.querySelector('#modules .cds-ShowMoreContainer-content h5'); return h5.parentElement.parentElement; });
  await crop(page, listCrop, 'module-item-list-expanded', 8).then((f) => { out.components['module-item-list'].states.expanded.crop = f; }).catch(() => {});
  // collapse again
  await toggle(smc).catch(() => {});
  await toggle(hdrBtn).catch(() => {});
  await page.waitForTimeout(800);

  // Instructor card (right column of #modules)
  const ic = await mark('instr-card', () => { const h = [...document.querySelectorAll('#modules h3, #modules span, #modules h2')].find((e) => e.textContent.trim() === 'Instructors'); let n = h; for (let i = 0; i < 8 && n; i++) { n = n.parentElement; if (getComputedStyle(n).borderTopWidth !== '0px' || getComputedStyle(n).boxShadow !== 'none') return n; } return h && h.closest('.cds-grid-item'); }).catch(() => null);
  if (ic) {
    comp('instructor-card', { description: 'Instructors card in the right column beside Modules: heading, ratings line with (i), avatar + Top Instructor badge + name link + org + counts, "View all 4 instructors", rule, then "Offered by".', selector: '#modules right column, bordered box' });
    await measure('instructor-card', 'default', ic, { pad: 10 });
    const iav = ic.locator('img').first();
    comp('instructor-avatar', { description: 'Instructor photo in the card.', selector: 'instructor card img' });
    await measure('instructor-avatar', 'default', iav, { extra: (l) => l.evaluate((el) => { const w = el.parentElement; return { wrapper: { w: w.getBoundingClientRect().width, h: w.getBoundingClientRect().height, border: getComputedStyle(w).border, radius: getComputedStyle(w).borderRadius, bg: getComputedStyle(w).backgroundColor, shadow: getComputedStyle(w).boxShadow } }; }) });
    const iname = ic.locator('a').first();
    comp('instructor-name', { description: 'Instructor name link (underlined, semibold).', selector: 'instructor card a' });
    await states('instructor-name', iname, ['default', 'hover', 'focus-visible']);
    const va = ic.locator('button.cds-button-ghost:has-text("View all")');
    comp('button-ghost-bold', { description: '"View all 4 instructors": ghost button, bold, blue.', selector: 'instructor card button.cds-button-ghost' });
    await states('button-ghost-bold', va, B4);
  }

  // Recommendations: chips + list product card
  const chip = page.locator('#recommendations .cds-Chip-root');
  comp('chip', { description: 'Filter chip used as a tab (cds-Chip-root): Related / Degrees; the selected one is filled.', selector: '#recommendations .cds-Chip-root' });
  out.components['chip'].repeat = await repeatGap('#recommendations .cds-Chip-root');
  await measure('chip', 'selected', page.locator('#recommendations .cds-Chip-selected'));
  await states('chip', chip.nth(1), B4);
  const lc = '#recommendations .cds-ProductCard-list';
  comp('product-card-list', { description: 'List variant of the product card (cds-ProductCard-list): image left (315 wide), text right.', selector: lc });
  out.components['product-card-list'].repeat = await repeatGap('#recommendations li');
  await states('product-card-list', page.locator(lc), ['default', 'hover', 'focus-visible'], { focusLoc: page.locator(`${lc} .cds-CommonCard-titleLink`) });
  comp('product-card-list-image', { description: 'List card image.', selector: `${lc} .cds-ProductCard-listPreviewImage` });
  await measure('product-card-list-image', 'default', page.locator(`${lc} .cds-ProductCard-listPreviewImage`), { crop: false });
  comp('product-card-list-title', { description: 'List card title.', selector: `${lc} .cds-CommonCard-title` });
  await measure('product-card-list-title', 'default', page.locator(`${lc} .cds-CommonCard-title`), { crop: false });

  // Testimonials
  const tcard = await mark('tcard', () => { let n = document.querySelector('#testimonials h3'); while (n && !(n.parentElement && n.parentElement.classList.contains('cds-grid-item'))) n = n.parentElement; return n; });
  comp('testimonial-card', { description: 'Testimonial card: 64px round photo, name (h3), "Learner since", quote.', selector: '#testimonials .cds-grid-item > div' });
  out.components['testimonial-card'].repeat = await repeatGap('#testimonials .cds-grid-item:has(> div > div > img)');
  await measure('testimonial-card', 'default', tcard, { pad: 10, extra: (l) => l.evaluate((el) => { const img = el.querySelector('img'); const h3 = el.querySelector('h3'); const since = h3 && h3.nextElementSibling; const q = el.querySelector('span'); const f = (e) => e && { font: getComputedStyle(e).font, color: getComputedStyle(e).color, letterSpacing: getComputedStyle(e).letterSpacing, margin: getComputedStyle(e).margin }; return { img: img && { w: img.getBoundingClientRect().width, radius: getComputedStyle(img).borderRadius }, name: f(h3), since: f(since), quote: f(q), heading: f(document.querySelector('#testimonials h2')) }; }) });

  // Reviews
  const rs = await mark('ratings-summary', () => document.querySelector('#reviews [role=img]').parentElement.parentElement);
  comp('ratings-summary', { description: 'Ratings summary: star + big "4.9", "32,925 reviews", then a 5-row bar graph (6px bars, percent labels).', selector: '#reviews left column' });
  await measure('ratings-summary', 'default', rs, { extra: (l) => l.evaluate((el) => { const big = el.querySelector('[role=img] span'); const bar = el.querySelector('[data-testid=reviews-bar-graph] li span:nth-child(3) > div'); const fill = bar && bar.firstElementChild; const lab = el.querySelector('[data-testid=reviews-bar-graph] li span span'); const pct = el.querySelector('[data-testid=reviews-bar-graph] li p'); const star = el.querySelector('[role=img] svg'); const f = (e) => e && { font: getComputedStyle(e).font, color: getComputedStyle(e).color }; return { big: f(big), star: star && { w: star.getBoundingClientRect().width, color: getComputedStyle(star).color, fill: getComputedStyle(star).fill }, track: bar && { w: bar.getBoundingClientRect().width, h: bar.getBoundingClientRect().height, bg: getComputedStyle(bar).backgroundColor, radius: getComputedStyle(bar).borderRadius }, fill: fill && { bg: getComputedStyle(fill).backgroundColor, radius: getComputedStyle(fill).borderRadius }, label: f(lab), pct: f(pct), rowGap: getComputedStyle(el.querySelector('[data-testid=reviews-bar-graph] ul')).gap }; }) });
  out.components['ratings-summary'].repeat = await repeatGap('[data-testid=reviews-bar-graph] li');
  const rc = await mark('review-card', () => [...document.querySelectorAll('#reviews [data-testid=rating-line]')][0].closest('div').parentElement.parentElement.parentElement);
  comp('review-card', { description: 'Review card: initial avatar circle, initials, star line (16px stars) · date, review text, Show more.', selector: '#reviews review row' });
  out.components['review-card'].repeat = await siblingGap('[data-m=review-card]');
  await measure('review-card', 'default', rc, { pad: 10, extra: (l) => l.evaluate((el) => { const av = el.children[0]; const ini = av && av.firstElementChild; const star = el.querySelector('[data-testid=rating-line-star-full] svg'); const num = el.querySelector('[data-testid=rating-line] > span:last-child'); const date = [...el.querySelectorAll('p')].find((p) => /Reviewed on/.test(p.textContent)); const body = el.querySelector('.content-inner p'); const f = (e) => e && { font: getComputedStyle(e).font, color: getComputedStyle(e).color }; return { avatar: av && { w: av.getBoundingClientRect().width, h: av.getBoundingClientRect().height, bg: getComputedStyle(av).backgroundColor, radius: getComputedStyle(av).borderRadius, border: getComputedStyle(av).border }, initial: f(ini), star: star && { w: star.getBoundingClientRect().width, color: getComputedStyle(star).color, fill: getComputedStyle(star).fill }, starGap: '18px pitch', num: f(num), date: f(date), body: f(body), cardBg: getComputedStyle(el).backgroundColor, cardBorder: getComputedStyle(el).border, cardRadius: getComputedStyle(el).borderRadius, cardPadding: getComputedStyle(el).padding }; }) });
  const vmr = page.locator('#reviews a:has-text("View more reviews")');
  if (await vmr.count()) { comp('link-view-more', { description: '"View more reviews" link.', selector: '#reviews a' }); await states('link-view-more', vmr, ['default', 'hover', 'focus-visible']); }

  // FAQ accordion
  const faq = page.locator('.cds-ShowMoreList-listContainer [role=listitem]');
  comp('faq-accordion', { description: 'FAQ item (cds-AccordionRoot with a leading 24px chevron, question 16px semibold); items are separated by rules.', selector: '.cds-ShowMoreList-listContainer [role=listitem]' });
  out.components['faq-accordion'].repeat = await repeatGap('.cds-ShowMoreList-listContainer [role=listitem]');
  await measure('faq-accordion', 'collapsed', faq.nth(0), { extra: (l) => l.evaluate((el) => { const all = [el, ...el.querySelectorAll('div')].slice(0, 5); return all.map((e) => ({ cls: [...e.classList].join(' ').slice(0, 70), borderBottom: `${getComputedStyle(e).borderBottomWidth} ${getComputedStyle(e).borderBottomStyle} ${getComputedStyle(e).borderBottomColor}`, borderTop: `${getComputedStyle(e).borderTopWidth} ${getComputedStyle(e).borderTopStyle} ${getComputedStyle(e).borderTopColor}`, bg: getComputedStyle(e).backgroundColor, radius: getComputedStyle(e).borderRadius, padding: getComputedStyle(e).padding, h: e.getBoundingClientRect().height })); }) });
  const fh = faq.nth(0).locator('.cds-AccordionHeader-button');
  comp('faq-accordion-header', { description: 'FAQ header button (cds-AccordionHeader-button).', selector: '.cds-AccordionHeader-button' });
  await states('faq-accordion-header', fh, B4, { cropLoc: faq.nth(0) });
  comp('faq-question', { description: 'Question label.', selector: '.cds-AccordionHeader-labelDetails' });
  await measure('faq-question', 'default', faq.nth(0).locator('.cds-AccordionHeader-labelDetails'), { crop: false });
  comp('faq-chevron', { description: 'Leading chevron in the FAQ header.', selector: '.cds-AccordionHeader-chevron' });
  await measure('faq-chevron', 'collapsed', faq.nth(0).locator('.cds-AccordionHeader-chevron'), { crop: false });
  await reset();
  await centre(fh);
  await toggle(fh);
  await page.waitForTimeout(1000);
  await measure('faq-accordion', 'expanded', faq.nth(0));
  await measure('faq-accordion-header', 'expanded', fh, { crop: false });
  await measure('faq-chevron', 'expanded', faq.nth(0).locator('.cds-AccordionHeader-chevron'), { crop: false });
  const fp = faq.nth(0).locator('[role=region]').first();
  comp('faq-panel', { description: 'FAQ answer panel.', selector: '[role=region]' });
  await measure('faq-panel', 'expanded', fp, { crop: false, extra: (l) => l.evaluate((el) => { const p = el.querySelector('p') || el; return { p: { font: getComputedStyle(p).font, color: getComputedStyle(p).color } }; }) });
  await toggle(fh).catch(() => {});
  const mq = await mark('more-q', () => { const h = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'More questions'); let n = h; for (let i = 0; i < 6 && n; i++) { n = n.parentElement; if (getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)' || getComputedStyle(n).borderTopWidth !== '0px') return n; } return h.parentElement.parentElement; }).catch(() => null);
  if (mq) { comp('more-questions', { description: '"More questions" aside next to the FAQ.', selector: 'h3 "More questions" container' }); await measure('more-questions', 'default', mq, { pad: 10 }); }

  // Header AI button (only on course/spec)
  const ai = page.locator('[data-testid=two-panel-chat-trigger]');
  for (const cand of ['[data-testid=two-panel-chat-trigger]', '.cds-breadcrumbs-homeIcon', '[data-testid=overflow-carousel] button']) {
    if (out.components['tooltip-icon']?.states?.opened?.style) break;
    const l = page.locator(cand).filter({ visible: true }).first();
    if (!(await l.count())) continue;
    await reset(); await centre(l); await l.hover().catch(() => {}); await page.waitForTimeout(1200);
    const tt = page.locator('[role=tooltip], .cds-Tooltip-tooltip').filter({ visible: true }).first();
    if (await tt.count()) { comp('tooltip-icon', { description: `Hover tooltip (cds-Tooltip) naming an icon button, shown on hovering ${cand}.`, selector: '[role=tooltip]' }); await measure('tooltip-icon', 'opened', tt, { pad: 12, extra: (x) => x.evaluate((el) => [el, ...el.querySelectorAll('*')].slice(0, 6).map((e) => ({ cls: [...e.classList].filter((c) => !c.startsWith('css-')).join(' '), bg: getComputedStyle(e).backgroundColor, shadow: getComputedStyle(e).boxShadow, radius: getComputedStyle(e).borderRadius, padding: getComputedStyle(e).padding, font: getComputedStyle(e).font, color: getComputedStyle(e).color, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, transform: getComputedStyle(e).transform }))) }); }
  }
  if (await ai.count()) { comp('icon-button-ghost', { description: 'Ghost icon button, medium (AI coach trigger in the header): 48x48, 24px icon.', selector: '[data-testid=two-panel-chat-trigger]' }); await states('icon-button-ghost', ai, B4); }

  // Business band
  const biz = await mark('biz', () => { const a = [...document.querySelectorAll('a')].find((a) => /Coursera for Business/.test(a.textContent)); let n = a; for (let i = 0; i < 10 && n; i++) { n = n.parentElement; const cs = getComputedStyle(n); if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') return n; } return a.closest('.cds-grid-item').parentElement; }).catch(() => null);
  if (biz) { comp('promo-band', { description: '"See how employees at top companies..." promo band with a logo strip.', selector: 'container of the Coursera for Business link' }); await measure('promo-band', 'default', biz, { pad: 0 }); }

  await sheetsFor('course');
  await page.close();
}

async function spec() {
  await newPage('spec');
  const items = page.locator('#courses [data-testid=accordion-item]');
  comp('spec-course-accordion', { description: 'Specialization course list item: 94x53 thumbnail, title link (h3), "Course 1 • 33 hours", chevron button at the right; expands to What you\'ll learn and skill tags.', selector: '#courses [data-testid=accordion-item]' });
  out.components['spec-course-accordion'].repeat = await repeatGap('#courses [data-testid=accordion-item]');
  await measure('spec-course-accordion', 'collapsed', items.nth(0), { extra: (l) => l.evaluate((el) => { const img = el.querySelector('img'); const a = el.querySelector('h3 a'); const meta = el.querySelector('h3 + div > span'); const f = (e) => e && { font: getComputedStyle(e).font, color: getComputedStyle(e).color, decoration: getComputedStyle(e).textDecorationLine }; return { img: img && { w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height, radius: getComputedStyle(img).borderRadius, border: getComputedStyle(img).border }, title: f(a), meta: f(meta) }; }) });
  const sbtn = items.nth(0).locator('button.cds-button-ghost').first();
  comp('spec-course-toggle', { description: 'Chevron toggle button at the right of a course row.', selector: '#courses [data-testid=accordion-item] button.cds-button-ghost' });
  await states('spec-course-toggle', sbtn, B4);
  comp('spec-course-title-link', { description: 'Course title link in the series list.', selector: '#courses h3 a' });
  await states('spec-course-title-link', items.nth(0).locator('h3 a'), ['default', 'hover', 'focus-visible']);
  await reset();
  await centre(sbtn);
  await toggle(sbtn);
  await page.waitForTimeout(1200);
  await measure('spec-course-accordion', 'expanded', items.nth(0), { pad: 10 });
  const tag = items.nth(0).locator('[data-testid=tag-root]').first();
  comp('tag-skill', { description: 'Skill tag in an expanded course (cds-tag-medium category primary default).', selector: '#courses [data-testid=tag-root]' });
  out.components['tag-skill'].repeat = await repeatGap('#courses [data-testid=accordion-item]:first-child [data-testid=tag-root]');
  await measure('tag-skill', 'default', tag, { extra: (l) => l.evaluate((el) => { const t = [...el.querySelectorAll('span')].find((s) => s.children.length === 0 && s.textContent.trim()); return t && { font: getComputedStyle(t).font, color: getComputedStyle(t).color }; }) });
  await toggle(sbtn).catch(() => {});
  await page.waitForTimeout(600);

  const cred = page.locator('#credits');
  if (await cred.count()) { comp('credits-callout', { description: '"Build toward a degree" callout under the course list.', selector: '#credits' }); await measure('credits-callout', 'default', cred, { pad: 8 }); }

  // Spec page instructor block
  const ic = await mark('spec-instr', () => { const h = [...document.querySelectorAll('#courses span, #courses h3')].find((e) => e.textContent.trim() === 'Instructors'); let n = h; for (let i = 0; i < 8 && n; i++) { n = n.parentElement; if (getComputedStyle(n).borderTopWidth !== '0px' || getComputedStyle(n).boxShadow !== 'none') return n; } return h.closest('.cds-grid-item'); }).catch(() => null);
  if (ic) { comp('instructor-card-spec', { description: 'Instructors + Offered by aside on the specialization page.', selector: '#courses right column' }); await measure('instructor-card-spec', 'default', ic, { pad: 10 }); }

  // Select
  const sel = page.locator('.cds-select-select').first();
  comp('select', { description: 'Select field ("All courses" in reviews): cds-input-root with notched outline, 16px chevron.', selector: '.cds-select-select' });
  const root = page.locator('.cds-formControl-root:has(.cds-select-select) .cds-input-root').first();
  await states('select', root, ['default', 'hover', 'focus-visible'], { focusLoc: sel, extra: (l) => l.evaluate((el) => { const fs = el.querySelector('fieldset'); const s = el.querySelector('.cds-select-select'); const i = el.querySelector('.cds-select-icon'); return { fieldset: { border: getComputedStyle(fs).border, radius: getComputedStyle(fs).borderRadius, boxShadow: getComputedStyle(fs).boxShadow, outline: getComputedStyle(fs).outline }, value: { font: getComputedStyle(s).font, color: getComputedStyle(s).color, padding: getComputedStyle(s).padding }, icon: i && { w: i.getBoundingClientRect().width, color: getComputedStyle(i).color } }; }) });
  await reset();
  await centre(sel);
  await toggle(sel);
  await page.waitForTimeout(1000);
  await measure('select', 'opened', root, { extra: (l) => l.evaluate((el) => { const fs = el.querySelector('fieldset'); return { fieldset: { border: getComputedStyle(fs).border, boxShadow: getComputedStyle(fs).boxShadow } }; }) });
  const paper = page.locator('.cds-select-paper, [role=listbox]').first();
  if (await paper.isVisible().catch(() => false)) {
    comp('select-menu', { description: 'Open select menu (cds-select-paper / list).', selector: '.cds-select-paper' });
    await measure('select-menu', 'opened', paper, { pad: 12 });
    const opt = page.locator('[role=listbox] [role=option]');
    comp('select-option', { description: 'Option row in the select menu.', selector: '[role=option]' });
    out.components['select-option'].repeat = await repeatGap('[role=listbox] [role=option]');
    await measure('select-option', 'selected', page.locator('[role=listbox] [role=option][aria-selected=true]'));
    await opt.nth(1).hover();
    await page.waitForTimeout(400);
    await measure('select-option', 'hover', opt.nth(1));
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    await measure('select-option', 'focus-visible', page.locator('[role=listbox] [role=option]:focus, [role=listbox] [role=option][data-focus-visible], [role=listbox] [role=option][data-focused]'), { via: 'ArrowDown in the open list' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }

  // ShowMoreList CTA (FAQ "Show all 25 ...")
  const sml = page.locator('.cds-ShowMoreList-ctaButton').first();
  if (await sml.count()) { comp('show-more-list-button', { description: '"Show all 25 frequently asked questions": cds-ShowMoreList-ctaButton, ghost with chevron.', selector: '.cds-ShowMoreList-ctaButton' }); await states('show-more-list-button', sml, B4); }

  // Spec hero (for comparison of hero colours)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  comp('spec-hero', { description: 'Specialization hero (same module as the course hero).', selector: '[data-e2e=hero-module]' });
  await measure('spec-hero', 'default', page.locator('[data-e2e=hero-module]'), { pad: 0, extra: async () => ({ bgAt_60_300: await bgAt(60, 300) }) });

  await sheetsFor('spec');
  await page.close();
}

// The Explore topic page (/explore/generative-ai): bands of a heading column on
// the left and a chip row over a horizontal row of compact course cards on the
// right, plus one dark band with next / previous arrows. Desktop is read at
// 1440 in the shared context; the states marked `mobile` come from a second
// 390x844 context (mobile Chrome user agent, touch) because the band restacks.
async function explore() {
  await newPage('explore');
  const desktopPage = page;
  const desktopCdp = cdp;
  const light = await mark('explore-band', () => {
    const b = [...document.querySelectorAll('[data-testid=block_layout]')].find((x) => x.querySelector('[data-testid=overflow-carousel]') && x.querySelector('.cds-Chip-selected'));
    return b && b.parentElement;
  });
  const dark = await mark('explore-band-dark', () => [...document.querySelectorAll('[data-testid=block_layout]')].find((x) => x.querySelector('[data-testid=overflow-carousel]') && x.querySelector('.cds-button-ghostInvert')));
  const blk = light.locator('[data-testid=block_layout]');
  const head = blk.locator('.cds-grid-item').first();
  const carousel = blk.locator('[data-testid=overflow-carousel]');
  const content = carousel.locator('[data-testid=overflow-carousel-content]');
  const card = content.locator('.cds-ProductCard-grid').first();
  const chipRow = blk.locator('button.cds-Chip-root').first().locator('xpath=..');
  const idleChip = blk.locator('button.cds-Chip-root:not(.cds-Chip-selected)').first();
  const selChip = blk.locator('button.cds-Chip-root.cds-Chip-selected').first();
  const darkCol = dark.locator('.cds-grid-item');
  const darkCarousel = dark.locator('[data-testid=overflow-carousel]');
  const next = darkCarousel.locator('button', { hasText: 'Next' });
  const prev = darkCarousel.locator('button', { hasText: 'Previous' });

  // What a carousel does: the scroll container, the grid inside it, how many
  // cards show, and the arrow buttons.
  const carouselExtra = (l) => l.evaluate((wrap) => {
    const sc = wrap.firstElementChild;
    const ct = wrap.querySelector('[data-testid=overflow-carousel-content]');
    const items = [...ct.children];
    const box = sc.getBoundingClientRect();
    const rects = items.map((i) => i.getBoundingClientRect());
    const cs = getComputedStyle(sc);
    const cc = getComputedStyle(ct);
    // The hidden label reads Previous / Next on desktop and "Displaying items ..." on
    // the mobile user agent, so a button is found by label or, failing that, by order.
    const btns = [...wrap.querySelectorAll('button')];
    const arrow = (t, i) => {
      const b = btns.find((x) => x.textContent.trim() === t) || btns[i];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const bs = getComputedStyle(b);
      return { display: bs.display, w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), padding: bs.padding };
    };
    const cols = getComputedStyle(ct).gridTemplateColumns.split(' ');
    return {
      cards: items.length,
      cardWidth: +rects[0].width.toFixed(1),
      cardPitch: rects[1] ? +(rects[1].left - rects[0].left).toFixed(1) : null,
      fullyVisible: rects.filter((r) => r.left >= box.left - 1 && r.right <= box.right + 1).length,
      partlyVisible: rects.filter((r) => r.right > box.left + 1 && r.left < box.right - 1).length,
      next: arrow('Next', 1),
      previous: arrow('Previous', 0),
      scroller: { overflowX: cs.overflowX, scrollSnapType: cs.scrollSnapType, scrollSnapAlign: cs.scrollSnapAlign, scrollSnapStop: cs.scrollSnapStop, scrollBehavior: cs.scrollBehavior, scrollbarWidth: cs.scrollbarWidth, padding: cs.padding, scrollWidth: sc.scrollWidth, clientWidth: sc.clientWidth, scrollLeft: sc.scrollLeft },
      content: { display: cc.display, columns: cols.length > 4 ? `${cols[0]} x ${cols.length}` : cols.join(' '), gap: cc.gap, padding: cc.padding, role: ct.getAttribute('role'), itemRole: items[0].getAttribute('role'), itemSnapAlign: getComputedStyle(items[0]).scrollSnapAlign },
    };
  });

  // Shift+Tab, Tab (kbFocus) would walk through the last card's link first and
  // scroll the row to its end, which hides Next. The arrows are focused after a
  // key press instead, without a scroll, so :focus-visible still applies.
  const arrowStates = async (key, loc) => {
    await states(key, loc, ['default', 'hover'], { pad: 24 });
    await reset();
    const l = loc.filter({ visible: true }).first();
    await centre(l);
    await page.keyboard.press('Shift');
    await l.evaluate((el) => el.focus({ preventScroll: true }));
    await page.waitForTimeout(350);
    const fv = await l.evaluate((el) => el.matches(':focus-visible'));
    await measure(key, 'focus-visible', l, { pad: 24, via: `Shift key press, then focus() without scrolling (:focus-visible ${fv ? 'matches' : 'does not match'})` });
    await reset();
    await states(key, loc, ['pressed'], { pad: 24 });
  };

  // ----- the light band: heading column, chips, cards -----
  await centre(light);
  comp('explore-band', { description: 'Explore page band (Trusted AI Learning): a full-width grey wrapper holding a 20% heading column and an 80% column with the chip row over the card carousel. The wrapper paints the fill; the block inside it (1440 wide, radius 24) paints nothing here.', selector: '[data-testid=block_layout] parent' });
  await measure('explore-band', 'default', light, { pad: 0, extra: (l) => l.evaluate((w) => {
    const b = w.querySelector('[data-testid=block_layout]');
    const row = b.firstElementChild;
    const bs = getComputedStyle(b);
    const rs = getComputedStyle(row);
    const cols = [...row.children].filter((c) => c.classList.contains('cds-grid-item')).map((c) => { const cs = getComputedStyle(c); const r = c.getBoundingClientRect(); return { x: +r.x.toFixed(1), w: +r.width.toFixed(1), flexBasis: cs.flexBasis, maxWidth: cs.maxWidth, padding: cs.padding, alignItems: cs.alignItems }; });
    return { block: { w: +b.getBoundingClientRect().width.toFixed(1), padding: bs.padding, borderRadius: bs.borderRadius, maxWidth: bs.maxWidth, backgroundColor: bs.backgroundColor }, row: { display: rs.display, flexWrap: rs.flexWrap, justifyContent: rs.justifyContent, margin: rs.margin, w: +row.getBoundingClientRect().width.toFixed(1) }, columns: cols };
  }) });

  comp('explore-section-heading', { description: 'Band heading (h2 "Trusted AI Learning") in the left column: 600 20/24 with the -0.003em tracking of the subtitle styles.', selector: 'block h2' });
  await measure('explore-section-heading', 'default', blk.locator('h2').first());
  comp('explore-section-sub', { description: 'Sub text under the band heading: 400 16/24 in the primary ink, 4px below the heading, wrapping in the 243px column.', selector: 'block .cds-grid-item p' });
  await measure('explore-section-sub', 'default', head.locator('p').first());

  comp('explore-chip-row', { description: 'Row of chips above the cards: flex, wrap, 8px between chips, 8px above the cards.', selector: 'parent of .cds-Chip-root' });
  await measure('explore-chip-row', 'default', chipRow, { pad: 4 });
  out.components['explore-chip-row'].repeat = await repeatGap('[data-m="explore-band"] .cds-Chip-root');

  comp('explore-chip', { description: 'Idle chip (cds-Chip-root): white pill, 1px grey border, 400 14/20 label, 32 tall. Read as loaded: no chip was clicked.', selector: 'button.cds-Chip-root:not(.cds-Chip-selected)' });
  await states('explore-chip', idleChip, B4, { pad: 8 });
  comp('explore-chip-selected', { description: 'Selected chip (cds-Chip-selected): near-black fill, white 600 14/20 label with 0.14px tracking, same 32px height and 12px side padding as the idle chip.', selector: 'button.cds-Chip-root.cds-Chip-selected' });
  await states('explore-chip-selected', selChip, ['default', 'hover', 'focus-visible', 'pressed'], { pad: 8 });

  comp('explore-carousel', { description: 'The card row (data-testid overflow-carousel): a flex wrapper with -8px -16px margins that holds the scroll container, the card grid inside it and two absolutely placed arrow buttons. With four cards and room for four it does not scroll and both arrows are 0x0.', selector: '[data-testid=overflow-carousel]' });
  await centre(carousel);
  await measure('explore-carousel', 'default', carousel, { pad: 0, extra: carouselExtra });
  out.components['explore-carousel'].repeat = await repeatGap('[data-m="explore-band"] [data-testid=overflow-carousel-content] > div');
  comp('explore-carousel-content', { description: 'The card grid (data-testid overflow-carousel-content, role list): grid with 12px gap (--cds-spacing-150), 16px left padding and four equal columns, or minmax(150px, 1fr) columns below 600.', selector: '[data-testid=overflow-carousel-content]' });
  await measure('explore-carousel-content', 'default', content, { crop: false });

  // Compact card
  comp('explore-card', { description: 'Compact course card: the search product card (cds-ProductCard-grid) without the skills line or tags. 8px inset 16:9 cover image, partner row, title, one type line. Height follows the tallest card in the row.', selector: '[data-testid=overflow-carousel-content] .cds-ProductCard-grid' });
  await states('explore-card', card, ['default', 'hover', 'focus-visible', 'pressed'], { pad: 20, focusLoc: card.locator('.cds-CommonCard-titleLink'), pressLoc: card });
  const parts = [
    ['explore-card-click-area', '.cds-CommonCard-clickArea', 'The inner click area that holds the hover shadow and focus ring.', false],
    ['explore-card-image-container', '.cds-ProductCard-gridPreviewContainer', 'Image well: 16:9, inset 8px.', true],
    ['explore-card-image', '.cds-CommonCard-previewImage', 'Preview image wrapper: 16:9, radius 8, clips an img with object-fit cover.', true],
    ['explore-card-content', '.cds-ProductCard-content', 'Text column under the image: 8px padding, 8px between the header and the footer.', false],
    ['explore-card-partner-logo', '.cds-ProductCard-partnerLogos .cds-Avatar-base', 'Organisation avatar: 18px square, 1px border, radius 5, 2px padding around a 12px logo.', true],
    ['explore-card-partner-name', '.cds-ProductCard-partnerNames', 'Organisation name beside the avatar: 400 14/24.', true],
    ['explore-card-title', '.cds-CommonCard-title', 'Card title (h3): 600 16/20, -0.048px tracking, three-line clamp.', true],
    ['explore-card-title-link', '.cds-CommonCard-titleLink', 'The title link; it is stretched over the whole card, so it takes the card focus ring.', false],
    ['explore-card-type', '.cds-CommonCard-metadata p', 'Type line under the title ("Professional Certificate", "Specialization", "Course"): 400 12/18 in the weak ink.', true],
    ['explore-card-footer', '.cds-ProductCard-footer', 'Footer block that holds the type line; it has no gap in a carousel.', false],
  ];
  const partOf = (sel) => card.locator(sel).first();
  for (const [k, s, d, shot] of parts) {
    comp(k, { description: d, selector: `.cds-ProductCard-grid ${s}` });
    await centre(partOf(s));
    await measure(k, 'default', partOf(s), { crop: shot, extra: k === 'explore-card-image' ? (l) => l.evaluate((el) => { const i = el.querySelector('img'); const cs = getComputedStyle(i); const r = i.getBoundingClientRect(); return { img: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), objectFit: cs.objectFit, radius: cs.borderRadius } }; }) : k === 'explore-card-partner-logo' ? (l) => l.evaluate((el) => { const i = el.querySelector('img'); const cs = getComputedStyle(i); const r = i.getBoundingClientRect(); return { img: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), objectFit: cs.objectFit, radius: cs.borderRadius } }; }) : undefined });
  }
  await states('explore-card-title-link', card.locator('.cds-CommonCard-titleLink'), ['hover', 'focus-visible'], { cropLoc: card, pad: 20 });

  // ----- the dark band: heading, sub text, arrow link, arrows -----
  await centre(dark);
  comp('explore-band-dark', { description: 'Dark band (Learn AI with today\'s most popular certificates): a 1344 wide block with radius 24 on the grey-975 ground, a 20% heading column, an 80% card column, and decorative art absolutely placed behind. The white text and the ghost-invert link sit on it.', selector: '[data-testid=block_layout] with a ghostInvert link' });
  await measure('explore-band-dark', 'default', dark, { pad: 0, extra: (l) => l.evaluate((b) => { const bs = getComputedStyle(b); const p = b.parentElement; const ps = getComputedStyle(p); return { block: { w: +b.getBoundingClientRect().width.toFixed(1), padding: bs.padding, borderRadius: bs.borderRadius, overflow: bs.overflow }, parent: { w: +p.getBoundingClientRect().width.toFixed(1), padding: ps.padding, backgroundColor: ps.backgroundColor } }; }) });
  comp('explore-section-heading-inverse', { description: 'Band heading on the dark band: the same 600 20/24 style in white.', selector: 'dark block h2' });
  await measure('explore-section-heading-inverse', 'default', dark.locator('h2').first(), { pad: 12 });
  comp('explore-section-sub-inverse', { description: 'Sub text on the dark band: 400 16/24 in white.', selector: 'dark block .cds-grid-item p' });
  await measure('explore-section-sub-inverse', 'default', darkCol.locator('p').first(), { pad: 12 });
  comp('explore-section-link', { description: 'The "Explore programs" arrow link under the sub text: cds-button-ghostInvert, a link styled as a button (48 tall, 600 16/24, 0.16px tracking) with a 24px arrow end icon; its left margin is -16px so the text lines up with the heading.', selector: 'a.cds-button-ghostInvert' });
  await states('explore-section-link', dark.locator('a.cds-button-ghostInvert').first(), B4, { pad: 12 });

  comp('explore-carousel-dark', { description: 'A carousel that overflows (20 cards at 242 wide, fixed columns): the scroll container has overflow-x auto, scroll-snap-type x mandatory and no scrollbar. The Next arrow appears at the right end; after one click the Previous arrow appears at the left end and the row has scrolled by four cards.', selector: '[data-testid=overflow-carousel] (dark band)' });
  await centre(darkCarousel);
  await measure('explore-carousel-dark', 'default', darkCarousel, { pad: 0, extra: async (l) => ({ snapProbe: await l.evaluate(async (wrap) => { const sc = wrap.firstElementChild; sc.style.scrollBehavior = 'auto'; sc.scrollLeft = 100; await new Promise((r) => setTimeout(r, 700)); const settled = sc.scrollLeft; sc.scrollLeft = 0; sc.style.scrollBehavior = ''; return { requested: 100, settled }; }), ...(await carouselExtra(l)) }) });
  out.components['explore-carousel-dark'].repeat = await repeatGap('[data-m="explore-band-dark"] [data-testid=overflow-carousel-content] > div');

  comp('explore-carousel-next', { description: 'Next arrow: a 24px wide button the height of the row, pinned to the right end, a 24px chevron over a white fade (linear-gradient to the right, 0 to 0.8 alpha; hover and pressed swap in a stronger fade), padding 0 0 0 4px. 0x0 when the row does not overflow. Clicking scrolls the row by four cards (1016px at 254 pitch) with scroll-behavior smooth.', selector: '[data-testid=overflow-carousel] button "Next"' });
  await arrowStates('explore-carousel-next', next);
  await reset();
  await centre(next);
  const scrollBefore = await darkCarousel.evaluate((w) => w.firstElementChild.scrollLeft);
  await next.filter({ visible: true }).first().click();
  await page.waitForTimeout(1500);
  await measure('explore-carousel-dark', 'scrolled', darkCarousel, { pad: 0, via: `clicked Next once from scrollLeft ${scrollBefore}, read after the smooth scroll settled`, extra: carouselExtra });
  comp('explore-carousel-prev', { description: 'Previous arrow: mirror of the Next arrow at the left end (white fade to the left, padding 0 4px 0 0). It is 0x0 until the row has scrolled.', selector: '[data-testid=overflow-carousel] button "Previous"' });
  await arrowStates('explore-carousel-prev', prev);
  await reset();
  await darkCarousel.evaluate((w) => { const sc = w.firstElementChild; sc.style.scrollBehavior = 'auto'; sc.scrollLeft = 0; sc.style.scrollBehavior = ''; });
  await page.waitForTimeout(400);

  await sheetsFor('explore');

  // ----- 390 wide -----
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: UA_MOBILE, isMobile: true, hasTouch: true, locale: 'en-US', reducedMotion: 'no-preference' });
  await newPage('explore', mctx);
  const via = '390x844 mobile context (touch, Android Chrome user agent)';
  const mlight = await mark('explore-band', () => {
    const b = [...document.querySelectorAll('[data-testid=block_layout]')].find((x) => x.querySelector('[data-testid=overflow-carousel]') && x.querySelector('.cds-Chip-selected'));
    return b && b.parentElement;
  });
  const mblk = mlight.locator('[data-testid=block_layout]');
  const mcar = mblk.locator('[data-testid=overflow-carousel]');
  const mcard = mcar.locator('.cds-ProductCard-grid').first();
  await centre(mlight);
  await measure('explore-band', 'mobile', mlight, { pad: 0, via, extra: (l) => l.evaluate((w) => {
    const b = w.querySelector('[data-testid=block_layout]');
    const row = b.firstElementChild;
    const bs = getComputedStyle(b);
    const cols = [...row.children].filter((c) => c.classList.contains('cds-grid-item')).map((c) => { const cs = getComputedStyle(c); const r = c.getBoundingClientRect(); return { x: +r.x.toFixed(1), w: +r.width.toFixed(1), flexBasis: cs.flexBasis, padding: cs.padding }; });
    const h2 = b.querySelector('h2');
    return { block: { w: +b.getBoundingClientRect().width.toFixed(1), padding: bs.padding, borderRadius: bs.borderRadius }, columns: cols, h2Displayed: h2 ? h2.getBoundingClientRect().width > 0 : null };
  }) });
  comp('explore-section-heading-link', { description: 'Below 600 the h2 collapses to 0x0 and the heading is shown as a link: the same 600 20/24 text with a chevron icon (4px margin) after it, on the band\'s own link. Read in the 390 context only.', selector: 'block .cds-grid-item a (below 600)' });
  await states('explore-section-heading-link', mblk.locator('.cds-grid-item').first().locator('a').filter({ hasText: 'Trusted AI Learning' }), ['default', 'focus-visible'], { pad: 8 });
  await measure('explore-section-sub', 'mobile', mblk.locator('.cds-grid-item').first().locator('p').first(), { via });
  await measure('explore-chip-row', 'mobile', mblk.locator('button.cds-Chip-root').first().locator('xpath=..'), { via, pad: 4 });
  await measure('explore-chip', 'mobile', mblk.locator('button.cds-Chip-root:not(.cds-Chip-selected)').first(), { via, pad: 8 });
  await centre(mcar);
  await measure('explore-carousel', 'mobile', mcar, { pad: 0, via, extra: carouselExtra });
  await measure('explore-carousel-content', 'mobile', mcar.locator('[data-testid=overflow-carousel-content]'), { via, crop: false });
  await measure('explore-card', 'mobile', mcard, { via, pad: 20 });
  for (const [k, s, , shot] of parts) {
    if (!shot) continue;
    await measure(k, 'mobile', mcard.locator(s).first(), { via });
  }
  await page.close();
  await mctx.close();

  // The same page at 390 wide with the desktop user agent. The mobile user agent
  // above hides both arrows (display none, the row is for touch); a narrow desktop
  // window keeps them, so their 390 state is read here.
  const nctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: UA, locale: 'en-US', reducedMotion: 'no-preference' });
  await newPage('explore', nctx);
  const nvia = '390x844 window with the desktop user agent';
  const nlight = await mark('explore-band', () => {
    const b = [...document.querySelectorAll('[data-testid=block_layout]')].find((x) => x.querySelector('[data-testid=overflow-carousel]') && x.querySelector('.cds-Chip-selected'));
    return b && b.parentElement;
  });
  const ncar = nlight.locator('[data-testid=block_layout] [data-testid=overflow-carousel]');
  await centre(ncar);
  await measure('explore-carousel', 'narrow', ncar, { pad: 0, via: nvia, extra: carouselExtra });
  await measure('explore-carousel-next', 'narrow', ncar.locator('button').filter({ visible: true }).first(), { via: nvia, pad: 24 });
  await page.close();
  await nctx.close();
  page = desktopPage;
  cdp = desktopCdp;
  current = 'explore';
  await page.close();
}

// Layout grid at several widths.
async function layout() {
  out._meta.layout = {};
  for (const w of [390, 768, 1024, 1440, 1920]) {
    const { browser: b2, context: c2 } = await launch({ width: w, height: 900 });
    const p = await c2.newPage();
    await open(p, URLS.course, 6500);
    const r = await p.evaluate(() => {
      const pick = (el) => { if (!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { cls: [...el.classList].join(' ').slice(0, 80), x: +r.x.toFixed(1), w: +r.width.toFixed(1), maxWidth: cs.maxWidth, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, marginLeft: cs.marginLeft, marginRight: cs.marginRight, gap: cs.gap, flexWrap: cs.flexWrap, display: cs.display }; };
      const outer = document.querySelector('.xdp-page-grid-container') || document.querySelector('main .cds-1');
      const row = outer.querySelector(':scope > .cds-9');
      const items = [...row.children].filter((e) => e.classList.contains('cds-grid-item')).slice(0, 3);
      const aboutCol = document.querySelector('#about')?.closest('.cds-grid-item');
      const hdr = document.querySelector('[data-testid=page-header-wrapper] .main-nav-container');
      return { viewport: innerWidth, container: pick(outer), row: pick(row), items: items.map(pick), aboutColumn: pick(aboutCol), header: pick(hdr), headerRow: pick(hdr && hdr.querySelector(':scope > .cds-9')), aboutText: pick(document.querySelector('#about h2')), footer: pick(document.querySelector('footer .cds-1')), footerRow: pick(document.querySelector('footer .cds-1 > .cds-9')) };
    });
    // Search grid at this width
    await open(p, URLS.search, 6500);
    r.searchGrid = await p.evaluate(() => { const ul = document.querySelector('#searchResults ul'); if (!ul) return null; const lis = [...ul.children].slice(0, 5).map((li) => { const r = li.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), padding: getComputedStyle(li).padding }; }); const cr = document.querySelector('#searchResults').getBoundingClientRect(); return { region: { x: cr.x, w: cr.width }, ulMargin: getComputedStyle(ul).margin, items: lis }; });
    out._meta.layout[w] = r;
    log('layout', w, r.container?.w, r.row?.x);
    await b2.close();
  }
}

// ---------- run ----------
const which = process.argv.slice(2);
const run = which.length ? which : ['home', 'search', 'course', 'spec', 'explore', 'layout'];
const { browser, context: ctx } = await launch();
// A subset run (for example only `explore`) keeps the capture stamp of the full run.
if (!which.length || !out._meta.capturedAt) out._meta.capturedAt = new Date().toISOString();
out._meta.viewport = '1440x900 @2x, headless Chromium (Playwright 1.63), desktop Chrome UA';
const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const k of run) {
  try {
    if (k === 'home') await home();
    if (k === 'search') await search();
    if (k === 'course') await course();
    if (k === 'spec') await spec();
    if (k === 'explore') await explore();
    if (k === 'layout') await layout();
  } catch (e) {
    log('PAGE FAILED', k, e.stack?.slice(0, 600));
  }
  save();
}
await browser.close();
log('done', Object.keys(out.components).length, 'components');
