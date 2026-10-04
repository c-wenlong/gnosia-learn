import { describe, expect, it } from "vitest";

import { activeDestination, DESTINATIONS, isCurrentRow, STUDIO_DESTINATION } from "./nav";

describe("activeDestination", () => {
  it("matches Home only on its own path", () => {
    expect(activeDestination("/home")).toBe("home");
    expect(activeDestination("/home?tab=x")).toBe("home");
    expect(activeDestination("/")).toBeNull();
    expect(activeDestination("/settings")).toBeNull();
  });

  it("keeps a destination highlighted one level in", () => {
    expect(activeDestination("/courses")).toBe("courses");
    expect(activeDestination("/courses/cp4281/m1-intro/session")).toBe("courses");
    expect(activeDestination("/library/video%3Aabc")).toBe("library");
    expect(activeDestination("/learn/dot-product")).toBe("learn");
  });

  it("matches whole segments only", () => {
    expect(activeDestination("/learning")).toBeNull();
    expect(activeDestination("/reviewer")).toBeNull();
  });

  it("gives an empty path no destination", () => {
    expect(activeDestination(null)).toBeNull();
    expect(activeDestination(undefined)).toBeNull();
    expect(activeDestination("")).toBeNull();
  });

  it("keeps Studio highlighted everywhere under /studio", () => {
    expect(activeDestination("/studio")).toBe("studio");
    expect(activeDestination("/studio?draft=abc")).toBe("studio");
    expect(activeDestination("/studio/d/some-diagram")).toBe("studio");
    expect(activeDestination("/studio/d/some-diagram?x=1#top")).toBe("studio");
    expect(activeDestination("/studio/api/jobs")).toBe("studio");
  });

  it("matches Studio on whole segments only", () => {
    expect(activeDestination("/studios")).toBeNull();
    expect(activeDestination("/studio-x/d")).toBeNull();
    expect(activeDestination("/courses/studio")).toBe("courses");
  });
});

describe("the destination lists", () => {
  it("keeps Studio out of the four learning destinations", () => {
    expect(DESTINATIONS).toHaveLength(4);
    expect(DESTINATIONS.map((d) => d.key)).toEqual(["home", "courses", "learn", "library"]);
    expect(DESTINATIONS.some((d) => d.href.startsWith("/studio"))).toBe(false);
  });

  it("does not list Review, and gives /review no active destination", () => {
    expect(DESTINATIONS.some((d) => d.href === "/review")).toBe(false);
    expect(activeDestination("/review")).toBeNull();
    expect(activeDestination("/review?concept=softmax")).toBeNull();
  });

  it("points New chat at the studio's home", () => {
    expect(STUDIO_DESTINATION).toEqual({ key: "studio", label: "Studio", href: "/studio" });
  });
});

describe("isCurrentRow", () => {
  it("matches a row's own page, with escapes undone on either side", () => {
    expect(isCurrentRow("/library/video%3Aabc", "/library/video:abc")).toBe(true);
    expect(isCurrentRow("/library/video%3Aabc", "/library/video%3Aabc")).toBe(true);
    expect(isCurrentRow("/learn/dot-product", "/learn/dot-product?tab=notes")).toBe(true);
    expect(isCurrentRow("/learn/dot-product", "/learn/dot-products")).toBe(false);
  });

  it("keeps a module's row current on the pages under it, and a course page's row on its own page only", () => {
    expect(isCurrentRow("/courses/cs3230/m1", "/courses/cs3230/m1/check", true)).toBe(true);
    expect(isCurrentRow("/courses/cs3230", "/courses/cs3230/m1")).toBe(false);
    expect(isCurrentRow("/courses/cs3230", "/courses/cs3230")).toBe(true);
    expect(isCurrentRow("/courses/cs3230/m1", "/courses/cs3230/m10", true)).toBe(false);
  });

  it("is never current with no path, or with a malformed escape it cannot undo", () => {
    expect(isCurrentRow("/learn/x", null)).toBe(false);
    expect(isCurrentRow("/learn/%E0%A4%A", "/learn/%E0%A4%A")).toBe(true);
    expect(isCurrentRow("/learn/%E0%A4%A", "/learn/x")).toBe(false);
  });
});
