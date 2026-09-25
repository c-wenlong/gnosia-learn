// Pasted into the page (DevTools console or a CDP Runtime.evaluate) after
// defining NAME, e.g. `const NAME = 'learn-dark-default';`. It records the
// computed styles of every visible element and POSTs them to sink.py on
// 127.0.0.1:8765, which writes dumps/<NAME>.json. The last expression is the
// value the console prints.
/* global NAME */
const P='display position top left right bottom padding-top padding-right padding-bottom padding-left margin-top margin-right margin-bottom margin-left gap row-gap column-gap background-color background-image color border-top-width border-right-width border-bottom-width border-left-width border-top-color border-right-color border-bottom-color border-left-color border-top-style border-bottom-style border-top-left-radius border-top-right-radius border-bottom-right-radius border-bottom-left-radius box-shadow opacity filter backdrop-filter font-family font-size font-weight line-height letter-spacing text-transform font-feature-settings text-align transition animation-name animation-duration transform z-index cursor max-width min-width min-height overflow outline-width outline-color outline-offset fill stroke stroke-width'.split(' ');
const D={};{const x=document.createElement('div');document.body.appendChild(x);const c=getComputedStyle(x);for(const p of P)D[p]=c.getPropertyValue(p);x.remove()}
const keep=(c,base)=>{const o={};for(const p of P){const v=c.getPropertyValue(p);if(v!==base[p]&&v!=='')o[p]=v.length>300?v.slice(0,300):v}return o};
const out=[];let i=0;
for(const el of document.querySelectorAll('body *')){
 if(['SCRIPT','STYLE','NOSCRIPT','LINK','META'].includes(el.tagName)||el.id==='__cx')continue;
 const r=el.getBoundingClientRect();if(r.width<1||r.height<1)continue;
 const c=getComputedStyle(el);if(c.visibility==='hidden')continue;
 const n={i:i++,t:el.tagName.toLowerCase(),cl:(el.getAttribute('class')||'').slice(0,120),r:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],s:keep(c,D)};
 const dt=el.getAttribute('data-test');if(dt)n.dt=dt;
 for(const a of ['role','aria-label','aria-disabled','aria-pressed','aria-checked','aria-selected','disabled','type','href','src'])if(el.hasAttribute(a))n[a]=(el.getAttribute(a)||'').slice(0,160);
 const tx=[...el.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent.trim()).join(' ').trim();if(tx)n.tx=tx.slice(0,80);
 for(const ps of ['::before','::after']){const pc=getComputedStyle(el,ps);if(pc.content&&pc.content!=='none'&&pc.content!=='normal'){n[ps]=keep(pc,D);n[ps].content=pc.content.slice(0,40)}}
 if(el.parentElement)n.p=el.parentElement.__i;el.__i=n.i;
 out.push(n)}
const meta={url:location.pathname,theme:document.documentElement.dataset.duoTheme,w:innerWidth,h:innerHeight,sy:scrollY,docH:document.documentElement.scrollHeight,ts:Date.now()};
const res=await fetch('http://127.0.0.1:8765/'+NAME,{method:'POST',body:JSON.stringify({meta,nodes:out})});
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
(await res.text())+' nodes='+out.length
