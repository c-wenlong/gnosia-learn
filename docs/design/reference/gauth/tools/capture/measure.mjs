// Measures Gauth's components on its public pages, in every state that can be
// reached without signing in or submitting anything.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs node measure.mjs [page ...]
//
// Pages: promo home academy create unit science math history atlas story news mobile.
// Writes raw/components-computed.json (merged, so a subset of pages can be re-run)
// and one crop per component and state into components/crops/. raw/measurements.md
// is then built from the JSON by build-measurements.mjs.
//
// States:
//   hover          real mouse hover, 450ms settle for transitions
//   focus-visible  keyboard: focus, Shift+Tab, Tab, so the browser sees a keyboard focus
//   pressed        CDP CSS.forcePseudoState [active, hover]; no mouse button is pressed,
//                  so no link or submit button can fire
//   focused        the field clicked into (a text field only)
//   filled         sample text typed into a field, measured, then deleted; Enter is never pressed
//   anything else  a resting state reached by the page itself or by a UI toggle (a tab,
//                  a menu, "Show more", the lesson's own Pause and Settings); nothing that
//                  sends a question, creates a course, signs in or uploads is ever pressed
import fs from 'node:fs';
import path from 'node:path';
import { BASE, M, launch, open, closePromo, openStory, styleOf, crop, centre, RAW } from './lib.mjs';

const OUT = process.env.OUT_JSON || path.join(RAW, 'components-computed.json');
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
out._meta ??= {};
out.components ??= {};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');

const URLS = {
  home: '/',
  science: '/course/science',
  math: '/course/math',
  history: '/course/history',
  my: '/course/my',
  unit: '/course/math/algebra-1?unit=real-numbers-and-sets',
  'lesson-science': '/course/science/how-things-work-1/learn?entry_source=start&from=science',
  'lesson-math': '/course/math/algebra-1/fundamentals-of-set-theory/learn?entry_source=start&return_to=course_detail',
  'lesson-history': '/course/history/crossing-the-ocean-wall/learn?entry_source=start&from=history',
  atlas: '/atlas',
  story: '/atlas',
  news: '/news',
};

let page, cdp, current, context, run;
const touched = new Set();

// ---------- helpers ----------

async function newPage(key, { mobile = false, promo = 'close', wait = 6000 } = {}) {
  current = key;
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  log('open', key, mobile ? '(mobile)' : '');
  await open(page, BASE + URLS[key], { wait, promo });
  await page.addStyleTag({ content: '*{caret-color:transparent!important}' });
}

async function reset() {
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()).catch(() => {});
  const vw = page.viewportSize()?.width ?? 1440;
  await page.mouse.move(vw - 2, 2);
  await page.waitForTimeout(250);
}

async function kbFocus(loc) {
  await loc.evaluate((el) => el.focus());
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  let ok = await loc.evaluate((el) => document.activeElement === el || el.contains(document.activeElement));
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
  return async () => { await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {}); };
}

// Clicks a UI toggle (tab, menu, show more). Refuses a submit button and any
// control whose text names an action this kit must never take.
const NEVER = /^(send|submit|sign in|log in|create|generate|upload|enable audio|explore now|share|export pdf|start free trial|upgrade|open)$/i;
async function toggle(loc, { allowLink = false } = {}) {
  const l = loc.filter({ visible: true }).first();
  const t = await l.evaluate((el) => ({ tag: el.tagName, type: el.getAttribute('type'), text: (el.innerText || el.getAttribute('aria-label') || '').trim() }));
  if (t.type === 'submit' || NEVER.test(t.text) || (t.tag === 'A' && !allowLink)) throw new Error(`toggle refused: ${t.tag} "${t.text}"`);
  await l.click({ timeout: 4000 }).catch(() => l.evaluate((el) => el.click()));
}

function comp(key, meta) {
  const c = (out.components[key] ??= { states: {} });
  Object.assign(c, { page: current, run, url: URLS[current] && BASE + URLS[current] }, meta);
  touched.add(key);
  c.states ??= {};
  return c;
}

async function measure(key, state, target, opts = {}) {
  const loc = target.filter({ visible: true }).first();
  const c = out.components[key];
  try {
    const s = await styleOf(loc);
    let file;
    if (opts.crop !== false) {
      try {
        file = await crop(page, (opts.cropLoc || loc).filter({ visible: true }).first(), `${key}-${state}`, opts.pad ?? 8);
      } catch (e) { s.cropError = String(e.message || e).slice(0, 120); }
    }
    c.states[state] = { ...s, crop: file, via: opts.via };
    if (opts.extra) c.states[state].extra = await opts.extra(loc);
    log('  ', key, state, s.rect.w + 'x' + s.rect.h);
  } catch (e) {
    c.states[state] = { error: String(e.message || e).slice(0, 200) };
    log('  !', key, state, String(e.message).slice(0, 120));
  }
}

const FILL = 'What is the derivative of x squared?';

// Records the listed states of one component. meta: title, group, desc, sel.
async function S(key, target, list, meta = {}, opts = {}) {
  comp(key, { title: meta.title, group: meta.group, desc: meta.desc, selector: meta.sel });
  delete out.components[key].missing;
  if (opts.open) { await reset(); await opts.open(); }
  const loc = target.filter({ visible: true }).first();
  if (!(await loc.count())) { log('  ! missing', key); out.components[key].missing = true; return; }
  for (const st of list) {
    let undo, via;
    try {
      if (!opts.noReset) await reset();
      if (!opts.noScroll) await centre(loc);
      if (opts.before?.[st]) via = await opts.before[st](loc);
      if (st === 'hover') {
        await (opts.hoverLoc || loc).filter({ visible: true }).first().hover({ timeout: 5000 }).catch(() => (opts.hoverLoc || loc).filter({ visible: true }).first().hover({ timeout: 5000, force: true }));
        await page.waitForTimeout(450);
        via = 'mouse hover';
      } else if (st === 'focus-visible') {
        via = await kbFocus((opts.focusLoc || loc).filter({ visible: true }).first());
      } else if (st === 'pressed') {
        undo = await forcePseudo((opts.pressLoc || loc).filter({ visible: true }).first(), ['active', 'hover']);
        via = 'CDP forcePseudoState :active:hover';
      } else if (st === 'focused') {
        await (opts.fieldLoc || loc).filter({ visible: true }).first().click({ timeout: 4000 });
        await page.waitForTimeout(400);
        via = 'clicked into the field';
      } else if (st === 'filled') {
        const f = (opts.fieldLoc || loc).filter({ visible: true }).first();
        await f.click({ timeout: 4000 });
        await page.keyboard.type(opts.fillText || FILL, { delay: 10 });
        await page.waitForTimeout(500);
        undo = async () => { await f.focus(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace'); await page.waitForTimeout(300); };
        via = `typed "${opts.fillText || FILL}", then deleted; nothing sent`;
      } else via = via || 'at rest';
      await measure(key, st, loc, { ...opts, via });
    } catch (e) {
      out.components[key].states[st] = { error: String(e.message || e).slice(0, 200) };
      log('  !', key, st, String(e.message).slice(0, 120));
    }
    if (undo) await undo().catch(() => {});
    if (opts.after?.[st]) await opts.after[st](loc).catch(() => {});
  }
  await reset();
}

const q = (sel) => page.locator(sel);
const B4 = ['default', 'hover', 'focus-visible', 'pressed'];

// Transitions and animations declared in every readable sheet, by selector.
async function sheetsFor(key) {
  const res = await page.evaluate(() => {
    const transitions = [];
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
        if (!r.style) continue;
        const t = r.style.getPropertyValue('transition');
        const a = r.style.getPropertyValue('animation');
        if (t || a) transitions.push({ selector: (r.selectorText || '').replace(/__[A-Za-z0-9_-]{5,6}/g, '').slice(0, 160), transition: t, animation: a });
      }
    };
    for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch { /* cross-origin, read by vars.mjs */ } }
    return transitions;
  });
  out._meta.sheets ??= {};
  out._meta.sheets[key] = res;
}

