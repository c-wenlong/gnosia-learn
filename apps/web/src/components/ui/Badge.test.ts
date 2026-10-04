import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders a label, not a control, its words in a truncating span", () => {
    const html = renderToStaticMarkup(createElement(Badge, { title: "tcp-vs-udp-transport-protocols", children: "tcp-vs-udp" }));
    expect(html).toMatch(/^<span title="tcp-vs-udp-transport-protocols" class="[^"]*rounded-full[^"]*"><span class="min-w-0 truncate">tcp-vs-udp<\/span><\/span>$/);
    expect(html).not.toMatch(/<(button|a)\b/);
    expect(html).not.toContain("tabindex");
  });

  it("takes each of its five tones", () => {
    const tones = { muted: "text-text2", accent: "text-accent-text", warn: "text-warn-text", danger: "text-danger", ok: "text-ok-text" } as const;
    for (const [tone, ink] of Object.entries(tones)) {
      const html = renderToStaticMarkup(createElement(Badge, { tone: tone as keyof typeof tones, children: "Failed" }));
      expect(html).toContain(ink);
    }
  });

  it("is muted by default", () => {
    expect(renderToStaticMarkup(createElement(Badge, { children: "none" }))).toContain("bg-surface2");
  });
});
