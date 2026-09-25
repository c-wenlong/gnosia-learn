const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.setContent(html, { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(1500);
    await p.screenshot({ path: process.argv[3] + '-' + scheme + '.png', fullPage: true });
    const info = await p.evaluate(() => {
      const empty = [];
      for (const e of document.querySelectorAll('[style*="var(--"]')) {
        const st = e.getAttribute('style');
        for (const m of st.matchAll(/var\((--[\w-]+)\)/g)) if (!getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim()) empty.push(m[1]);
      }
      const used = new Set(); for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) for (const m of r.cssText.matchAll(/var\((--[\w-]+)/g)) used.add(m[1]); } catch (e) {} }
      const missing = [...used].filter(v => !getComputedStyle(document.documentElement).getPropertyValue(v).trim() && !['--face', '--fg', '--lip', '--lift', '--x'].includes(v));
      return { emptyInline: [...new Set(empty)].slice(0, 20), missingInCss: missing.slice(0, 40), h: document.body.scrollHeight };
    });
    out.push({ scheme, errs, ...info }); await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
