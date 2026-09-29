import { describe, expect, it } from "vitest";

import {
  EXTEND_KEY_TTL_MS,
  EXTEND_OPENER,
  extendKey,
  extendRefusal,
  forgetExtendKey,
  leaveOpener,
  readingWords,
  takeOpener,
} from "./studio-extend";

/** A `Storage` in memory, and one whose every call throws like a blocked one. */
function memory(): Storage {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    clear: () => held.clear(),
    getItem: (key) => held.get(key) ?? null,
    key: (at) => [...held.keys()][at] ?? null,
    removeItem: (key) => void held.delete(key),
    setItem: (key, value) => void held.set(key, String(value)),
  };
}

function blocked(): Storage {
  const fail = () => {
    throw new Error("SecurityError");
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

describe("a refused Extend", () => {
  const refusal = (error: string, detail: unknown = null) => ({ error, detail });

  it("offers only a way out for a name the runner will not take, or a diagram that is gone", () => {
    expect(extendRefusal(400, refusal('"x y" is not a diagram name'), "x y").actions).toEqual(["close"]);
    const gone = extendRefusal(404, refusal("no diagram dot-product in the catalog"), "Dot product");
    expect(gone.headline).toContain("Dot product");
    expect(gone.actions).toEqual(["close"]);
  });

  it("offers Try again and the canvas when the checkout or inspect failed", () => {
    const failed = extendRefusal(
      502,
      refusal("dot-product would not inspect, so the planner cannot be told what is in it", { exitCode: 1 }),
      "Dot product",
    );
    expect(failed.actions).toEqual(["retry", "canvas", "close"]);
    // The runner's own sentence, which is the only thing that says which step failed.
    expect(failed.detail).toContain("The runner said: dot-product would not inspect");
    expect(failed.detail).not.toContain("[object Object]");
  });

  it("carries a string detail from the checkout", () => {
    const failed = extendRefusal(502, refusal("checkout failed", "the catalog is not reachable"), "x");
    expect(failed.detail).toContain("checkout failed. the catalog is not reachable.");
  });

  it("says the topic list is the problem on a 503, with the runner's words", () => {
    const down = extendRefusal(503, refusal("the topic list cannot be read and there is no cached copy"), "x");
    expect(down.headline).toBe("The topic list could not be read.");
    expect(down.detail).toContain("The runner said: the topic list cannot be read");
    expect(down.actions).toEqual(["retry", "close"]);
  });

  it("tells a runner that is down from one that answered", () => {
    expect(extendRefusal(0, refusal("the studio runner is not answering"), "x").headline).toBe(
      "The studio runner is not answering.",
    );
    expect(extendRefusal(500, refusal("boom"), "x").headline).toBe("The runner answered 500.");
  });
});

describe("the pending line", () => {
  it("says what is happening, and says more only once the wait is long enough to wonder about", () => {
    expect(readingWords(0)).toEqual({ lead: "Reading the diagram", more: null });
    expect(readingWords(8_000).more).toContain("starts a browser");
    expect(readingWords(45_000).more).toContain("Still going");
  });
});

describe("the press's idempotency key", () => {
  it("is reused by a reload while the diagram is being read, so the runner makes one draft", () => {
    const store = memory();
    let minted = 0;
    const fresh = () => `k${(minted += 1)}`;
    const first = extendKey(store, "dot-product", fresh, 1_000);
    expect(extendKey(store, "dot-product", fresh, 2_000)).toBe(first);
    expect(extendKey(store, "other", fresh, 2_000)).not.toBe(first);
  });

  it("is new once the press became a draft, or once the old one is stale", () => {
    const store = memory();
    let minted = 0;
    const fresh = () => `k${(minted += 1)}`;
    const first = extendKey(store, "dot-product", fresh, 0);
    forgetExtendKey(store, "dot-product");
    const second = extendKey(store, "dot-product", fresh, 1);
    expect(second).not.toBe(first);
    expect(extendKey(store, "dot-product", fresh, 1 + EXTEND_KEY_TTL_MS)).not.toBe(second);
  });

  it("still works with no storage, or storage that throws", () => {
    expect(extendKey(null, "x", () => "k")).toBe("k");
    expect(extendKey(blocked(), "x", () => "k")).toBe("k");
    expect(() => forgetExtendKey(blocked(), "x")).not.toThrow();
  });
});

describe("the opener handed to the conversation", () => {
  it("is read once, so a reload never sends it again", () => {
    const store = memory();
    leaveOpener(store, "d1", { send: EXTEND_OPENER, compose: "" });
    expect(takeOpener(store, "d1")).toEqual({ send: EXTEND_OPENER, compose: "" });
    expect(takeOpener(store, "d1")).toBeNull();
  });

  it("carries a message typed while the diagram was read, and what was left in the composer", () => {
    const store = memory();
    leaveOpener(store, "d1", { send: "Add the projection of a onto b", compose: "and label the angle" });
    expect(takeOpener(store, "d1")).toEqual({ send: "Add the projection of a onto b", compose: "and label the angle" });
  });

  it("is nothing when missing, malformed, or unreadable", () => {
    const store = memory();
    expect(takeOpener(store, "d1")).toBeNull();
    store.setItem("studio:extend-opener:d2", "{not json");
    expect(takeOpener(store, "d2")).toEqual({ send: null, compose: "" });
    expect(takeOpener(blocked(), "d3")).toBeNull();
    expect(takeOpener(null, "d4")).toBeNull();
  });
});
