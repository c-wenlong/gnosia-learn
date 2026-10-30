import { describe, expect, it } from "vitest";

import {
  EXTEND_KEY_TTL_MS,
  EXTEND_OPENER,
  extendKey,
  extendRefusal,
  firstTurn,
  forgetExtendKey,
  carryOpener,
  leaveOpener,
  readOpener,
  readingWords,
  leavePrefill,
  takeOpener,
  takePrefill,
  talkItThroughText,
  talkTarget,
  MAKE_VIDEO_WORDS,
  makeVideoTitle,
  makeVideoValue,
} from "./studio-extend";
import { openerValue } from "./studio-cards";
import { RUNNER_DOWN } from "@/lib/studio-client";

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
    expect(firstTurn(null, false)).toEqual({ text: EXTEND_OPENER, mentions: [] });
    expect(firstTurn({ text: "Add the projection", mentions: [] }, false)).toEqual({ text: "Add the projection", mentions: [] });
  });

  it("keeps the chips of a message sent during the read", () => {
    const queued = { text: "@video of the handshake", mentions: [{ kind: "video" as const, start: 0, end: 6 }] };
    expect(firstTurn(queued, false)).toBe(queued);
    expect(firstTurn(queued, true)).toBe(queued);
  });

  it("is never the opener on a Talk it through press, with a prefill or without one", () => {
    // Storage lost the prefill: still nothing is sent on the person's behalf.
    expect(firstTurn(null, true)).toBeNull();
    // The person sent their own words during the read: those go.
    expect(firstTurn({ text: "Add the length panel again, smaller", mentions: [] }, true)).toEqual({
      text: "Add the length panel again, smaller",
      mentions: [],
    });
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

  it("is reused for the same print only, so an edited press makes its own draft", () => {
    const store = memory();
    let minted = 0;
    const fresh = () => `k${(minted += 1)}`;
    const first = extendKey(store, "tutor:tcp", fresh, 1_000, "a");
    expect(extendKey(store, "tutor:tcp", fresh, 2_000, "a")).toBe(first);
    const edited = extendKey(store, "tutor:tcp", fresh, 3_000, "b");
    expect(edited).not.toBe(first);
    // The edited press is now the one a retry finds.
    expect(extendKey(store, "tutor:tcp", fresh, 4_000, "b")).toBe(edited);
    // A key kept with no print is not a match for a press that has one, and the reverse.
    const plain = extendKey(store, "dot-product", fresh, 1_000);
    expect(extendKey(store, "dot-product", fresh, 2_000, "a")).not.toBe(plain);
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
    expect(takeOpener(store, "d1")).toEqual({
      send: EXTEND_OPENER,
      sendMentions: [],
      compose: "",
      composeMentions: [],
      source: null,
      mentions: [],
    });
    expect(takeOpener(store, "d1")).toBeNull();
  });

  it("carries the chips a video's Change starts the composer with, and nothing else", () => {
    const store = memory();
    leaveOpener(store, "d1", { send: null, compose: "say it slower", source: null, mentions: ["video"] });
    expect(takeOpener(store, "d1")).toEqual({
      send: null,
      sendMentions: [],
      compose: "say it slower",
      composeMentions: [],
      source: null,
      mentions: ["video"],
    });
    store.setItem("studio:extend-opener:d2", JSON.stringify({ compose: "x", mentions: ["video", "video", "audio", 3] }));
    expect(takeOpener(store, "d2")?.mentions).toEqual(["video"]);
  });

  it("carries a message sent while the diagram was read, what was left unsent, and the diagram", () => {
    const store = memory();
    leaveOpener(store, "d1", { send: "Add the projection of a onto b", compose: "and label the angle", source: "dot-product" });
    expect(takeOpener(store, "d1")).toEqual({
      send: "Add the projection of a onto b",
      sendMentions: [],
      compose: "and label the angle",
      composeMentions: [],
      source: "dot-product",
      mentions: [],
    });
  });

  it("carries where the chips sit in the queued message and in the unsent words", () => {
    const store = memory();
    leaveOpener(store, "d1", {
      send: "A @diagram of the handshake",
      sendMentions: [{ kind: "diagram", start: 2, end: 10 }],
      compose: "then a @video of it",
      composeMentions: [{ kind: "video", start: 7, end: 13 }],
      source: "tcp",
    });
    expect(takeOpener(store, "d1")).toEqual({
      send: "A @diagram of the handshake",
      sendMentions: [{ kind: "diagram", start: 2, end: 10 }],
      compose: "then a @video of it",
      composeMentions: [{ kind: "video", start: 7, end: 13 }],
      source: "tcp",
      mentions: [],
    });
  });

  it("reads a chip it cannot vouch for as words: wrong range, unknown kind, twice, or no message to carry it", () => {
    const store = memory();
    store.setItem(
      "studio:extend-opener:d1",
      JSON.stringify({
        send: "@video and @video",
        sendMentions: [
          { kind: "video", start: 0, end: 6 },
          { kind: "video", start: 11, end: 17 },
          { kind: "audio", start: 7, end: 10 },
          { kind: "diagram", start: 0, end: 6 },
          "video",
          null,
        ],
        compose: "x",
        composeMentions: [{ kind: "video", start: 0, end: 6 }],
      }),
    );
    expect(takeOpener(store, "d1")).toMatchObject({ sendMentions: [{ kind: "video", start: 0, end: 6 }], composeMentions: [] });
    store.setItem("studio:extend-opener:d2", JSON.stringify({ send: "  ", sendMentions: [{ kind: "video", start: 0, end: 6 }] }));
    expect(takeOpener(store, "d2")).toMatchObject({ send: null, sendMentions: [] });
    store.setItem("studio:extend-opener:d3", JSON.stringify({ send: "@video", sendMentions: "video", composeMentions: 3 }));
    expect(takeOpener(store, "d3")).toMatchObject({ sendMentions: [], composeMentions: [] });
  });

  it("is nothing when missing, malformed, or unreadable", () => {
    const store = memory();
    expect(takeOpener(store, "d1")).toBeNull();
    store.setItem("studio:extend-opener:d2", "{not json");
    expect(takeOpener(store, "d2")).toEqual({
      send: null,
      sendMentions: [],
      compose: "",
      composeMentions: [],
      source: null,
      mentions: [],
    });
    expect(takeOpener(blocked(), "d3")).toBeNull();
    expect(takeOpener(null, "d4")).toBeNull();
  });

  it("is kept in the page's memory when the store refuses it, and taken from there once", () => {
    const opener = { send: "@video", sendMentions: [{ kind: "video" as const, start: 0, end: 6 }], compose: "", source: null };
    leaveOpener(blocked(), "held-1", opener);
    expect(readOpener(blocked(), "held-1")).toMatchObject({ send: "@video", sendMentions: opener.sendMentions });
    expect(takeOpener(null, "held-1")).toMatchObject({ send: "@video" });
    expect(takeOpener(null, "held-1")).toBeNull();
    // A store that takes the write and keeps nothing is the same case.
    const forgetful = { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage;
    leaveOpener(forgetful, "held-2", opener);
    expect(takeOpener(forgetful, "held-2")).toMatchObject({ send: "@video" });
  });
});

describe("Make a video of this (D86)", () => {
  it("starts the composer with the Video chip and the sentence, and never a first turn", () => {
    const value = makeVideoValue({ ok: true, reason: null });
    expect(value).toEqual({ text: `@video ${MAKE_VIDEO_WORDS}`, mentions: [{ kind: "video", start: 0, end: 6 }] });
    // Unknown availability reads as available, as the menu reads it.
    expect(makeVideoValue(null)).toEqual(value);
    // Nothing queued: the press sends nothing, whatever it holds.
    expect(firstTurn(null, true)).toBeNull();
    expect(makeVideoTitle("Dot product")).toBe("A video of Dot product");
  });

  it("leaves the words without a chip when the video doctor says no", () => {
    expect(makeVideoValue({ ok: false, reason: "manimkc is not installed" })).toEqual({ text: MAKE_VIDEO_WORDS, mentions: [] });
  });

  it("reaches the conversation's composer with its chip where it was, and sends nothing", () => {
    const store = memory();
    const value = makeVideoValue({ ok: true, reason: null });
    leaveOpener(store, "dv", { send: null, sendMentions: [], compose: value.text, composeMentions: value.mentions, source: "dot-product" });
    const opener = takeOpener(store, "dv")!;
    expect(opener.send).toBeNull();
    expect(openerValue(opener)).toEqual(value);
  });

  it("does not take the key an Extend press on the same diagram left, nor leave it one", () => {
    const store = memory();
    let minted = 0;
    const fresh = () => `k${++minted}`;
    const extend = extendKey(store, "dot-product", fresh, 1_000);
    const video = extendKey(store, "dot-product", fresh, 2_000, "video");
    expect(video).not.toBe(extend);
    // A reload of the video press finds its own draft.
    expect(extendKey(store, "dot-product", fresh, 3_000, "video")).toBe(video);
    // And Extend after it is its own press again.
    expect(extendKey(store, "dot-product", fresh, 4_000)).not.toBe(video);
  });

  it("remembers that a draft was opened for a video, in this tab only", async () => {
    const { arrivingPurpose, arrivingSource, noteArrival } = await import("./studio-extend");
    expect(arrivingPurpose("fresh-v")).toBeNull();
    noteArrival("dv1", "dot-product", "video");
    noteArrival("de1", "dot-product");
    expect(arrivingPurpose("dv1")).toBe("video");
    expect(arrivingSource("dv1")).toBe("dot-product");
    expect(arrivingPurpose("de1")).toBe("extend");
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

describe("an Extend press run twice for the same draft", () => {
  const queued = { send: "Add the projection", sendMentions: [], compose: "and label it", composeMentions: [], source: "dot-product" };
  const rerun = { send: EXTEND_OPENER, sendMentions: [], compose: "", composeMentions: [], source: "dot-product" };

  it("is left alone the first time", () => {
    expect(carryOpener(null, rerun, false)).toEqual(rerun);
  });

  it("keeps the earlier message and words when nothing was typed since", () => {
    expect(carryOpener(queued, rerun, false)).toEqual(queued);
  });

  it("sends a message queued since, and composes words typed since", () => {
    const since = { ...rerun, send: "Show it on a graph", compose: "slowly" };
    expect(carryOpener(queued, since, true)).toEqual(since);
  });

  it("keeps the earlier words when only a message was queued since", () => {
    const since = { ...rerun, send: "Show it on a graph" };
    expect(carryOpener(queued, since, true)).toMatchObject({ send: "Show it on a graph", compose: "and label it" });
  });
  it("never lets Make a video of this's own sentence replace words typed before a reload (#305 review)", () => {
    // Send pressed during the read, then more typed, then a reload after the hand-off was saved.
    const value = makeVideoValue({ ok: true, reason: null });
    const before = { send: "@video Show the projection", sendMentions: [{ kind: "video" as const, start: 0, end: 6 }], compose: "and keep it short", composeMentions: [], source: "dot-product" };
    const reloaded = { send: null, sendMentions: [], compose: value.text, composeMentions: value.mentions, source: "dot-product" };
    expect(carryOpener(before, reloaded, false, { composeUntouched: true })).toMatchObject({
      send: "@video Show the projection",
      sendMentions: before.sendMentions,
      compose: "and keep it short",
    });
    // Words the person typed over the sentence since are theirs, and win.
    const edited = { ...reloaded, compose: "@video Only the second panel", composeMentions: [{ kind: "video" as const, start: 0, end: 6 }] };
    expect(carryOpener(before, edited, false, { composeUntouched: false })).toMatchObject({ compose: "@video Only the second panel" });
    // An untouched sentence over an untouched sentence stays the sentence.
    const first = { ...reloaded };
    expect(carryOpener(first, reloaded, false, { composeUntouched: true })).toMatchObject({ compose: value.text, composeMentions: value.mentions });
  });
});

describe("reading an opener without taking it", () => {
  it("leaves it for the conversation to take", () => {
    const store = memory();
    leaveOpener(store, "d1", { send: "Add the projection", compose: "", source: null });
    expect(readOpener(store, "d1")?.send).toBe("Add the projection");
    expect(takeOpener(store, "d1")?.send).toBe("Add the projection");
    expect(readOpener(store, "d1")).toBeNull();
  });
});
