// Read every custom property Claude's stylesheets declare and write raw/css-vars.json.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs SNAPS=<dir of page copies> node tools/capture/vars.mjs
//
// claude.ai serves its CSS from assets-proxy.anthropic.com with CORS headers, so the signed-in
// page's CSSOM could read it, and snapshot.js inlined every sheet into each page copy as a
// <style> block. The blocks are the same in every copy (the app ships one CSS bundle), so they
// are deduplicated by content hash, then each is parsed by a headless Chromium (constructed
// CSSStyleSheet) and every rule that declares a custom property is kept with its selector, its
// enclosing @media/@supports/@layer/@container, and the block it came from. @font-face rules are
// kept too. No network: the copies are read from disk and nothing is fetched.
//
// Each rule is then sorted into one of three bins:
//   cds        Claude's design system: any --cds-* name, plus every name declared on a selector
//              that carries the theme attributes (data-theme, data-mode, data-density, data-font,
//              data-color-version) or .cds-root
//   app        other names Claude's own classes declare (--font-*, --sidebar-*, the markdown
//              previews' --text-*, ...), outside Tailwind's layers
//   utility    a one-off `[--x:value]` arbitrary-property utility class (an override on one element)
//   tailwind   Tailwind v4's internals: --tw-* and everything declared inside @layer properties
//              or @layer theme (Tailwind's default palette, spacing and type scale)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = path.resolve(here, '..', '..');
const SNAPS = process.env.SNAPS;
if (!SNAPS) { console.error('SNAPS=<dir of page copies> is required'); process.exit(2); }

const blocks = new Map();
for (const f of fs.readdirSync(SNAPS).filter((n) => n.endsWith('.html')).sort()) {
  const html = fs.readFileSync(path.join(SNAPS, f), 'utf8');
  for (const m of html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
    const css = m[2].replace(/<\\\/style/gi, '</style');
    const media = (m[1].match(/media="([^"]*)"/) || [])[1] || '';
    const key = crypto.createHash('sha1').update(media + css).digest('hex').slice(0, 10);
    const b = blocks.get(key) || { name: 'block-' + key, media, bytes: css.length, css, copies: [] };
    b.copies.push(f.replace(/\.html$/, ''));
    blocks.set(key, b);
  }
}
const sheets = [...blocks.values()].sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const { chromium } = pw.default ?? pw;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><head></head><body></body></html>');
const result = await page.evaluate((sheets) => {
  const rules = [];
  const fonts = [];
  const walk = (list, ctx, file) => {
    for (const r of list) {
      if (r.type === CSSRule.FONT_FACE_RULE) {
        const o = { file };
        for (let i = 0; i < r.style.length; i++) o[r.style[i]] = r.style.getPropertyValue(r.style[i]).trim();
        fonts.push(o);
        continue;
      }
      if (r.cssRules && !r.style) {
        const head = r.type === CSSRule.MEDIA_RULE ? '@media ' + r.media.mediaText
          : r.type === CSSRule.SUPPORTS_RULE ? '@supports ' + r.conditionText
          : r.constructor.name === 'CSSLayerBlockRule' ? '@layer ' + r.name
          : r.constructor.name === 'CSSContainerRule' ? '@container ' + r.conditionText
          : r.cssText.split('{')[0].trim();
        walk(r.cssRules, [...ctx, head], file);
        continue;
      }
      if (!r.style) continue;
      const props = {};
      let n = 0;
      for (let i = 0; i < r.style.length; i++) {
        const k = r.style[i];
        if (k && k.startsWith("--")) { props[k] = r.style.getPropertyValue(k).trim(); n++; }
      }
      // A nested style rule (CSS nesting) keeps its own children.
      if (n) rules.push({ file, selector: r.selectorText, context: ctx, properties: props });
      if (r.cssRules && r.cssRules.length) walk(r.cssRules, [...ctx, r.selectorText], file);
    }
  };
  for (const s of sheets) {
    const ss = new CSSStyleSheet({ media: s.media || undefined });
    try { ss.replaceSync(s.css); } catch (e) { rules.push({ file: s.name, error: String(e) }); continue; }
    walk(ss.cssRules, [], s.name);
  }
  return { rules, fonts };
}, sheets.map(({ name, media, css }) => ({ name, media, css })));

