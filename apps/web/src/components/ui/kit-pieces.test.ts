import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Glyph } from "./Glyph";
import { Placeholder } from "./Placeholder";
import { TypingDots } from "./TypingDots";

/**
 * Small kit pieces the UI audit's leftovers added (issue #359): `TypingDots`,
 * a `Placeholder` a class can size, and `Glyph`'s stroke. The lint rules in
 * eslint-rules/gnosia.mjs fail when a hand-built copy of a kit piece comes back.
 */

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

describe("Glyph", () => {
  it("draws at 1.6 in its 20-unit box unless a stroke is given", () => {
    expect(renderToStaticMarkup(createElement(Glyph, { name: "tick" }))).toContain('stroke-width="1.6"');
    expect(renderToStaticMarkup(createElement(Glyph, { name: "tick", stroke: 2.75 }))).toContain('stroke-width="2.75"');
  });
});
