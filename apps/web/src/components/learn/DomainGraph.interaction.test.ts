// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LearnIndex } from "./LearnIndex";
import type { GraphEdge } from "@/lib/concept-graph";
import { domainLayout, domainTree, type DomainNode, type DomainTopic } from "@/lib/domain-map";
import { movedKey, viewBoxFor } from "@/lib/domain-view";
import type { IndexRow } from "@/lib/learn-index";

/**
 * Written before the interaction (phase 3 of docs/proposals/domain-map.md,
 * D5 to D7): hover keeps a concept and its neighbours and fades the rest, the
 * list and the graph hover in step, focus in the list is hover, a topic's
 * title lights its group, and a concept drags, its place kept for the session
 * until Reset.
 */

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
  };
});

const topics: DomainTopic[] = [
  { slug: "sorting", title: "Sorting", domain: "algorithms" },
  { slug: "graphs", title: "Graphs", domain: "algorithms" },
];
const spec: [string, string][] = [
  ["merge", "sorting"],
  ["quick", "sorting"],
  ["heap", "sorting"],
  ["bfs", "graphs"],
  ["dfs", "graphs"],
];
const rows: IndexRow[] = spec.map(([id]) => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  summary: "",
  bucket: "learning",
  pL: 0.5,
  due: null,
  isDue: false,
  dueLabel: "",
  overdue: false,
  lastSeenLabel: "",
  leech: false,
  courseLabel: null,
  courses: [],
  domain: null,
  ready: false,
}));
const edges: GraphEdge[] = [
  { from: "merge", to: "quick", kind: "requires" },
  { from: "merge", to: "heap", kind: "requires" },
  { from: "heap", to: "bfs", kind: "requires" },
  { from: "bfs", to: "dfs", kind: "requires" },
];
const nodes: DomainNode[] = rows.map((r, i) => ({ ...r, topic: spec[i][1] }));
const tree = domainTree(nodes, edges, topics);
const layout = domainLayout(nodes, edges, topics, "algorithms");
const map = { tree, layouts: { algorithms: layout } };

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Reduced motion, so Reset lands in one frame.
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => undefined;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/learn");
});

function mount() {
  window.history.replaceState(null, "", "/learn?domain=algorithms");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const initial = { selected: null, view: "graph" as const, scope: "neighbourhood" as const, filter: "all" as const, domain: "algorithms", topic: null };
  act(() => root.render(createElement(LearnIndex, { rows, edges, map, initial })));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  const svg = host.querySelector("svg[data-domain-graph]") as SVGSVGElement;
  // jsdom does not lay out: draw the picture at one pixel per layout unit.
  const view = viewBoxFor(layout, null);
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: view.width, height: view.height, right: view.width, bottom: view.height, x: 0, y: 0, toJSON: () => ({}) });
  return { host, svg, view };
}

const concept = (host: HTMLElement, id: string) => host.querySelector(`svg [data-concept="${id}"]`) as SVGGElement;
const row = (host: HTMLElement, id: string) => host.querySelector(`[data-list-concept="${id}"]`) as HTMLButtonElement;
const state = (host: HTMLElement, id: string) => {
  const g = concept(host, id);
  return g.dataset.hover === "true" ? "hover" : g.dataset.related === "true" ? "related" : g.dataset.faded === "true" ? "faded" : "plain";
};
const enter = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
const leave = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
const pointer = (el: Element, type: string, x: number, y: number, buttons = 1) =>
  act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, buttons })));
const dotOf = (host: HTMLElement, id: string) => concept(host, id).querySelector("circle[data-dot]") as SVGCircleElement;
const cxOf = (host: HTMLElement, id: string) => Number(dotOf(host, id).getAttribute("cx"));
/** Drag a concept by (dx, dy) client pixels, one pixel per layout unit. */
function dragBy(host: HTMLElement, svg: SVGSVGElement, id: string, dx: number, dy: number) {
  const view = viewBoxFor(layout, null);
  const x = cxOf(host, id) - view.x;
  const y = Number(dotOf(host, id).getAttribute("cy")) - view.y;
  pointer(concept(host, id), "pointerdown", x, y);
  pointer(svg, "pointermove", x + dx, y + dy);
  pointer(svg, "pointerup", x + dx, y + dy, 0);
}

