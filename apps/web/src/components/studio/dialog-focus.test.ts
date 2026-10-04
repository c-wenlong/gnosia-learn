// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { focusIsStill, focusIsUnclaimed } from "./dialog-focus";

afterEach(() => {
  document.body.replaceChildren();
});

describe("focusIsUnclaimed", () => {
  it("is true for nothing, the body, the dialog itself and its Close, where showModal() puts it", () => {
    expect(focusIsUnclaimed(null)).toBe(true);
    expect(focusIsUnclaimed(document.body)).toBe(true);
    const dialog = document.createElement("dialog");
    const close = document.createElement("button");
    close.setAttribute("data-dialog-close", "");
    dialog.append(close);
    document.body.append(dialog);
    expect(focusIsUnclaimed(dialog)).toBe(true);
    expect(focusIsUnclaimed(close)).toBe(true);
  });

  it("is false for anything else the person can be on", () => {
    for (const tag of ["input", "textarea", "button", "a"]) {
      expect(focusIsUnclaimed(document.createElement(tag))).toBe(false);
    }
  });
});

describe("focusIsStill", () => {
  it("lets a late composer take focus that is unclaimed, or still on what opened the panel", () => {
    const row = document.createElement("a");
    document.body.append(row);
    expect(focusIsStill(document.body, row)).toBe(true);
    expect(focusIsStill(row, row)).toBe(true);
    expect(focusIsStill(document.body, null)).toBe(true);
  });

  it("leaves focus the person moved after opening, such as the sidebar's search", () => {
    const row = document.createElement("a");
    const search = document.createElement("input");
    document.body.append(row, search);
    expect(focusIsStill(search, row)).toBe(false);
    expect(focusIsStill(search, document.body)).toBe(false);
    expect(focusIsStill(search, null)).toBe(false);
  });
});
