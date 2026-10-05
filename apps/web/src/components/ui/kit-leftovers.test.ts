import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageLoading, WORKSPACE_ROOT } from "@/components/PageLoading";
import { StudioCanvasLoading, StudioGridLoading } from "@/components/studio/StudioLoading";

import { Card } from "./Card";
import { cardClasses } from "./classes";
import { Collapse } from "./Collapse";
import { Glyph } from "./Glyph";
import { Placeholder } from "./Placeholder";
import { Skeleton, SKELETON } from "./Skeleton";
import { TypingDots } from "./TypingDots";

/**
 * The kit pieces the UI audit's leftovers added (issue #359): the card's
 * `flush` and `gap` options, `Skeleton`, `TypingDots`, a `Placeholder` a class
 * can size, the full-bleed loading frame the studio uses, and `Glyph`'s
 * stroke. Then the guards that fail when a hand-built copy comes back.
 */

const classesOf = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");

describe("cardClasses", () => {
  it("pads 20 with a 12px gap by default, 14 when tight", () => {
    expect(cardClasses().split(" ")).toEqual(expect.arrayContaining(["gap-3", "p-5", "rounded-[20px]", "border-2"]));
    expect(cardClasses({ tight: true }).split(" ")).toContain("p-3.5");
  });

  it("is the shell alone when flush: no padding, no gap, its children clipped", () => {
    const classes = cardClasses({ flush: true }).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["overflow-hidden", "rounded-[20px]", "border-2", "border-border", "bg-surface"]));
    expect(classes.filter((c) => /^(p[xytrblse]?|gap)-/.test(c))).toEqual([]);
  });

  it("takes the gap as an option, so there is only ever one gap class", () => {
    // One gap class whichever way it is asked for: the option, or a
    // `className` gap that `cx` keeps over the card's own.
    expect(cardClasses({ gap: 2 }).split(" ").filter((c) => c.startsWith("gap-"))).toEqual(["gap-2"]);
    expect(cardClasses({ gap: 4, tight: true }).split(" ").filter((c) => c.startsWith("gap-"))).toEqual(["gap-4"]);
    expect(cardClasses({ flush: true, gap: 1.5 }).split(" ").filter((c) => c.startsWith("gap-"))).toEqual(["gap-1.5"]);
    expect(cardClasses({ className: "gap-2" }).split(" ").filter((c) => c.startsWith("gap-"))).toEqual(["gap-2"]);
  });

  it("is what Card renders, flush included", () => {
    const html = renderToStaticMarkup(createElement(Card, { flush: true, as: "div", "aria-label": "Graph" }, "x"));
    expect(html.startsWith("<div")).toBe(true);
    expect(classesOf(html)).toContain("overflow-hidden");
    expect(classesOf(html)).not.toContain("p-5");
  });
});

describe("Skeleton", () => {
  it("is one block at one radius, its sheen sweeping unless motion is reduced", () => {
    const classes = classesOf(renderToStaticMarkup(createElement(Skeleton, { className: "h-4 w-20" })));
    expect(classes).toEqual(expect.arrayContaining(["skeleton", "rounded-md", "animate-sheen", "motion-reduce:animate-none", "h-4", "w-20"]));
    expect(SKELETON.split(" ")).toEqual(expect.arrayContaining(["skeleton", "rounded-md"]));
  });

  it("drops the radius when it fills a frame that clips it", () => {
    const classes = classesOf(renderToStaticMarkup(createElement(Skeleton, { fill: true, className: "flex-1" })));
    expect(classes.some((c) => c.startsWith("rounded"))).toBe(false);
    expect(classes).toContain("motion-reduce:animate-none");
  });
});

describe("TypingDots", () => {
  it("is three hidden dots pulsing in turn, still under reduced motion", () => {
    const html = renderToStaticMarkup(createElement(TypingDots));
    expect(html).toMatch(/^<span aria-hidden="true"/);
    const dots = [...html.matchAll(/<span class="([^"]*)" style="animation-delay:(\d+)ms"/g)];
    expect(dots.map((m) => m[2])).toEqual(["0", "180", "360"]);
    for (const [, classes] of dots) expect(classes).toContain("motion-reduce:animate-none");
  });
});

describe("Placeholder", () => {
  it("sets its height inline when given one, and leaves it to a class when not", () => {
    expect(renderToStaticMarkup(createElement(Placeholder, { label: "x", height: 170 }))).toContain('style="height:170px"');
    const free = renderToStaticMarkup(createElement(Placeholder, { label: "x", className: "h-[170px] md:h-[220px]" }));
    expect(free).not.toContain("style=");
    expect(free).toContain("md:h-[220px]");
  });
});

