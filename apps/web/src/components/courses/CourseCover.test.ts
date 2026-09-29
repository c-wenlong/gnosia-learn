// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { CourseCover } from "./CourseCover";

// A course card's cover and its fallback: a cover the route cannot serve (a
// deployment that reads the database but not the blob store) shows the same
// code placeholder a course with no cover shows, not a broken image.

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(element: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return {
    host,
    rerender: (next: ReactElement) => act(() => root.render(next)),
  };
}

const SRC = "/api/courses/cs2111/cover?v=a12ffbe45db30050";

/** The image's URL, path and query: `next/image` sets `src` again once mounted, which makes it absolute. */
const srcOf = (host: HTMLElement) => {
  const url = new URL(host.querySelector("img")?.getAttribute("src") ?? "", window.location.href);
  return `${url.pathname}${url.search}`;
};

describe("CourseCover", () => {
  it("shows the photo from the cover route, filling its frame, straight from the route", () => {
    const { host } = mount(createElement(CourseCover, { src: SRC, code: "CS2111" }));
    const img = host.querySelector("img") as HTMLImageElement;
    // Unoptimized: the browser asks the route itself, with the session cookie.
    expect(srcOf(host)).toBe(SRC);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.className).toContain("object-cover");
    expect(host.textContent).toBe("");
  });

  it("draws the code placeholder for a course with no cover", () => {
    const { host } = mount(createElement(CourseCover, { src: null, code: "CS2111" }));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe("CS2111");
  });

  it("falls back to the same placeholder, filling the same frame, when the photo fails to load", () => {
    const { host } = mount(createElement(CourseCover, { src: SRC, code: "CS2111" }));
    const img = host.querySelector("img") as HTMLImageElement;
    act(() => img.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe("CS2111");
    // Full height of the parent's 16:9 frame, as the photo was: nothing moves.
    expect((host.firstElementChild as HTMLElement).style.height).toBe("100%");
  });

  it("gives a new cover its own try after an old one failed", () => {
    const { host, rerender } = mount(createElement(CourseCover, { src: SRC, code: "CS2111" }));
    act(() => (host.querySelector("img") as HTMLImageElement).dispatchEvent(new Event("error")));
    const next = "/api/courses/cs2111/cover?v=0123456789abcdef";
    rerender(createElement(CourseCover, { src: next, code: "CS2111" }));
    expect(srcOf(host)).toBe(next);
  });
});
