// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyMotionToDocument,
  asMotionMode,
  MOTION_COOKIE,
  motionAttribute,
  prefersReducedMotion,
  readMotionCookie,
  scrollBehavior,
  writeMotionCookie,
} from "@/lib/motion";

afterEach(() => {
  delete document.documentElement.dataset.motion;
  document.cookie = `${MOTION_COOKIE}=; Path=/; Max-Age=0`;
});

describe("the motion cookie", () => {
  it("reads only a mode it knows, and null for anything else", () => {
    expect(asMotionMode("always")).toBe("always");
    expect(asMotionMode("system")).toBe("system");
    expect(asMotionMode("never")).toBeNull();
    expect(asMotionMode(undefined)).toBeNull();
  });

  it("puts data-motion=reduce on the page for always, and nothing for system", () => {
    expect(motionAttribute("always")).toBe("reduce");
    expect(motionAttribute("system")).toBeUndefined();
    expect(motionAttribute(null)).toBeUndefined();
    applyMotionToDocument("always");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    applyMotionToDocument("system");
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
  });

  it("writes a cookie it can read back, and finds it among others", () => {
    expect(readMotionCookie()).toBeNull();
    writeMotionCookie("always");
    expect(readMotionCookie()).toBe("always");
    expect(readMotionCookie(`a=1; ${MOTION_COOKIE}=system; b=2`)).toBe("system");
    expect(readMotionCookie(`${MOTION_COOKIE}=sometimes`)).toBeNull();
  });
});

describe("prefersReducedMotion", () => {
  const media = (matches: boolean) => () => ({ matches });

  it("is true when the device asks for less, or Settings says always, and false otherwise", () => {
    expect(prefersReducedMotion({ matchMedia: media(true), root: { dataset: {} } })).toBe(true);
    expect(prefersReducedMotion({ matchMedia: media(false), root: { dataset: { motion: "reduce" } } })).toBe(true);
    expect(prefersReducedMotion({ matchMedia: media(false), root: { dataset: {} } })).toBe(false);
  });

  it("is false with no window to ask, and reads the page's own attribute by default", () => {
    expect(prefersReducedMotion({})).toBe(false);
    expect(prefersReducedMotion()).toBe(false);
    document.documentElement.dataset.motion = "reduce";
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe("globals.css", () => {
  it("reads data-motion beside the media query, in the variants and in the global rule", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"), "utf8");
    // Tailwind's own motion-reduce: and motion-safe: read only the device.
    expect(css).toMatch(/@custom-variant motion-reduce \{[^]*?\[data-motion="reduce"\]/);
    expect(css).toMatch(/@custom-variant motion-safe \{[^]*?:not\(\[data-motion="reduce"\]\)/);
    // The safety net that finishes every transition and animation at once.
    expect(css).toMatch(/:root\[data-motion="reduce"\] \*,[^{]*\{[^}]*transition-duration: 0\.01ms !important/);
  });
});

describe("scrollBehavior", () => {
  afterEach(() => {
    delete document.documentElement.dataset.motion;
  });

  afterEach(() => vi.unstubAllGlobals());

  const device = (reduce: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)", media: query }));

  it("glides unless Settings asks for stillness", () => {
    device(false);
    expect(scrollBehavior()).toBe("smooth");
    document.documentElement.dataset.motion = "reduce";
    expect(scrollBehavior()).toBe("auto");
  });

  it("jumps when the device asks for less movement", () => {
    device(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("glides where there is no media query to ask", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });
});

describe("one place asks whether to keep still", () => {
  it("leaves no script reading the device's setting alone, which would ignore Settings' Always", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join, relative } = await import("node:path");
    const src = join(dirname(fileURLToPath(import.meta.url)), "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const text = readFileSync(path, "utf8");
          const rel = relative(src, path);
          // The query as a string anywhere, so one kept in a variable is caught too.
          if (rel !== join("lib", "motion.ts") && /["'`]\(\s*prefers-reduced-motion/.test(text)) offenders.push(rel);
          if (/behavior:\s*["']smooth["']/.test(text)) offenders.push(`${rel} (a hard-coded smooth scroll; use scrollBehavior())`);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
