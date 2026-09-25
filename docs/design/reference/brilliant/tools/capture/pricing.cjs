const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const OUT = process.env.SP + '/wt/docs/design/reference/brilliant/screenshots/';
(async () => {
  const b = await chromium.launch(); const out = {};
  for (const scheme of ['light','dark']) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto('https://brilliant.org/subscribe/', { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(4000);
    await p.addStyleTag({ content: '#onetrust-consent-sdk{display:none!important}' });
    await p.screenshot({ path: `${OUT}pricing-${scheme}-fullpage.png`, fullPage: true });
    out[scheme] = await p.evaluate(() => {
      const cs = (e) => { if(!e) return null; const s=getComputedStyle(e), r=e.getBoundingClientRect(); const o={tag:e.tagName.toLowerCase(), cls:(e.className?.toString()||'').slice(0,400), data:Object.entries(e.dataset||{}).map(([k,v])=>k+':'+v).join(','), box:[r.x,r.y,r.width,r.height].map(n=>Math.round(n)).join(',')}; for (const p of ['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','background-image','border','border-radius','box-shadow','padding','gap','transition','transform','opacity']) { const v=s.getPropertyValue(p); if(v && !['none','normal','0px','rgba(0, 0, 0, 0)','all 0s ease 0s','1'].includes(v) && !(p==='border'&&v.startsWith('0px'))) o[p]=v.slice(0,300);} for (const ps of ['::before','::after']) { const q=getComputedStyle(e,ps); if(q.content!=='none') o[ps]=[q.backgroundImage.slice(0,250),q.backgroundColor,q.border,q.borderRadius,q.inset,q.boxShadow,q.height].join(' | '); } return o; };
      const tabs=[...document.querySelectorAll('[role=tab]')]; const tablist=document.querySelector('[role=tablist]');
      const ind=[...document.querySelectorAll('[data-slot*=indicator],[class*=indicator]')].slice(0,3);
      const plans=[...document.querySelectorAll('[data-slot=box][data-checked],[data-slot=box][data-unchecked]')];
      const planKids = plans.slice(0,2).map(pl => [cs(pl), ...[...pl.querySelectorAll('*')].slice(0,8).map(cs)]);
      const vt=[...document.querySelectorAll('button[data-orientation=vertical]')].slice(0,2).map(b=>[cs(b), cs(b.parentElement)]);
      const h2s=[...document.querySelectorAll('h2,h3')].map(h=>[h.textContent.trim().slice(0,50), cs(h)]);
      const acc=[...document.querySelectorAll('[data-slot*=accordion],details,summary,[aria-expanded]')].slice(0,6).map(cs);
      const foot=document.querySelector('footer'); 
      return { tabs: tabs.map(cs), tablist: cs(tablist), ind: ind.map(cs), planKids, vt, h2s, acc, footer: cs(foot), footerLinks: foot ? [...foot.querySelectorAll('a')].slice(0,3).map(cs) : null, slots: [...new Set([...document.querySelectorAll('[data-slot]')].map(e=>e.dataset.slot))] };
    });
    await ctx.close();
  }
  fs.writeFileSync(process.env.SP + '/cap/pricing-measure.json', JSON.stringify(out, null, 1));
  console.log('ok');
  await b.close();
})();