// ---------- shell (read on the home page) ----------
const G = {
  shell: 'Shell and navigation', home: 'Homework home', academy: 'Academy catalogue', unit: 'Unit page',
  science: 'Lesson player: science canvas', math: 'Lesson player: math', history: 'Lesson player: history',
  atlas: 'Atlas', news: 'Insights', overlay: 'Dialogs and overlays', mobile: 'Mobile (390 wide)',
};

async function promo() {
  await newPage('home', { promo: 'keep' });
  const dlg = q(M('atlas-intro-modal_aw-atlas-intro-modal'));
  await S('promo-dialog', dlg, ['default'], { group: G.overlay, title: 'Promo dialog', desc: 'The announcement every page opens with ("Introducing Gauth Academy"): a 600px white card at radius 24 with a 0 8 20 shadow, a Playfair Display 24/31.2 800 title, a 14/19.6 grey subtitle, a media panel, a full-width black button and a round close button.', sel: M('atlas-intro-modal_aw-atlas-intro-modal') }, { noScroll: true });
  await S('promo-title', q(M('atlas-intro-modal_aw-atlas-intro-modal-title')), ['default'], { group: G.overlay, title: 'Promo dialog title', sel: M('atlas-intro-modal_aw-atlas-intro-modal-title') }, { noScroll: true });
  await S('promo-subtitle', q(M('atlas-intro-modal_aw-atlas-intro-modal-subtitle')), ['default'], { group: G.overlay, title: 'Promo dialog subtitle', sel: M('atlas-intro-modal_aw-atlas-intro-modal-subtitle') }, { noScroll: true });
  await S('promo-confirm', q(M('atlas-intro-modal_aw-atlas-intro-modal-confirm')), B4, { group: G.overlay, title: 'Promo dialog button', desc: '"Explore now": black, radius 14, 48px tall, Playfair Display 18/27 600. Hover turns it #21252e; pressed scales it to 0.99. Measured, never pressed.', sel: M('atlas-intro-modal_aw-atlas-intro-modal-confirm') }, { noScroll: true });
  await S('promo-close', q(M('atlas-intro-modal_aw-atlas-intro-modal-close')), B4, { group: G.overlay, title: 'Promo dialog close button', sel: M('atlas-intro-modal_aw-atlas-intro-modal-close') }, { noScroll: true });
  out._meta.backdrop = await page.evaluate(() => {
    const d = document.querySelector('[class*="atlas-intro-modal_aw-atlas-intro-modal__"]');
    const res = [];
    for (let n = d; n; n = n.parentElement) { const c = getComputedStyle(n); if (c.backgroundColor !== 'rgba(0, 0, 0, 0)' && n !== d) res.push({ node: n.className.toString().replace(/__[\w-]{5,6}/g, '').slice(0, 80), bg: c.backgroundColor, backdrop: c.backdropFilter }); }
    for (const n of document.querySelectorAll('[class*="mask" i]')) { const c = getComputedStyle(n); const r = n.getBoundingClientRect(); if (r.width > 1000) res.push({ node: n.className.toString().replace(/__[\w-]{5,6}/g, '').slice(0, 80), bg: c.backgroundColor, backdrop: c.backdropFilter }); }
    return res;
  });
  await page.close();
}

async function home() {
  await newPage('home');
  await sheetsFor('home');
  const g = G.shell;
  await S('header', q(M('pc-header_header')), ['default'], { group: g, title: 'Top bar', desc: 'The 60px bar over the content column: white with a 1px bottom rule on Homework and Insights, transparent on Academy. Holds the question field on inner pages, Upgrade and Sign in.', sel: M('pc-header_header') }, { noScroll: true });
  await S('upgrade-button', q(M('pc-header_accountActionWarm')), ['default', 'hover', 'pressed'], { group: g, title: 'Upgrade button', desc: 'The gold Upgrade pill: a warm gradient fill with brown text and a bolt icon. A div, so it takes no keyboard focus. Measured, never pressed.', sel: M('pc-header_accountActionWarm') }, { noScroll: true });
  await S('sign-in-button', q(M('pc-header_loginEntry') + ' span').first(), ['default', 'hover', 'pressed'], { group: g, title: 'Sign in button', desc: 'The near-black primary button in the top bar. A span in a div, so it takes no keyboard focus. Measured, never pressed.', sel: M('pc-header_loginEntry') + ' span' }, { noScroll: true, hoverLoc: q(M('pc-header_loginEntry')) });
  await S('side-menu', q(M('side-menu_side-menu')), ['default'], { group: g, title: 'Sidebar', desc: 'The 220px left rail: logo and collapse button, the four destinations, a rule, App, and the Gauth PLUS card pinned to the bottom.', sel: M('side-menu_side-menu') }, { noScroll: true });
  const items = q(M('side-menu_side-menu-item'));
  await S('side-menu-item-active', q(M('side-menu_side-menu-item-active')), ['default'], { group: g, title: 'Sidebar item, current (cool)', desc: 'The current destination on Homework and Insights: a #f5f5f7 pill with the label in 600.', sel: M('side-menu_side-menu-item-active') }, { noScroll: true });
  await S('side-menu-item', items.filter({ hasText: 'Atlas' }), ['default', 'hover', 'pressed'], { group: g, title: 'Sidebar item', desc: 'A destination row: 40px tall, radius 10, 20px icon, 14/21 label.', sel: M('side-menu_side-menu-item') }, { noScroll: true });
  await S('side-menu-link', q(M('side-menu_link')).filter({ hasText: 'Atlas' }), ['focus-visible'], { group: g, title: 'Sidebar link, keyboard focus', desc: 'The link inside a sidebar row, which is what takes keyboard focus.', sel: M('side-menu_link') }, { noScroll: true, cropLoc: items.filter({ hasText: 'Atlas' }) });
  await S('side-menu-collapse', q(M('side-menu_sidebar-collapse')), B4, { group: g, title: 'Sidebar collapse button', sel: M('side-menu_sidebar-collapse') }, { noScroll: true });
  await S('plus-card', q(M('side-menu-small-cards_upgrade-small-card')), ['default'], { group: g, title: 'Gauth PLUS card', desc: 'The upsell card at the foot of the sidebar: cream fill, radius 12, a gold rule under the title and a gold "Start Free Trial" button.', sel: M('side-menu-small-cards_upgrade-small-card') }, { noScroll: true });
  await S('plus-card-button', q(M('side-menu-small-cards_btn')), ['default', 'hover', 'pressed'], { group: g, title: 'Gauth PLUS card button', desc: 'Measured, never pressed.', sel: M('side-menu-small-cards_btn') }, { noScroll: true });
  await S('logo', q(M('side-menu_h-logo')), ['default'], { group: g, title: 'Logo', sel: M('side-menu_h-logo') }, { noScroll: true });

  const h = G.home;
  await S('home-hero', q(M('slogan_slogan')), ['default'], { group: h, title: 'Homework hero', desc: 'The first band of the home page: a pale lilac gradient ground, the two-line serif title, the question field, the upload panel and the subject chips.', sel: M('slogan_slogan') }, { noScroll: true });
  await S('home-title', q(M('slogan_title')), ['default'], { group: h, title: 'Hero title', desc: '"Your AI Study Helper / Gauth it, Ace it!" in Gauth Home Libre Baskerville; the second line is filled with a gradient through background-clip.', sel: M('slogan_title') }, { noScroll: true });
  const box = q(M('pc_search-input-container'));
  await S('question-box', box, ['default', 'hover', 'focused', 'filled'], { group: h, title: 'Question field', desc: 'The 680 x 64 pill the home page is built around: a faint indigo tint, a 2px indigo-alpha border, radius 38, a round white submit button at the right end. Text was typed and deleted; nothing was sent.', sel: M('pc_search-input-container') }, { fieldLoc: q(M('pc_input')) });
  await S('question-input', q(M('pc_input')), ['default', 'focus-visible'], { group: h, title: 'Question field input', sel: M('pc_input') }, { crop: false });
  await S('question-submit', q(M('pc_search-submit-wrap')), ['default', 'hover'], { group: h, title: 'Question submit button', desc: 'The round white arrow button; measured, never pressed.', sel: M('pc_search-submit-wrap') });
  await S('upload-panel', q(M('pc_uploadWrap')), ['default', 'hover'], { group: h, title: 'Upload panel', desc: 'The dashed drop zone under the field. Hovered only; no file was chosen.', sel: M('pc_uploadWrap') });
  const chip = q(M('resources-list_resources-item')).first();
  await S('subject-chip', chip, B4, { group: h, title: 'Subject chip', desc: 'Icon over label, 87 x 72, radius 10, in a muted grey-violet.', sel: M('resources-list_resources-item') });
  await S('subject-more', q(M('resources-list_resources-more')), ['default', 'hover', 'pressed'], { group: h, title: 'More subjects chip', desc: 'The "MORE" pill at the end of the chip row.', sel: M('resources-list_resources-more') });
  await S('atlas-band-title', q(M('atlas-intro_headline')), ['default'], { group: h, title: 'Section headline', desc: 'The marketing sections below the fold open with a 32/41.6 700 headline and a 16/24 500 grey line; a word can carry a gradient shine.', sel: M('atlas-intro_headline') });
  await S('atlas-showcase', q(M('atlas-intro_showcase')), ['default'], { group: h, title: 'Atlas showcase', desc: 'A radius-48 panel with soft radial colour washes holding the copy, a CTA and a demo video.', sel: M('atlas-intro_showcase') });
  await S('atlas-cta', q(M('atlas-intro_cta')), B4, { group: h, title: 'Start Exploring button', desc: 'A dark radius-14 link button. Measured, never followed.', sel: M('atlas-intro_cta') });
  await S('feature-card', q(M('atlas-intro_feature')).first(), ['default', 'hover'], { group: h, title: 'Feature card', desc: 'White, 1px #5058651a border, radius 32: icon, 16/24 600 title, 14/21 grey line.', sel: M('atlas-intro_feature') });
  await S('solution-option', q(M('ai-solution_option')).first(), ['default', 'hover'], { group: h, title: 'Solution option row', desc: 'A radius-20 row with an icon, a 16/22 600 title and a 14/22 description. The rows take turns being the active one, which turns Gauth red (#ff013e) with white text and a red-tinted shadow; the measured row was active.', sel: M('ai-solution_option') });
  await S('live-tutor-band', q(M('live-tutor_live-tutor-content')), ['default'], { group: h, title: 'Live tutor band', desc: 'A pink block with one oversized corner radius (54 54 200 54).', sel: M('live-tutor_live-tutor-content') });
  await S('footer', q(M('pc-footer-view_footer-wrap')), ['default'], { group: h, title: 'Footer', desc: 'White with a 1px #f5f5f7 top rule: brand line, email, socials and a language select, then Company, Legal and Download App columns.', sel: M('pc-footer-view_footer-wrap') });
  await page.close();
}

