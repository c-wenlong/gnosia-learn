// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { prefersReducedMotion, scrollBehavior } from "./reduced-motion";

afterEach(() => vi.unstubAllGlobals());

function reduce(on: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: on && query === "(prefers-reduced-motion: reduce)", media: query }));
}

describe("reduced motion for scripted scrolling", () => {
  it("glides when the reader has not asked for less movement", () => {
    reduce(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });

  it("jumps when they have", () => {
    reduce(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("glides where there is no media query to ask", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });
});
