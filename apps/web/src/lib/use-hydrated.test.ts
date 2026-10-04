// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "@/components/ui/use-media-query";

import { useHydrated } from "./use-hydrated";
import { usePageVisible } from "./use-page-visible";

/**
 * The three small hooks over browser state: whether the page has hydrated,
 * whether its tab is showing, and whether a media query matches. Each gives
 * the server's answer on the server and while hydrating, then the browser's.
 */

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const roots: Array<() => void> = [];
afterEach(() => {
  while (roots.length) roots.pop()?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(element: ReactElement): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(element));
  roots.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

function Hydrated(): ReactElement {
  return createElement("span", null, useHydrated() ? "browser" : "server");
}

function Visible(): ReactElement {
  return createElement("span", null, usePageVisible() ? "shown" : "hidden");
}

function Wide({ query, server }: { query: string; server: boolean }): ReactElement {
  return createElement("span", null, useMediaQuery(query, server) ? "wide" : "narrow");
}

/** A `matchMedia` whose answer a test can change, telling every listener. */
function fakeMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_: "change", listener: () => void) => listeners.add(listener),
    removeEventListener: (_: "change", listener: () => void) => listeners.delete(listener),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    listeners,
    set(next: boolean) {
      matches = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

describe("useHydrated", () => {
  it("is false on the server, and while the browser matches the server's HTML", () => {
    const html = renderToString(createElement(Hydrated));
    expect(html).toBe("<span>server</span>");
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let root: Root | undefined;
    act(() => {
      root = hydrateRoot(container, createElement(Hydrated));
    });
    // Hydrated without a mismatch, then rendered again as the browser's.
    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toBe("browser");
    act(() => root?.unmount());
    container.remove();
  });

  it("is true at once for something mounted after the page hydrated", () => {
    expect(mount(createElement(Hydrated)).textContent).toBe("browser");
  });
});

describe("usePageVisible", () => {
  it("is shown on the server", () => expect(renderToString(createElement(Visible))).toBe("<span>shown</span>"));

  it("follows the tab as it is hidden and shown again", () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const container = mount(createElement(Visible));
    expect(container.textContent).toBe("shown");
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(container.textContent).toBe("hidden");
    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(container.textContent).toBe("shown");
  });
});

describe("useMediaQuery", () => {
  it("gives the server's value on the server", () => {
    expect(renderToString(createElement(Wide, { query: "(min-width: 900px)", server: false }))).toBe("<span>narrow</span>");
    expect(renderToString(createElement(Wide, { query: "(min-width: 900px)", server: true }))).toBe("<span>wide</span>");
  });

  it("answers from matchMedia in the browser and follows a change", () => {
    const media = fakeMedia(true);
    const container = mount(createElement(Wide, { query: "(min-width: 1280px)", server: false }));
    expect(media.matchMedia).toHaveBeenCalledWith("(min-width: 1280px)");
    expect(container.textContent).toBe("wide");
    media.set(false);
    expect(container.textContent).toBe("narrow");
  });

  it("stops listening when unmounted", () => {
    const media = fakeMedia(false);
    mount(createElement(Wide, { query: "(min-width: 900px)", server: false }));
    expect(media.listeners.size).toBe(1);
    roots.pop()?.();
    expect(media.listeners.size).toBe(0);
  });

  it("keeps the server's value where there is no matchMedia, rather than throwing", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(mount(createElement(Wide, { query: "(min-width: 900px)", server: true })).textContent).toBe("wide");
  });
});