async function academy() {
  await newPage('science');
  await sheetsFor('academy');
  const g = G.academy;
  await S('academy-ground', q(M('catalog_page')), ['default'], { group: g, title: 'Academy page', desc: 'The catalogue page: #faf9f5 ground under a transparent top bar, the warm sidebar, a 1025px column.', sel: M('catalog_page') }, { noScroll: true, crop: false });
  await S('side-menu-warm', q(M('side-menu_side-menu-warm')), ['default'], { group: G.shell, title: 'Sidebar, warm', desc: 'On Academy the sidebar takes the page ground and the current item turns beige.', sel: M('side-menu_side-menu-warm') }, { noScroll: true });
  await S('side-menu-item-warm-active', q(M('side-menu_side-menu-item-warm-active')), ['default'], { group: G.shell, title: 'Sidebar item, current (warm)', desc: 'The current destination on Academy: a #f4ebe5 pill (--lesson-primary-fill-2).', sel: M('side-menu_side-menu-item-warm-active') }, { noScroll: true });
  await S('academy-title', q(M('catalog_hero') + ' h1'), ['default'], { group: g, title: 'Academy title', desc: '"Gauth Academy" in Playfair Display 700 at 36px.', sel: M('catalog_hero') + ' h1' }, { noScroll: true });
  await S('create-course-button', q(M('catalog_createButton')), B4, { group: g, title: 'Create Course button', desc: 'A pale blue pill: an image fill of a soft blue-to-cream gradient, a 1px #d5e3f4 border, radius 12, a sparkle icon and SF Pro 14/21 500.', sel: M('catalog_createButton') }, { noScroll: true });
  const tabs = q(M('catalog_categoryTab'));
  await S('category-tab-active', q(M('catalog_categoryTabActive')), ['default', 'focus-visible'], { group: g, title: 'Category tab, current', desc: 'The current catalogue tab: #f4ebe5 fill, transparent border, 700 label.', sel: M('catalog_categoryTabActive') }, { noScroll: true });
  await S('category-tab', tabs.filter({ hasText: 'Math Curriculum' }), B4, { group: g, title: 'Category tab', desc: 'A 36px tab with a 1px #5058651a border, radius 12, 14/19.6 grey label.', sel: M('catalog_categoryTab') }, { noScroll: true });
  await S('section-heading', q(M('catalog_sectionHeading')).first(), ['default'], { group: g, title: 'Course section heading', desc: 'An 80px rounded cover beside a 22/28.6 600 title and a 16/22.4 grey line.', sel: M('catalog_sectionHeading') }, { noScroll: true });
  await S('course-section', q(M('catalog_courseSection')).first(), ['default'], { group: g, title: 'Course section', desc: 'One course: its heading and a three-column card grid, closed by a 1px #e7e6e3 rule.', sel: M('catalog_courseSection') }, { noScroll: true, crop: false });
  const card = q(M('catalog_premiumCard')).first();
  await S('lesson-card', card, B4, { group: g, title: 'Lesson card (Science Labs, History Signature)', desc: 'A white card, 1px rgba(0,0,0,.08) border, radius 16, a 0 4 7 shadow at 4%: a 147px cover inset 9px at radius 12, a 700 category label, a 16/24 600 title, a 12/16.8 subtitle and a 6px progress track.', sel: M('catalog_premiumCard') });
  await S('lesson-card-category', q(M('catalog_premiumCategory')).first(), ['default'], { group: g, title: 'Lesson card category', sel: M('catalog_premiumCategory') }, { crop: false });
  await S('lesson-card-title', q(M('catalog_premiumInfo') + ' h2').first(), ['default'], { group: g, title: 'Lesson card title', sel: M('catalog_premiumInfo') + ' h2' }, { crop: false });
  await S('lesson-card-subtitle', q(M('catalog_premiumSubtitle')).first(), ['default'], { group: g, title: 'Lesson card subtitle', sel: M('catalog_premiumSubtitle') }, { crop: false });
  await S('lesson-card-progress', q(M('catalog_premiumProgressTrack')).first(), ['default'], { group: g, title: 'Lesson card progress track', sel: M('catalog_premiumProgressTrack') });
  await page.close();

  await newPage('math');
  await S('unit-card', q(M('catalog_card')).first(), B4, { group: g, title: 'Unit card (Math Curriculum)', desc: 'A white card 326 x 178: an 80px cover tile at radius 12 beside an Inter 17/23.8 600 title, a "Unit 1 | 42 Topics" meta line and a 6px pill track.', sel: M('catalog_card') });
  await S('unit-card-title', q(M('catalog_card') + ' h3').first(), ['default'], { group: g, title: 'Unit card title', sel: M('catalog_card') + ' h3' }, { crop: false });
  await S('unit-card-meta', q(M('catalog_meta')).first(), ['default'], { group: g, title: 'Unit card meta line', sel: M('catalog_meta') });
  await S('unit-card-progress', q(M('catalog_progressTrack')).first(), ['default'], { group: g, title: 'Unit card progress track', sel: M('catalog_progressTrack') }, { crop: false });
  const more = q(M('catalog_expandButton')).first();
  await S('show-more', more, [...B4, 'expanded'], { group: g, title: 'Show more button', desc: '"Show 14 more" with a chevron: 1px #e0e3e8 border, radius 12, 14/19.6 grey. Pressing it lists the remaining units as compact rows.', sel: M('catalog_expandButton') }, {
    before: { expanded: async (l) => { await toggle(l); await page.waitForTimeout(1200); return 'clicked (a UI toggle)'; } },
  });
  const row = await page.evaluate(() => { const a = [...document.querySelectorAll('a[href*="?unit="]')].find((x) => /Unit\s*7/.test(x.innerText)); if (!a) return null; a.setAttribute('data-m', 'unit-row'); return true; });
  if (row) await S('unit-row', q('[data-m="unit-row"]'), ['default', 'hover', 'focus-visible'], { group: g, title: 'Unit card revealed by Show more', desc: 'Show more reveals the units past the sixth as the same cards.', sel: 'a[href*="?unit="] (7th and later)' });
  await page.close();

  await newPage('history');
  await S('history-card', q(M('catalog_premiumCard')).first(), ['default', 'hover'], { group: g, title: 'History lesson card', desc: 'The same card as Science Labs with a full-bleed illustrated cover.', sel: M('catalog_premiumCard') });
  await page.close();

  await newPage('my');
  await S('my-empty', q(M('catalog_emptyState')).first().or(q('main').locator('img').first().locator('xpath=../..')), ['default'], { group: g, title: 'My Course empty state', desc: 'A fan of three course cards, a 20px 600 title, a grey line and a dark Create button.', sel: M('catalog_emptyState') });
  const create = page.getByRole('button', { name: 'Create', exact: true });
  await S('create-button', create, B4, { group: g, title: 'Create button (empty state)', desc: 'The dark primary button: #21252e, radius 12, 44px, white 16/22.4 500. Hover lightens it to #333943; pressed also scales it to 0.98. Measured, never pressed.', sel: 'button "Create"' });
  await page.close();
}

