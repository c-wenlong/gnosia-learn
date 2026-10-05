// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LearnIndex } from "./LearnIndex";
import type { GraphEdge } from "@/lib/concept-graph";
import { domainLayout, domainTree, type DomainNode, type DomainTopic } from "@/lib/domain-map";
import { MIN_DRAW_SCALE, movedKey, textEm, TITLE_INSET, viewBoxFor } from "@/lib/domain-view";
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

// The same concepts under topics whose titles are too long for their groups at the smallest scale.
const longTopics: DomainTopic[] = [
  { slug: "sorting", title: "Sorting and the lower bound on comparison sorts", domain: "algorithms" },
  { slug: "graphs", title: "Graph search, traversal orders and shortest paths", domain: "algorithms" },
];
const longLayout = domainLayout(nodes, edges, longTopics, "algorithms");
const longMap = { tree: domainTree(nodes, edges, longTopics), layouts: { algorithms: longLayout } };

function mount(m: typeof map = map) {
  window.history.replaceState(null, "", "/learn?domain=algorithms");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const initial = { selected: null, view: "graph" as const, scope: "neighbourhood" as const, filter: "all" as const, domain: "algorithms", topic: null };
  act(() => root.render(createElement(LearnIndex, { rows, edges, map: m, initial })));
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

/**
 * Written before the label culling (D10 of docs/proposals/domain-map.md): a
 * label keeps 11px on screen however small the picture is drawn, and one that
 * would overlap a higher priority label or a dot is not drawn. jsdom has no
 * ResizeObserver, so these install one the test drives: `drawAt` reports the
 * picture drawn at a fraction of its layout width.
 */
describe("domain graph label culling", () => {
  const observers: Array<{ cb: ResizeObserverCallback; self: ResizeObserver }> = [];
  class FakeObserver {
    constructor(cb: ResizeObserverCallback) {
      observers.push({ cb, self: this as unknown as ResizeObserver });
    }
    observe() {}
    unobserve() {}
    disconnect() {
      const i = observers.findIndex((o) => o.self === (this as unknown as ResizeObserver));
      if (i >= 0) observers.splice(i, 1);
    }
  }
  beforeEach(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeObserver;
  });
  afterEach(() => {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  });

  function drawAt(svg: SVGSVGElement, scale: number, l: typeof layout = layout) {
    const view = viewBoxFor(l, null);
    const width = view.width * scale;
    const height = view.height * scale;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) });
    act(() => observers.forEach((o) => o.cb([], o.self)));
  }
  const labelOf = (host: HTMLElement, id: string) => concept(host, id).dataset.label;
  const fontOf = (host: HTMLElement, id: string) => Number(concept(host, id).querySelector("text")?.getAttribute("font-size"));
  const ids = ["merge", "quick", "heap", "bfs", "dfs"];

  it("draws every label at the layout size when the picture is drawn full size", () => {
    const { host, svg } = mount();
    drawAt(svg, 1);
    expect(ids.map((id) => labelOf(host, id))).toEqual(ids.map(() => "shown"));
    expect(fontOf(host, "merge")).toBe(12.5);
  });

  it("keeps a label 11px on screen on a small picture, and culls the ones that collide, keeping their names", () => {
    const { host, svg } = mount();
    drawAt(svg, 0.15);
    expect(fontOf(host, "merge") * 0.15).toBeCloseTo(11);
    const hidden = ids.filter((id) => labelOf(host, id) === "hidden");
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.length).toBeLessThan(ids.length);
    for (const id of hidden) {
      const g = concept(host, id);
      // The dot stays, and the name a screen reader hears is whole.
      expect(g.querySelector("circle[data-dot]")).not.toBeNull();
      expect(g.getAttribute("aria-label")).toMatch(new RegExp(`^${id[0].toUpperCase()}${id.slice(1)}, Learning`));
      expect(g.querySelector("title")?.textContent).toBe(g.getAttribute("aria-label"));
    }
  });

  it("always shows the hovered concept's label, and its full title on the plate", () => {
    const { host, svg } = mount();
    drawAt(svg, 0.15);
    const culled = ids.find((id) => labelOf(host, id) === "hidden") as string;
    expect(culled).toBeDefined();
    enter(concept(host, culled));
    expect(labelOf(host, culled)).toBe("shown");
    expect(svg.querySelector("[data-plate]")?.textContent).toBe(culled[0].toUpperCase() + culled.slice(1));
    leave(concept(host, culled));
    expect(labelOf(host, culled)).toBe("hidden");
  });

  it("hides the lower priority label when a drag piles two concepts together", () => {
    const { host, svg } = mount();
    drawAt(svg, 1);
    expect(labelOf(host, "dfs")).toBe("shown");
    // Drop dfs a few units off bfs: their labels overlap. bfs has a dependant (dfs) and dfs has none.
    const bfs = { x: cxOf(host, "bfs"), y: Number(dotOf(host, "bfs").getAttribute("cy")) };
    const dfs = { x: cxOf(host, "dfs"), y: Number(dotOf(host, "dfs").getAttribute("cy")) };
    dragBy(host, svg, "dfs", bfs.x - dfs.x + 6, bfs.y - dfs.y + 4);
    expect(labelOf(host, "bfs")).toBe("shown");
    expect(labelOf(host, "dfs")).toBe("hidden");
    expect(concept(host, "dfs").getAttribute("aria-label")).toMatch(/^Dfs, Learning/);
  });

  it("gives the concepts a group preview keeps lit their labels first", () => {
    const { host, svg } = mount();
    drawAt(svg, 1);
    // Pile quick (sorting) against dfs (graphs): neither has a dependant, so the lower id, dfs, keeps its label.
    const dfs = { x: cxOf(host, "dfs"), y: Number(dotOf(host, "dfs").getAttribute("cy")) };
    const quick = { x: cxOf(host, "quick"), y: Number(dotOf(host, "quick").getAttribute("cy")) };
    dragBy(host, svg, "quick", dfs.x + 6 - quick.x, dfs.y + 4 - quick.y);
    expect([labelOf(host, "dfs"), labelOf(host, "quick")]).toEqual(["shown", "hidden"]);
    // Lighting the sorting group puts quick first.
    enter(host.querySelector('[data-topic-title="sorting"]') as Element);
    expect([labelOf(host, "dfs"), labelOf(host, "quick")]).toEqual(["hidden", "shown"]);
  });

  // Review of #385: a label's press area is the label's own box, so it never covers another concept's dot.
  it("keeps every label's press area off the other concepts' dots, after a drag too", () => {
    const { host, svg } = mount();
    drawAt(svg, 1);
    // merge renders before dfs; drop it beside and just under dfs, inside the old 112-unit target under dfs's label.
    const dfs = { x: cxOf(host, "dfs"), y: Number(dotOf(host, "dfs").getAttribute("cy")) };
    const merge = { x: cxOf(host, "merge"), y: Number(dotOf(host, "merge").getAttribute("cy")) };
    dragBy(host, svg, "merge", dfs.x + 50 - merge.x, dfs.y + 26 - merge.y);
    expect(labelOf(host, "dfs")).toBe("shown");
    const dots = ids.map((id) => ({ id, x: cxOf(host, id), y: Number(dotOf(host, id).getAttribute("cy")) }));
    for (const id of ids) {
      const rect = concept(host, id).querySelector('rect[data-press="label"]');
      if (rect === null) continue;
      const [x, y, w, h] = ["x", "y", "width", "height"].map((a) => Number(rect.getAttribute(a)));
      for (const d of dots) {
        if (d.id === id) continue;
        expect(d.x >= x && d.x <= x + w && d.y >= y && d.y <= y + h, `${id}'s label covers ${d.id}'s dot`).toBe(false);
      }
    }
  });

  const titleOf = (host: HTMLElement, topic: string) => host.querySelector(`svg [data-topic-title="${topic}"]`) as SVGTextElement;
  /** What a title draws: its own text, not the full title its tooltip carries. */
  const drawnTitle = (el: Element) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("");

  it("draws a topic's title at the layout size full size, and at 11px on screen at the smallest scale", () => {
    const { host, svg } = mount();
    drawAt(svg, 1);
    expect(Number(titleOf(host, "sorting").getAttribute("font-size"))).toBe(12.5);
    drawAt(svg, MIN_DRAW_SCALE);
    for (const topic of ["sorting", "graphs"]) {
      expect(Number(titleOf(host, topic).getAttribute("font-size")) * MIN_DRAW_SCALE).toBeCloseTo(11);
    }
  });

  it("grows a group's title band with its title, leaving its concepts where they are", () => {
    const { host, svg } = mount();
    drawAt(svg, 1);
    const rect = () => host.querySelector('svg [data-group="graphs"] rect') as SVGRectElement;
    const top = Number(rect().getAttribute("y"));
    const cy = Number(dotOf(host, "bfs").getAttribute("cy"));
    drawAt(svg, MIN_DRAW_SCALE);
    expect(Number(rect().getAttribute("y"))).toBeLessThan(top);
    expect(Number(dotOf(host, "bfs").getAttribute("cy"))).toBe(cy);
    // The baseline sits below the band's top by more than the text's ascent, and above the first dot.
    const title = titleOf(host, "graphs");
    const font = Number(title.getAttribute("font-size"));
    expect(Number(title.getAttribute("y")) - font * 0.9).toBeGreaterThan(Number(rect().getAttribute("y")));
    expect(Number(title.getAttribute("y")) + font * 0.28).toBeLessThan(cy - 12);
  });

  it("ends a title too long for its group in an ellipsis on a small picture, the full title kept in its tooltip", () => {
    const { host, svg } = mount(longMap);
    drawAt(svg, 1, longLayout);
    for (const t of longTopics) {
      expect(drawnTitle(titleOf(host, t.slug))).toBe(t.title);
      expect(titleOf(host, t.slug).querySelector("title")?.textContent).toBe(t.title);
    }
    drawAt(svg, MIN_DRAW_SCALE, longLayout);
    let cut = 0;
    for (const t of longTopics) {
      const el = titleOf(host, t.slug);
      const text = drawnTitle(el);
      const rect = host.querySelector(`svg [data-group="${t.slug}"] rect`) as SVGRectElement;
      const font = Number(el.getAttribute("font-size"));
      // Drawn inside the group, whole or cut.
      expect(Number(el.getAttribute("x"))).toBe(Number(rect.getAttribute("x")) + TITLE_INSET);
      expect(Number(el.getAttribute("x")) + textEm(text, true) * font).toBeLessThanOrEqual(Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")));
      if (text !== t.title) {
        cut++;
        expect(text.endsWith("\u2026")).toBe(true);
        expect(t.title.startsWith(text.slice(0, -1))).toBe(true);
      }
      expect(el.querySelector("title")?.textContent).toBe(t.title);
    }
    expect(cut).toBeGreaterThan(0);
    // The list beside the picture names the topic whole.
    expect(host.querySelector('button[data-list-topic="graphs"]')?.textContent).toContain(longTopics[1].title);
  });

  // Review of #409: a title in a wide script is drawn a full em a character, and must still fit its group.
  it("cuts a title in a wide script so it fits its group drawn a full em a character", () => {
    const wide: DomainTopic[] = [
      { slug: "sorting", title: "\u6574\u5217\u3068\u6bd4\u8f03\u30bd\u30fc\u30c8\u306e\u4e0b\u754c", domain: "algorithms" },
      { slug: "graphs", title: "\uadf8\ub798\ud504 \ud0d0\uc0c9\uacfc \ucd5c\ub2e8 \uacbd\ub85c", domain: "algorithms" },
    ];
    const wideLayout = domainLayout(nodes, edges, wide, "algorithms");
    const { host, svg } = mount({ tree: domainTree(nodes, edges, wide), layouts: { algorithms: wideLayout } });
    drawAt(svg, MIN_DRAW_SCALE, wideLayout);
    for (const t of wide) {
      const el = titleOf(host, t.slug);
      const text = drawnTitle(el);
      const rect = host.querySelector(`svg [data-group="${t.slug}"] rect`) as SVGRectElement;
      const font = Number(el.getAttribute("font-size"));
      // Every letter but a space a full em, as the fallback font draws them.
      const drawn = [...text].reduce((w, c) => w + (c === " " ? 0.25 : c === "\u2026" ? 0.64 : 1), 0) * font;
      expect(Number(el.getAttribute("x")) + drawn, `${t.slug}'s title runs past its group`).toBeLessThanOrEqual(
        Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")),
      );
      expect(el.querySelector("title")?.textContent).toBe(t.title);
    }
  });

  it("keeps the hover plate inside the picture, as it does the labels", () => {
    const { host, svg } = mount();
    drawAt(svg, 0.15);
    const view = viewBoxFor(layout, null);
    for (const id of ids) {
      enter(concept(host, id));
      const plate = svg.querySelector("[data-plate] rect") as SVGRectElement;
      const x = Number(plate.getAttribute("x"));
      const w = Number(plate.getAttribute("width"));
      expect(x, `${id}'s plate starts left of the picture`).toBeGreaterThanOrEqual(view.x);
      expect(x + w, `${id}'s plate ends right of the picture`).toBeLessThanOrEqual(view.x + view.width + 1e-9);
      leave(concept(host, id));
    }
  });
});
