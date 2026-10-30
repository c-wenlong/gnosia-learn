// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LearnIndex } from "./LearnIndex";
import type { GraphEdge } from "@gnosia/tutor/concept-graph";
import { domainLayout, domainTree, type DomainNode, type DomainTopic } from "@/lib/domain-map";
import { axesViewBox, movedKey } from "@/lib/domain-view";
import { parseFilter, parseLayout, parseScope, parseView, type IndexRow } from "@/lib/learn-index";

/**
 * Written before the axes layout (D11 of docs/proposals/domain-map.md): a
 * Groups and Axes switch beside the breadcrumb, held in the URL as
 * `layout=axes`; in Axes each concept sits by its layer and by how many
 * concepts need it, gliding there from its group; the topic boxes fade out;
 * hover, the chips, the list and the topic headers still light the picture,
 * and nothing drags.
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
const spec: [string, string, IndexRow["bucket"]][] = [
  ["merge", "sorting", "mastered"],
  ["quick", "sorting", "learning"],
  ["heap", "sorting", "learning"],
  ["bfs", "graphs", "untouched"],
  ["dfs", "graphs", "untouched"],
];
const rows: IndexRow[] = spec.map(([id, , bucket]) => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  summary: "",
  bucket,
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
const layout = domainLayout(nodes, edges, topics, "algorithms");
const map = { tree: domainTree(nodes, edges, topics), layouts: { algorithms: layout } };

const reduced = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as typeof window.matchMedia;
beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = reduced;
  Element.prototype.scrollIntoView = () => undefined;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/learn");
  window.matchMedia = reduced;
});

/** The index as the page draws it for `search`, the picture one pixel per layout unit. */
function mount(search = "?domain=algorithms") {
  window.history.replaceState(null, "", `/learn${search}`);
  const params = new URLSearchParams(search);
  const initial = {
    selected: params.get("concept"),
    view: parseView(params.get("view")),
    scope: parseScope(params.get("scope")),
    filter: parseFilter(params.get("filter")),
    domain: params.get("domain"),
    topic: params.get("topic"),
    layout: parseLayout(params.get("layout")),
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(LearnIndex, { rows, edges, map, initial })));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const svgOf = (host: HTMLElement) => host.querySelector("svg[data-domain-graph]") as SVGSVGElement;
/** jsdom does not lay out: report the picture drawn at one pixel per layout unit of its current frame. */
function drawFull(host: HTMLElement) {
  const svg = svgOf(host);
  svg.getBoundingClientRect = () => {
    const [, , width, height] = (svg.getAttribute("viewBox") ?? "0 0 0 0").split(" ").map(Number);
    return { left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) };
  };
  return svg;
}
const concept = (host: HTMLElement, id: string) => host.querySelector(`svg [data-concept="${id}"]`) as SVGGElement;
const at = (host: HTMLElement, id: string) => {
  const dot = concept(host, id).querySelector("circle[data-dot]") as SVGCircleElement;
  return { x: Number(dot.getAttribute("cx")), y: Number(dot.getAttribute("cy")) };
};
const switcher = (host: HTMLElement) => host.querySelector('[role="radiogroup"][aria-label="Layout"]') as HTMLElement | null;
const option = (host: HTMLElement, label: string) =>
  [...(switcher(host)?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
const url = () => new URLSearchParams(window.location.search);
const enter = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
const leave = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
const pointer = (el: Element, type: string, x: number, y: number, buttons = 1) =>
  act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, buttons })));
const state = (host: HTMLElement, id: string) => {
  const g = concept(host, id);
  return g.dataset.hover === "true" ? "hover" : g.dataset.related === "true" ? "related" : g.dataset.faded === "true" ? "faded" : "plain";
};
const ids = spec.map(([id]) => id);

