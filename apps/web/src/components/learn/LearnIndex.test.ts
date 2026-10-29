// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DomainMapData } from "@/lib/domain-map";
import type { IndexRow } from "@/lib/learn-index";

import { LearnIndex, MapPanel } from "./LearnIndex";
import type { GraphEdge, GraphNode } from "@/lib/concept-graph";

/**
 * The Learn index's graph card fades a new concept's graph in by mounting it
 * afresh (a key), which takes the node a keyboard user pressed away with the
 * old graph. The concept it chose takes the focus in the new one.
 */

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
  };
});

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function row(id: string, title: string): IndexRow {
  // A cast rather than a typed literal: rows gain fields as the map grows, and this test needs none of them.
  return {
    id,
    title,
    summary: "",
    bucket: "learning",
    pL: 0.4,
    due: null,
    isDue: false,
    dueLabel: "–",
    overdue: false,
    lastSeenLabel: "–",
    leech: false,
    courseLabel: null,
    courses: [],
    domain: "networks",
    ready: false,
  } as IndexRow;
}

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      createElement(LearnIndex, {
        rows: [row("ip", "IP"), row("tcp", "TCP"), row("tls", "TLS")],
        edges: [
          { from: "ip", to: "tcp", kind: "requires" },
          { from: "tcp", to: "tls", kind: "requires" },
        ],
        map: { tree: [], layouts: {} } satisfies DomainMapData,
        initial: { selected: "tcp", view: "table", scope: "neighbourhood", filter: "all", domain: null, topic: null },
      }),
    ),
  );
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const node = (host: HTMLElement, title: string) =>
  [...host.querySelectorAll('svg g[role="button"]')].find((g) => g.getAttribute("aria-label")?.startsWith(`${title},`)) as SVGGElement;

describe("LearnIndex graph card", () => {
  it("fades a newly chosen concept's graph in, and gives the chosen node the focus back", () => {
    const host = mount();
    const before = host.querySelector('svg[aria-label^="Neighbourhood graph of"]');
    expect(before?.getAttribute("aria-label")).toBe("Neighbourhood graph of TCP");

    const tls = node(host, "TLS");
    tls.focus();
    act(() => {
      tls.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    const after = host.querySelector('svg[aria-label^="Neighbourhood graph of"]') as SVGSVGElement;
    expect(after.getAttribute("aria-label")).toBe("Neighbourhood graph of TLS");
    // Mounted afresh, so it fades in.
    expect(before?.isConnected).toBe(false);
    expect(after.parentElement?.classList.contains("animate-fade-in")).toBe(true);
    expect(document.activeElement).toBe(node(host, "TLS"));
    expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not pull the focus into the graph later after the ringed node is pressed again", () => {
    const host = mount();
    const tcp = node(host, "TCP");
    tcp.focus();
    act(() => {
      tcp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const link = [...host.querySelectorAll("table a")].find((a) => a.textContent === "IP") as HTMLAnchorElement;
    act(() => link.focus());
    expect(document.activeElement).toBe(link);
  });

  it("leaves the focus alone when the choice came from outside the graph", () => {
    const host = mount();
    const link = [...host.querySelectorAll("table a")].find((a) => a.textContent === "IP") as HTMLAnchorElement;
    act(() => link.focus());
    expect(document.activeElement).toBe(link);
    expect(host.querySelector('svg[aria-label^="Neighbourhood graph of"]')?.getAttribute("aria-label")).toBe(
      "Neighbourhood graph of IP",
    );
  });
});

describe("LearnIndex table", () => {
  it("says which row the graph shows on that row's title link, not with aria-selected on a plain table row", () => {
    const host = mount();
    const current = () => [...host.querySelectorAll("table a[aria-current]")].map((a) => [a.textContent, a.getAttribute("aria-current")]);
    expect(current()).toEqual([["TCP", "true"]]);
    expect(host.querySelector("tr[aria-selected]")).toBeNull();

    const ip = [...host.querySelectorAll("table a")].find((a) => a.textContent === "IP") as HTMLAnchorElement;
    act(() => ip.focus());
    expect(current()).toEqual([["IP", "true"]]);
  });
});

describe("LearnIndex map details", () => {
  it("moves focus to the newly chosen concept's name after a Needs or Leads to press", () => {
    const node = (id: string, title: string) => ({ id, title, bucket: "learning", pL: 0.4, courses: [], domain: "networks" }) as unknown as GraphNode;
    const nodes = [node("a", "TCP"), node("b", "UDP")];
    const edges: GraphEdge[] = [{ from: "a", to: "b", kind: "requires" }];
    const rows = { a: row("a", "TCP"), b: row("b", "UDP") } as Record<string, IndexRow>;
    function Host() {
      const [focus, setFocus] = useState("a");
      return createElement(MapPanel, { focus: rows[focus], nodes, edges, onPick: setFocus });
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(createElement(Host)));
    mounted.push(() => {
      act(() => root.unmount());
      host.remove();
    });
    const scrolled: string[] = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.textContent ?? "");
    };
    const leadsTo = host.querySelector<HTMLButtonElement>('button[data-concept="b"]')!;
    act(() => leadsTo.focus());
    act(() => leadsTo.click());
    expect(document.activeElement?.tagName).toBe("H3");
    expect(document.activeElement?.textContent).toBe("UDP");
    // And brought into view, since a press near the foot of the panel could leave it above the fold.
    expect(scrolled).toContain("UDP");
  });
});