async function createDialog() {
  await newPage('my');
  const g = G.overlay;
  await q(M('catalog_createButton')).first().click();
  await page.waitForTimeout(2500);
  const dlg = page.getByRole('dialog').filter({ hasText: 'Create a Course' }).first();
  const dsel = 'role=dialog "Create a Course"';
  await S('create-dialog', dlg, ['default'], { group: g, title: 'Create a Course dialog', desc: 'Opened from Create Course: a #faf9f5 sheet with radius 24, a greeting, three suggestion chips, Shuffle, and a prompt field over a blue-to-lilac glow. Nothing was typed into the prompt but sample text, then deleted; no suggestion was pressed.', sel: dsel }, { noScroll: true });
  const chip = dlg.locator('button').filter({ hasText: /\w{4,}/ }).filter({ hasNotText: /Shuffle/ }).first();
  await S('create-suggestion', chip, ['default', 'hover', 'focus-visible'], { group: g, title: 'Course suggestion chip', desc: 'A white chip with a 600 label and an arrow; pressing one would start a course, so it was only hovered and focused.', sel: dsel + ' button' }, { noScroll: true });
  const field = dlg.locator('textarea, input').first();
  await S('create-prompt', field.locator('xpath=ancestor::div[1]'), ['default', 'focused', 'filled'], { group: g, title: 'Course prompt field', desc: 'The white radius-16 prompt field at the foot of the dialog with a round send button that stays grey until there is text.', sel: dsel + ' textarea' }, { noScroll: true, fieldLoc: field, fillText: 'Photosynthesis' });
  const close = dlg.locator('button[aria-label*="lose" i], button').filter({ hasText: /^$/ }).first();
  await S('create-close', close, ['default', 'hover', 'focus-visible'], { group: g, title: 'Dialog close button', sel: dsel + ' close' }, { noScroll: true });
  await page.close();
}

async function unit() {
  await newPage('unit');
  await sheetsFor('unit');
  const g = G.unit;
  await S('back-link', q(M('math-course-detail_backLink')), ['default', 'hover', 'focus-visible'], { group: g, title: 'Back link', desc: 'An arrow and the catalogue tab name, SF Pro 16/22.4 in #646a77.', sel: M('math-course-detail_backLink') }, { noScroll: true });
  await S('course-banner', q(M('math-course-detail_courseBanner')), ['default'], { group: g, title: 'Course banner', desc: 'A radius-20 band tinted with the course colour (Algebra 1 is green #ecf4e5): an SF Pro 22/28.6 700 course title, a lessons and topics count, a 7px progress bar and the percent.', sel: M('math-course-detail_courseBanner') }, { noScroll: true });
  await S('unit-rail', q(M('math-course-detail_unitRail')), ['default'], { group: g, title: 'Unit rail', desc: 'The 310px list of units: a 1px rgba(0,0,0,.04) border, radius 16; the current unit is marked by a 5px green bar on its ::before and green #3c6b26 text.', sel: M('math-course-detail_unitRail') }, { noScroll: true });
  await S('unit-button-active', q(M('math-course-detail_unitButtonActive')), ['default', 'focus-visible'], { group: g, title: 'Unit rail item, current', sel: M('math-course-detail_unitButtonActive') }, { noScroll: true });
  await S('unit-button', q(M('math-course-detail_unitButton')).nth(1), ['default', 'hover', 'pressed'], { group: g, title: 'Unit rail item', desc: 'A 62px row: 12/16.8 "Unit n" over a 14/21 700 title.', sel: M('math-course-detail_unitButton') }, { noScroll: true });
  await S('unit-header', q(M('math-course-detail_unitHeader')).first(), ['default'], { group: g, title: 'Unit header', desc: 'A white-on-ground header card with radius 20 over the topic path.', sel: M('math-course-detail_unitHeader') }, { noScroll: true });
  await S('topic-path', q(M('math-course-detail_topicPath')).first(), ['default'], { group: g, title: 'Topic path', desc: 'Topics as round coin buttons on a winding dotted connector, the label to the right; the current topic has a halo ring.', sel: M('math-course-detail_topicPath') });
  await S('topic-node-current', q(M('math-course-detail_topicButtonInProgress')).first(), ['default', 'hover', 'focus-visible'], { group: g, title: 'Topic node, current', sel: M('math-course-detail_topicButtonInProgress') });
  await S('topic-node', q(M('math-course-detail_topicButton')).nth(1), ['default', 'hover', 'focus-visible', 'pressed'], { group: g, title: 'Topic node, not started', desc: 'A pale coin with a star and a grey label.', sel: M('math-course-detail_topicButton') });
  await S('learning-panel', q(M('math-course-detail_learningPanel')).first(), ['default'], { group: g, title: 'Start panel', desc: 'The floating card under the current topic: white, a 1px #5058651a border, radius 28, a 0 12 14 shadow tinted navy at 14%, a 17/23.8 700 topic title and a full-width dark Start button.', sel: M('math-course-detail_learningPanel') });
  await S('start-button', q(M('math-course-detail_lessonAction')).first(), B4, { group: g, title: 'Start button', desc: 'The primary button: #21252e, radius 12, 48px, white 16/24 700, with a moving light sheen drawn on ::after. Pressed scales it to 0.98.', sel: M('math-course-detail_lessonAction') });
  await page.close();
}

