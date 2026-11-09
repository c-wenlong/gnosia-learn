import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audits, contrast } from './brand-contrast.mjs';

function checkChangedCss(change) {
  const scratch = mkdtempSync(join(tmpdir(), 'gnosia-brand-contrast-'));
  try {
    mkdirSync(join(scratch, 'scripts'));
    mkdirSync(join(scratch, 'apps/web/src/app'), { recursive: true });
    copyFileSync(new URL('./brand-contrast.mjs', import.meta.url), join(scratch, 'scripts/brand-contrast.mjs'));
    const css = readFileSync(new URL('../apps/web/src/app/globals.css', import.meta.url), 'utf8');
    writeFileSync(join(scratch, 'apps/web/src/app/globals.css'), change(css));
    return spawnSync(process.execPath, [join(scratch, 'scripts/brand-contrast.mjs')], { encoding: 'utf8' });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe('the terracotta brand palette', () => {
  it('uses WCAG relative luminance rather than a brightness approximation', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(contrast('#c2603f', '#faf6ec')).toBeCloseTo(3.86, 2);
    expect(contrast('#9e4a2e', '#faf6ec')).toBeCloseTo(5.60, 2);
  });
  it('rejects a panel mix that makes its text unreadable, using the changed CSS', () => {
    const ran = checkChangedCss((css) => css.replace('var(--brand-terracotta) 12%', 'var(--brand-terracotta) 30%'));
    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('terracotta on terracotta panel');
  });
  it('fails closed when an app token disappears instead of accepting NaN', () => {
    const ran = checkChangedCss((css) => css.replace('--text: #38251f;', '--renamed-text: #38251f;'));
    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('NaN');
  });
  for (const [name, modes] of Object.entries(audits)) {
    for (const [index, rows] of modes.entries()) {
      it(`${name}, ${index ? 'dark' : 'light'}: every text and graphic pair meets its minimum`, () => {
        expect(rows.filter(({ ratio, minimum }) => !Number.isFinite(ratio) || ratio < minimum)).toEqual([]);
      });
    }
  }
});
