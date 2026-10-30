// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LearnIndex } from "./LearnIndex";
import type { GraphEdge } from "@gnosia/tutor/concept-graph";
import { domainLayout, domainTree, type DomainNode, type DomainTopic } from "@/lib/domain-map";
import { viewBoxFor } from "@/lib/domain-view";
import { parseFilter, parseScope, parseView, type IndexRow } from "@/lib/learn-index";

/**
 * Written before the domain views (phase 2 of docs/proposals/domain-map.md,
 * D2, D4 and D8): the cards, a domain, a topic, the breadcrumb and Back, a
 * pick that crosses domains, and search and filters on both levels.
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
  { slug: "vectors", title: "Vectors", domain: "foundations" },
];
const spec: [string, string, DomainNode["bucket"]][] = [
  ["merge", "sorting", "mastered"],
  ["quick", "sorting", "learning"],
  ["bfs", "graphs", "untouched"],
  ["dot", "vectors", "learning"],
];
const rows: IndexRow[] = spec.map(([id, , bucket]) => ({
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
  ready: false,
}));
const edges: GraphEdge[] = [
  { from: "merge", to: "quick", kind: "requires" },
  { from: "merge", to: "bfs", kind: "requires" },
  { from: "dot", to: "quick", kind: "assumes" },
];
const nodes: DomainNode[] = rows.map((r, i) => ({ ...r, topic: spec[i][1] }));
const tree = domainTree(nodes, edges, topics);
const map = { tree, layouts: Object.fromEntries(tree.map((d) => [d.slug, domainLayout(nodes, edges, topics, d.slug)])) };

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => undefined;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  window.history.replaceState(null, "", "/learn");
});

/** The index as the page would draw it for the URL the browser shows now. */
function mountAtUrl() {
  const params = new URLSearchParams(window.location.search);
  const initial = {
    selected: params.get("concept"),
    view: parseView(params.get("view")),
    scope: parseScope(params.get("scope")),
    filter: parseFilter(params.get("filter")),
    domain: params.get("domain"),
    topic: params.get("topic"),
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

const url = () => new URLSearchParams(window.location.search);
const cards = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>("[data-domain-card]")];
const graph = (host: HTMLElement) => host.querySelector<SVGSVGElement>("svg[data-domain-graph]");
const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
const crumbs = (host: HTMLElement) =>
  [...host.querySelectorAll('nav[aria-label="Breadcrumb"] li')].map((li) => li.textContent?.trim());

function type(host: HTMLElement, text: string, enter = false) {
  const input = host.querySelector("input") as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (enter) act(() => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
}

describe("LearnIndex by domain", () => {
  it("opens on one card per domain, studied first, with no graph", () => {
    const host = mountAtUrl();
    expect(cards(host).map((c) => c.dataset.domainCard)).toEqual(["algorithms", "foundations"]);
    expect(cards(host)[0].textContent).toContain("Algorithms");
    expect(cards(host)[0].textContent).toContain("3 concepts");
    expect(cards(host)[0].textContent).toContain("2 topics");
    // The bar's spoken counts name the buckets as the chips do.
    expect(cards(host)[0].querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("1 mastered, 1 learning, 1 not started");
    expect(graph(host)).toBeNull();
  });

  it("opens a domain from its card: its concepts only, in the URL and the breadcrumb", () => {
    const host = mountAtUrl();
    act(() => cards(host)[0].click());
    expect(url().get("domain")).toBe("algorithms");
    const svg = graph(host) as SVGSVGElement;
    expect(svg.getAttribute("aria-label")).toBe("Algorithms map, 3 concepts in 2 topics");
    expect([...svg.querySelectorAll("[data-concept]")].map((g) => g.getAttribute("data-concept")).sort()).toEqual(["bfs", "merge", "quick"]);
    expect(crumbs(host)).toEqual(["Learn", "Algorithms"]);
    // D4: the edge from another domain is listed, not drawn.
    expect(svg.querySelectorAll("[data-edge]")).toHaveLength(2);
    expect(host.querySelector("[data-outside]")?.textContent).toContain("Foundations");
  });

  it("narrows to a topic and back up through the breadcrumb", () => {
    window.history.replaceState(null, "", "/learn?domain=algorithms");
    const host = mountAtUrl();
    const title = host.querySelector<HTMLElement>('[data-topic-title="sorting"]') as HTMLElement;
    act(() => title.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(url().get("topic")).toBe("sorting");
    expect(crumbs(host)).toEqual(["Learn", "Algorithms", "Sorting"]);
    const box = viewBoxFor(map.layouts.algorithms, "sorting");
    expect((graph(host) as SVGSVGElement).getAttribute("viewBox")).toBe(`${box.x} ${box.y} ${box.width} ${box.height}`);
    // The other topic's concepts are not in the topic's view.
    expect(graph(host)?.querySelector('[data-concept="bfs"]')).toBeNull();

    act(() => button(host, "Algorithms").click());
    expect(url().get("topic")).toBeNull();
    expect(graph(host)?.querySelector('[data-concept="bfs"]')).not.toBeNull();
    act(() => button(host, "Learn").click());
    expect(url().get("domain")).toBeNull();
    expect(cards(host)).toHaveLength(2);
  });

  it("follows Back and Forward through the levels", () => {
    const host = mountAtUrl();
    act(() => cards(host)[0].click());
    window.history.replaceState(window.history.state, "", "/learn");
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(graph(host)).toBeNull();
    window.history.replaceState(window.history.state, "", "/learn?domain=foundations");
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(graph(host)?.getAttribute("aria-label")).toBe("Foundations map, 1 concept in 1 topic");
  });

  it("selects a concept on the graph, and a pick in the panel crosses into its domain", () => {
    window.history.replaceState(null, "", "/learn?domain=algorithms");
    const host = mountAtUrl();
    const quick = graph(host)?.querySelector('[data-concept="quick"]') as SVGGElement;
    act(() => quick.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(quick.getAttribute("aria-pressed")).toBe("true");
    expect(url().get("concept")).toBe("quick");
    const panel = host.querySelector('section[aria-label="Concept details"]') as HTMLElement;
    const dot = panel.querySelector<HTMLButtonElement>('button[data-concept="dot"]') as HTMLButtonElement;
    // The prerequisite in another domain says which.
    expect(dot.textContent).toContain("Foundations");
    act(() => dot.click());
    expect(url().get("domain")).toBe("foundations");
    expect(url().get("concept")).toBe("dot");
    expect(graph(host)?.querySelector('[data-concept="dot"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("lets go of a selection the URL names outside the domain it opens", () => {
    window.history.replaceState(null, "", "/learn?domain=foundations&concept=merge");
    const host = mountAtUrl();
    expect(graph(host)?.getAttribute("aria-label")).toMatch(/^Foundations map/);
    expect(host.querySelector('section[aria-label="Concept details"] h3')).toBeNull();
    expect(url().get("concept")).toBeNull();
  });

  it("moves the focus to the new concept's name after a pick that crosses domains", () => {
    window.history.replaceState(null, "", "/learn?domain=algorithms&concept=quick");
    const host = mountAtUrl();
    const dot = host.querySelector<HTMLButtonElement>('section[aria-label="Concept details"] button[data-concept="dot"]') as HTMLButtonElement;
    act(() => dot.focus());
    act(() => dot.click());
    expect(document.activeElement?.tagName).toBe("H3");
    expect(document.activeElement?.textContent).toBe("Dot");
    // Served once: moving on from there does not pull the focus back to a panel.
    const crumb = [...host.querySelectorAll('nav[aria-label="Breadcrumb"] button')].find((b) => b.textContent === "Learn") as HTMLButtonElement;
    act(() => crumb.click());
    act(() => cards(host)[1].focus());
    act(() => cards(host)[1].click());
    expect(document.activeElement?.tagName).not.toBe("H3");
  });

  it("leaves the topic titles in the picture to the pointer; the list's buttons are the keyboard's", () => {
    window.history.replaceState(null, "", "/learn?domain=algorithms");
    const host = mountAtUrl();
    const title = host.querySelector('[data-topic-title="sorting"]') as Element;
    expect(title.getAttribute("role")).toBeNull();
    expect(title.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelector('button[data-list-topic="sorting"]')).not.toBeNull();
  });

  it("opens a concept's domain when the URL names only the concept", () => {
    window.history.replaceState(null, "", "/learn?concept=bfs");
    const host = mountAtUrl();
    expect(graph(host)?.getAttribute("aria-label")).toMatch(/^Algorithms map/);
    expect(url().get("domain")).toBe("algorithms");
  });

  it("counts search matches per domain on the cards, and Enter opens the best one in its domain", () => {
    const host = mountAtUrl();
    type(host, "dot");
    const [algorithms, foundations] = cards(host);
    expect(algorithms.dataset.dim).toBe("true");
    expect(foundations.dataset.dim).toBe("false");
    expect(foundations.textContent).toContain("1 match");
    type(host, "dot", true);
    expect(url().get("domain")).toBe("foundations");
    expect(url().get("concept")).toBe("dot");
  });

  it("dims the concepts a filter hides inside a domain", () => {
    window.history.replaceState(null, "", "/learn?domain=algorithms&filter=mastered");
    const host = mountAtUrl();
    const dim = (id: string) => graph(host)?.querySelector(`[data-concept="${id}"]`)?.getAttribute("data-dim");
    expect(dim("merge")).toBe("false");
    expect(dim("quick")).toBe("true");
  });

  it("lists the domain's topics and concepts beside the graph, a press selecting", () => {
    window.history.replaceState(null, "", "/learn?domain=algorithms");
    const host = mountAtUrl();
    const list = host.querySelector('[aria-label="Concepts in Algorithms"]') as HTMLElement;
    expect([...list.querySelectorAll("[data-list-concept]")].map((b) => b.getAttribute("data-list-concept"))).toEqual([
      "merge",
      "quick",
      "bfs",
    ]);
    act(() => (list.querySelector('[data-list-concept="bfs"]') as HTMLButtonElement).click());
    expect(url().get("concept")).toBe("bfs");
  });
});