async function science() {
  await newPage('lesson-science', { wait: 7000 });
  await sheetsFor('lesson-science');
  const g = G.science, o = G.overlay;
  const dlg = q('dialog' + M('canvas_dialog')).first();
  await S('audio-dialog', dlg, ['default'], { group: o, title: 'Enable audio dialog', desc: 'Shown when a science lesson opens: a 400px white Astryx dialog at radius 20 with a 0 12 32 shadow at 16%, an Inter 24/32 600 title, a 14/20 grey line and two 48px buttons at radius 16.', sel: 'dialog' + M('canvas_dialog') }, { noScroll: true });
  const notNow = page.getByRole('button', { name: 'Not now' });
  const enable = page.getByRole('button', { name: 'Enable audio' });
  await S('audio-not-now', notNow, ['default', 'hover', 'focus-visible', 'pressed'], { group: o, title: 'Secondary button (Not now)', desc: 'White, 1px #d0d5dd border, radius 16, Inter 15/20 500. Pressed scales it to 0.98. Its focus ring is Astryx\'s 2px #0064e0 outline.', sel: 'button "Not now"' }, { noScroll: true });
  await S('audio-enable', enable, ['default', 'hover', 'focus-visible', 'pressed'], { group: o, title: 'Primary button (Enable audio)', desc: 'Near-black #1f232b, radius 16, white Inter 15/20 500. Measured, never pressed.', sel: 'button "Enable audio"' }, { noScroll: true });
  await notNow.click();
  await page.waitForTimeout(1500);
  const pause = page.getByRole('button', { name: 'Pause' });
  const header = q('header' + M('canvas_header'));
  await S('canvas-header', header, ['default'], { group: g, title: 'Lesson header', desc: 'Exit button and the lesson title in Playfair Display 16/21 600 at the left; the transport (previous, play or pause, next), Reset view and Settings at the right, all 32px round ghost buttons.', sel: 'header' + M('canvas_header') }, { noScroll: true });
  await S('canvas-exit', page.getByRole('button', { name: 'Exit lesson' }), B4, { group: g, title: 'Exit button', sel: 'button "Exit lesson"' }, { noScroll: true });
  await S('canvas-control', page.getByRole('button', { name: 'Reset view' }), B4, { group: g, title: 'Transport and view buttons', desc: 'A 32px round ghost button holding a 32px icon. Hover lays a 5% ink film over it, pressed 10% and a 0.98 scale; keyboard focus draws Astryx\'s 2px #0064e0 ring 3px out.', sel: 'button "Reset view"' }, { noScroll: true });
  await S('canvas-outline', q('nav' + M('canvas_outline')), ['default'], { group: g, title: 'Section rail', desc: 'The right-hand outline: right-aligned 14/20 section names beside a 2px track whose dark segment marks the current section.', sel: 'nav' + M('canvas_outline') }, { noScroll: true });
  const items = page.locator('a.astryx-outline-item');
  await S('outline-item-active', page.locator('a.astryx-outline-item.active'), ['default'], { group: g, title: 'Section rail item, current', sel: 'a.astryx-outline-item.active' }, { noScroll: true });
  await S('outline-item', items.nth(2), ['default', 'hover', 'focus-visible'], { group: g, title: 'Section rail item', sel: 'a.astryx-outline-item' }, { noScroll: true });
  await S('ask-tutor', q(M('canvas_shell')).first(), ['default', 'hover'], { group: g, title: 'Ask Tutor bar', desc: 'The compact pill docked at the bottom centre: white, 1px #e2e2e8 border, radius 9999, a two-layer soft shadow, the Gauth mascot, an "Ask Tutor" placeholder and a microphone button. It widens to 820px when opened (0.26s).', sel: M('canvas_shell') }, { noScroll: true });
  await S('ask-tutor-mic', q(M('canvas_microphone')).first(), ['default', 'hover', 'focus-visible'], { group: g, title: 'Ask Tutor microphone button', desc: 'Measured, never pressed.', sel: M('canvas_microphone') }, { noScroll: true });
  if (await pause.count()) await pause.click().catch(() => {});
  await page.waitForTimeout(800);
  await S('ask-tutor-open', q(M('canvas_shell')).first(), ['opened', 'filled'], { group: g, title: 'Ask Tutor bar, opened', desc: 'Clicking the bar widens it into a text field. Sample text was typed and deleted; no message was sent.', sel: M('canvas_shell') }, {
    noScroll: true, noReset: true,
    before: { opened: async () => { await q('[aria-label="Ask Tutor"]').first().click(); await page.waitForTimeout(1500); return 'clicked into the bar'; } },
    fieldLoc: q('[aria-label="Ask Tutor"]'), fillText: 'Why does thin air reduce drag?',
  });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/dev/null' }).catch(() => {});
  // settings popover
  await S('settings-popover', page.getByRole('dialog').filter({ hasText: 'Narration' }).first(), ['opened'], { group: g, title: 'Settings popover', desc: 'Speed, Narration and Captions switches, a Zoom stepper and Export PDF (not pressed): a white card with a 1px #f2f2f2 border, radius 24 and a 0 8 14 shadow at 9%.', sel: 'role=dialog (Settings)' }, {
    noScroll: true, noReset: true,
    open: async () => { await page.getByRole('button', { name: 'Settings' }).click(); await page.waitForTimeout(1000); },
    before: { opened: async () => 'Settings pressed (opens a menu)' },
  });
  const sw = page.getByRole('switch').first();
  await S('switch', sw, ['default', 'hover', 'focus-visible'], { group: g, title: 'Switch', desc: 'A Settings row holding the Narration toggle, off: 44px, radius 12; hover fills it #f3f3f3 and keyboard focus draws a 2px #307aff ring inside. Not toggled.', sel: 'role=switch' }, {
    noScroll: true, noReset: true,
    open: async () => { if (!(await sw.isVisible().catch(() => false))) { await page.getByRole('button', { name: 'Settings' }).click(); await page.waitForTimeout(800); } },
  });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  // the canvas body: the first chapter as it stands at the start
  await S('chapter-title', q('h2' + M('canvas_title')).first(), ['default'], { group: g, title: 'Chapter title', desc: '"Canvas Chapter", which is Libre Baskerville Bold, 24/30.', sel: 'h2' + M('canvas_title') }, { noScroll: true });
  await S('note-heading', q('h3' + M('canvas_title')).first(), ['default'], { group: g, title: 'Note heading', desc: '"Canvas Heading" (Satoshi Medium) 18/26 600; the note being read is blue #2e70ed.', sel: 'h3' + M('canvas_title') }, { noScroll: true });
  await S('note-text', q(M('canvas_text')).first(), ['default'], { group: g, title: 'Note body text', desc: '"Canvas Print" (Satoshi) 16/28 in a warm grey #45433f.', sel: M('canvas_text') }, { noScroll: true });
  await S('canvas-ground', q(M('canvas_viewport')).first(), ['default'], { group: g, title: 'Canvas ground', desc: 'A #fcfcfc board with a dot grid, panned and zoomed by drag and Ctrl/Cmd + scroll.', sel: M('canvas_viewport') }, { noScroll: true, crop: false });
  // play on and capture what the lesson draws next (figure, callout, list, quiz)
  const play = page.getByRole('button', { name: 'Play' });
  if (await play.count()) await play.click().catch(() => {});
  const inView = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.top > 60 && r.bottom < innerHeight - 20; }, sel);
  for (let i = 0; i < 60 && !(await inView('ol' + M('canvas_list'))); i++) await page.waitForTimeout(1500);
  const pauseNow = page.getByRole('button', { name: 'Pause' });
  if (await pauseNow.count()) await pauseNow.click().catch(() => {});
  await page.waitForTimeout(1500);
  const body = { group: g };
  await S('figure-card', q('figure' + M('canvas_image')).last(), ['default'], { ...body, title: 'Figure card', desc: 'An animated diagram in a white radius-20 frame.', sel: 'figure' + M('canvas_image') }, { noScroll: true, noReset: true });
  await S('callout', q('blockquote' + M('canvas_callout')).last(), ['default'], { ...body, title: 'Takeaway callout', desc: 'A #e8fbef radius-14 box with a bulb icon for the one-line takeaway.', sel: 'blockquote' + M('canvas_callout') }, { noScroll: true, noReset: true });
  await S('numbered-list', q('ol' + M('canvas_list')).last(), ['default'], { ...body, title: 'Numbered list', desc: 'Points with a small number in a pale blue disc and 16/24 text.', sel: 'ol' + M('canvas_list') }, { noScroll: true, noReset: true });
  const play2 = page.getByRole('button', { name: 'Play' });
  if (await play2.count()) await play2.click().catch(() => {});
  let quiz = false;
  for (let i = 0; i < 110 && !quiz; i++) {
    await page.waitForTimeout(2000);
    quiz = await page.locator('[aria-label="Close quiz and continue"]').count() > 0;
  }
  log('  quiz shown:', quiz);
  const kinds = await page.evaluate(() => {
    const mark = (el, n) => { if (el) el.setAttribute('data-m', n); return !!el; };
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top > 40 && r.bottom < innerHeight - 10; };
    const all = [...document.querySelectorAll('[class*="canvas_"]')].filter(vis);
    const quizCard = document.querySelector('[aria-label="Close quiz and continue"]')?.closest('[class*="canvas_"]:not(button)');
    let q2 = quizCard; while (q2 && q2.getBoundingClientRect().height < 200) q2 = q2.parentElement;
    const ok = mark(q2, 'quiz');
    document.querySelectorAll('[data-m="quiz"] input').forEach((inp, i) => { let n = inp.parentElement; while (n && n.getBoundingClientRect().height < 30) n = n.parentElement; if (n) n.setAttribute('data-m', 'opt' + i); });
    return { all: all.length, quiz: ok };
  });
  log('  marked', JSON.stringify(kinds));
  if (kinds.quiz) {
    await S('quiz-card', q('[data-m="quiz"]'), ['default'], { group: g, title: 'Quiz card', desc: 'A check-in question docked over the canvas: white, 1px #e3e3e3 border, radius 20, a 0 6 24 shadow at 7%, an Inter 16/24 600 question, four outlined options and a small close button. No option was chosen.', sel: 'canvas quiz' }, { noScroll: true });
    await S('quiz-option', q('[data-m="opt0"]'), ['default', 'hover', 'focus-visible'], { group: g, title: 'Quiz option', desc: 'A 44px option, 1px #e6e6e7 border, radius 10, SF Pro 14/20, over a visually hidden radio. Hover fills it #f3f3f3; keyboard focus draws Astryx\'s 2px #0064e0 ring 3px out. Hovered and focused only.', sel: 'canvas quiz option' }, { noScroll: true, focusLoc: q('[data-m="quiz"] input').first() });
  }
  await page.close();
}

