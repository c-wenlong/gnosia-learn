// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LearnIndex } from "./LearnIndex";
import type { GraphEdge, GraphNode } from "@/lib/concept-graph";
import { mapLayout } from "@/lib/concept-map";
import { parseFilter, parseScope, parseView, type IndexRow } from "@/lib/learn-index";

// One chain, so a concept's neighbourhood is a smaller box than its island.
const ids = ["alpha", "beta", "gamma", "delta", "epsilon"];
const rows: IndexRow[] = ids.map((id) => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  summary: "",
  bucket: "untouched",
  pL: 0,
  due: null,
  isDue: false,
  dueLabel: "",
  overdue: false,
  lastSeenLabel: "",
  leech: false,
  courseLabel: null,
  courses: [],
  domain: "test",
  ready: false,
}));
const edges: GraphEdge[] = ids.slice(1).map((to, i) => ({ from: ids[i], to, kind: "requires" }) as GraphEdge);
const nodes: GraphNode[] = rows.map((r) => ({ id: r.id, title: r.title, bucket: r.bucket, pL: r.pL, courses: r.courses, domain: r.domain }));
const map = mapLayout(nodes, edges);

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no matchMedia; reduced motion makes every fit land in one frame.
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as typeof window.matchMedia;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/learn");
});

/** The index as the page would draw it for the URL the browser shows now. */
function mountAtUrl() {
  const params = new URLSearchParams(window.location.search);
  const view = parseView(params.get("view"));
  const initial = {
    selected: params.get("concept"),
    view,
    scope: parseScope(params.get("scope"), view),
    filter: parseFilter(params.get("filter")),
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(LearnIndex, { rows, edges, map, initial })));
  act(() => vi.runAllTimers());
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const svg = (host: HTMLElement) => host.querySelector("svg[data-fit]") as SVGSVGElement;
const chip = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

function search(host: HTMLElement, text: string) {
  const input = host.querySelector('input[type="search"], input') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  act(() => vi.runAllTimers());
}

describe("LearnIndex map", () => {
  it("returns from the table to the view the URL names, not to a fit asked for before", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/learn");
    const host = mountAtUrl();

    // On the map, Enter on a search fits the match's neighbourhood.
    search(host, "gamma");
    expect(svg(host).dataset.fit).toBe("neighbourhood");

    // To the table and back: the map comes back on the island the URL now says.
    act(() => chip(host, "Table").click());
    act(() => chip(host, "Graph").click());
    act(() => vi.runAllTimers());
    expect(new URLSearchParams(window.location.search).get("scope")).toBe("island");
    const returned = { fit: svg(host).dataset.fit, viewBox: svg(host).getAttribute("viewBox") };

    // A reload of that URL draws the same thing.
    const fresh = mountAtUrl();
    expect(returned).toEqual({ fit: svg(fresh).dataset.fit, viewBox: svg(fresh).getAttribute("viewBox") });
    expect(returned.fit).toBe("island");

    // A new request on the returned map is still answered.
    search(host, "delta");
    expect(svg(host).dataset.fit).toBe("neighbourhood");
  });
});
