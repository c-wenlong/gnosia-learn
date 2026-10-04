import { describe, expect, it } from "vitest";

import { activeDestination, DESTINATIONS, STUDIO_DESTINATION } from "./nav";

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
  it("keeps Studio out of the five learning destinations", () => {
    expect(DESTINATIONS).toHaveLength(5);
    expect(DESTINATIONS.map((d) => d.key)).toEqual(["home", "courses", "learn", "library", "review"]);
    expect(DESTINATIONS.some((d) => d.href.startsWith("/studio"))).toBe(false);
  });

  it("points New chat at the studio's home", () => {
    expect(STUDIO_DESTINATION).toEqual({ key: "studio", label: "Studio", href: "/studio" });
  });
});
