const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.default ?? pw;
const OUT = new URL('../../screenshots/', import.meta.url).pathname;
const pages = [['landing','/'],['login','/login/'],['signup','/signup/'],['courses-public','/courses/'],['course-public','/courses/linear-expressions-and-equations/'],['pricing','/subscribe/'],['notfound','/this-page-does-not-exist-xyz/']];
(async () => {
  const b = await chromium.launch();
  const report = {};
  for (const [vw, vh, tag, dpr] of [[1440,900,'',2],[390,844,'mobile-',3]]) {
    for (const scheme of ['light','dark']) {
      const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, colorScheme: scheme, isMobile: vw<500, hasTouch: vw<500 });
      const p = await ctx.newPage();
      for (const [name, path] of pages) {
        try {
          const r = await p.goto('https://brilliant.org' + path, { waitUntil: 'networkidle', timeout: 45000 });
          await p.waitForTimeout(1500);
          await p.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
          const info = await p.evaluate(() => ({ url: location.pathname, theme: document.documentElement.dataset.theme || '(none)', bg: getComputedStyle(document.body).backgroundColor, title: document.title }));
          report[`${tag}${name}-${scheme}`] = { status: r && r.status(), ...info };
          await p.screenshot({ path: `${OUT}${tag}${name}-${scheme}-default.png` });
        } catch (e) { report[`${tag}${name}-${scheme}`] = 'ERR ' + e.message.slice(0,100); }
      }
      await ctx.close();
    }
  }
  console.log(JSON.stringify(report, null, 1));
  await b.close();
})();
