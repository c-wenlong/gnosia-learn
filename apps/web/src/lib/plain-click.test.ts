import { describe, expect, it } from "vitest";

import { isPlainClick } from "./plain-click";

const click = (over: Partial<Parameters<typeof isPlainClick>[0]> = {}) =>
  isPlainClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over });

describe("isPlainClick", () => {
  it("is a main-button click with no modifier", () => expect(click()).toBe(true));
  it("leaves every modified click to the browser", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(click({ [key]: true })).toBe(false);
  });
  it("leaves the middle and right buttons to the browser", () => {
    expect(click({ button: 1 })).toBe(false);
    expect(click({ button: 2 })).toBe(false);
  });

});
