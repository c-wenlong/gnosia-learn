// @vitest-environment jsdom
import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FOLD_MS } from "./motion";
import { Arrive, FadeImg, Reveal } from "./motion-parts";

// Children go as arguments, as the lint rule wants; the props types require
// them, hence the casts.

/**
 * The studio's motion pieces: a fold that keeps its content while it shuts
 * and then lets it go, an arrival decided once at mount, and a picture that
 * fades in once it has loaded, cached or not.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.useRealTimers();
});

function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, draw: (next: ReactNode) => act(() => root.render(next)) };
}

describe("Reveal", () => {
  const fold = (open: boolean) => createElement(Reveal, { open } as ComponentProps<typeof Reveal>, createElement("button", { type: "button" }, "Draw"));

  it("draws nothing while shut, and its content as it opens", () => {
    const { host, draw } = mount(fold(false));
    expect(host.querySelector("button")).toBeNull();
    draw(fold(true));
    expect(host.querySelector("button")).not.toBeNull();
    expect(host.firstElementChild!.hasAttribute("inert")).toBe(false);
  });

  it("keeps its content, inert, while it folds shut, and drops it once folded", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { host, draw } = mount(fold(true));
    draw(fold(false));
    // Folding: still drawn, so it shuts with its content, and out of reach.
    expect(host.querySelector("button")).not.toBeNull();
    expect(host.firstElementChild!.hasAttribute("inert")).toBe(true);
    expect(host.firstElementChild!.className).toContain("grid-rows-[0fr]");
    act(() => vi.advanceTimersByTime(FOLD_MS));
    expect(host.querySelector("button")).toBeNull();
  });

  it("drops its content at once when motion is reduced", () => {
    document.documentElement.dataset.motion = "reduce";
    try {
      const { host, draw } = mount(fold(true));
      draw(fold(false));
      expect(host.querySelector("button")).toBeNull();
    } finally {
      delete document.documentElement.dataset.motion;
    }
  });

  it("keeps its content when it opens again mid-fold", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { host, draw } = mount(fold(true));
    draw(fold(false));
    draw(fold(true));
    act(() => vi.advanceTimersByTime(FOLD_MS));
    expect(host.querySelector("button")).not.toBeNull();
    expect(host.firstElementChild!.hasAttribute("inert")).toBe(false);
  });
});

describe("Arrive", () => {
  it("decides at mount: turning it on later does not start an animation on what is already there", () => {
    const box = (animate: boolean) => createElement(Arrive, { animate } as ComponentProps<typeof Arrive>, "a reply");
    const { host, draw } = mount(box(false));
    draw(box(true));
    expect(host.firstElementChild!.className).not.toContain("animate-enter");
  });

  it("animates what mounts with it on, and honours reduced motion", () => {
    const { host } = mount(createElement(Arrive, { animate: true } as ComponentProps<typeof Arrive>, "a reply"));
    expect(host.firstElementChild!.className).toContain("animate-enter");
    expect(host.firstElementChild!.className).toContain("motion-reduce:animate-none");
  });
});

describe("FadeImg", () => {
  it("is transparent until its picture loads, then fades in", () => {
    const { host } = mount(createElement(FadeImg, { src: "/a.svg", alt: "A" }));
    const image = host.querySelector("img")!;
    expect(image.className).toContain("opacity-0");
    act(() => image.dispatchEvent(new Event("load")));
    expect(image.className).toContain("opacity-100");
    expect(image.hasAttribute("data-loaded")).toBe(true);
  });

  it("shows a picture the browser already had, whose load fired before React was listening", () => {
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
    const width = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
    Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 120 });
    try {
      const { host } = mount(createElement(FadeImg, { src: "/cached.svg", alt: "" }));
      expect(host.querySelector("img")!.className).toContain("opacity-100");
    } finally {
      if (complete) Object.defineProperty(HTMLImageElement.prototype, "complete", complete);
      if (width) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", width);
    }
  });

  it("shows a picture that failed, so its alt text is not hidden, and still tells the caller", () => {
    const onError = vi.fn();
    const { host } = mount(createElement(FadeImg, { src: "/missing.svg", alt: "Missing", onError }));
    const image = host.querySelector("img")!;
    act(() => image.dispatchEvent(new Event("error")));
    expect(image.className).toContain("opacity-100");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("is transparent from the server's HTML on, unlike a cover, which hides nothing there", () => {
    const html = renderToString(createElement(FadeImg, { src: "/a.svg", alt: "A" }));
    expect(html).toContain("opacity-0");
    expect(html).not.toContain("data-loaded");
  });

  it("goes transparent again for a new picture until that one loads", () => {
    const { host, draw } = mount(createElement(FadeImg, { src: "/one.svg", alt: "" }));
    act(() => host.querySelector("img")!.dispatchEvent(new Event("load")));
    draw(createElement(FadeImg, { src: "/two.svg", alt: "" }));
    expect(host.querySelector("img")!.className).toContain("opacity-0");
  });
});
