import { describe, expect, it } from 'vitest';
import { audits, contrast } from './brand-contrast.mjs';

describe('the terracotta brand palette', () => {
  it('uses WCAG relative luminance rather than a brightness approximation', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(contrast('#c2603f', '#faf6ec')).toBeCloseTo(3.86, 2);
    expect(contrast('#9e4a2e', '#faf6ec')).toBeCloseTo(5.60, 2);
  });
  for (const [name, modes] of Object.entries(audits)) {
    for (const [index, rows] of modes.entries()) {
      it(`${name}, ${index ? 'dark' : 'light'}: every text and graphic pair meets its minimum`, () => {
        expect(rows.filter(({ ratio, minimum }) => !Number.isFinite(ratio) || ratio < minimum)).toEqual([]);
      });
    }
  }
});
