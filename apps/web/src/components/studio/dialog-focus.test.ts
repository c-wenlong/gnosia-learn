// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { focusIsUnclaimed } from "./dialog-focus";

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