describe("domain graph interaction", () => {
  it("keeps a hovered concept and its neighbours, fades the rest, and lights its edges", () => {
    const { host, svg } = mount();
    enter(concept(host, "heap"));
    expect(["merge", "quick", "heap", "bfs", "dfs"].map((id) => state(host, id))).toEqual(["related", "faded", "hover", "related", "faded"]);
    const hot = [...svg.querySelectorAll('[data-edge][data-hot="true"]')].map((e) => e.getAttribute("data-edge")).sort();
    expect(hot).toEqual(["heap>bfs", "merge>heap"]);
    // The full title shows on a plate.
    expect(svg.querySelector("[data-plate]")?.textContent).toBe("Heap");
    // And the list follows.
    expect(row(host, "heap").dataset.hover).toBe("true");
    leave(concept(host, "heap"));
    expect(state(host, "quick")).toBe("plain");
    expect(svg.querySelector("[data-plate]")).toBeNull();
  });

  it("hovers the graph from the list, and focus in the list is hover", () => {
    const { host } = mount();
    enter(row(host, "dfs"));
    expect(state(host, "dfs")).toBe("hover");
    expect(state(host, "bfs")).toBe("related");
    leave(row(host, "dfs"));
    act(() => row(host, "quick").focus());
    expect(state(host, "quick")).toBe("hover");
    act(() => row(host, "quick").blur());
    expect(state(host, "quick")).toBe("plain");
  });

  it("lights a topic's group when its title is hovered", () => {
    const { host } = mount();
    enter(host.querySelector('[data-topic-title="graphs"]') as Element);
    expect(["merge", "bfs", "dfs"].map((id) => state(host, id))).toEqual(["faded", "related", "related"]);
  });

  it("drags a concept, keeps it there for the session, and Reset puts it back", () => {
    const { host, svg } = mount();
    const dot = () => concept(host, "dfs").querySelector("circle[data-dot]") as SVGCircleElement;
    const start = { x: Number(dot().getAttribute("cx")), y: Number(dot().getAttribute("cy")) };
    const { view } = { view: viewBoxFor(layout, null) };
    const client = (p: { x: number; y: number }) => ({ x: p.x - view.x, y: p.y - view.y });
    const from = client(start);
    pointer(concept(host, "dfs"), "pointerdown", from.x, from.y);
    pointer(svg, "pointermove", from.x - 40, from.y + 30);
    pointer(svg, "pointerup", from.x - 40, from.y + 30, 0);
    // The click a drag ends with does not select.
    act(() => void concept(host, "dfs").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(concept(host, "dfs").getAttribute("aria-pressed")).toBe("false");
    expect(Number(dot().getAttribute("cx"))).toBe(start.x - 40);
    expect(Number(dot().getAttribute("cy"))).toBe(start.y + 30);
    expect(JSON.parse(window.sessionStorage.getItem(movedKey("algorithms")) ?? "{}")).toEqual({ dfs: { x: start.x - 40, y: start.y + 30 } });
    const pill = host.querySelector('[role="status"][data-moved]') as HTMLElement;
    expect(pill.textContent).toContain("Positions moved");

    // A fresh page in the same session draws it where it was left.
    const again = mount();
    const moved = again.host.querySelector('svg [data-concept="dfs"] circle[data-dot]') as SVGCircleElement;
    expect(Number(moved.getAttribute("cx"))).toBe(start.x - 40);

    const reset = [...pill.querySelectorAll("button")].find((b) => b.textContent === "Reset") as HTMLButtonElement;
    act(() => reset.click());
    expect(Number(dot().getAttribute("cx"))).toBe(start.x);
    expect(window.sessionStorage.getItem(movedKey("algorithms"))).toBeNull();
    expect(host.querySelector('[role="status"][data-moved]')).toBeNull();
  });

  it("keeps a dragged concept where it was dropped when storage refuses the write", () => {
    const { host, svg } = mount();
    const before = cxOf(host, "dfs");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      dragBy(host, svg, "dfs", 30, 0);
      expect(cxOf(host, "dfs")).toBe(before + 30);
    } finally {
      setItem.mockRestore();
    }
  });

  it("drops a press released outside the picture, so a later move does not drag", () => {
    const { host, svg } = mount();
    const before = cxOf(host, "dfs");
    pointer(concept(host, "dfs"), "pointerdown", 10, 10);
    // Released elsewhere: the next move over the picture has no button down.
    pointer(svg, "pointermove", 80, 10, 0);
    pointer(svg, "pointermove", 120, 10, 1);
    expect(cxOf(host, "dfs")).toBe(before);
  });

  it("keeps a focused row lit when the mouse leaves it", () => {
    const { host } = mount();
    act(() => row(host, "quick").focus());
    enter(row(host, "quick"));
    leave(row(host, "quick"));
    expect(state(host, "quick")).toBe("hover");
    // A pointer hover elsewhere wins while it lasts, and focus comes back after.
    enter(concept(host, "bfs"));
    expect(state(host, "bfs")).toBe("hover");
    leave(concept(host, "bfs"));
    expect(state(host, "quick")).toBe("hover");
  });

  it("lights whichever moved last: a row Tabbed to while the pointer rests elsewhere", () => {
    const { host } = mount();
    enter(concept(host, "bfs"));
    act(() => row(host, "quick").focus());
    expect(state(host, "quick")).toBe("hover");
    enter(concept(host, "dfs"));
    expect(state(host, "dfs")).toBe("hover");
    act(() => row(host, "heap").focus());
    expect(state(host, "heap")).toBe("hover");
    // The pointer moving inside the concept it already rests on takes the light back.
    act(() => void concept(host, "dfs").dispatchEvent(new MouseEvent("mousemove", { bubbles: true })));
    expect(state(host, "dfs")).toBe("hover");
  });

  it("glides home on Reset without a jump, and takes no drag until it is home", () => {
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const media = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
    try {
      const { host, svg } = mount();
      const home = cxOf(host, "dfs");
      dragBy(host, svg, "dfs", 50, 0);
      const reset = [...host.querySelectorAll('[data-moved] button')].find((b) => b.textContent === "Reset") as HTMLButtonElement;
      act(() => reset.click());
      // Before the first frame it is still where it was dropped, not at home.
      expect(cxOf(host, "dfs")).toBe(home + 50);
      // A drag during the glide is not taken.
      dragBy(host, svg, "bfs", 0, 40);
      const run = (t: number) => {
        now = t;
        const queued = frames.splice(0);
        act(() => queued.forEach((cb) => cb(t)));
      };
      run(150);
      expect(cxOf(host, "dfs")).toBeGreaterThan(home);
      expect(cxOf(host, "dfs")).toBeLessThan(home + 50);
      run(400);
      expect(cxOf(host, "dfs")).toBe(home);
      expect(window.sessionStorage.getItem(movedKey("algorithms"))).toBeNull();
      expect(host.querySelector("[data-moved]")).toBeNull();
    } finally {
      window.matchMedia = media;
      raf.mockRestore();
      clock.mockRestore();
    }
  });

  it("selects on a press that does not move", () => {
    const { host, svg } = mount();
    pointer(concept(host, "merge"), "pointerdown", 10, 10);
    pointer(svg, "pointerup", 11, 10, 0);
    act(() => void concept(host, "merge").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(concept(host, "merge").getAttribute("aria-pressed")).toBe("true");
  });
});
