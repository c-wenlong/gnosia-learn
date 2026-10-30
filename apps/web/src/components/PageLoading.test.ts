import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageLoading, WORKSPACE_ROOT } from "./PageLoading";
import { StudioCanvasLoading, StudioGridLoading } from "./studio/StudioLoading";

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