// ---------------------------------------------------------------- resolution
//
// A declared value says little on its own (`hsl(from var(--cds-neutral-900) h s l / 10%)`,
// `calc(.5rem * var(--cds-rem-scale,1))`), so every name is also resolved the way the browser
// resolves it. A probe document carries every block and the same root the app draws:
// <html class="cds-root" data-theme="claude" data-color-version="v2" data-mode=... data-density=...
// data-font="anthropic">, with a .dframe-root (data-variant="web", as on claude.ai) holding an
// aside.dframe-sidebar. Each --cds-*, --font-*, legacy palette and Tailwind theme name is read on a
// probe under <body>, each --df-* name on a probe inside the sidebar; the value is then classified
// and computed by assigning it to a real property (color, width, box-shadow, transition-*), so a
// colour comes back as sRGB and a length as px. Three passes: light and dark at the comfortable
// density the account uses, and light at compact (the default when no data-density is set, which
// Claude still forces on some components). The viewport is 1440 x 900, so a clamp() with vw resolves
// to its 1440-wide value.
const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shell = (mode, density) => '<!doctype html><html class="cds-root" lang="en-US" data-theme="claude" data-color-version="v2" data-mode="' + mode + '" data-density="' + density + '" data-font="anthropic"><head>'
  + sheets.map((s) => '<style' + (s.media ? ' media="' + s.media + '"' : '') + '>' + s.css.replace(/<\/style/gi, '<\\/style') + '</style>').join('')
  + '</head><body class="bg-surface-1 text-primary font-sans"><div id="probe-root"></div>'
  + '<div class="dframe-root cds-root" data-web="true" data-variant="web" data-sidebar-density="' + density + '" data-density="' + density + '" data-mode="' + mode + '" data-platform="desktop" data-font="anthropic">'
  + '<aside class="dframe-sidebar" data-variant="web" data-density="' + density + '"><div id="probe-sidebar"></div></aside></div></body></html>';
const want = [...new Set(result.rules.filter((r) => !r.error && !r.context.includes('@layer properties') && !/\\\[--/.test(r.selector || '')).flatMap((r) => Object.keys(r.properties)))]
  .filter((n) => !/^--(tw-|_|lightningcss-)/.test(n)).sort();
const resolved = {};
for (const [pass, mode, density] of [['light', 'light', 'comfortable'], ['dark', 'dark', 'comfortable'], ['compact', 'light', 'compact']]) {
  await page2.setContent(shell(mode, density), { waitUntil: 'load' });
  resolved[pass] = await page2.evaluate((names) => {
    const rootProbe = document.getElementById('probe-root');
    const sideProbe = document.getElementById('probe-sidebar');
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:0;top:0;width:1000px;height:1000px;visibility:hidden';
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:0;top:0';
    box.appendChild(probe);
    document.body.appendChild(box);
    const lin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    const fromOklab = (L, a, b) => {
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map((v) => Math.round(Math.min(1, Math.max(0, lin(v))) * 255));
    };
    const num = (x) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x));
    const norm = (c) => {
      let m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
      let rgb, a = 1;
      if (m) { rgb = [m[1], m[2], m[3]].map((v) => Math.round(+v)); a = m[4] === undefined ? 1 : +m[4]; }
      else if ((m = c.match(/^color\(srgb ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: \/ ([\d.]+%?))?\)$/))) { rgb = [m[1], m[2], m[3]].map((v) => Math.round(Math.min(1, Math.max(0, +v)) * 255)); a = m[4] === undefined ? 1 : num(m[4]); }
      else if ((m = c.match(/^oklab\(([-\d.e]+%?) ([-\d.e]+) ([-\d.e]+)(?: \/ ([\d.]+%?))?\)$/))) { rgb = fromOklab(num(m[1]), +m[2], +m[3]); a = m[4] === undefined ? 1 : num(m[4]); }
      else if ((m = c.match(/^oklch\(([-\d.e]+%?) ([-\d.e]+) ([-\d.e]+)(?: \/ ([\d.]+%?))?\)$/))) { const h = (+m[3] * Math.PI) / 180; rgb = fromOklab(num(m[1]), +m[2] * Math.cos(h), +m[2] * Math.sin(h)); a = m[4] === undefined ? 1 : num(m[4]); }
      else return { unparsed: c };
      a = Math.round(a * 1000) / 1000;
      return a === 1 ? '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') : `rgba(${rgb.join(', ')}, ${a})`;
    };
    const out = {};
    for (const name of names) {
      const el = name.startsWith('--df-') ? sideProbe : rootProbe;
      const raw = getComputedStyle(el).getPropertyValue(name).trim();
      if (!raw) continue;
      const r = { raw: raw.length > 300 ? raw.slice(0, 300) + '…' : raw };
      const hsl = /^-?[\d.]+(deg)? [\d.]+% [\d.]+%$/.test(raw);
      const asColor = hsl ? `hsl(${raw})` : raw;
      probe.removeAttribute('style'); probe.style.cssText = 'position:absolute;left:0;top:0';
      if (/^-?\d*\.?\d+$/.test(raw)) { r.kind = 'number'; r.value = +raw; }
      else if (/currentcolor/i.test(raw)) { r.kind = 'other'; r.note = 'depends on currentColor'; }
      else if (CSS.supports('color', asColor) && !/^(inherit|initial|unset|revert)$/.test(raw)) {
        probe.style.color = asColor; r.kind = 'color'; r.value = norm(getComputedStyle(probe).color); if (hsl) r.hslTriplet = true;
        if (typeof r.value === 'object') { r.kind = 'other'; r.note = 'colour space not converted: ' + r.value.unparsed; delete r.value; }
      } else if (!raw.includes('%') && CSS.supports('width', raw)) { probe.style.width = raw; r.kind = 'dimension'; r.value = getComputedStyle(probe).width; if (/vw|vh|dvh/.test(raw)) r.note = 'viewport-relative, resolved at 1440 x 900'; }
      else if (CSS.supports('box-shadow', raw)) { probe.style.boxShadow = raw; r.kind = 'shadow'; r.value = getComputedStyle(probe).boxShadow; }
      else if (CSS.supports('transition-duration', raw)) { probe.style.transitionDuration = raw; r.kind = 'duration'; r.value = getComputedStyle(probe).transitionDuration; }
      else if (CSS.supports('transition-timing-function', raw) && !/^[a-z-]+$/.test(raw) || /^(ease|ease-in|ease-out|ease-in-out|linear)$/.test(raw)) { r.kind = 'easing'; r.value = raw; }
      else if (/[A-Za-z]/.test(raw) && CSS.supports('font-family', raw)) { r.kind = 'fontFamily'; r.value = raw; }
      else r.kind = 'other';
      out[name] = r;
    }
    box.remove();
    return out;
  }, want);
}
// Keep compact only where it differs from light (comfortable).
for (const n of Object.keys(resolved.compact)) if (JSON.stringify(resolved.compact[n]) === JSON.stringify(resolved.light[n])) delete resolved.compact[n];
await browser.close();