describe("PageLoading, full", () => {
  it("fills the shell, waits before it shows, and says its status outside the busy region", () => {
    // A plain function with no hooks; its optional props defeat createElement's overloads.
    const html = renderToStaticMarkup(PageLoading({ layout: "full", label: "Opening the studio", children: "outline" }));
    expect(html).toMatch(/^<p role="status" class="sr-only">Opening the studio<\/p><div data-layout="full" aria-busy="true"/);
    expect(html).toContain("animate-fade-in-late");
  });

  it("is the frame both studio loading screens use, drawn in kit skeletons", () => {
    for (const screen of [StudioGridLoading, StudioCanvasLoading]) {
      const html = renderToStaticMarkup(createElement(screen));
      expect(html).toContain('data-layout="full"');
      expect(html).toContain("animate-fade-in-late");
      // The legacy alias the blocks were filled with, gone from the blocks.
      expect(html).not.toMatch(/bg-\[var\(--surface-hover\)\][^"]*animate-pulse/);
    }
  });
});

describe("PageLoading, workspace", () => {
  it("carries the concept page's own root, so the shell is the same height while it loads", () => {
    const html = renderToStaticMarkup(PageLoading({ layout: "workspace", label: "Opening the concept" }));
    expect(html).toMatch(/^<p role="status" class="sr-only">Opening the concept<\/p><div data-layout="workspace" aria-busy="true"/);
    const root = /<div data-layout="workspace" aria-busy="true" class="([^"]*)"/.exec(html)![1]!.split(" ");
    expect(root).toEqual(expect.arrayContaining([...WORKSPACE_ROOT.split(" "), "animate-fade-in-late"]));
    // Three panels side by side where they fit (`ws:`), one under the tab row where not.
    expect(html).toContain("ws:grid-cols-[250px_minmax(0,1fr)_270px]");
    expect(html.match(/border-b border-hair/g)).toHaveLength(3);
    expect(html.match(/ws-tabs:hidden/g)).toHaveLength(2);
  });
});

describe("Glyph", () => {
  it("draws at 1.6 in its 20-unit box unless a stroke is given", () => {
    expect(renderToStaticMarkup(createElement(Glyph, { name: "tick" }))).toContain('stroke-width="1.6"');
    expect(renderToStaticMarkup(createElement(Glyph, { name: "tick", stroke: 2.75 }))).toContain('stroke-width="2.75"');
  });
});

describe("Collapse", () => {
  it("puts its className on the inner box, where padding would hold a shut fold open", () => {
    // jsdom lays nothing out, so the height itself cannot be measured here:
    // the guard below keeps padding off the box instead.
    const html = renderToStaticMarkup(createElement(Collapse, { open: false, className: "min-w-0" } as ComponentProps<typeof Collapse>, createElement("p", { className: "pt-4" }, "x")));
    expect(html).toContain("grid-rows-[0fr]");
    expect(html).toMatch(/class="[^"]*\bmin-h-0 [^"]*min-w-0"><p class="pt-4">/);
  });
});

const src = join(dirname(fileURLToPath(import.meta.url)), "../..");

function sources(): Array<{ path: string; text: string }> {
  const found: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        found.push({ path: relative(src, path), text: readFileSync(path, "utf8") });
      }
    }
  };
  walk(src);
  return found;
}

/** Every `<Collapse ...>` or `<Reveal ...>` opening tag, props and all (a `>` inside braces does not end it). */
function foldTags(text: string): string[] {
  const tags: string[] = [];
  for (const start of text.matchAll(/<(Collapse|Reveal)\b/g)) {
    let depth = 0;
    let at = start.index + start[0].length;
    for (; at < text.length; at++) {
      const ch = text[at];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(text.slice(start.index, at + 1));
  }
  return tags;
}

/** A padding utility, with or without variants: `pt-4`, `md:px-3`, `p-[3px]`. */
const PADDING = /(?:^|[\s"'`:])p[xytrblse]?-(?:\d|\[|px\b)/;

describe("the kit's leftovers stay gone", () => {
  const padded = (text: string) =>
    foldTags(text).some((tag) => /className=/.test(tag) && PADDING.test(tag.slice(tag.indexOf("className="))));

  it("knows a padded fold when it sees one", () => {
    expect(padded(`<Collapse open={n > 0} className="pt-8">`)).toBe(true);
    expect(padded(`<Reveal open={a} className={cx("md:px-3", b)}>`)).toBe(true);
    expect(padded(`<Collapse open={n > 0} className="min-w-0">`)).toBe(false);
    expect(padded(`<Collapse open={open}><p className="pt-4" /></Collapse>`)).toBe(false);
  });

  it("puts no padding on a Collapse's own box", () => {
    const paddedFiles = sources()
      .filter(({ text }) => padded(text))
      .map(({ path }) => path);
    expect(paddedFiles).toEqual([]);
  });

  it("builds every card shell with cardClasses", () => {
    // Not cards: DomainBrowser's domain tile is a button with its own 16px
    // padding and an accent border on hover, and the composer's box is a
    // field's face that happens to share the card's radius.
    const notCards = ["ui/classes.ts", "learn/DomainBrowser.tsx", "ui/composer-keys.ts"];
    const handBuilt = sources()
      .filter(({ path }) => !notCards.some((name) => path.endsWith(name)))
      .filter(({ text }) => /rounded-\[20px\] border-2 border-border bg-surface/.test(text))
      .map(({ path }) => path);
    expect(handBuilt).toEqual([]);
  });

  it("draws one typing indicator, the kit's", () => {
    const copies = sources()
      .filter(({ path, text }) => !path.endsWith("ui/TypingDots.tsx") && /animationDelay: `\$\{at \* 180\}ms`/.test(text))
      .map(({ path }) => path);
    expect(copies).toEqual([]);
  });

  it("takes the field pieces' marks from Glyph", () => {
    for (const piece of ["Checkbox", "SearchField", "Combobox"]) {
      const text = readFileSync(join(src, `components/ui/${piece}.tsx`), "utf8");
      expect(text, piece).not.toContain("<svg");
    }
  });
});