async function math() {
  await newPage('lesson-math', { wait: 8000 });
  await sheetsFor('lesson-math');
  const g = G.math;
  const gate = page.getByRole('button', { name: 'Continue', exact: true });
  if (await gate.count()) {
    await S('audio-gate', gate.locator('xpath=..'), ['default'], { group: G.overlay, title: 'Audio gate', desc: 'The math player asks for a tap instead of a dialog: a line of text and a dark Continue button over the blurred slide.', sel: 'button "Continue" parent' }, { noScroll: true });
    await S('continue-button', gate, ['default', 'hover', 'focus-visible', 'pressed'], { group: G.overlay, title: 'Continue button', sel: 'button "Continue"' }, { noScroll: true });
    await gate.click();
    await page.waitForTimeout(4000);
  }
  await S('math-lesson-page', q(M('shared_lessonPage')).first(), ['default'], { group: g, title: 'Math lesson page', desc: 'Two columns on #faf9f5: a 360px tutor column at the left and the slide in a white radius-32 frame at the right, under a 66px header with the progress bar.', sel: M('shared_lessonPage') }, { noScroll: true, crop: false });
  await S('tutor-panel', q('aside' + M('shared_tutorPanel')).first(), ['default'], { group: g, title: 'Tutor column', desc: 'The mascot, a status line ("Explaining ...") with a shimmer, the running transcript and the "Ask gauth" field at the foot.', sel: 'aside' + M('shared_tutorPanel') }, { noScroll: true });
  await page.waitForSelector(M('shared_status'), { state: 'visible', timeout: 20000 }).catch(() => {});
  await S('tutor-status', q(M('shared_status')).first(), ['default'], { group: g, title: 'Tutor status line', sel: M('shared_status') }, { noScroll: true });
  const bar = q(M('tutor_inputBar')).first();
  await S('tutor-input', bar, ['default', 'hover', 'focused', 'filled'], { group: g, title: 'Ask gauth field', desc: 'White, 1px #e4e6eb border, radius 16, 48px, Inter 16, a microphone at the right; it grows with the text. Sample text was typed and deleted; nothing was sent.', sel: M('tutor_inputBar') }, { noScroll: true, fieldLoc: bar.locator('textarea'), fillText: 'Why is the empty set a subset?' });
  await S('progress-bar', q(M('shared_progressGroup')).first(), ['default'], { group: g, title: 'Lesson progress', desc: 'Previous and next page arrows around an 8px track (#edeade fill, #27220c value) and one 20px dot per later chapter.', sel: M('shared_progressGroup') }, { noScroll: true });
  await S('page-nav', page.getByRole('button', { name: 'Next lesson page' }), B4, { group: g, title: 'Page arrow button', sel: 'button "Next lesson page"' }, { noScroll: true });
  const pauseBtn = page.getByRole('button', { name: /Pause lesson|Play lesson/ });
  await S('header-round-button', pauseBtn, B4, { group: g, title: 'Header round button', desc: 'Pause, speed ("1x") and chapters: 40px round ghost buttons.', sel: 'button "Pause lesson"' }, { noScroll: true });
  await S('speed-button', page.getByRole('button', { name: /Playback speed/ }), ['default', 'hover'], { group: g, title: 'Speed button', sel: 'button "Playback speed"' }, { noScroll: true });
  await S('player-frame', q(M('shared_playerFrame')).first(), ['default'], { group: g, title: 'Slide frame', desc: 'The white radius-32 frame the slide plays in, title in Playfair Display.', sel: M('shared_playerFrame') }, { noScroll: true });
  await S('chapters-panel', q('aside' + M('pgc_panel')), ['opened'], { group: g, title: 'Chapters panel', desc: 'Opened from the list button at the top right: a white panel of chapter rows, the current one tinted.', sel: 'aside' + M('pgc_panel') }, {
    noScroll: true, noReset: true,
    open: async () => { await page.getByRole('button', { name: 'Open lesson chapters' }).click(); await page.waitForTimeout(1200); },
    before: { opened: async () => 'Open lesson chapters pressed (opens a panel)' },
  });
  await S('chapter-option-active', q(M('pgc_activeOption')), ['default'], { group: g, title: 'Chapter row, current', sel: M('pgc_activeOption') }, { noScroll: true, noReset: true });
  await S('chapter-option', q(M('pgc_chapterOption')).nth(1), ['default', 'hover', 'focus-visible'], { group: g, title: 'Chapter row', desc: 'A 37px row. Hovered and focused only.', sel: M('pgc_chapterOption') }, { noScroll: true, noReset: true });
  await page.getByRole('button', { name: /Close lesson chapters|Open lesson chapters/ }).first().click().catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  // let the tutor talk for a while, so the transcript has text
  await page.waitForTimeout(25000);
  await S('tutor-transcript', q(M('shared_tutorTranscript')).first(), ['default'], { group: g, title: 'Tutor transcript', desc: 'The column under the mascot. While the tutor narrates it holds the status line with a shimmer; no transcript text appeared in 25 seconds of playback.', sel: M('shared_tutorTranscript') }, { noScroll: true });
  await page.close();
}

async function history() {
  await newPage('lesson-history', { wait: 8000 });
  const g = G.history;
  await S('history-lesson-page', q(M('lesson_lessonPage')).first(), ['default'], { group: g, title: 'History lesson page', desc: 'An immersive player on #faf9f5: chapter pills centred in the header, the scene in the middle, a round play button and a caption line at the foot.', sel: M('lesson_lessonPage') }, { noScroll: true, crop: false });
  await S('chapter-pills', q(M('lesson_chapterPills')), ['default'], { group: g, title: 'Chapter pills', desc: 'The current chapter as a grey pill with an icon and its name; later chapters as numbered pills joined by dashed lines; a chapters list button at the end.', sel: M('lesson_chapterPills') }, { noScroll: true });
  await S('chapter-pill-active', q(M('lesson_chapterPillActive')), ['default'], { group: g, title: 'Chapter pill, current', sel: M('lesson_chapterPillActive') }, { noScroll: true });
  await S('chapter-pill', q(M('lesson_chapterPillUpcoming')).first(), ['default', 'hover', 'focus-visible'], { group: g, title: 'Chapter pill, upcoming', desc: 'An upcoming chapter: a 32px pill at 4% ink with its number at 25% ink; hover doubles both.', sel: M('lesson_chapterPillUpcoming') }, { noScroll: true });
  await S('play-button', q(M('lesson_mediaControlButton')).first(), ['default', 'hover', 'focus-visible'], { group: g, title: 'Play button', desc: 'A 60px disc, white at 82%, with a 0 8 28 navy shadow and a black play glyph. Not pressed.', sel: M('lesson_mediaControlButton') }, { noScroll: true });
  await S('chapter-panel', q('aside' + M('lesson_chapterPanel')), ['opened'], { group: g, title: 'Chapter panel', desc: 'A 400px white panel from the right edge, radius 28 on the leading corners, a -8 0 40 shadow: each chapter with a number, a 600 name and a two-line description; the current chapter is pink #fff0f3 with red text.', sel: 'aside' + M('lesson_chapterPanel') }, {
    noScroll: true, noReset: true,
    open: async () => { await q(M('lesson_chapterMenuButton')).first().click(); await page.waitForTimeout(1200); },
    before: { opened: async () => 'chapters button pressed (opens a panel)' },
  });
  await S('chapter-panel-item', q(M('lesson_chapterPanelItem')).nth(1), ['default', 'hover', 'focus-visible'], { group: g, title: 'Chapter panel row', sel: M('lesson_chapterPanelItem') }, { noScroll: true, noReset: true });
  await q(M('lesson_panelClose')).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const cap = await page.evaluate(() => { const e = [...document.querySelectorAll('body *')].find((n) => n.children.length === 0 && /\w/.test(n.textContent || '') && n.getBoundingClientRect().top > innerHeight - 100 && n.getBoundingClientRect().left > 300); if (e) e.setAttribute('data-m', 'caption'); return !!e; });
  if (cap) await S('caption', q('[data-m="caption"]'), ['default'], { group: g, title: 'Caption line', desc: 'The narration as one centred grey line under the scene.', sel: 'caption' }, { noScroll: true });
  await page.close();
}

