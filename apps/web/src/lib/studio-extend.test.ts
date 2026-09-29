import { describe, expect, it } from "vitest";

import {
  EXTEND_KEY_TTL_MS,
  EXTEND_OPENER,
  extendKey,
  extendRefusal,
  firstTurn,
  forgetExtendKey,
  leaveOpener,
  readingWords,
  leavePrefill,
  takeOpener,
  takePrefill,
  talkItThroughText,
  talkTarget,
} from "./studio-extend";
import { RUNNER_DOWN } from "./studio-drafts";

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

  it("offers only a way out for a name the runner will not take", () => {
    expect(extendRefusal(400, refusal('"x y" is not a diagram name'), "x y").actions).toEqual(["close"]);
  });

  it("shows the runner's reason for a 404 and offers Try again, since a catalog that is down reads the same", () => {
    const gone = extendRefusal(
      404,
      refusal("no diagram dot-product in the catalog", "the catalog is not reachable and there is no checkout"),
      "Dot product",
    );
    expect(gone.headline).toContain("Dot product");
    expect(gone.detail).toContain('"no diagram dot-product in the catalog; the catalog is not reachable and there is no checkout"');
    expect(gone.actions).toEqual(["retry", "close"]);
  });

  it("offers Try again and the canvas when the checkout or inspect failed, quoting the runner as it wrote it", () => {
    const failed = extendRefusal(
      502,
      refusal("dot-product would not inspect, so the planner cannot be told what is in it", { exitCode: 1 }),
      "Dot product",
    );
    expect(failed.actions).toEqual(["retry", "canvas", "close"]);
    // The slug keeps its case: quoted, not recased into a sentence.
    expect(failed.detail).toContain('The runner said: "dot-product would not inspect, so the planner cannot be told what is in it".');
    expect(failed.detail).not.toContain("[object Object]");
  });

  it("joins a string detail to the runner's error inside the one quotation", () => {
    const failed = extendRefusal(502, refusal("checkout failed.", "the catalog is not reachable"), "x");
    expect(failed.detail).toContain('The runner said: "checkout failed; the catalog is not reachable".');
  });

  it("says the topic list is the problem on a 503, with the runner's words", () => {
    const down = extendRefusal(503, refusal("the topic list cannot be read and there is no cached copy"), "x");
    expect(down.headline).toBe("The topic list could not be read.");
    expect(down.detail).toContain('The runner said: "the topic list cannot be read');
    expect(down.actions).toEqual(["retry", "close"]);
  });

  it("tells a runner that is down, as the proxy's 502 or a failed fetch, from one that answered", () => {
    const down = { headline: "The studio runner is not answering.", actions: ["retry", "close"] };
    expect(extendRefusal(0, refusal(RUNNER_DOWN), "x")).toMatchObject(down);
    expect(extendRefusal(502, refusal(RUNNER_DOWN, "Nothing is listening on http://127.0.0.1:7250."), "x")).toMatchObject(down);
    // A 502 the runner itself sent is about the diagram, not about the runner.
    expect(extendRefusal(502, refusal("dot-product would not inspect"), "x").actions).toContain("canvas");
    expect(extendRefusal(500, refusal("boom"), "x").headline).toBe("The runner answered 500.");
  });
});

describe("the first turn an Extend press hands over", () => {
  it("is the opener on an ordinary press, and a message sent during the read instead of it", () => {
    expect(firstTurn(null, false)).toBe(EXTEND_OPENER);
    expect(firstTurn("Add the projection", false)).toBe("Add the projection");
  });

  it("is never the opener on a Talk it through press, with a prefill or without one", () => {
    // Storage lost the prefill: still nothing is sent on the person's behalf.
    expect(firstTurn(null, true)).toBeNull();
    // The person sent their own words during the read: those go.
    expect(firstTurn("Add the length panel again, smaller", true)).toBe("Add the length panel again, smaller");
  });
});

describe("talking a failed job through", () => {
  it("opens on the diagram an extend job was about, and on nothing for a new one", () => {
    expect(talkTarget({ mode: "extend", slug: "dot-product" })).toBe("dot-product");
    expect(talkTarget({ mode: "new", slug: "tcp-window" })).toBeNull();
  });

  it("hands the Extend panel its prefill once, and nothing for another diagram", () => {
    const store = memory();
    leavePrefill(store, "dot-product", "A drawing failed; change it.");
    expect(takePrefill(store, "other")).toBeNull();
    expect(takePrefill(store, "dot-product")).toBe("A drawing failed; change it.");
    expect(takePrefill(store, "dot-product")).toBeNull();
    expect(takePrefill(blocked(), "dot-product")).toBeNull();
    expect(takePrefill(null, "dot-product")).toBeNull();
  });

  it("prefills the intent, what it was meant to draw and what went wrong", () => {
    const text = talkItThroughText(
      { title: "TCP window", slug: "tcp-window", mode: "new", intent: "Show how the window shrinks on loss." },
      "the check refused what it drew",
    );
    expect(text).toContain('A drawing of "TCP window" (a new diagram, tcp-window) failed');
    expect(text).toContain("It was meant to show: Show how the window shrinks on loss.");
    expect(text).toContain("What went wrong: the check refused what it drew");
  });

  it("names the diagram an extension was for, and leaves out a failure it does not know", () => {
    const text = talkItThroughText({ title: "Dot product", slug: "dot-product", mode: "extend", intent: "Add the projection." }, null);
    expect(text).toContain("an extension of dot-product");
    expect(text).not.toContain("What went wrong");
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
    leaveOpener(store, "d1", { send: EXTEND_OPENER, compose: "", source: null });
    expect(takeOpener(store, "d1")).toEqual({ send: EXTEND_OPENER, compose: "", source: null });
    expect(takeOpener(store, "d1")).toBeNull();
  });

  it("carries a message sent while the diagram was read, what was left unsent, and the diagram", () => {
    const store = memory();
    leaveOpener(store, "d1", { send: "Add the projection of a onto b", compose: "and label the angle", source: "dot-product" });
    expect(takeOpener(store, "d1")).toEqual({
      send: "Add the projection of a onto b",
      compose: "and label the angle",
      source: "dot-product",
    });
  });

  it("is nothing when missing, malformed, or unreadable", () => {
    const store = memory();
    expect(takeOpener(store, "d1")).toBeNull();
    store.setItem("studio:extend-opener:d2", "{not json");
    expect(takeOpener(store, "d2")).toEqual({ send: null, compose: "", source: null });
    expect(takeOpener(blocked(), "d3")).toBeNull();
    expect(takeOpener(null, "d4")).toBeNull();
  });
});

describe("the picture across the hand-off", () => {
  it("remembers which diagram a draft was just opened on, and nothing else", async () => {
    const { arrivingSource, noteArrival } = await import("./studio-extend");
    expect(arrivingSource("fresh")).toBeNull();
    noteArrival("d9", "dot-product");
    expect(arrivingSource("d9")).toBe("dot-product");
  });
});
