import { describe, expect, it } from "vitest";

import { cameBack, heldPagesKey, MAX_RESTORED_PAGES, parseHeldPages, POP_WINDOW_MS, sameLibraryView } from "./library-history";

describe("back and forward", () => {
  it("keys the held pages by the view's URL", () => {
    expect(heldPagesKey("/library?view=list")).toBe("library-pages:/library?view=list");
  });

  it("reads a held count and offset, and refuses the rest", () => {
    expect(parseHeldPages(JSON.stringify({ pages: 3, y: 1200.5 }))).toEqual({ pages: 3, y: 1200.5 });
    expect(parseHeldPages(JSON.stringify({ pages: 9999, y: 0 }))).toEqual({ pages: MAX_RESTORED_PAGES, y: 0 });
    for (const bad of [null, "", "{", "7", JSON.stringify({ pages: 0, y: 0 }), JSON.stringify({ pages: 1.5, y: 0 }), JSON.stringify({ pages: 2, y: -1 }), JSON.stringify({ pages: 2 })]) {
      expect(parseHeldPages(bad)).toBeNull();
    }
  });

  it("restores after a recent popstate to this view, or on a document loaded by back or reload", () => {
    const now = 10_000;
    const href = "/library?view=list";
    const pop = (ago: number, url = "http://localhost/library?view=list") => ({ at: now - ago, url });
    const base = { now, href, navigation: "navigate", firstMount: false };
    expect(cameBack({ ...base, lastPop: pop(100) })).toBe(true);
    expect(cameBack({ ...base, lastPop: pop(100, "http://localhost/library?view=list&open=note%3Ax") })).toBe(true);
    // Back to some other page, then a link here: a fresh visit.
    expect(cameBack({ ...base, lastPop: pop(100, "http://localhost/home") })).toBe(false);
    expect(cameBack({ ...base, lastPop: pop(POP_WINDOW_MS) })).toBe(false);
    expect(cameBack({ ...base, lastPop: pop(-5), navigation: null })).toBe(false);
    expect(cameBack({ ...base, lastPop: null, navigation: "back_forward", firstMount: true })).toBe(true);
    expect(cameBack({ ...base, lastPop: null, navigation: "reload", firstMount: true })).toBe(true);
    expect(cameBack({ ...base, lastPop: null, navigation: "reload", firstMount: false })).toBe(false);
    expect(cameBack({ ...base, lastPop: null, navigation: "navigate", firstMount: true })).toBe(false);
  });

  it("knows a view by its parameters, in any order, an open row aside", () => {
    expect(sameLibraryView("http://x/library?view=list&group=topic", "/library?group=topic&view=list")).toBe(true);
    expect(sameLibraryView("/library?open=a&view=list", "/library?view=list")).toBe(true);
    expect(sameLibraryView("/library", "/library?view=list")).toBe(false);
    expect(sameLibraryView("/home?view=list", "/library?view=list")).toBe(false);
    expect(sameLibraryView("http://[bad", "/library")).toBe(false);
  });
});