describe("the axes layout", () => {
  it("offers Groups and Axes beside the breadcrumb, Groups chosen, and Axes moves every concept to its place on the axes", () => {
    const host = mount();
    // In the breadcrumb's row, after it.
    const row = (host.querySelector('nav[aria-label="Breadcrumb"]') as HTMLElement).parentElement as HTMLElement;
    expect(row.contains(switcher(host))).toBe(true);
    expect(option(host, "Groups").getAttribute("aria-checked")).toBe("true");
    for (const id of ids) expect(at(host, id)).toEqual(layout.positions[id]);

    act(() => option(host, "Axes").click());
    expect(option(host, "Axes").getAttribute("aria-checked")).toBe("true");
    expect(url().get("layout")).toBe("axes");
    for (const id of ids) expect(at(host, id)).toEqual(layout.axes.positions[id]);
    const box = axesViewBox(layout.axes);
    expect(svgOf(host).getAttribute("viewBox")).toBe(`${box.x} ${box.y} ${box.width} ${box.height}`);
    // The topic boxes fade out, and the axes and their captions fade in.
    const groups = svgOf(host).querySelector("[data-groups]") as SVGGElement;
    expect(groups.getAttribute("class")).toContain("opacity-0");
    expect(groups.getAttribute("aria-hidden")).toBe("true");
    const axes = svgOf(host).querySelector("[data-axes]") as SVGGElement;
    expect(axes.getAttribute("class")).toContain("opacity-100");
    expect(axes.textContent).toContain("Learn earlier");
    expect(axes.textContent).toContain("Learn later");
    expect(axes.textContent).toContain("Needed by more concepts");
    expect(axes.textContent).toContain("Foundational");

    act(() => option(host, "Groups").click());
    expect(url().get("layout")).toBeNull();
    for (const id of ids) expect(at(host, id)).toEqual(layout.positions[id]);
    expect((svgOf(host).querySelector("[data-groups]") as SVGGElement).getAttribute("class")).toContain("opacity-100");
    expect((svgOf(host).querySelector("[data-axes]") as SVGGElement).getAttribute("class")).toContain("opacity-0");
  });

  it("opens in Axes from the URL, and follows Back to Groups and Forward again", () => {
    const host = mount("?domain=algorithms&layout=axes");
    expect(option(host, "Axes").getAttribute("aria-checked")).toBe("true");
    for (const id of ids) expect(at(host, id)).toEqual(layout.axes.positions[id]);
    window.history.replaceState(window.history.state, "", "/learn?domain=algorithms");
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(option(host, "Groups").getAttribute("aria-checked")).toBe("true");
    expect(at(host, "dfs")).toEqual(layout.positions.dfs);
    window.history.replaceState(window.history.state, "", "/learn?domain=algorithms&layout=axes");
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(at(host, "dfs")).toEqual(layout.axes.positions.dfs);
  });

  it("keeps Axes across a topic and back, though a topic is always groups and hides the switch", () => {
    const host = mount("?domain=algorithms&layout=axes");
    const header = host.querySelector('button[data-list-topic="graphs"]') as HTMLButtonElement;
    act(() => header.click());
    expect(url().get("topic")).toBe("graphs");
    expect(url().get("layout")).toBeNull();
    expect(switcher(host)).toBeNull();
    expect(at(host, "bfs")).toEqual(layout.positions.bfs);
    const crumb = [...host.querySelectorAll('nav[aria-label="Breadcrumb"] button')].find((b) => b.textContent === "Algorithms") as HTMLButtonElement;
    act(() => crumb.click());
    expect(url().get("layout")).toBe("axes");
    expect(at(host, "bfs")).toEqual(layout.axes.positions.bfs);
    // A topic the URL names with the axes is still drawn in groups.
    const again = mount("?domain=algorithms&topic=sorting&layout=axes");
    expect(switcher(again)).toBeNull();
    expect(at(again, "merge")).toEqual(layout.positions.merge);
  });

  it("drops the layout from the URL in the table view and on the domain cards", () => {
    const host = mount("?domain=algorithms&layout=axes");
    const view = host.querySelector('[role="radiogroup"][aria-label="View"]') as HTMLElement;
    act(() => ([...view.querySelectorAll("button")].find((b) => b.textContent === "Table") as HTMLButtonElement).click());
    expect(url().get("layout")).toBeNull();
    const cards = mount("?domain=algorithms&layout=axes");
    const learn = [...cards.querySelectorAll('nav[aria-label="Breadcrumb"] button')].find((b) => b.textContent === "Learn") as HTMLButtonElement;
    act(() => learn.click());
    expect(url().get("layout")).toBeNull();
    expect(url().get("domain")).toBeNull();
  });

  it("glides each concept from its group to the axes and back, eased over about 400ms", () => {
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
    const run = (t: number) => {
      now = t;
      const queued = frames.splice(0);
      act(() => queued.forEach((cb) => cb(t)));
    };
    try {
      const host = mount();
      const from = layout.positions.dfs;
      const to = layout.axes.positions.dfs;
      act(() => option(host, "Axes").click());
      // Not yet moved: the first frame starts it.
      expect(at(host, "dfs")).toEqual(from);
      run(200);
      const mid = at(host, "dfs");
      const share = (mid.x - from.x) / (to.x - from.x || 1);
      expect(share).toBeGreaterThan(0.5);
      expect(share).toBeLessThan(1);
      run(450);
      expect(at(host, "dfs")).toEqual(to);
      expect(frames).toHaveLength(0);
      // And back home again.
      act(() => option(host, "Groups").click());
      run(500);
      run(1000);
      expect(at(host, "dfs")).toEqual(from);
    } finally {
      raf.mockRestore();
      clock.mockRestore();
    }
  });

  it("drags nothing in Axes, and keeps a dragged group layout for when Groups returns", () => {
    window.sessionStorage.setItem(movedKey("algorithms"), JSON.stringify({ dfs: { x: 10, y: 20 } }));
    const host = mount("?domain=algorithms&layout=axes");
    const svg = drawFull(host);
    // A dragged position is not applied on the axes, and the pill about it is not shown there.
    expect(at(host, "dfs")).toEqual(layout.axes.positions.dfs);
    expect(host.querySelector("[data-moved]")).toBeNull();
    const box = axesViewBox(layout.axes);
    const p = at(host, "bfs");
    pointer(concept(host, "bfs"), "pointerdown", p.x - box.x, p.y - box.y);
    pointer(svg, "pointermove", p.x - box.x + 60, p.y - box.y + 40);
    pointer(svg, "pointerup", p.x - box.x + 60, p.y - box.y + 40, 0);
    expect(at(host, "bfs")).toEqual(layout.axes.positions.bfs);
    expect(JSON.parse(window.sessionStorage.getItem(movedKey("algorithms")) ?? "{}")).toEqual({ dfs: { x: 10, y: 20 } });
    expect(concept(host, "bfs").getAttribute("class")).not.toContain("cursor-grab");
    // A press still selects.
    act(() => void concept(host, "bfs").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(url().get("concept")).toBe("bfs");

    act(() => option(host, "Groups").click());
    expect(at(host, "dfs")).toEqual({ x: 10, y: 20 });
    expect(host.querySelector("[data-moved]")).not.toBeNull();
  });

  // Review of #426: a drag in Groups that no click followed must not swallow the first press on the axes.
  it("selects on the first press in Axes after a drag in Groups", () => {
    const host = mount();
    const svg = drawFull(host);
    const view = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const p = at(host, "dfs");
    pointer(concept(host, "dfs"), "pointerdown", p.x - view[0], p.y - view[1]);
    pointer(svg, "pointermove", p.x - view[0] + 40, p.y - view[1]);
    pointer(svg, "pointerup", p.x - view[0] + 40, p.y - view[1], 0);
    // No click after it: the pointer was let go off the concept.
    act(() => option(host, "Axes").click());
    const q = at(host, "bfs");
    pointer(concept(host, "bfs"), "pointerdown", q.x, q.y);
    pointer(svg, "pointerup", q.x, q.y, 0);
    act(() => void concept(host, "bfs").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(url().get("concept")).toBe("bfs");
  });

  // Review of #426: switching to the axes mid-drag (the arrow keys on the switch) ends the drag there.
  it("ends a drag in progress when the picture switches to the axes", () => {
    const host = mount();
    const svg = drawFull(host);
    const view = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const p = at(host, "dfs");
    pointer(concept(host, "dfs"), "pointerdown", p.x - view[0], p.y - view[1]);
    pointer(svg, "pointermove", p.x - view[0] + 40, p.y - view[1]);
    act(() => option(host, "Axes").click());
    // The frame is the axes', not the one the drag froze.
    const box = axesViewBox(layout.axes);
    expect(svg.getAttribute("viewBox")).toBe(`${box.x} ${box.y} ${box.width} ${box.height}`);
    pointer(svg, "pointermove", p.x - view[0] + 90, p.y - view[1] + 30);
    pointer(svg, "pointerup", p.x - view[0] + 90, p.y - view[1] + 30, 0);
    expect(at(host, "dfs")).toEqual(layout.axes.positions.dfs);
    // Back in groups, it is where the drag had got to when the switch came, not where the pointer went after.
    act(() => option(host, "Groups").click());
    expect(at(host, "dfs")).toEqual({ x: p.x + 40, y: p.y });
  });

  // Review of #426: through the real history, not a URL put in place by hand.
  it("comes back to Axes through Back and Forward in the browser's history", async () => {
    const host = mount();
    act(() => option(host, "Axes").click());
    act(() => (host.querySelector('button[data-list-topic="graphs"]') as HTMLButtonElement).click());
    expect(url().get("topic")).toBe("graphs");
    const traverse = (move: () => void) =>
      act(async () => {
        const popped = new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
        move();
        await popped;
      });
    await traverse(() => window.history.back());
    expect(url().get("topic")).toBeNull();
    expect(url().get("layout")).toBe("axes");
    expect(option(host, "Axes").getAttribute("aria-checked")).toBe("true");
    expect(at(host, "dfs")).toEqual(layout.axes.positions.dfs);
    await traverse(() => window.history.forward());
    expect(url().get("topic")).toBe("graphs");
    expect(switcher(host)).toBeNull();
    expect(at(host, "bfs")).toEqual(layout.positions.bfs);
  });

  it("lights a hovered concept's edges and shows its plate in Axes", () => {
    const host = mount("?domain=algorithms&layout=axes");
    enter(concept(host, "heap"));
    expect(ids.map((id) => state(host, id))).toEqual(["related", "faded", "hover", "related", "faded"]);
    const hot = [...svgOf(host).querySelectorAll('[data-edge][data-hot="true"]')].map((e) => e.getAttribute("data-edge")).sort();
    expect(hot).toEqual(["heap>bfs", "merge>heap"]);
    expect(svgOf(host).querySelector("[data-plate]")?.textContent).toBe("Heap");
    leave(concept(host, "heap"));
    expect(state(host, "quick")).toBe("plain");
  });

  it("previews a legend chip's group, and lights a topic's concepts from its header in the list", () => {
    const host = mount("?domain=algorithms&layout=axes");
    enter(host.querySelector('[data-legend-chip="untouched"]') as Element);
    expect(ids.map((id) => state(host, id))).toEqual(["faded", "faded", "faded", "related", "related"]);
    leave(host.querySelector('[data-legend-chip="untouched"]') as Element);
    // The list's topic header is the only way to see a topic on the axes.
    enter(host.querySelector('button[data-list-topic="sorting"]') as Element);
    expect(ids.map((id) => state(host, id))).toEqual(["related", "related", "related", "faded", "faded"]);
    leave(host.querySelector('button[data-list-topic="sorting"]') as Element);
    expect(state(host, "merge")).toBe("plain");
  });

  it("names the arrangement in the picture's accessible name", () => {
    const host = mount("?domain=algorithms&layout=axes");
    expect(svgOf(host).getAttribute("aria-label")).toMatch(/^Algorithms map, 5 concepts by when they are learnt and how many concepts need them/);
  });
});
