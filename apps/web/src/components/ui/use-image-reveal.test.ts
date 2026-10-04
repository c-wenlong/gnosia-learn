// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { useImageReveal } from "./use-image-reveal";

/**
 * A picture that fades in once loaded: hidden until its load, counted as
 * loaded when it was already complete before React was listening, hidden or
 * shown when it fails as the caller asks, and never hidden in the server's
 * HTML.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function Picture({ src, showOnError }: { src: string | null; showOnError?: boolean }) {
  const { attach, onLoad, onError, loaded, className } = useImageReveal(src, { showOnError });
  return createElement("img", {
    ref: attach,
    src: src ?? undefined,
    alt: "A picture",
    onLoad,
    onError,
    className,
    "data-loaded": loaded ? "" : undefined,
  });
}

function mount(src: string | null, showOnError?: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(Picture, { src, showOnError })));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return {
    image: () => host.querySelector("img")!,
    draw: (next: string | null) => act(() => root.render(createElement(Picture, { src: next, showOnError }))),
  };
}

/** Run `fn` with every `<img>` reporting itself complete, at `width` natural pixels. */
function asComplete(width: number, fn: () => void) {
  const proto = HTMLImageElement.prototype;
  const complete = Object.getOwnPropertyDescriptor(proto, "complete");
  const natural = Object.getOwnPropertyDescriptor(proto, "naturalWidth");
  Object.defineProperty(proto, "complete", { configurable: true, get: () => true });
  Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => width });
  try {
    fn();
  } finally {
    if (complete) Object.defineProperty(proto, "complete", complete);
    if (natural) Object.defineProperty(proto, "naturalWidth", natural);
  }
}

describe("useImageReveal", () => {
  it("hides the picture until it loads, then fades it in", () => {
    const { image } = mount("/a.webp");
    expect(image().className).toContain("opacity-0");
    expect(image().className).toContain("motion-reduce:transition-none");
    expect(image().hasAttribute("data-loaded")).toBe(false);
    act(() => image().dispatchEvent(new Event("load")));
    expect(image().className).toContain("opacity-100");
    expect(image().hasAttribute("data-loaded")).toBe(true);
  });

  it("counts a picture complete before onLoad was listening as loaded at once", () => {
    asComplete(120, () => {
      const { image } = mount("/cached.webp");
      expect(image().className).toContain("opacity-100");
      expect(image().hasAttribute("data-loaded")).toBe(true);
    });
  });

  it("keeps a failed picture hidden, before React was listening or after", () => {
    asComplete(0, () => {
      const { image } = mount("/broken-early.webp");
      expect(image().className).toContain("opacity-0");
    });
    const { image } = mount("/broken.webp");
    act(() => image().dispatchEvent(new Event("error")));
    expect(image().className).toContain("opacity-0");
    expect(image().hasAttribute("data-loaded")).toBe(false);
  });

  it("with showOnError shows a failed picture, so its alt text is not hidden", () => {
    asComplete(0, () => {
      const { image } = mount("/broken-early.svg", true);
      expect(image().className).toContain("opacity-100");
    });
    const { image } = mount("/broken.svg", true);
    expect(image().className).toContain("opacity-0");
    act(() => image().dispatchEvent(new Event("error")));
    expect(image().className).toContain("opacity-100");
    expect(image().hasAttribute("data-loaded")).toBe(true);
  });

  it("hides again for a new picture until that one loads", () => {
    const { image, draw } = mount("/one.webp");
    act(() => image().dispatchEvent(new Event("load")));
    draw("/two.webp");
    expect(image().className).toContain("opacity-0");
    expect(image().hasAttribute("data-loaded")).toBe(false);
  });

  it("hides nothing in the server's HTML, though nothing has loaded there", () => {
    const html = renderToString(createElement(Picture, { src: "/a.webp" }));
    expect(html).toContain("opacity-100");
    expect(html).not.toContain("data-loaded");
  });
});

/**
 * The "already complete before onLoad" check is written once, here. A
 * component that writes it again by hand (as the studio's tiles and `FadeImg`
 * each did) drifts: one checked `naturalWidth`, another did not.
 * `DiagramView` keeps its own, for a skeleton with three states; and
 * `use-asset-failure` asks the opposite question, whether a complete picture
 * failed.
 *
 * Only a picture's `complete` counts: one read off an image-named element, or
 * one checked against `naturalWidth`, so a `job.complete` elsewhere is not
 * mistaken for it.
 */
describe("image reveal", () => {
  it("leaves no hand-written complete-before-onLoad check outside use-image-reveal", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const allowed = new Set(["components/ui/use-image-reveal.ts", "components/DiagramView.tsx", "components/use-asset-failure.ts"]);
    const pictureComplete = /\b\w*(?:img|image|picture|poster)\w*\??\.complete\b|\.complete\b[^;]*?\bnaturalWidth\b/i;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && pictureComplete.test(readFileSync(path, "utf8"))) {
          const at = relative(src, path);
          if (!allowed.has(at)) offenders.push(at);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
