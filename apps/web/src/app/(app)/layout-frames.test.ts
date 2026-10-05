import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/**
 * A page and the frames around it choose the same shell width
 * (`data-layout`, the table in `components/AppShell.tsx`).
 *
 * The shell reads the width off whatever is on screen, so a loading frame, an
 * error or a 404 in a different mode from its page changes the shell under
 * the learner as one replaces the other: the sidebar drawn for a beat and
 * taken away (a focus page loading in the `app` frame), the shell switching
 * to the viewport's height (the workspace loading as `app`), or the gutters
 * jumping (a page with no `data-layout` at all, in the legacy 48rem mode,
 * after the `app` frame).
 *
 * The rule for a page: every `loading.tsx` on its path below `(app)` draws
 * the page's own mode, since a dynamic route is prefetched as far as the
 * first loading boundary on its path and that is the frame that shows; and a
 * page in any mode but `app` has one, since `(app)/loading.tsx` is `app`.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

function* pages(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* pages(full);
    else if (entry.name === "page.tsx") yield full;
  }
}

/** The mode a file's first `data-layout` names: a page's main return comes before its fallbacks. */
function pageLayout(file: string): string | null {
  return /data-layout="([a-z]+)"/.exec(readFileSync(file, "utf8"))?.[1] ?? null;
}

/** The mode a `loading.tsx` draws: `PageLoading`'s `layout`, `app` by default; the studio's are `full`. */
function loadingLayout(file: string): string {
  const text = readFileSync(file, "utf8");
  if (/\bStudio(Grid|Canvas)Loading\b/.test(text)) return "full";
  return /<PageLoading\b[^>]*\blayout="([a-z]+)"/.exec(text)?.[1] ?? "app";
}

/** The `loading.tsx` files from a page's directory up to, not including, `(app)/`. */
function loadingsAbove(page: string): string[] {
  const found: string[] = [];
  for (let dir = path.dirname(page); dir !== HERE; dir = path.dirname(dir)) {
    const loading = path.join(dir, "loading.tsx");
    if (existsSync(loading)) found.push(loading);
  }
  return found;
}

const rel = (file: string) => path.relative(HERE, file);

describe("layout frames", () => {
  it("gives every page under the shell a data-layout", () => {
    const bare = [...pages(HERE)].filter((page) => pageLayout(page) === null).map(rel);
    expect(bare).toEqual([]);
  });

  it("keeps a page's fallbacks in its own mode, so the frame before them matches too", () => {
    // A fallback (the database unreachable, say) replaces the same loading
    // frame the page does; in another mode the shell would jump as it lands.
    const mixed: string[] = [];
    for (const page of pages(HERE)) {
      const modes = new Set([...readFileSync(page, "utf8").matchAll(/data-layout="([a-z]+)"/g)].map((m) => m[1]));
      if (modes.size > 1) mixed.push(`${rel(page)}: ${[...modes].join(", ")}`);
    }
    expect(mixed).toEqual([]);
  });

  it("loads every page in its own mode", () => {
    const wrong: string[] = [];
    for (const page of pages(HERE)) {
      const layout = pageLayout(page);
      if (layout === null) continue;
      const loadings = loadingsAbove(page);
      for (const loading of loadings) {
        if (loadingLayout(loading) !== layout) wrong.push(`${rel(page)} is ${layout}, ${rel(loading)} is ${loadingLayout(loading)}`);
      }
      if (loadings.length === 0 && layout !== "app") wrong.push(`${rel(page)} is ${layout} and loads in the app frame`);
    }
    expect(wrong).toEqual([]);
  });

  it("keeps the concept workspace's frame off the session below it", () => {
    // The workspace's frame wraps its page alone, in a group, so a session
    // opened from anywhere else shows its focus frame and not three panels.
    expect(existsSync(path.join(HERE, "learn/[concept]/loading.tsx"))).toBe(false);
    expect(loadingLayout(path.join(HERE, "learn/[concept]/(workspace)/loading.tsx"))).toBe("workspace");
    expect(loadingLayout(path.join(HERE, "learn/[concept]/session/loading.tsx"))).toBe("focus");
  });

  it("draws the error boundary and the shell's 404 as app pages", () => {
    for (const file of ["error.tsx", "not-found.tsx"]) {
      expect(pageLayout(path.join(HERE, file)), file).toBe("app");
    }
  });
});

describe("the shell's 404", () => {
  it("says what the root 404 says, inside the shell", async () => {
    const [{ default: AppNotFound }, { default: RootNotFound }] = await Promise.all([
      import("./not-found"),
      import("../not-found"),
    ]);
    const shell = renderToStaticMarkup(createElement(AppNotFound));
    const root = renderToStaticMarkup(createElement(RootNotFound));
    expect(shell).toMatch(/^<div data-layout="app"/);
    expect(shell).toContain("Page not found");
    expect(shell).toContain('href="/home"');
    // No second <main>: the shell has one already.
    expect(shell).not.toContain("<main");
    expect(root).toMatch(/^<main/);
    expect(root).toContain("Page not found");
  });
});
