import { describe, expect, it } from "vitest";

import { COMPOSER_PLACEHOLDER, COMPOSER_TEXT, composerHeight, composerKey, modEnterTarget } from "./composer-keys";
import { inputClasses } from "./classes";

const key = (over: Partial<Parameters<typeof composerKey>[0]> = {}) =>
  composerKey({ key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, ...over });

describe("composerKey", () => {
  it("sends on a plain Enter", () => expect(key()).toBe("send"));
  it("makes Shift+Enter a new line", () => expect(key({ shiftKey: true })).toBe("newline"));
  it("keeps Cmd and Ctrl+Enter apart, for the studio's Draw", () => {
    expect(key({ metaKey: true })).toBe("mod-send");
    expect(key({ ctrlKey: true })).toBe("mod-send");
  });
  it("leaves Enter to an input method that is composing", () => expect(key({ isComposing: true })).toBe("none"));
  it("ignores every other key", () => expect(key({ key: "a" })).toBe("none"));
  it("leaves Safari's IME commit alone: keyCode 229 with isComposing already false", () => {
    expect(key({ isComposing: false, keyCode: 229 })).toBe("none");
    expect(key({ keyCode: 13 })).toBe("send");
  });
});

describe("modEnterTarget", () => {
  it("goes to the caller only from an empty field", () => {
    expect(modEnterTarget("", true)).toBe("mod");
    expect(modEnterTarget("  \n", true)).toBe("mod");
    expect(modEnterTarget("use the other topic", true)).toBe("send");
  });
  it("sends when the caller has no use for it", () => expect(modEnterTarget("", false)).toBe("send"));
});

describe("composerHeight", () => {
  it("is the tutor's 52px at one line", () => expect(composerHeight(48)).toBe(52));
  it("never goes under one line", () => expect(composerHeight(10)).toBe(52));
  it("grows a line at a time", () => expect(composerHeight(72)).toBe(76));
  it("stops at six lines and scrolls past them", () => {
    expect(composerHeight(10_000)).toBe(28 + 24 * 6);
    expect(composerHeight(10_000, 3)).toBe(28 + 24 * 3);
  });
});

/**
 * iOS Safari zooms the page when it focuses a field under 16px, and leaves it
 * zoomed. A field's text is `text-base` with no breakpoint, so it is 16px on a
 * phone, and only from `md` up may it shrink.
 */
describe("field text size on a phone", () => {
  const unprefixed = (classes: string) => classes.split(/\s+/).filter((c) => !c.includes(":"));
  for (const [name, classes] of [
    ["the composer's text", COMPOSER_TEXT],
    ["the composer's placeholder", COMPOSER_PLACEHOLDER],
    ["an input", inputClasses()],
    ["a small input", inputClasses({ size: "sm" })],
  ] as const) {
    it(`${name} is 16px below md`, () => {
      const base = unprefixed(classes);
      expect(base).toContain("text-base");
      expect(base.filter((c) => /^text-\[\d+px\]$/.test(c))).toEqual([]);
    });
  }
  it("keeps the composer's 24px line, so its height arithmetic holds at both sizes", () => {
    expect(unprefixed(COMPOSER_TEXT)).toContain("leading-6");
  });
});
