// Discovery pass: for each page, lists every cds-* class used in the DOM (with
// a sample element), every cds-* class named in a stylesheet selector, and the
// fixed/sticky elements (banners, chat panels) that need removing.
// Writes JSON to $OUT (default: the scratch dir given as argv[2]).
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib.mjs';

const OUT = process.argv[2] || '.';
const PAGES = {
  search: 'https://www.coursera.org/search?query=machine%20learning',
  course: 'https://www.coursera.org/learn/machine-learning',
  spec: 'https://www.coursera.org/specializations/machine-learning-introduction',
  home: 'https://www.coursera.org/',
};

const { browser, context } = await launch();
const page = await context.newPage();
for (const [key, url] of Object.entries(PAGES)) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(7000);
  const info = await page.evaluate(() => {
    const cssPath = (el) => {
      const parts = [];
      for (let n = el; n && n.nodeType === 1 && parts.length < 6; n = n.parentElement) {
        let s = n.tagName.toLowerCase();
        if (n.id) s += '#' + n.id;
        const cls = [...n.classList].filter((c) => !/^css-/.test(c)).slice(0, 3);
        if (cls.length) s += '.' + cls.join('.');
        const tid = n.getAttribute('data-testid') || n.getAttribute('data-e2e');
        if (tid) s += `[data-testid=${tid}]`;
        parts.unshift(s);
      }
      return parts.join(' > ');
    };
    const dom = {};
    for (const el of document.querySelectorAll('[class*="cds-"]')) {
      for (const c of el.classList) {
        if (!c.startsWith('cds-')) continue;
        const d = (dom[c] ||= { n: 0, sample: cssPath(el), text: (el.innerText || '').trim().slice(0, 60) });
        d.n++;
      }
    }
    const sheet = new Set();
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
        const s = r.selectorText || '';
        for (const m of s.matchAll(/\.(cds-[A-Za-z0-9_-]+)/g)) sheet.add(m[1]);
      }
    };
    for (const ss of document.styleSheets) { try { walk(ss.cssRules); } catch {} }
    const fixed = [];
    for (const el of document.querySelectorAll('body *')) {
      const p = getComputedStyle(el).position;
      if (p === 'fixed' || p === 'sticky') {
        const r = el.getBoundingClientRect();
        if (r.width * r.height > 100) fixed.push({ p, path: cssPath(el), rect: [r.x, r.y, r.width, r.height].map(Math.round), text: (el.innerText || '').trim().slice(0, 80) });
      }
    }
    const testids = {};
    for (const el of document.querySelectorAll('[data-testid],[data-e2e]')) {
      const t = el.getAttribute('data-testid') || el.getAttribute('data-e2e');
      testids[t] = (testids[t] || 0) + 1;
    }
    return { title: document.title, dom, sheet: [...sheet].sort(), fixed, testids, h: document.documentElement.scrollHeight };
  });
  fs.writeFileSync(path.join(OUT, `explore-${key}.json`), JSON.stringify(info, null, 1));
  await page.screenshot({ path: path.join(OUT, `explore-${key}.png`) });
  console.log(key, info.title, 'dom cds classes', Object.keys(info.dom).length, 'sheet', info.sheet.length, 'fixed', info.fixed.length, 'h', info.h);
}
await browser.close();