async function atlas() {
  await newPage('atlas');
  await sheetsFor('atlas');
  const g = G.atlas;
  await S('atlas-header', q('header' + M('header_header')).first(), ['default'], { group: g, title: 'Atlas top bar', desc: 'Atlas has its own 56px shell: logo and a menu button at the left, Sign in at the right.', sel: 'header' + M('header_header') }, { noScroll: true });
  await S('atlas-drawer', q(M('header_drawer')).first(), ['default'], { group: g, title: 'Atlas sidebar', desc: 'A 230px white drawer: New Topic, a search field and the topic list (empty when signed out).', sel: M('header_drawer') }, { noScroll: true });
  await S('new-topic', q(M('header_addBtn')).first(), B4, { group: g, title: 'New Topic button', desc: 'A 44px row, radius 12, plus icon and Rubik 12px label.', sel: M('header_addBtn') }, { noScroll: true });
  await S('atlas-search', q(M('header_searchBox')).first(), ['default', 'hover', 'focused', 'filled'], { group: g, title: 'Topic search field', sel: M('header_searchBox') }, { noScroll: true, fieldLoc: q(M('header_searchInput')), fillText: 'Moon' });
  await S('atlas-title', q(M('atlas-landing_start-project-title')), ['default'], { group: g, title: 'Atlas title', desc: '"Turn any topic into a visual story" in Libre Baskerville 40/48 700, the first letter filled with a red gradient.', sel: M('atlas-landing_start-project-title') }, { noScroll: true });
  await S('atlas-composer', q(M('atlas-landing_composer')).first(), ['default', 'hover', 'focused', 'filled'], { group: g, title: 'Atlas prompt box', desc: 'A 920 x 148 white box, 1px #e4e6eb border, radius 20, a peach glow (0 6 20 rgba(255,215,199,.4)) that deepens on focus, a Search toggle pill and a round send button. Sample text was typed and deleted; nothing was sent.', sel: M('atlas-landing_composer') }, { noScroll: true, fieldLoc: q(M('atlas-landing_input-container') + ' textarea'), fillText: 'The water cycle' });
  await S('search-toggle', q(M('atlas-landing_search-toggle')).first(), ['default', 'hover', 'focus-visible'], { group: g, title: 'Search toggle pill', desc: 'The web-search switch, on: a near-black #171410 pill, radius 20, with a 0 5 12 shadow; hover lightens it to #2a2d34. Not toggled.', sel: M('atlas-landing_search-toggle') }, { noScroll: true });
  await S('send-button', q(M('atlas-landing_send-button')).first(), ['default', 'hover'], { group: g, title: 'Send button', desc: 'Grey #eef0f3 disc while the box is empty. Never pressed.', sel: M('atlas-landing_send-button') }, { noScroll: true });
  await S('recommendation-chip', q(M('atlas-landing_recommendation-chip')).first(), ['default', 'hover', 'focus-visible', 'pressed'], { group: g, title: 'Recommendation chip', desc: 'A white chip, 1px #dcdcdc border, radius 10, SF Pro 13/19.5 black; hover lifts it 1px onto #f5f5f7 with a soft shadow. Pressing one would start a story, so it was only hovered, focused and forced.', sel: M('atlas-landing_recommendation-chip') }, { noScroll: true });
  await S('stories-title', q(M('user-cases_title')).first(), ['default'], { group: g, title: 'Popular Stories heading', sel: M('user-cases_title') });
  const card = q(M('user-cases_card')).filter({ has: q(M('user-cases_videoBadge')) }).first();
  await S('story-card', card, ['default', 'hover', 'focus-visible', 'pressed'], { group: g, title: 'Story card', desc: 'A 339px white card, 1px rgba(0,0,0,.08) border, radius 16, a 0 6 18 shadow at 4%: a radius-12 thumbnail (video or image) and a 16/24 600 title. Hover lifts it 4px with a 0 18 42 shadow at 10%.', sel: M('user-cases_card') });
  await S('video-badge', q(M('user-cases_videoBadge')).first(), ['default'], { group: g, title: 'Video badge', desc: 'A dark translucent radius-8 label over the thumbnail.', sel: M('user-cases_videoBadge') });
  await S('new-badge', q(M('user-cases_newBadge')).first(), ['default'], { group: g, title: 'New badge', desc: 'A red #ff013e radius-8 label.', sel: M('user-cases_newBadge') });
  await S('play-icon', q(M('user-cases_playIcon')).first(), ['default'], { group: g, title: 'Play disc', desc: 'A 48px white-alpha disc over a video thumbnail.', sel: M('user-cases_playIcon') });
  // the preview dialog a card opens
  const apollo = q(M('user-cases_card')).filter({ hasText: 'Apollo 11' }).first();
  await centre(apollo);
  await apollo.click();
  await page.waitForTimeout(3000);
  await S('story-preview', q(M('user-cases_exploreButton')).locator('xpath=..'), ['default'], { group: G.overlay, title: 'Story preview', desc: 'A story card opens a video preview over a dark scrim, with a white Explore pill under it.', sel: M('user-cases_exploreButton') + ' parent' }, { noScroll: true });
  await S('explore-button', q(M('user-cases_exploreButton')), ['default', 'hover', 'focus-visible'], { group: G.overlay, title: 'Explore button', sel: M('user-cases_exploreButton') }, { noScroll: true });
  await page.close();
}

