// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { DockedAside } from "./DockedAside";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

function draw(props: Parameters<typeof DockedAside>[0]): HTMLElement {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(DockedAside, props)));
  mounted.push(() => act(() => root.unmount()));
  return host;
}

describe("DockedAside", () => {
  it("is a container around one grid holding the main column then the side one", () => {
    const host = draw({
      aside: "wide",
      className: "fade",
      children: [createElement("main", { key: "m" }), createElement("aside", { key: "a" })],
    });
    const outer = host.firstElementChild as HTMLElement;
    expect(outer.className.split(" ")).toEqual(expect.arrayContaining(["@container", "fade"]));
    const grid = outer.firstElementChild as HTMLElement;
    expect([...grid.children].map((el) => el.tagName)).toEqual(["MAIN", "ASIDE"]);
    expect(grid.className).toContain("grid-cols-1");
  });

  it("docks a 320 to 380px side for wide and a fixed 300px side for narrow", () => {
    const wide = draw({ aside: "wide", children: null }).querySelector("[data-docked-aside]") as HTMLElement;
    const narrow = draw({ aside: "narrow", children: null }).querySelector("[data-docked-aside]") as HTMLElement;
    expect(wide.className).toContain("@4xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]");
    expect(wide.className).toContain("gap-5");
    expect(narrow.className).toContain("@4xl:grid-cols-[minmax(0,1fr)_300px]");
    expect(narrow.className).toContain("gap-4");
  });
});
