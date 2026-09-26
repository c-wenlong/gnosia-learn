// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { MathText } from "./Math";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(element: ReactElement) {
  const host = document.createElement("p");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

describe("MathText", () => {
  it("typesets the formulas in a plain string and leaves the prose as text", () => {
    const host = mount(createElement(MathText, { text: "Pick $c>0$ and $n_0$ first." }));
    expect(host.querySelectorAll(".katex")).toHaveLength(2);
    expect(host.firstChild?.textContent).toBe("Pick ");
    expect(host.lastChild?.textContent).toBe(" first.");
    // No dollar survives outside the TeX annotation MathML keeps for copying.
    const visible = [...host.querySelectorAll(".katex-html")].map((n) => n.textContent).join("");
    expect(visible).not.toContain("$");
  });

  it("renders bare children without a className, and one span with it", () => {
    expect(mount(createElement(MathText, { text: "no maths" })).innerHTML).toBe("no maths");
    const wrapped = mount(createElement(MathText, { text: "no maths", className: "truncate" }));
    expect(wrapped.innerHTML).toBe('<span class="truncate">no maths</span>');
  });

  it("keeps markup in the prose as text", () => {
    const host = mount(createElement(MathText, { text: "<b>bold</b> costs $5 and $3" }));
    expect(host.querySelector("b")).toBeNull();
    expect(host.textContent).toBe("<b>bold</b> costs $5 and $3");
  });

  it("sets $$...$$ as a display block", () => {
    const host = mount(createElement(MathText, { text: "Then $$\\sum_{i=1}^{n} i$$" }));
    expect(host.querySelector(".katex-display")).not.toBeNull();
  });
});
