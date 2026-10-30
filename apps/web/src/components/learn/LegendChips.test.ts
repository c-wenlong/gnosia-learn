// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LearnIndex } from "./LearnIndex";
import type { GraphEdge } from "@gnosia/tutor/concept-graph";
import { domainLayout, domainTree, type DomainNode, type DomainTopic } from "@/lib/domain-map";
import { parseFilter, type IndexRow } from "@/lib/learn-index";
import type { MasteryBucket } from "@gnosia/tutor/mastery-bucket";

/**
 * Written before the legend chips (D9 of docs/proposals/domain-map.md): a
 * chip over the picture per group, with its count for the domain or the open
 * topic. Hover or focus previews the group the way a topic's title does,
 * leaving the URL alone; a press commits it as the Status filter, and a
 * second press clears it. The chips and the Status menu always agree.
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
const spec: [string, string, MasteryBucket, boolean][] = [
  ["merge", "sorting", "mastered", false],
  ["quick", "sorting", "learning", false],
  ["heap", "sorting", "untouched", true],
  ["bfs", "graphs", "learning", true],
  ["dfs", "graphs", "untouched", false],
];
const rows: IndexRow[] = spec.map(([id, , bucket, ready]) => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  summary: "",
  bucket,
  pL: bucket === "untouched" ? 0 : 0.5,
  due: null,
  isDue: id === "merge",
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
  { from: "merge", to: "quick", kind: "requires" },
  { from: "merge", to: "heap", kind: "requires" },
  { from: "heap", to: "bfs", kind: "requires" },
  { from: "bfs", to: "dfs", kind: "requires" },
];
const nodes: DomainNode[] = rows.map((r, i) => ({ ...r, topic: spec[i][1] }));
const map = { tree: domainTree(nodes, edges, topics), layouts: { algorithms: domainLayout(nodes, edges, topics, "algorithms") } };

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => undefined;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/learn");
});

function mount(search = "?domain=algorithms") {
  window.history.replaceState(null, "", `/learn${search}`);
  const params = new URLSearchParams(search);
  const initial = {
    selected: null,
    view: "graph" as const,
    scope: "neighbourhood" as const,
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

const chip = (host: HTMLElement, key: string) => host.querySelector(`button[data-legend-chip="${key}"]`) as HTMLButtonElement;
const chips = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>("button[data-legend-chip]")];
const pressed = (host: HTMLElement) => chips(host).filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.dataset.legendChip);
const concept = (host: HTMLElement, id: string) => host.querySelector(`svg [data-concept="${id}"]`) as SVGGElement;
const light = (host: HTMLElement, id: string) => {
  const g = concept(host, id);
  return g.dataset.hover === "true" ? "hover" : g.dataset.related === "true" ? "lit" : g.dataset.faded === "true" ? "faded" : "plain";
};
/** Every concept the picture draws, and how it is lit. */
const lights = (host: HTMLElement) =>
  Object.fromEntries(spec.filter(([id]) => concept(host, id) !== null).map(([id]) => [id, light(host, id)]));
const enter = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
const leave = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
const status = (host: HTMLElement) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Status:"))?.textContent?.trim();
const filterInUrl = () => new URLSearchParams(window.location.search).get("filter");

