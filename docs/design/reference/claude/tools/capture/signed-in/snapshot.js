// Paste into the console of a signed-in page, then call window.__snap('<label>', REDACT),
// where REDACT is the contents of the account's redaction file (see redact.example.json):
// { "replace": [[pattern, flags, replacement], ...], "badges": [[css selector, letter], ...] }.
// It returns one string, SNAPSTART<meta>SNAPMETA<html>SNAPEND: a static copy of the page with
// every same-origin stylesheet inlined from the CSSOM (with each url() made absolute against the
// sheet it came from, so fonts and masks still load from file://), cross-origin sheets kept as
// <link> tags, scripts removed, iframes replaced by same-size boxes, canvases kept as images,
// signed URLs cut back to their path, the account's photo replaced by a disc, and every REDACT
// pattern replaced. unsnap.py writes it to disk and refuses it if a redacted string or a
// signing parameter survived; render.mjs screenshots it headless at 2x. The redaction file
// names the account, so it lives outside the repository. Adapted from the Manus kit.
//
// window.__inline(re) fetches every <img> whose src matches re in the page, scales it to at most
// 480px wide and keeps it as a JPEG data URL, which __snap writes in place of the src. Use it
// for thumbnails served with a signed query that the snapshot would otherwise cut off.
window.__inline = async function (match) {
  const re = match || /^https:\/\/[^/]+\/(backend-api\/estuary|api\/[^/]+\/files)\//;
  window.__inl = window.__inl || {};
  for (const img of document.images) {
    if (!re.test(img.src) || window.__inl[img.src]) continue;
    try {
      const blob = await (await fetch(img.src)).blob();
      const bm = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      const s = Math.min(1, 480 / bm.width);
      c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      window.__inl[img.src] = c.toDataURL('image/jpeg', 0.8);
    } catch { /* not fetchable: the renderer shows the placeholder */ }
  }
  return Object.keys(window.__inl).length;
};
// window.__sprites() fetches every external SVG sprite a <use href="file.svg#id"> points at
// (ChatGPT draws all its icons that way), and __snap then copies just the symbols the page uses
// into a hidden <svg> in the copy and points each <use> at its local copy, since a file:// page
// may not load a cross-origin sprite. Await it before __snap.
window.__sprites = async function () {
  window.__spr = window.__spr || {};
  const files = [...new Set([...document.querySelectorAll('use')].map((u) => u.getAttribute('href') || u.getAttribute('xlink:href') || '').filter((h) => h && !h.startsWith('#')).map((h) => new URL(h.split('#')[0], location.href).href))];
  for (const f of files) {
    if (window.__spr[f]) continue;
    try { window.__spr[f] = new DOMParser().parseFromString(await (await fetch(f)).text(), 'image/svg+xml'); } catch { /* leave that sprite out */ }
  }
  return Object.keys(window.__spr).length;
};
function spriteFix(clone) {
  const spr = window.__spr || {};
  const keep = new Map();
  const files = Object.keys(spr);
  clone.querySelectorAll('use').forEach((u) => {
    const h = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
    if (!h || h.startsWith('#') || !h.includes('#')) return;
    const f = new URL(h.split('#')[0], location.href).href, id = h.split('#')[1];
    const doc = spr[f];
    if (!doc) return;
    const local = 'spr' + files.indexOf(f) + '-' + id;
    if (!keep.has(local)) {
      const sym = doc.getElementById(id);
      if (sym) { const c = sym.cloneNode(true); c.setAttribute('id', local); keep.set(local, c.outerHTML); }
    }
    u.setAttribute('href', '#' + local);
    u.removeAttribute('xlink:href');
  });
  if (keep.size) clone.querySelector('body').insertAdjacentHTML('beforeend', '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" data-sprites="">' + [...keep.values()].join('') + '</svg>');
}
window.__snap = function (label, REDACT) {
  if (!REDACT || !Array.isArray(REDACT.replace)) throw new Error('pass the redaction file as the second argument');
  // A presigned URL (S3, CloudFront) carries a credential that works until it expires, so
  // any URL with a signing parameter loses its whole query string.
  const SIGNED = /[?&](X-Amz-[A-Za-z-]+|Signature|Key-Pair-Id|Policy|Expires|token|access_token|auth)=/i;
  const abs = (u) => { let h; try { h = new URL(u, location.href).href; } catch { return u; } return SIGNED.test(h) ? h.split('?')[0] : h; };
  const parts = [];
  for (const ss of document.styleSheets) {
    try {
      let t = '';
      for (const r of ss.cssRules) t += r.cssText + '\n';
      const base = ss.href || location.href;
      t = t.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => (u.startsWith('data:') || u.startsWith('#') ? m : 'url("' + abs(new URL(u, base).href) + '")'));
      parts.push({ css: t, media: ss.media && ss.media.mediaText });
    } catch { if (ss.href) parts.push({ href: ss.href }); }
  }
  const clone = document.documentElement.cloneNode(true);
  // Inner scrollers keep their position only as a property, and removing scripts and styles from
  // the copy shifts every child index, so each scrolled element is marked in the copy itself.
  const liveAll = document.documentElement.querySelectorAll('*'), cloneAll = clone.querySelectorAll('*');
  liveAll.forEach((e, i) => { if (e.scrollTop > 0 || e.scrollLeft > 0) cloneAll[i].setAttribute('data-snap-scroll', e.scrollTop + ',' + e.scrollLeft); });
  const srcC = document.querySelectorAll('canvas'), cC = clone.querySelectorAll('canvas');
  srcC.forEach((c, i) => {
    try {
      const img = document.createElement('img');
      img.src = c.toDataURL(); img.style.cssText = c.style.cssText;
      img.width = c.width; img.height = c.height; img.className = c.className;
      cC[i].replaceWith(img);
    } catch { /* tainted canvas: leave it blank */ }
  });
  const srcIf = document.querySelectorAll('iframe'), cIf = clone.querySelectorAll('iframe');
  srcIf.forEach((f, i) => {
    const r = f.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = f.className; d.setAttribute('data-was-iframe', abs(f.src || ''));
    d.style.cssText = f.style.cssText + ';width:' + r.width + 'px;height:' + r.height + 'px;background:#0d0f12;display:' + (r.width ? 'block' : 'none');
    cIf[i].replaceWith(d);
  });
  const srcV = document.querySelectorAll('video'), cV = clone.querySelectorAll('video');
  srcV.forEach((v, i) => {
    try {
      const cv = document.createElement('canvas');
      cv.width = v.videoWidth; cv.height = v.videoHeight;
      cv.getContext('2d').drawImage(v, 0, 0);
      cV[i].setAttribute('poster', cv.toDataURL('image/jpeg', 0.85));
    } catch { /* cross-origin frame: keep the page's own poster */ }
    cV[i].removeAttribute('src');
    cV[i].querySelectorAll('source,track').forEach((n) => n.remove());
  });
  const srcIn = document.querySelectorAll('input,textarea,select'), cIn = clone.querySelectorAll('input,textarea,select');
  srcIn.forEach((el, i) => {
    const c = cIn[i];
    if (!c) return;
    if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
    else if (el.tagName === 'TEXTAREA') c.textContent = el.value;
    else if (el.tagName === 'SELECT') [...c.options].forEach((o, j) => { o.selected = el.options[j] && el.options[j].selected; });
    else c.setAttribute('value', el.value);
  });
  // Base UI (Claude) marks a popup that is closing with data-ending-style and one that is opening
  // with data-starting-style, and clears both from an animation frame. A hidden tab runs no frames,
  // so a closed menu stays mounted and a new one stays at its start: the copy drops the first and
  // settles the second.
  clone.querySelectorAll('[data-ending-style][data-closed]').forEach((n) => { const p = n.parentElement && n.parentElement.hasAttribute('data-closed') ? n.parentElement : n; p.remove(); });
  clone.querySelectorAll('[data-starting-style]').forEach((n) => n.removeAttribute('data-starting-style'));
  spriteFix(clone);
  clone.querySelectorAll('script,noscript,link[rel="stylesheet"],link[rel="preload"],link[rel="modulepreload"],link[rel="prefetch"],style,base').forEach((n) => n.remove());
  const INL = window.__inl || {};
  clone.querySelectorAll('[src]').forEach((n) => {
    const v = n.getAttribute('src');
    let full; try { full = new URL(v, location.href).href; } catch { full = v; }
    n.setAttribute('src', INL[full] || abs(v));
  });
  clone.querySelectorAll('[href]').forEach((n) => { const v = n.getAttribute('href'); if (!v.startsWith('#')) n.setAttribute('href', abs(v)); });
  clone.querySelectorAll('[srcset]').forEach((n) => n.setAttribute('srcset', n.getAttribute('srcset').split(',').map((p) => {
    const a = p.trim().split(/\s+/); a[0] = abs(a[0]); return a.join(' ');
  }).join(', ')));
  clone.querySelectorAll('[poster]').forEach((n) => { const v = n.getAttribute('poster'); if (!v.startsWith('data:')) n.setAttribute('poster', abs(v)); });
  // The avatar photo becomes a disc with an L; each badge the redaction file lists becomes
  // its letter.
  clone.querySelectorAll('img[src*="googleusercontent.com"], img[src*="gravatar.com"], img[src*="avatar"], img[alt="Profile image"]').forEach((img) => {
    const d = document.createElement('div');
    d.className = img.className;
    d.setAttribute('style', 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:9999px;background:#8a8a8a;color:#fff;font-weight:600;font-size:12px');
    d.textContent = 'L';
    img.replaceWith(d);
  });
  const initials = [...(REDACT.badges || [])];
  for (const [sel, rep] of initials) {
    clone.querySelectorAll(sel).forEach((b) => {
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (/^\s*[A-Za-z]{1,2}\s*$/.test(w.currentNode.nodeValue)) w.currentNode.nodeValue = rep;
      b.querySelectorAll('img').forEach((i) => i.remove());
    });
  }
  clone.querySelector('head').insertAdjacentHTML('beforeend', parts.map((p) => (p.href
    ? '<link rel="stylesheet" href="' + p.href + '">'
    : '<style' + (p.media ? ' media="' + p.media + '"' : '') + '>' + p.css.replace(/<\/style/gi, '<\\/style') + '</style>')).join('\n'));
  let html = '<!doctype html>\n' + clone.outerHTML;
  for (const [pattern, flags, rep] of REDACT.replace) html = html.replace(new RegExp(pattern, flags), rep);
  // Inner scrollers (the task thread is a virtualised list inside one) keep their position only
  // as a property, so each scrolled element is recorded by its child-index path for render.mjs.
  const pathOf = (el) => { const out = []; for (let n = el; n && n !== document.documentElement; n = n.parentElement) out.unshift([...n.parentElement.children].indexOf(n)); return out; };
  const scrolls = [...document.querySelectorAll('*')].filter((e) => e.scrollTop > 0).map((e) => ({ path: pathOf(e), top: e.scrollTop, left: e.scrollLeft, max: e.scrollHeight - e.clientHeight }));
  const meta = { label, url: location.href, title: document.title, scrollY, w: innerWidth, h: innerHeight, docH: document.documentElement.scrollHeight, scrolls };
  return 'SNAPSTART' + JSON.stringify(meta) + 'SNAPMETA' + html + 'SNAPEND';
};