async function story() {
  await newPage('story');
  await openStory(page);
  out._meta.storyUrl = page.url().replace(/\/session\/\d+/, '/session/<id>');
  const g = G.atlas;
  await S('story-stage', q(M('atlas_visualFrame')).first(), ['default'], { group: g, title: 'Story canvas', desc: 'The story image in a radius-20 frame, hotspot rings over places in it, a "Content generated by AI" note under it.', sel: M('atlas_visualFrame') }, { noScroll: true });
  await S('share-button', q(M('atlas-share-button_button')).first(), ['default', 'hover', 'focus-visible', 'pressed'], { group: g, title: 'Share button', desc: 'The dark #21252e radius-8 button, Rubik 12/20 600. It shows no hover, focus or pressed change. Measured, never pressed.', sel: M('atlas-share-button_button') }, { noScroll: true });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter((e) => /Generate Video/.test(e.innerText || '') && e.getBoundingClientRect().top < 40 && e.getBoundingClientRect().width > 0)[0]; if (b) b.setAttribute('data-m', 'gen'); });
  const gen = q('[data-m="gen"]');
  await S('generate-video-button', gen, ['default', 'hover', 'focus-visible'], { group: g, title: 'Generate Video button', desc: 'A white button, 1px #dfe3ea border, radius 8, Rubik 12/20 600, a red guide dot; hover greys it to #f9fafb. Never pressed.', sel: 'button "Generate Video"' }, { noScroll: true });
  const pop = q(M('video_header')).locator('xpath=..');
  await S('video-settings', pop, ['opened'], { group: g, title: 'Video Settings popover', desc: 'Source image tiles, a language select and a dark Generate Video button with an estimate line, in a white radius-16 popover with a 0 10 40 shadow that springs in (cubic-bezier(0.34, 1.56, 0.64, 1)). Nothing in it was pressed.', sel: M('video_header') + ' parent' }, {
    noScroll: true, noReset: true,
    open: async () => { await gen.hover(); await page.waitForTimeout(1500); },
    before: { opened: async () => 'hovered Generate Video' },
  });
  await reset();
  const rail = await page.evaluate(() => { const v = [...document.querySelectorAll('button, [role=tab]')].find((e) => (e.innerText || '').trim() === 'View'); if (!v) return false; let n = v.parentElement; while (n && n.getBoundingClientRect().height < 100) n = n.parentElement; n.setAttribute('data-m', 'rail'); v.setAttribute('data-m', 'view'); const d = [...document.querySelectorAll('button, [role=tab]')].find((e) => (e.innerText || '').trim() === 'Details'); if (d) d.setAttribute('data-m', 'details'); return true; });
  if (rail) {
    await S('view-rail', q('[data-m="rail"]'), ['default'], { group: g, title: 'View and Details rail', desc: 'A floating white radius-16 rail at the right edge of the canvas, 1px #eeeeee border, with View (current, a 3px black bar) and Details.', sel: 'View / Details rail' }, { noScroll: true });
    await S('rail-item', q('[data-m="details"]'), ['default', 'hover', 'focus-visible'], { group: g, title: 'Rail item', sel: 'button "Details"' }, { noScroll: true });
  }
  const strip = await page.evaluate(() => { const t = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && (e.textContent || '').trim() === 'Apollo 11 Moon Mission Journey' && e.getBoundingClientRect().top > 600); if (!t) return false; let n = t; while (n && n.getBoundingClientRect().height < 50) n = n.parentElement; n.setAttribute('data-m', 'strip-item'); return true; });
  if (strip) await S('story-strip-item', q('[data-m="strip-item"]'), ['default', 'hover'], { group: g, title: 'Story strip item', desc: 'The current story under the canvas: thumbnail and a 600 title on a #f5f6f9 radius-12 tile.', sel: 'story strip' }, { noScroll: true });
  await page.close();
}

async function news() {
  await newPage('news');
  const g = G.news;
  await S('header-question', q(M('pc-header_input')).first(), ['default', 'hover', 'focused', 'filled'], { group: G.shell, title: 'Top bar question field', desc: 'On inner pages the question field moves into the top bar: 640 x 40, white at 84%, a 1px #e4e6eb border, radius 30, image and send buttons. Sample text was typed and deleted.', sel: M('pc-header_input') }, { noScroll: true, fieldLoc: q(M('pc-header_input') + ' input, ' + M('pc-header_input') + ' textarea'), fillText: 'Solve 2x + 3 = 7' });
  await S('breadcrumb', q(M('content-list_breadcrumb')).first(), ['default'], { group: g, title: 'Breadcrumb', sel: M('content-list_breadcrumb') }, { noScroll: true });
  await S('pill-tab-active', q(M('media-center_tab-active')).first(), ['default', 'focus-visible'], { group: g, title: 'Pill tab, current', desc: 'News: pink #fff0f3 fill, 1px #ffe5ec border, red #f00039 label, radius 100. Keyboard focus draws a 2px red ring 2px out.', sel: M('media-center_tab-active') }, { noScroll: true });
  await S('pill-tab', q(M('media-center_tab')).filter({ hasText: 'Blog' }).first(), B4, { group: g, title: 'Pill tab', desc: 'White, 1px #e4e6eb border, radius 100, 14/21 500; pressed fills it #f5f5f7.', sel: M('media-center_tab') }, { noScroll: true });
  await S('featured-article', q(M('media-center_featured-card')).first(), ['default', 'hover', 'focus-visible'], { group: g, title: 'Featured article', desc: 'A 26/36 700 title and a 16/24 description beside a 333 x 200 radius-12 image.', sel: M('media-center_featured-card') }, { noScroll: true });
  await S('article-row', q(M('media-center_list-item')).first(), ['default', 'hover'], { group: g, title: 'Article row', desc: 'A 171 x 96 radius-8 image beside an 18px title and a two-line grey summary, rows split by a 1px rule.', sel: M('media-center_list-item') });
  await page.close();
}

async function mobile() {
  const g = G.mobile;
  await newPage('home', { mobile: true, promo: 'keep' });
  await S('m-promo-dialog', q(M('atlas-intro-modal_aw-atlas-intro-modal')), ['default'], { group: g, title: 'Promo dialog (mobile)', sel: M('atlas-intro-modal_aw-atlas-intro-modal') }, { noScroll: true });
  await closePromo(page);
  const top = await page.evaluate(() => { const h = [...document.querySelectorAll('header, [class*="header" i]')].find((e) => { const r = e.getBoundingClientRect(); return r.top <= 1 && r.width >= 380 && r.height >= 40 && r.height <= 80; }); if (h) h.setAttribute('data-m', 'm-header'); return h ? h.className.toString().replace(/__[\w-]{5,6}/g, '') : null; });
  if (top) await S('m-header', q('[data-m="m-header"]'), ['default'], { group: g, title: 'Mobile top bar', desc: 'Logo and a menu button; the sidebar becomes a drawer.', sel: top }, { noScroll: true });
  const menu = await page.evaluate(() => { const b = [...document.querySelectorAll('button, [role=button], div, span')].find((e) => { const r = e.getBoundingClientRect(); return r.top < 50 && r.left > 320 && r.width >= 20 && r.width <= 48 && e.querySelector('svg, img'); }); if (b) b.setAttribute('data-m', 'm-menu'); return !!b; });
  if (menu) {
    await S('m-menu-button', q('[data-m="m-menu"]'), ['default'], { group: g, title: 'Mobile menu button', sel: 'top bar menu button' }, { noScroll: true });
  }
  await S('m-question-box', q(M('m_search-input-container')).or(q(M('pc_search-input-container'))).or(q('textarea, input[type=text]').first()).first(), ['default'], { group: g, title: 'Mobile question field', sel: 'question field' });
  const banner = await page.evaluate(() => { const o = [...document.querySelectorAll('a, button, div')].find((e) => (e.innerText || '').trim() === 'Open' && e.getBoundingClientRect().top > 700); if (!o) return false; let n = o; while (n && n.getBoundingClientRect().width < 380) n = n.parentElement; n.setAttribute('data-m', 'm-banner'); return true; });
  if (banner) await S('m-app-banner', q('[data-m="m-banner"]'), ['default'], { group: g, title: 'App banner (mobile)', desc: 'A bottom banner with the app icon, rating and an Open pill. Open was not pressed.', sel: 'bottom app banner' }, { noScroll: true });
  await page.close();
  await newPage('math', { mobile: true });
  await S('m-unit-card', q(M('catalog_card')).first(), ['default'], { group: g, title: 'Unit card (mobile)', desc: 'On a phone the unit card is a 112px row card at radius 20 with a 4px track.', sel: M('catalog_card') });
  await S('m-category-tab', q(M('catalog_categoryTab')).first(), ['default'], { group: g, title: 'Category tab (mobile)', sel: M('catalog_categoryTab') }, { noScroll: true });
  await S('m-create-button', q(M('catalog_createButton')).first(), ['default'], { group: g, title: 'Create button (mobile)', desc: 'On a phone Create Course shrinks to "+ Create" on a #f4f2e6 pill.', sel: M('catalog_createButton') }, { noScroll: true });
  await page.close();
}

const PAGES = { promo, home, academy, create: createDialog, unit, science, math, history, atlas, story, news, mobile };
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PAGES);
const done = new Set(); // pages whose capture ran to the end
for (const k of want) {
  const isMobile = k === 'mobile';
  const l = await launch({ mobile: isMobile });
  context = l.context;
  run = k;
  try { await PAGES[k](); done.add(k); } catch (e) { log('PAGE FAILED', k, String(e.message).split('\n')[0]); }
  out._meta.read = new Date().toLocaleDateString('en-CA'); // the local date of the capture
  save();
  await l.browser.close();
}
// a component a page no longer produces is dropped, so a re-run cannot leave stale entries; a page that
// failed partway keeps its earlier entries, since what it did not reach is not known to be gone
for (const [key, c] of Object.entries(out.components)) if (done.has(c.run) && !touched.has(key)) { delete out.components[key]; log('dropped stale', key); }
save();
log('done ->', OUT);
