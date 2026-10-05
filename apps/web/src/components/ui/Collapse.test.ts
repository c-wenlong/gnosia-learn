// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
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
      act(() => root.render(createElement(
          Collapse,
          // Children as an argument, as the lint rule wants; the props type
          // requires them, hence the cast.
          { open, id: "r" } as ComponentProps<typeof Collapse>,
          createElement("input", { name: "kept" }),
        )));

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

  it("is the containing block for what it clips, so a shut fold's sr-only line cannot escape it", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(createElement(
        Collapse,
        { open: false, id: "r" } as ComponentProps<typeof Collapse>,
        createElement("p", { className: "sr-only" }, "Saved"),
      )));
    const clip = (host.querySelector("#r") as HTMLElement).firstElementChild as HTMLElement;
    expect(clip.className.split(" ")).toEqual(expect.arrayContaining(["relative", "overflow-clip"]));
    act(() => root.unmount());
  });
});
