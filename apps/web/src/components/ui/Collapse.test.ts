// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";

import { Collapse } from "./Collapse";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("Collapse", () => {
  it("keeps its content mounted, and inert and at no height while shut", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const draw = (open: boolean) =>
      act(() => root.render(createElement(Collapse, { open, id: "r", children: createElement("input", { name: "kept" }) })));

    draw(false);
    const region = host.querySelector("#r") as HTMLElement;
    expect(region.hasAttribute("inert")).toBe(true);
    expect(region.className).toContain("grid-rows-[0fr]");
    expect(host.querySelector("input")).not.toBeNull();

    draw(true);
    expect(region.hasAttribute("inert")).toBe(false);
    expect(region.className).toContain("grid-rows-[1fr]");
    act(() => root.unmount());
  });
});
