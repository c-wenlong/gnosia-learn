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
  // jsdom does not lay out, so it has no scrollIntoView; the panel calls it on a pick.
  Element.prototype.scrollIntoView = () => undefined;
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

/** Search and press Enter; `settle` runs the timers (and so the fake clock) on. */
function search(host: HTMLElement, text: string, settle = true) {
  const input = host.querySelector('input[type="search"], input') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  if (settle) act(() => vi.runAllTimers());
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

  it("does not replay a center asked for from the panel when the map comes back", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/learn");
    const host = mountAtUrl();

    // The panel for gamma lists delta under "Leads to"; picking it centres the map on it.
    search(host, "gamma");
    const pick = host.querySelector('section[aria-label="Concept details"] button[data-concept="delta"]') as HTMLButtonElement;
    act(() => pick.click());
    act(() => vi.runAllTimers());
    expect(svg(host).dataset.fit).toBe("");

    act(() => chip(host, "Table").click());
    act(() => chip(host, "Graph").click());
    act(() => vi.runAllTimers());
    const returned = { fit: svg(host).dataset.fit, viewBox: svg(host).getAttribute("viewBox") };
    const fresh = mountAtUrl();
    expect(returned).toEqual({ fit: svg(fresh).dataset.fit, viewBox: svg(fresh).getAttribute("viewBox") });
    expect(returned.fit).toBe("island");
  });

  it("answers two requests made in the same millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
    window.history.replaceState(null, "", "/learn");
    const host = mountAtUrl();

    // The clock does not move between the two, so both requests have one `n`.
    search(host, "gamma", false);
    search(host, "alpha", false);
    act(() => vi.runAllTimers());
    const answered = svg(host).getAttribute("viewBox");
    window.history.replaceState(null, "", "/learn");
    const direct = mountAtUrl();
    search(direct, "alpha");
    expect(answered).toBe(svg(direct).getAttribute("viewBox"));
  });
});
