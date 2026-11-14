// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LearnIndex } from "./LearnIndex";
import type { GraphEdge } from "@hermes/tutor/concept-graph";
import { domainLayout, domainTree, type DomainNode, type DomainTopic } from "@/lib/domain-map";
import { parseFilter, parseLayout, parseScope, parseView, type IndexRow } from "@/lib/learn-index";

/**
 * Written before the Path layout (D12 to D16 of docs/proposals/domain-map.md):
 * a third segment beside Groups and Axes, held in the URL as `layout=path`;
 * the topics on one spine in the order they are learnt, each topic's concepts
 * under its node; a topic whose concepts are all mastered folded, one press
 * opening it; the view opening at the first topic with a concept ready to
 * learn; hover, the legend and the list lighting concepts as they do on the
 * groups; edges that leave the line listed beside the node.
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
  { slug: "foundations", title: "Foundations", domain: "algorithms" },
  { slug: "vectors", title: "Vectors", domain: "math" },
];
// id, topic, bucket, ready
const spec: [string, string, IndexRow["bucket"], boolean][] = [
  ["basics", "foundations", "mastered", false],
  ["merge", "sorting", "mastered", false],
  ["quick", "sorting", "learning", false],
  ["heap", "sorting", "untouched", true],
  ["bfs", "graphs", "untouched", true],
  ["dfs", "graphs", "untouched", false],
  ["linalg", "vectors", "learning", false],
];
const rows: IndexRow[] = spec.map(([id, , bucket, ready]) => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  summary: "",
  bucket,
  pL: bucket === "untouched" ? 0 : 0.5,
  due: null,
  isDue: false,
  dueLabel: "",
  overdue: false,
  lastSeenLabel: "",
  leech: false,
  courseLabel: null,
  courses: [],
  domain: null,
  ready,
}));
const edges: GraphEdge[] = [
  { from: "basics", to: "merge", kind: "requires" },
  { from: "merge", to: "quick", kind: "requires" },
  { from: "merge", to: "heap", kind: "requires" },
  { from: "heap", to: "bfs", kind: "requires" },
  { from: "bfs", to: "dfs", kind: "requires" },
  { from: "linalg", to: "heap", kind: "requires" },
];
const nodes: DomainNode[] = rows.map((r, i) => ({ ...r, topic: spec[i][1] }));
const map = {
  tree: domainTree(nodes, edges, topics),
  layouts: { algorithms: domainLayout(nodes, edges, topics, "algorithms"), math: domainLayout(nodes, edges, topics, "math") },
};

const scrolled: Element[] = [];
beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as typeof window.matchMedia;
});
beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/learn");
});

function mount(search = "?domain=algorithms&layout=path") {
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

const spine = (host: HTMLElement) => host.querySelector("ol[data-spine]") as HTMLOListElement | null;
const stops = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>("li[data-spine-node]")];
const stop = (host: HTMLElement, topic: string) => host.querySelector(`li[data-spine-node="${topic}"]`) as HTMLLIElement;
const toggle = (host: HTMLElement, topic: string) => host.querySelector(`button[data-spine-toggle="${topic}"]`) as HTMLButtonElement;
const chip = (host: HTMLElement, id: string) => host.querySelector(`button[data-spine-concept="${id}"]`) as HTMLButtonElement;
const lit = (host: HTMLElement, id: string) => {
  const c = chip(host, id);
  return c.dataset.hover === "true" ? "hover" : c.dataset.related === "true" ? "related" : c.dataset.faded === "true" ? "faded" : "plain";
};
const switcher = (host: HTMLElement) => host.querySelector('[role="radiogroup"][aria-label="Layout"]') as HTMLElement;
const option = (host: HTMLElement, label: string) =>
  [...switcher(host).querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
const enter = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
const leave = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
const url = () => new URLSearchParams(window.location.search);
const legend = (host: HTMLElement, key: string) => host.querySelector(`button[data-legend-chip="${key}"]`) as HTMLButtonElement;

describe("the path layout", () => {
  it("is the third choice of the layout switch, writes layout=path, and swaps the picture for the spine and back", () => {
    const host = mount("?domain=algorithms");
    expect([...switcher(host).querySelectorAll('[role="radio"]')].map((b) => b.textContent?.trim())).toEqual(["Groups", "Axes", "Path"]);
    expect(spine(host)).toBeNull();
    expect(host.querySelector("svg[data-domain-graph]")).not.toBeNull();
    act(() => option(host, "Path").click());
    expect(option(host, "Path").getAttribute("aria-checked")).toBe("true");
    expect(url().get("layout")).toBe("path");
    expect(spine(host)).not.toBeNull();
    expect(host.querySelector("svg[data-domain-graph]")).toBeNull();
    act(() => option(host, "Groups").click());
    expect(url().get("layout")).toBeNull();
    expect(spine(host)).toBeNull();
    expect(host.querySelector("svg[data-domain-graph]")).not.toBeNull();
  });

  it("opens from the URL, follows Back to Groups, and a topic is always groups", () => {
    const host = mount();
    expect(spine(host)).not.toBeNull();
    window.history.replaceState(window.history.state, "", "/learn?domain=algorithms");
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(spine(host)).toBeNull();
    const again = mount("?domain=algorithms&topic=sorting&layout=path");
    expect(spine(again)).toBeNull();
    expect(again.querySelector('[role="radiogroup"][aria-label="Layout"]')).toBeNull();
  });

  it("draws one node per topic in the order they are learnt, each with its concepts in steps", () => {
    const host = mount();
    expect(stops(host).map((s) => s.dataset.spineNode)).toEqual(["foundations", "sorting", "graphs"]);
    const steps = (topic: string) =>
      [...stop(host, topic).querySelectorAll("[data-spine-step]")].map((s) => [...s.querySelectorAll("button[data-spine-concept]")].map((b) => (b as HTMLElement).dataset.spineConcept));
    expect(steps("sorting")).toEqual([["merge"], ["heap", "quick"]]);
    expect(steps("graphs")).toEqual([["bfs"], ["dfs"]]);
    expect(spine(host)?.getAttribute("aria-label")).toBe("Algorithms as a path, 3 topics");
    // The names a screen reader reads carry the mastery and the marks.
    expect(chip(host, "heap").getAttribute("aria-label")).toBe("Heap, Not started, ready to learn");
  });

  it("folds a topic whose concepts are all mastered, and one press opens it and folds it again", () => {
    const host = mount();
    const body = (topic: string) => host.querySelector(`#spine-${topic}`) as HTMLElement;
    expect(stop(host, "foundations").dataset.done).toBe("true");
    expect(toggle(host, "foundations").getAttribute("aria-expanded")).toBe("false");
    // Mounted but shut: not reachable by keyboard or screen reader.
    expect(body("foundations").hasAttribute("inert")).toBe(true);
    expect(toggle(host, "sorting").getAttribute("aria-expanded")).toBe("true");
    expect(body("sorting").hasAttribute("inert")).toBe(false);
    expect(stop(host, "foundations").textContent).toContain("All mastered");

    act(() => toggle(host, "foundations").click());
    expect(toggle(host, "foundations").getAttribute("aria-expanded")).toBe("true");
    expect(body("foundations").hasAttribute("inert")).toBe(false);
    act(() => toggle(host, "foundations").click());
    expect(body("foundations").hasAttribute("inert")).toBe(true);
  });

  it("animates the fold, with motion left out for a reader who asked for less", () => {
    const host = mount();
    const body = host.querySelector("#spine-foundations") as HTMLElement;
    expect(body.className).toContain("transition-[grid-template-rows,opacity]");
    expect(body.className).toContain("motion-reduce:transition-none");
  });

  it("opens scrolled to the first topic with a concept ready to learn, and says which concepts are", () => {
    const host = mount();
    expect(scrolled).toEqual([stop(host, "sorting")]);
    expect(stop(host, "sorting").dataset.frontier).toBe("true");
    expect(stop(host, "graphs").dataset.frontier).toBe("false");
    expect(stop(host, "sorting").textContent).toContain("1 ready to learn");
    expect(chip(host, "heap").dataset.ready).toBe("true");
  });

  it("does not scroll when the first topic is the frontier, or when a concept was asked for", () => {
    const concepts = mount("?domain=algorithms&layout=path&concept=dfs");
    expect(scrolled).toEqual([]);
    // Asked for a concept in a folded topic: it is opened, not hidden.
    const inFolded = mount("?domain=algorithms&layout=path&concept=basics");
    expect(toggle(inFolded, "foundations").getAttribute("aria-expanded")).toBe("true");
    expect(chip(concepts, "dfs").getAttribute("aria-pressed")).toBe("true");
  });

  it("opens a folded topic when one of its concepts is chosen from the list", () => {
    const host = mount();
    expect(toggle(host, "foundations").getAttribute("aria-expanded")).toBe("false");
    const row = host.querySelector('button[data-list-concept="basics"]') as HTMLButtonElement;
    act(() => row.click());
    expect(toggle(host, "foundations").getAttribute("aria-expanded")).toBe("true");
  });

  it("opens the topic again when the already selected concept is chosen from the list after its topic is folded", () => {
    const host = mount("?domain=algorithms&layout=path&concept=merge");
    expect(toggle(host, "sorting").getAttribute("aria-expanded")).toBe("true");
    act(() => toggle(host, "sorting").click());
    expect(toggle(host, "sorting").getAttribute("aria-expanded")).toBe("false");
    const row = host.querySelector('button[data-list-concept="merge"]') as HTMLButtonElement;
    act(() => row.click());
    expect(toggle(host, "sorting").getAttribute("aria-expanded")).toBe("true");
  });

  it("leaves the concepts out of the tab order, since the list beside the path is the keyboard's way in (D7), and keeps the controls in it", () => {
    const host = mount();
    expect(chip(host, "heap").tabIndex).toBe(-1);
    expect(toggle(host, "sorting").tabIndex).toBe(0);
    const outside = host.querySelector('button[data-spine-outside="linalg"]') as HTMLButtonElement;
    expect(outside.tabIndex).toBe(0);
  });

  it("keeps each node clear of the phone header when the view scrolls to it, and of nothing on a wider screen", () => {
    const host = mount();
    expect(stop(host, "sorting").className).toContain("scroll-mt-28");
    expect(stop(host, "sorting").className).toContain("md:scroll-mt-4");
  });

  it("keeps a hovered concept and its neighbours lit and fades the rest, and the list lights them too (D5)", () => {
    const host = mount();
    enter(chip(host, "merge"));
    expect([lit(host, "merge"), lit(host, "quick"), lit(host, "heap"), lit(host, "bfs"), lit(host, "dfs")]).toEqual([
      "hover",
      "related",
      "related",
      "faded",
      "faded",
    ]);
    leave(chip(host, "merge"));
    expect(["merge", "quick", "heap", "bfs", "dfs"].map((id) => lit(host, id))).toEqual(["plain", "plain", "plain", "plain", "plain"]);
    enter(host.querySelector('button[data-list-concept="bfs"]') as Element);
    expect([lit(host, "bfs"), lit(host, "heap"), lit(host, "dfs"), lit(host, "merge")]).toEqual(["hover", "related", "related", "faded"]);
  });

  it("previews a legend chip's group, and a press filters to it (D9)", () => {
    const host = mount();
    enter(legend(host, "ready"));
    expect(["heap", "bfs", "merge", "dfs"].map((id) => lit(host, id))).toEqual(["plain", "plain", "faded", "faded"]);
    leave(legend(host, "ready"));
    expect(lit(host, "merge")).toBe("plain");
    act(() => legend(host, "ready").click());
    expect(url().get("filter")).toBe("ready");
    expect(legend(host, "ready").getAttribute("aria-pressed")).toBe("true");
    // The concepts the filter would hide are dimmed, never removed.
    expect(chip(host, "merge").className).toContain("opacity-40");
    expect(chip(host, "heap").className).not.toContain("opacity-40");
  });

  it("lights a topic's concepts when its title is hovered", () => {
    const host = mount();
    enter(toggle(host, "graphs"));
    expect(["bfs", "dfs", "heap"].map((id) => lit(host, id))).toEqual(["plain", "plain", "faded"]);
    leave(toggle(host, "graphs"));
    expect(lit(host, "heap")).toBe("plain");
  });

  it("lists the edges that leave the line beside the node instead of drawing them (D14)", () => {
    const host = mount();
    // No lines are drawn for edges: the path is HTML and its only SVG is the kit's icons.
    expect(spine(host)?.querySelector("line, path[data-edge], svg[data-domain-graph]")).toBeNull();
    const side = stop(host, "sorting").querySelector("[data-spine-side]") as HTMLElement;
    expect(side.textContent).toBe("Needs Linalg (Math)");
    const outside = side.querySelector('button[data-spine-outside="linalg"]') as HTMLButtonElement;
    // A topic whose prerequisite sits just above it has no label: the line says it.
    expect(stop(host, "graphs").querySelector("[data-spine-side]")).toBeNull();
    // Pressing it goes to that concept, in its own domain.
    act(() => outside.click());
    expect(url().get("domain")).toBe("math");
    expect(url().get("concept")).toBe("linalg");
  });

  it("hides the groups' Positions moved pill and keeps the list beside it", () => {
    window.sessionStorage.setItem("learn-map:moved:algorithms", JSON.stringify({ merge: { x: 5, y: 5 } }));
    const host = mount();
    expect(host.querySelector("[data-moved]")).toBeNull();
    expect(host.querySelector('section[aria-label="Concepts in Algorithms"]')).not.toBeNull();
  });

  it("opens a topic from its node", () => {
    const host = mount();
    const open = [...stop(host, "graphs").querySelectorAll("button")].find((b) => b.textContent === "Open topic") as HTMLButtonElement;
    act(() => open.click());
    expect(url().get("topic")).toBe("graphs");
    expect(spine(host)).toBeNull();
  });
});