const THEME_ATTR = /data-(theme|mode|density|font|color-version)|\.cds-root/;
const binOf = (r) => {
  const names = Object.keys(r.properties);
  if (/\\\[--/.test(r.selector || "")) return "utility";
  if (names.every((n) => n.startsWith('--tw-')) || r.context.some((c) => c === '@layer properties' || c === '@layer theme')) return 'tailwind';
  if (names.some((n) => n.startsWith('--cds-')) || THEME_ATTR.test(r.selector || '')) return 'cds';
  return 'app';
};
const ok = result.rules.filter((r) => !r.error);
for (const r of ok) r.bin = binOf(r);

const bySelector = {};
for (const r of ok) {
  const key = `[${r.bin}] ` + (r.context.length ? r.context.join(' ') + ' ' : '') + r.selector;
  bySelector[key] = (bySelector[key] || 0) + Object.keys(r.properties).length;
}
const names = (bin) => [...new Set(ok.filter((r) => r.bin === bin).flatMap((r) => Object.keys(r.properties)))].sort();
const out = {
  readAt: '2026-10-04',
  source: 'the <style> blocks snapshot.js inlined into each signed-in page copy (claude.ai\'s CSS from assets-proxy.anthropic.com), deduplicated by content',
  sheets: sheets.map(({ name, media, bytes, copies }) => ({ name, media, bytes, copies: copies.length === 20 ? 'all 20 copies' : copies })),
  counts: {
    rules: ok.length,
    fonts: result.fonts.length,
    names: { cds: names('cds').length, app: names('app').length, utility: names('utility').length, tailwind: names('tailwind').length },
    bySelector,
  },
  errors: result.rules.filter((r) => r.error),
  cds: ok.filter((r) => r.bin === 'cds'),
  app: ok.filter((r) => r.bin === 'app'),
  utility: ok.filter((r) => r.bin === 'utility'),
  tailwind: ok.filter((r) => r.bin === 'tailwind'),
  fonts: result.fonts,
  resolved,
};
fs.mkdirSync(path.join(REF, 'raw'), { recursive: true });
fs.writeFileSync(path.join(REF, 'raw', 'css-vars.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`resolved: light ${Object.keys(resolved.light).length}, dark ${Object.keys(resolved.dark).length}, compact differs ${Object.keys(resolved.compact).length}`);
console.log(`css-vars.json: ${ok.length} rules, ${result.fonts.length} font faces; names cds ${out.counts.names.cds}, app ${out.counts.names.app}, tailwind ${out.counts.names.tailwind}`);
for (const [k, v] of Object.entries(bySelector).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${v}\t${k.slice(0, 160)}`);
