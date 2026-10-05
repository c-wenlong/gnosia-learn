import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PreviewHeader } from "@/lib/library-preview";

import { PreviewerHeader } from "./PreviewerHeader";

/**
 * The previewer's header, drawn by the kit's `DialogHeader`: the kind's glyph,
 * the title, the date, the 28px tools in their order, a rule, and a Close in
 * line with the tools. Until the body arrives (or after it failed) the glyph,
 * title and date are grey bars and only Open page and Close are there.
 */

const FULL: PreviewHeader = {
  family: "diagram",
  kindLabel: "Diagram",
  title: "TCP vs UDP",
  plainName: false,
  date: "30 Sept",
  dateTime: "2026-09-30T00:00:00.000Z",
  concept: { href: "/learn/tcp", title: "TCP" },
  conversation: { href: "/studio?draft=d1", title: "TCP vs UDP" },
  download: { href: "/api/assets/diagram%3Atcp/file?download=1" },
  page: "/library/diagram%3Atcp",
  wide: true,
};

const render = (props: Partial<ComponentProps<typeof PreviewerHeader>> = {}) =>
  renderToStaticMarkup(
    createElement(PreviewerHeader, { header: FULL, loading: false, id: "diagram:tcp", onClose: () => undefined, ...props }),
  );

const at = (html: string, needle: string) => html.indexOf(needle);

describe("PreviewerHeader with a body", () => {
  const html = render();

  it("is the kit's header: an h2 in the panel title role, and Close marked for the focus logic", () => {
    expect(html).toMatch(/<h2 class="[^"]*text-\[14px\][^"]*font-semibold[^"]*">/);
    expect(html).toMatch(/aria-label="Close" title="Close" class="[^"]*" data-dialog-close="">/);
  });

  it("names the kind to a screen reader beside the title", () => {
    expect(html).toContain('<span class="sr-only">Diagram: </span>TCP vs UDP');
  });

  it("goes glyph, title, date, the tools in order, the rule, then Close", () => {
    const order = [
      "<svg", // the kind's glyph
      "<h2",
      "<time",
      'aria-label="Open TCP"',
      'aria-label="Conversation: TCP vs UDP"',
      'aria-label="Download"',
      'aria-label="Open page"',
      "w-px bg-hair",
      "data-dialog-close",
    ].map((needle) => at(html, needle));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("draws every tool and Close as a 28px square", () => {
    for (const label of ["Open TCP", "Conversation: TCP vs UDP", "Download", "Open page", "Close"]) {
      const tag = html.match(new RegExp(`<(?:a|button)[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";
      expect(tag, label).toMatch(/class="[^"]*\bsize-7\b[^"]*\brounded-lg\b/);
    }
  });

  it("sets a plain file name in mono and the secondary ink, any other title in the panel's", () => {
    expect(html).not.toContain("font-mono");
    expect(render({ header: { ...FULL, plainName: true, title: "week_01.mp4" } })).toMatch(
      /<span class="[^"]*font-mono[^"]*text-text2[^"]*"><span class="sr-only">Diagram: <\/span>week_01\.mp4/,
    );
  });

  it("leaves out the tools and the date it has nothing for", () => {
    const bare = render({ header: { ...FULL, concept: null, conversation: null, download: null, date: null } });
    expect(bare).not.toContain("<time");
    expect(bare).not.toContain("Download");
    expect(bare).not.toContain("Conversation");
    expect(bare).toContain('aria-label="Open page"');
    expect(bare).toContain("data-dialog-close");
  });
});

describe("PreviewerHeader without one", () => {
  it("shows grey bars where the glyph, title and date go, and only Open page and Close", () => {
    const html = render({ header: null, loading: true });
    expect(html).not.toContain("<time");
    expect(html.match(/animate-sheen/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(html).toContain('aria-label="Open page" title="Open page"');
    expect(html).toContain('href="/library/diagram%3Atcp"');
    expect(html).not.toContain('aria-label="Download"');
    expect(html.endsWith("</button></div>")).toBe(true);
  });

  it("says loading only while it is, and not after the body failed to come", () => {
    expect(render({ header: null, loading: true })).toContain('<span class="sr-only">Loading preview</span>');
    const failed = render({ header: null, loading: false });
    expect(failed).not.toContain("Loading preview");
    expect(failed).toContain('<span class="sr-only">Preview</span>');
  });
});
