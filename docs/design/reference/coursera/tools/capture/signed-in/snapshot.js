// Paste into the console of a signed-in coursera.org page, then call
// window.__snap('<label>'). It returns one string, SNAPSTART<meta>SNAPMETA<html>SNAPEND:
// a static copy of the page with every stylesheet inlined from the CSSOM (Emotion
// inserts its rules with insertRule, so the <style> tags alone are empty), scripts
// removed, iframes replaced by same-size boxes, the current video frame kept as a
// poster, and the learner's name, avatar initials, email and programme redacted.
// unsnap.py writes it to disk and refuses it if a name survived; render.mjs
// screenshots it headless at 2x. Extend the redaction list for another account.
window.__snap = function (label) {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
  const parts = [];
  for (const ss of document.styleSheets) {
    try {
      let t = '';
      for (const r of ss.cssRules) t += r.cssText + '\n';
      parts.push({ css: t, media: ss.media && ss.media.mediaText });
    } catch { if (ss.href) parts.push({ href: ss.href }); }
  }
  const clone = document.documentElement.cloneNode(true);
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
  clone.querySelectorAll('script,noscript,link[rel="stylesheet"],link[rel="preload"],link[rel="modulepreload"],link[rel="prefetch"],style,base').forEach((n) => n.remove());
  clone.querySelectorAll('[src]').forEach((n) => n.setAttribute('src', abs(n.getAttribute('src'))));
  clone.querySelectorAll('[href]').forEach((n) => n.setAttribute('href', abs(n.getAttribute('href'))));
  clone.querySelectorAll('[srcset]').forEach((n) => n.setAttribute('srcset', n.getAttribute('srcset').split(',').map((p) => {
    const a = p.trim().split(/\s+/); a[0] = abs(a[0]); return a.join(' ');
  }).join(', ')));
  clone.querySelectorAll('[poster]').forEach((n) => { const v = n.getAttribute('poster'); if (!v.startsWith('data:')) n.setAttribute('poster', abs(v)); });
  // Avatar initials: the header menu, the My Learning greeting, and the programme badge.
  clone.querySelectorAll('[data-testid="user-avatar"],[aria-label*="User dropdown"],[aria-label="National University of Singapore"]').forEach((b) => {
    const rep = (b.getAttribute('aria-label') || 'User').startsWith('User') ? 'L' : 'E';
    const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (/^\s*[A-Za-z]{1,2}\s*$/.test(w.currentNode.nodeValue)) w.currentNode.nodeValue = rep;
    b.querySelectorAll('img').forEach((i) => i.remove());
  });
  clone.querySelector('head').insertAdjacentHTML('beforeend', parts.map((p) => (p.href
    ? '<link rel="stylesheet" href="' + p.href + '">'
    : '<style' + (p.media ? ' media="' + p.media + '"' : '') + '>' + p.css.replace(/<\/style/gi, '<\\/style') + '</style>')).join('\n'));
  let html = '<!doctype html>\n' + clone.outerHTML;
  html = html
    .replace(/Kai Chen/gi, 'Learner').replace(/Kai/g, 'Learner')
    .replace(/chenwenlongofficial@gmail\.com/gi, 'learner@example.com').replace(/Wenlong/gi, 'Learner')
    .replace(/National University of Singapore/g, 'Example University')
    .replace(/Uplift Mentorship Programme 2026[^"<]*/g, 'Example Program')
    .replace(/uplift-mentorship-programme-2026-expiry-31-jul-2026-82y1r/g, 'example-program');
  const meta = { label, url: location.href, title: document.title, scrollY, w: innerWidth, h: innerHeight, docH: document.documentElement.scrollHeight };
  return 'SNAPSTART' + JSON.stringify(meta) + 'SNAPMETA' + html + 'SNAPEND';
};
