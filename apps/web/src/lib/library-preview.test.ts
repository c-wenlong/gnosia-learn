import { describe, expect, it } from "vitest";

import { assetHref } from "@/lib/library";
import {
  arrowStep,
  assetIdOfHref,
  neighbour,
  openFromSearch,
  parseOpen,
  previewDate,
  previewTarget,
  withOpen,
  type PreviewAnchor,
  type PreviewClick,
} from "@/lib/library-preview";

const PLAIN: PreviewClick = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};
const VIDEO = "manimkc:out/algorithms/recurrences/master/cs3230_a1.mp4";
const ROW: PreviewAnchor = { href: assetHref(VIDEO), target: null, download: false };

describe("parseOpen", () => {
  it("reads the id, trimmed", () => {
    expect(parseOpen(" note:abc ")).toBe("note:abc");
  });

  it("takes the first of a repeated parameter", () => {
    expect(parseOpen(["a", "b"])).toBe("a");
  });

  it("is null for nothing, a blank and an over-long value", () => {
    expect(parseOpen(undefined)).toBeNull();
    expect(parseOpen(null)).toBeNull();
    expect(parseOpen("   ")).toBeNull();
    expect(parseOpen("x".repeat(1001))).toBeNull();
  });

  it("reads a raw search string, its escapes decoded", () => {
    expect(openFromSearch(`?view=list&open=${encodeURIComponent(VIDEO)}`)).toBe(VIDEO);
    expect(openFromSearch("view=list")).toBeNull();
    expect(openFromSearch("")).toBeNull();
  });
});

describe("withOpen", () => {
  it("adds the id after the view's own filters, which it keeps", () => {
    const search = withOpen("?kind=video&view=list", VIDEO);
    expect(search.startsWith("?kind=video&view=list&open=")).toBe(true);
    expect(openFromSearch(search)).toBe(VIDEO);
  });

  it("replaces an open id rather than adding a second", () => {
    expect(withOpen("?open=a&q=x", "b")).toBe("?open=b&q=x");
  });

  it("removes it, and leaves no bare question mark", () => {
    expect(withOpen("?kind=note&open=a", null)).toBe("?kind=note");
    expect(withOpen("?open=a", null)).toBe("");
    expect(withOpen("", null)).toBe("");
  });

  it("round-trips an id with colons, slashes and spaces", () => {
    const id = "link:cs3216 m3/r1?x";
    expect(openFromSearch(withOpen("", id))).toBe(id);
  });
});

describe("previewTarget: which clicks open the panel", () => {
  it("opens a plain left click on an asset's link", () => {
    expect(previewTarget(PLAIN, ROW)).toBe(VIDEO);
  });

  it("leaves every modified click to the browser", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
      expect(previewTarget({ ...PLAIN, [key]: true }, ROW)).toBeNull();
    }
  });

  it("leaves the middle and right buttons alone", () => {
    expect(previewTarget({ ...PLAIN, button: 1 }, ROW)).toBeNull();
    expect(previewTarget({ ...PLAIN, button: 2 }, ROW)).toBeNull();
  });

  it("leaves a click something already handled, or one inside a control in the row", () => {
    expect(previewTarget({ ...PLAIN, defaultPrevented: true }, ROW)).toBeNull();
    expect(previewTarget(PLAIN, ROW, true)).toBeNull();
  });

  it("leaves a link that opens elsewhere or downloads", () => {
    expect(previewTarget(PLAIN, { ...ROW, target: "_blank" })).toBeNull();
    expect(previewTarget(PLAIN, { ...ROW, download: true })).toBeNull();
    expect(previewTarget(PLAIN, { ...ROW, target: "_self" })).toBe(VIDEO);
  });

  it("opens only a link to one asset's page", () => {
    expect(previewTarget(PLAIN, { ...ROW, href: "/library" })).toBeNull();
    expect(previewTarget(PLAIN, { ...ROW, href: "/library?kind=video" })).toBeNull();
    expect(previewTarget(PLAIN, { ...ROW, href: "/library/a/b" })).toBeNull();
    expect(previewTarget(PLAIN, { ...ROW, href: "/learn/master-theorem" })).toBeNull();
    expect(previewTarget(PLAIN, { ...ROW, href: "https://example.com/library/a" })).toBeNull();
    expect(previewTarget(PLAIN, { ...ROW, href: null })).toBeNull();
  });
});

describe("assetIdOfHref", () => {
  it("decodes the segment, ignoring a query or a hash", () => {
    expect(assetIdOfHref(`${assetHref(VIDEO)}?from=home`)).toBe(VIDEO);
    expect(assetIdOfHref(`${assetHref("note:x")}#top`)).toBe("note:x");
  });

  it("refuses a malformed escape rather than guessing", () => {
    expect(assetIdOfHref("/library/%E0%A4%A")).toBeNull();
  });
});

describe("neighbour", () => {
  const ids = ["a", "b", "c"];
  it("moves one row either way", () => {
    expect(neighbour(ids, "b", -1)).toBe("a");
    expect(neighbour(ids, "b", 1)).toBe("c");
  });

  it("stops at the ends, and has none for an asset the list does not show", () => {
    expect(neighbour(ids, "a", -1)).toBeNull();
    expect(neighbour(ids, "c", 1)).toBeNull();
    expect(neighbour(ids, "z", 1)).toBeNull();
  });
});

describe("arrowStep", () => {
  const plain = { key: "ArrowRight", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, inWidget: false };
  it("maps left and right", () => {
    expect(arrowStep({ ...plain, key: "ArrowLeft" })).toBe(-1);
    expect(arrowStep(plain)).toBe(1);
    expect(arrowStep({ ...plain, key: "ArrowDown" })).toBeNull();
  });

  it("never takes the key from a widget that uses it, or with a modifier", () => {
    expect(arrowStep({ ...plain, inWidget: true })).toBeNull();
    expect(arrowStep({ ...plain, altKey: true })).toBeNull();
    expect(arrowStep({ ...plain, metaKey: true })).toBeNull();
  });
});

describe("previewDate", () => {
  const now = new Date("2026-10-05T04:00:00Z");
  const timeZone = "Asia/Singapore";

  it("says the day it was made", () => {
    expect(previewDate("2026-10-04T10:00:00Z", "2026-10-04T10:05:00Z", { now, timeZone })).toBe("4 Oct");
  });

  it("says edited when it changed more than a day later", () => {
    expect(previewDate("2026-09-01T10:00:00Z", "2026-10-02T10:00:00Z", { now, timeZone })).toBe("edited 2 Oct");
  });

  it("counts the day in the zone, and names another year", () => {
    expect(previewDate("2026-10-03T17:00:00Z", "2026-10-03T17:00:00Z", { now, timeZone })).toBe("4 Oct");
    expect(previewDate("2025-12-28T04:00:00Z", "2025-12-28T04:00:00Z", { now, timeZone })).toBe("28 Dec 2025");
  });

  it("is null for an instant that does not parse", () => {
    expect(previewDate("nope", "nope", { now, timeZone })).toBeNull();
  });
});
