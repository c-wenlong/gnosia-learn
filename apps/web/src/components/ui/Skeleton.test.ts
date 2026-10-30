import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { sheenDelay, SHEEN_STAGGER_MS, Skeleton, SKELETON, SkeletonCard, SkeletonRow } from "./Skeleton";

/**
 * The kit `Skeleton` and its two Library shapes (L9 of
 * docs/proposals/library-by-type-and-day.md): a block in the `--skeleton`
 * token with a sheen that sweeps at intervals, staggered across siblings, and
 * a flat block under reduced motion. Static markup cannot run a media query,
 * so the reduced-motion half is the `motion-reduce:animate-none` class and the
 * stylesheet's rest position; the motion itself is measured in a browser (the
 * PR that added it has the 25ms samples).
 */

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css"), "utf8");

function blocks(html: string): string[] {
  return [...html.matchAll(/class="([^"]*\bskeleton\b[^"]*)"/g)].map(([, c]) => c);
}

describe("Skeleton", () => {
  it("sweeps its sheen, and stops it under reduced motion", () => {
    const [block] = blocks(renderToStaticMarkup(createElement(Skeleton, { className: "h-4 w-20" })));
    expect(block.split(" ")).toEqual(expect.arrayContaining(["skeleton", "animate-sheen", "motion-reduce:animate-none"]));
  });

  it("staggers siblings by their place, repeating after eight", () => {
    expect(sheenDelay(undefined)).toBeUndefined();
    expect(sheenDelay(0)).toEqual({ "--skeleton-delay": "0ms" });
    expect(sheenDelay(3)).toEqual({ "--skeleton-delay": `${3 * SHEEN_STAGGER_MS}ms` });
    expect(sheenDelay(8)).toEqual(sheenDelay(0));
    expect(sheenDelay(-1)).toEqual(sheenDelay(7));
    const html = renderToStaticMarkup(createElement(Skeleton, { index: 2 }));
    expect(html).toContain(`--skeleton-delay:${2 * SHEEN_STAGGER_MS}ms`);
  });

  it("draws a row as the glyph tile and two bars, every block on the row's delay", () => {
    const html = renderToStaticMarkup(createElement(SkeletonRow, { index: 1 }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-skeleton="row"');
    expect(html).toContain("min-h-[calc(var(--shell-row)+24px)]");
    const parts = blocks(html);
    expect(parts).toHaveLength(4);
    expect(parts[0]).toContain("size-8");
    expect(html.match(/--skeleton-delay:90ms/g)).toHaveLength(4);
  });

  it("draws a card as the picture and three bars", () => {
    const html = renderToStaticMarkup(createElement(SkeletonCard, {}));
    expect(html).toContain('data-skeleton="card"');
    const parts = blocks(html);
    expect(parts).toHaveLength(4);
    expect(parts[0]).toContain("h-[110px]");
    expect(parts.every((c) => c.includes("motion-reduce:animate-none"))).toBe(true);
  });

  it("reads its colours from tokens every palette defines, and rests flat", () => {
    for (const block of [":root {", ".dark {", ".gnosia {", ".gnosia.dark {"]) {
      const at = css.indexOf(`\n${block}`);
      const body = css.slice(at, css.indexOf("\n}", at));
      expect(body, block).toMatch(/--skeleton: #[0-9a-f]{6};/);
      expect(body, block).toMatch(/--skeleton-sheen: #[0-9a-f]{6};/);
    }
    // The sweep runs 1.2s of a 2.4s cycle, then rests, and the rest is the
    // gradient's left end, which is only the block's colour.
    expect(css).toMatch(/--animate-sheen: sheen 2\.4s ease-in-out var\(--skeleton-delay, 0ms\) infinite;/);
    expect(css).toMatch(/@keyframes sheen \{\s*0% \{\s*background-position: 100% 0;\s*\}\s*50%,\s*100% \{\s*background-position: 0% 0;/);
    expect(css).toMatch(/\.skeleton \{[^}]*background-position: 0% 0;/);
  });

  it("is one block at one radius, sized by its className", () => {
    const [block] = blocks(renderToStaticMarkup(createElement(Skeleton, { className: "h-4 w-20" })));
    expect(block.split(" ")).toEqual(expect.arrayContaining(["skeleton", "rounded-md", "h-4", "w-20"]));
    expect(SKELETON.split(" ")).toEqual(expect.arrayContaining(["skeleton", "rounded-md"]));
  });

  it("drops the radius when it fills a frame that clips it", () => {
    const classes = blocks(renderToStaticMarkup(createElement(Skeleton, { fill: true, className: "flex-1" })))[0]!.split(" ");
    expect(classes.some((c) => c.startsWith("rounded"))).toBe(false);
    expect(classes).toContain("motion-reduce:animate-none");
  });
});