describe("legend chips on a domain's picture", () => {
  it("draws a chip per group above the picture, each with its swatch and its count in the domain", () => {
    const host = mount();
    expect(chips(host).map((c) => [c.dataset.legendChip, c.textContent])).toEqual([
      ["mastered", "Mastered1"],
      ["learning", "Learning2"],
      ["untouched", "Not started2"],
      ["ready", "Ready to learn2"],
    ]);
    // Real buttons, a swatch each that a screen reader does not read twice.
    for (const c of chips(host)) {
      expect(c.type).toBe("button");
      expect(c.querySelector('[aria-hidden="true"]')).not.toBeNull();
      for (const img of c.querySelectorAll('[role="img"]')) expect(img.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(chips(host).map((c) => c.getAttribute("aria-label"))).toEqual(["Mastered, 1", "Learning, 2", "Not started, 2", "Ready to learn, 2"]);
    // Above the picture: the chips come first in the card.
    const svg = host.querySelector("svg[data-domain-graph]") as SVGSVGElement;
    expect(chip(host, "mastered").compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pressed(host)).toEqual([]);
  });

  it("counts only the open topic's concepts when a topic is open", () => {
    const host = mount("?domain=algorithms&topic=graphs");
    expect(chips(host).map((c) => c.textContent)).toEqual(["Mastered0", "Learning1", "Not started1", "Ready to learn1"]);
  });

  it("previews a group on hover, fading the rest, and leaves the URL and the filter alone", () => {
    const host = mount();
    const before = window.location.search;
    enter(chip(host, "learning"));
    expect(lights(host)).toEqual({ merge: "faded", quick: "lit", heap: "faded", bfs: "lit", dfs: "faded" });
    expect(window.location.search).toBe(before);
    expect(pressed(host)).toEqual([]);
    expect(status(host)).toBe("Status: All");
    leave(chip(host, "learning"));
    expect(Object.values(lights(host)).every((l) => l === "plain")).toBe(true);
  });

  it("previews ready to learn across buckets", () => {
    const host = mount();
    enter(chip(host, "ready"));
    expect(lights(host)).toEqual({ merge: "faded", quick: "faded", heap: "lit", bfs: "lit", dfs: "faded" });
  });

  it("previews nothing for an empty group, rather than fading the whole picture", () => {
    const host = mount("?domain=algorithms&topic=graphs");
    enter(chip(host, "mastered"));
    expect(Object.values(lights(host)).every((l) => l === "plain")).toBe(true);
    leave(chip(host, "mastered"));
    act(() => chip(host, "mastered").focus());
    expect(Object.values(lights(host)).every((l) => l === "plain")).toBe(true);
  });

  it("previews on keyboard focus, and restores on blur", () => {
    const host = mount();
    act(() => chip(host, "untouched").focus());
    expect(lights(host)).toEqual({ merge: "faded", quick: "faded", heap: "lit", bfs: "faded", dfs: "lit" });
    act(() => chip(host, "untouched").blur());
    expect(Object.values(lights(host)).every((l) => l === "plain")).toBe(true);
  });

  it("keeps a focused chip's preview when the pointer passes over another chip, and a hovered concept wins while it lasts", () => {
    const host = mount();
    act(() => chip(host, "mastered").focus());
    enter(chip(host, "learning"));
    expect(light(host, "quick")).toBe("lit");
    leave(chip(host, "learning"));
    expect(lights(host)).toEqual({ merge: "lit", quick: "faded", heap: "faded", bfs: "faded", dfs: "faded" });
    enter(concept(host, "dfs"));
    expect(light(host, "dfs")).toBe("hover");
    expect(light(host, "bfs")).toBe("lit");
    leave(concept(host, "dfs"));
    expect(light(host, "merge")).toBe("lit");
  });

  it("commits a group as the Status filter on a press, and clears it on a second press", () => {
    const host = mount();
    enter(chip(host, "learning"));
    act(() => chip(host, "learning").click());
    expect(filterInUrl()).toBe("learning");
    expect(pressed(host)).toEqual(["learning"]);
    expect(status(host)).toBe("Status: Learning");
    // The filter dims what it hides; the preview gives way to it, so nothing is faded on top.
    expect(concept(host, "merge").dataset.dim).toBe("true");
    expect(concept(host, "quick").dataset.dim).toBe("false");
    expect(Object.values(lights(host)).every((l) => l === "plain")).toBe(true);

    act(() => chip(host, "learning").click());
    expect(filterInUrl()).toBeNull();
    expect(pressed(host)).toEqual([]);
    expect(status(host)).toBe("Status: All");
    expect(concept(host, "merge").dataset.dim).toBe("false");
    // Still under the pointer, but the press settled it: nothing previews until the pointer comes back.
    expect(Object.values(lights(host)).every((l) => l === "plain")).toBe(true);
    leave(chip(host, "learning"));
    enter(chip(host, "learning"));
    expect(light(host, "merge")).toBe("faded");
  });

  it("moves the press from one chip to another", () => {
    const host = mount();
    act(() => chip(host, "mastered").click());
    act(() => chip(host, "ready").click());
    expect(filterInUrl()).toBe("ready");
    expect(pressed(host)).toEqual(["ready"]);
  });

  it("agrees with the Status menu: a group chosen there shows its chip pressed, any other filter none", () => {
    expect(pressed(mount("?domain=algorithms&filter=ready"))).toEqual(["ready"]);
    expect(pressed(mount("?domain=algorithms&filter=untouched"))).toEqual(["untouched"]);
    expect(pressed(mount("?domain=algorithms&filter=due"))).toEqual([]);

    const host = mount();
    const menu = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Status:")) as HTMLButtonElement;
    act(() => menu.click());
    const option = (value: string) => host.querySelector(`[role="option"][data-value="${value}"]`) as HTMLElement;
    act(() => option("mastered").click());
    expect(pressed(host)).toEqual(["mastered"]);
    act(() => menu.click());
    act(() => option("leeches").click());
    expect(pressed(host)).toEqual([]);
    expect(filterInUrl()).toBe("leeches");
  });
});
