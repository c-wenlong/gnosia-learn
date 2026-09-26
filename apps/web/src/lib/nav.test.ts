import { describe, expect, it } from "vitest";

import { activeDestination } from "./nav";

describe("activeDestination", () => {
  it("matches Today only on the root", () => {
    expect(activeDestination("/today")).toBe("today");
    expect(activeDestination("/today?tab=x")).toBe("today");
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

  it("gives Studio and an empty path no destination", () => {
    expect(activeDestination("/studio")).toBeNull();
    expect(activeDestination(null)).toBeNull();
    expect(activeDestination("")).toBeNull();
  });
});
