// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";

import { SheetFocus as SheetFocusOf } from "./SheetFocus";

const SheetFocus = SheetFocusOf as (props: { label: string; returnTo: string }) => ReturnType<typeof SheetFocusOf>;

/** The inspector sheet takes focus as it opens and hands it back to More as it closes (the Greptile review of #596). */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("SheetFocus", () => {
  it("focuses the sheet on open and the opening button on close", () => {
    const more = document.createElement("button");
    more.setAttribute("aria-label", "More actions");
    // jsdom lays nothing out: say the button is on screen.
    more.getClientRects = () => [{}] as unknown as DOMRectList;
    document.body.append(more);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(createElement(SheetFocus, { label: "Diagram details", returnTo: 'button[aria-label="More actions"]' }, createElement("p", null, "Inspector"))),
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Diagram details");
    act(() => root.unmount());
    expect(document.activeElement).toBe(more);
    host.remove();
    more.remove();
  });
});
