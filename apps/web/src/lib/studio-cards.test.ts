import { describe, expect, it } from "vitest";

import { valueOf } from "@/components/ui/mention-text";
import type { DraftSlot, DraftView, TranscriptEntry, VideoBrief } from "@/lib/studio-drafts";
import type { Brief, Job } from "@/lib/studio-jobs";

import {
  askAgainValue,
  entryBriefs,
  jobKind,
  kindBusy,
  kindCardStatus,
  kindDrawBlock,
  kindDrawKey,
  kindPendingTopic,
  kindUnavailable,
  lastPersonValue,
  liveCards,
  makeBoth,
  mentionOptions,
  modEnterPlan,
  openerValue,
  lengthSendBlock,
  newestBriefSeq,
  plannerKindsOf,
  pressLabel,
  suggestionsFor,
  suggestKinds,
  topicSuggestionValue,
  valueBack,
  valueSendBlock,
  waitingKinds,
  waitingLine,
  SAY_WHAT,
} from "./studio-cards";
import { STILL_ANSWERING } from "./studio-chat";

const DIAGRAM: Brief = {
  intent: "Show how attention weights are computed",
  title: "Attention weights",
  topic: "transformers",
  slug: "attention-weights",
  mode: "new",
  elements: [{ label: "Query" }, { label: "Key" }],
  relations: [],
};

const VIDEO: VideoBrief = {
  title: "How attention weights are computed",
  topic: "transformers",
  slug: "attention-weights",
  mode: "new",
  idea: "Attention weights come from comparing a query with every key.",
  audience: "familiar",
  targetSeconds: 60,
  voice: "af_heart",
  scenes: [{ name: "why_it_matters", beats: [{ say: "Each word decides which other words matter.", show: "A sentence.", labels: [] }] }],
  concepts: [],
};

const entry = (seq: number, role: TranscriptEntry["role"], text: string, extra: Partial<TranscriptEntry> = {}): TranscriptEntry => ({
  seq,
  role,
  text,
  at: "2026-09-29T00:00:00Z",
  ...extra,
});

const slot = (over: Partial<DraftSlot> = {}): DraftSlot => ({
  brief: null,
  briefSeq: null,
  pendingTopic: null,
  jobId: null,
  waiting: null,
  requestSeq: null,
  held: null,
  state: "open",
  ...over,
});

const view = (over: Partial<DraftView> = {}): DraftView => ({
  draftId: "d1",
  kind: "diagram",
  state: "briefed",
  source: null,
  title: null,
  transcript: [],
  brief: null,
  pendingTopic: null,
  jobId: null,
  turns: 1,
  turnCap: 20,
  costUsd: null,
  costSource: null,
  inFlight: false,
  error: null,
  created: "2026-09-29T00:00:00Z",
  updated: "2026-09-29T00:00:00Z",
  note: "",
  plannerKinds: ["diagram", "video"],
  slots: {},
  ...over,
});

const job = (over: Partial<Job>): Job =>
  ({
    jobId: "j1",
    kind: "new",
    state: "running",
    phase: null,
    title: "A job",
    topic: "transformers",
    target: "learn/assets/attention-weights.tldr",
    candidate: "",
    attempt: 1,
    turns: null,
    costUsd: null,
    costSource: null,
    exitCode: null,
    gate: null,
    written: [],
    indexed: false,
    error: null,
    errorKind: null,
    requested: "2026-09-29T00:00:00Z",
    started: null,
    finished: null,
    updated: "2026-09-29T00:00:00Z",
    cancelRequestedAt: null,
    note: "",
    ...over,
  }) as Job;

/** A person asking for both, and one reply carrying both briefs. */
const bothAsked = (over: Partial<DraftView> = {}) =>
  view({
    transcript: [
      entry(1, "person", "make a @video and a @diagram", {
        mentions: [
          { kind: "video", start: 7, end: 13 },
          { kind: "diagram", start: 20, end: 28 },
        ],
      }),
      entry(2, "planner", "Here are both.", {
        briefs: [
          { kind: "diagram", brief: DIAGRAM, requestSeq: 1 },
          { kind: "video", brief: VIDEO, requestSeq: 1 },
        ],
      }),
    ],
    slots: {
      diagram: slot({ brief: DIAGRAM, briefSeq: 2, requestSeq: 1, state: "briefed" }),
      video: slot({ brief: VIDEO, briefSeq: 2, requestSeq: 1, state: "briefed" }),
    },
    ...over,
  });

describe("entryBriefs", () => {
  it("reads briefs by kind, keeping the last of each", () => {
    const briefs = entryBriefs({
      briefs: [
        { kind: "diagram", brief: DIAGRAM, requestSeq: 1 },
        { kind: "diagram", brief: { ...DIAGRAM, title: "Second" }, requestSeq: 1 },
        { kind: "video", brief: VIDEO, requestSeq: 1 },
      ],
    });
    expect(briefs.map((item) => [item.kind, item.brief.title])).toEqual([
      ["diagram", "Second"],
      ["video", VIDEO.title],
    ]);
  });

  it("reads a runner from before STUDIO-MENTIONS.md: a lone brief is a diagram", () => {
    expect(entryBriefs({ brief: DIAGRAM })).toEqual([{ kind: "diagram", brief: DIAGRAM, requestSeq: null }]);
    expect(entryBriefs({})).toEqual([]);
  });
});

describe("kindCardStatus", () => {
  it("keeps one live card per kind: a newer video brief greys only the older video card", () => {
    const current = bothAsked();
    current.transcript.push(
      entry(3, "person", "@video shorter", { mentions: [{ kind: "video", start: 0, end: 6 }] }),
      entry(4, "planner", "Shorter.", { briefs: [{ kind: "video", brief: { ...VIDEO, targetSeconds: 60 }, requestSeq: 3 }] }),
    );
    current.slots!.video = slot({ brief: VIDEO, briefSeq: 4, requestSeq: 3, state: "briefed" });
    expect(kindCardStatus(current, 2, "diagram")).toBe("live");
    expect(kindCardStatus(current, 2, "video")).toBe("stale");
    expect(kindCardStatus(current, 4, "video")).toBe("live");
    expect(newestBriefSeq(current.transcript, "video")).toBe(4);
  });

  it("shows a card the planner held, and one out of force", () => {
    const current = bothAsked();
    current.slots!.video = slot({ ...current.slots!.video, held: { reason: "You said the topic is wrong" } });
    current.slots!.diagram = slot({ ...current.slots!.diagram, state: "open" });
    expect(kindCardStatus(current, 2, "video")).toBe("onHold");
    expect(kindCardStatus(current, 2, "diagram")).toBe("held");
  });

  it("tells the brief a job was made from from a newer one that landed while it ran (C14 lifted)", () => {
    const current = bothAsked();
    current.slots!.diagram = slot({ ...current.slots!.diagram, state: "drawing", jobId: "j1", briefAt: "2026-09-29T00:00:00Z" });
    const running = [job({ jobId: "j1", requested: "2026-09-29T00:00:05Z" })];
    expect(kindCardStatus(current, 2, "diagram", running)).toBe("drawn");
    current.slots!.diagram.briefAt = "2026-09-29T00:01:00Z";
    expect(kindCardStatus(current, 2, "diagram", running)).toBe("live");
  });

  it("falls back to the one-card rule with no slots", () => {
    const old = view({ slots: undefined, state: "briefed", transcript: [entry(1, "planner", "x", { brief: DIAGRAM })] });
    expect(kindCardStatus(old, 1, "diagram")).toBe("live");
    expect(kindCardStatus(old, 1, "video")).toBe("stale");
  });

  it("closes every card of an abandoned draft", () => {
    expect(kindCardStatus(bothAsked({ state: "abandoned" }), 2, "video")).toBe("closed");
  });
});

describe("kindPendingTopic", () => {
  it("reads the slot's own topic for the card in force, and the reply's for an older one", () => {
    const pending = { entry: { slug: "attn", title: "Attention", domain: "ml", summary: null, aliases: [], relations: [] }, nearMatches: [] };
    const current = bothAsked();
    current.slots!.video = slot({ ...current.slots!.video, pendingTopic: pending });
    expect(kindPendingTopic("live", "video", {}, current)).toBe(pending);
    expect(kindPendingTopic("live", "diagram", {}, current)).toBeNull();
    expect(kindPendingTopic("stale", "video", { pendingTopic: pending }, current)).toBe(pending);
  });
});

describe("pressing", () => {
  it("disables a card while that kind's job from the draft is open, and leaves the other alone (T8)", () => {
    const current = bothAsked();
    current.slots!.diagram = slot({ ...current.slots!.diagram, jobId: "j1" });
    const jobs = [job({ jobId: "j1", state: "awaiting_review" })];
    expect(kindBusy(current, "diagram", jobs)?.jobId).toBe("j1");
    expect(kindDrawBlock("diagram", DIAGRAM, current, jobs, null, { ok: true, reason: null })?.reason).toBe(
      "The diagram is still being drawn.",
    );
    expect(kindDrawBlock("video", VIDEO, current, jobs, null, { ok: true, reason: null })).toBeNull();
    expect(kindBusy(current, "diagram", [job({ jobId: "j1", state: "accepted" })])).toBeNull();
  });

  it("lets a diagram and a video share a slug, but not two of one kind (T10)", () => {
    const video = job({ jobId: "v1", target: "videos/attention-weights.mp4" });
    expect(jobKind(video)).toBe("video");
    expect(kindDrawBlock("diagram", DIAGRAM, bothAsked(), [video], null, null)).toBeNull();
    expect(kindDrawBlock("video", VIDEO, bothAsked(), [video], null, null)?.holder).toBe("v1");
  });

  it("says why, in order: a reply arriving, on hold, the video doctor, the cap", () => {
    const current = bothAsked();
    expect(kindDrawBlock("video", VIDEO, { ...current, inFlight: true }, [], null, null)?.reason).toBe(STILL_ANSWERING);
    current.slots!.video = slot({ ...current.slots!.video, held: { reason: "You said the topic is wrong" } });
    expect(kindDrawBlock("video", VIDEO, current, [], null, null)?.reason).toBe("On hold: You said the topic is wrong");
    expect(kindDrawBlock("video", VIDEO, bothAsked(), [], null, { ok: false, reason: "kokoro is not cached" })?.reason).toBe(
      "Videos are unavailable: kokoro is not cached",
    );
    expect(
      kindDrawBlock("diagram", DIAGRAM, bothAsked(), [], { capUsd: 5, totalUsd: 6, exceeded: true, oldestAgesOutAt: null }, null)?.reason,
    ).toMatch(/daily cap is spent/);
  });

  it("keys each press by reply, kind and the kind's previous job", () => {
    expect(kindDrawKey("d1", 2, "video", null)).toBe("draw:d1:2:video:none");
    expect(kindDrawKey("d1", 2, "diagram", "j1")).toBe("draw:d1:2:diagram:j1");
    expect(kindDrawKey("d1", 2, "diagram", null)).not.toBe(kindDrawKey("d1", 2, "video", null));
  });

  it("words each press, with the topic's creation when one is proposed", () => {
    const pending = { entry: { slug: "x", title: "X", domain: "d", summary: null, aliases: [], relations: [] }, nearMatches: [] };
    expect(pressLabel("diagram", null)).toBe("Draw");
    expect(pressLabel("video", null)).toBe("Make video");
    expect(pressLabel("video", pending)).toBe("Create topic and make video");
  });
});

describe("Make both", () => {
  it("offers it for a pair asked for in one message, under the later card", () => {
    const both = makeBoth(liveCards(bothAsked(), [], null, { ok: true, reason: null }));
    expect(both?.label).toBe("Make both");
    expect(both?.cards.map((card) => card.kind)).toEqual(["diagram", "video"]);
    expect(both?.kind).toBe("video");
  });

  it("pairs by request, not by reply: a video fixed on a retry still pairs (T31)", () => {
    const current = bothAsked();
    current.transcript[1] = entry(2, "planner", "The diagram.", { briefs: [{ kind: "diagram", brief: DIAGRAM, requestSeq: 1 }] });
    current.transcript.push(entry(4, "planner", "The video, fixed.", { briefs: [{ kind: "video", brief: VIDEO, requestSeq: 1 }] }));
    current.slots!.video = slot({ brief: VIDEO, briefSeq: 4, requestSeq: 1, state: "briefed" });
    const both = makeBoth(liveCards(current, [], null, null));
    expect(both?.seq).toBe(4);
    expect(both?.kind).toBe("video");
  });

  it("is not offered for cards from different requests, or while either is disabled", () => {
    const apart = bothAsked();
    apart.slots!.video = slot({ ...apart.slots!.video, requestSeq: 3 });
    expect(makeBoth(liveCards(apart, [], null, null))).toBeNull();
    expect(makeBoth(liveCards(bothAsked(), [], null, { ok: false, reason: "no Metal" }))).toBeNull();
    const held = bothAsked();
    held.slots!.diagram = slot({ ...held.slots!.diagram, held: { reason: "wrong idea" } });
    expect(makeBoth(liveCards(held, [], null, null))).toBeNull();
  });

  it("says it creates the topic when either brief proposes one", () => {
    const pending = { entry: { slug: "x", title: "X", domain: "d", summary: null, aliases: [], relations: [] }, nearMatches: [] };
    const current = bothAsked();
    current.slots!.diagram = slot({ ...current.slots!.diagram, pendingTopic: pending });
    expect(makeBoth(liveCards(current, [], null, null))?.label).toBe("Create topic and make both");
  });
});

describe("Cmd+Enter (T9)", () => {
  const cards = liveCards(bothAsked(), [], null, null);
  it("sends words, presses the one live card, and with two only announces: focus never moves to a paid button", () => {
    expect(modEnterPlan(false, cards)).toEqual({ action: "send" });
    expect(modEnterPlan(true, cards.slice(0, 1))).toEqual({ action: "press", card: cards[0] });
    expect(modEnterPlan(true, cards)).toEqual({ action: "announce" });
    expect(modEnterPlan(true, [])).toEqual({ action: "none" });
  });
});

describe("waiting and suggestions", () => {
  it("lists the kinds still owed a brief", () => {
    const current = bothAsked();
    current.slots!.video = slot({ ...current.slots!.video, waiting: { requestSeq: 3 } });
    expect(waitingKinds(current)).toEqual([{ kind: "video", requestSeq: 3 }]);
    expect(waitingLine("video")).toBe("Video brief still to come");
    expect(waitingKinds(view({ slots: undefined }))).toEqual([]);
  });

  it("shows suggestions under the newest reply only, and not once the person has answered", () => {
    const current = view({
      transcript: [entry(1, "person", "what is attention?"), entry(2, "planner", "It is...", { suggest: ["video", "diagram"] })],
    });
    expect(suggestionsFor(current)).toEqual({ seq: 2, kinds: ["video", "diagram"] });
    current.transcript.push(entry(3, "person", "go on"));
    expect(suggestionsFor(current)).toBeNull();
    expect(suggestionsFor({ ...current, transcript: current.transcript.slice(0, 2), inFlight: true })).toBeNull();
  });

  it("reads suggest as a list or as the block's own object", () => {
    expect(suggestKinds({ kinds: ["diagram", "nope", "diagram"] })).toEqual(["diagram"]);
    expect(suggestKinds(null)).toEqual([]);
  });
});

describe("the menu's entries", () => {
  it("disables Video on a draft whose prompt predates it (T4), or when the doctor fails (T5)", () => {
    expect(plannerKindsOf({})).toEqual(["diagram"]);
    expect(kindUnavailable("video", {}, null)).toBe("Start a new conversation to make a video");
    expect(kindUnavailable("video", { plannerKinds: ["diagram", "video"] }, { ok: false, reason: "no Metal" })).toBe(
      "Videos are unavailable: no Metal",
    );
    expect(kindUnavailable("video", { plannerKinds: ["diagram", "video"] }, { ok: false, reason: null })).toBe(
      "Videos are not available on this machine",
    );
    const options = mentionOptions({ plannerKinds: ["diagram", "video"] }, { ok: true, reason: null });
    expect(options.map((option) => [option.name, option.disabledReason])).toEqual([
      ["Diagram", null],
      ["Video", null],
    ]);
  });
});

describe("the composer's values", () => {
  it("keeps Send for a bare tag until the conversation has a turn (T15, T16)", () => {
    const bare = valueOf<"video">([{ type: "mention", kind: "video" }]);
    expect(valueSendBlock(bare, true)).toBe(SAY_WHAT);
    expect(valueSendBlock(bare, false)).toBeNull();
  });

  it("gives back a refused turn's words and chips (T17)", () => {
    const body = valueOf<"video">([{ type: "mention", kind: "video" }, { type: "text", text: " tcp" }]);
    expect(valueBack({ text: "", mentions: [] }, body, false)).toBe(body);
    expect(valueBack({ text: "newer", mentions: [] }, body, false).text).toBe("newer");
    expect(valueBack({ text: "newer", mentions: [] }, body, true).text).toBe("@video tcp\nnewer");
  });

  it("resends the last message with its chips, and asks again with the failed kind's tag", () => {
    const transcript = [entry(1, "person", "a @video", { mentions: [{ kind: "video", start: 2, end: 8 }] })];
    expect(lastPersonValue(transcript)).toEqual({ text: "a @video", mentions: [{ kind: "video", start: 2, end: 8 }] });
    const again = askAgainValue({ case: "E6", text: "scenes: too many", field: "scenes" }, "video");
    expect(again.text.startsWith("@video The studio refused that brief: scenes: too many.")).toBe(true);
    expect(again.mentions).toEqual([{ kind: "video", start: 0, end: 6 }]);
    expect(askAgainValue({ case: "E6", text: "x", field: null }, null).mentions).toEqual([]);
  });

  it("prefills a topic suggestion as a tagged sentence, never sent", () => {
    expect(topicSuggestionValue("TCP").text).toBe("A @diagram for TCP that shows ");
  });
});

describe("a video in review replaced by a newer brief (D52)", () => {
  it("lets the press through, says so, and does not count the replaced job as holding the slug", () => {
    const current = bothAsked();
    current.slots!.video = slot({ ...current.slots!.video, jobId: "v1", replaces: { jobId: "v1" } });
    const jobs = [job({ jobId: "v1", state: "awaiting_review", target: "videos/attention-weights.mp4" })];
    expect(kindDrawBlock("video", VIDEO, current, jobs, null, null)).toBeNull();
    expect(liveCards(current, jobs, null, null).find((card) => card.kind === "video")?.replaces).toBe("v1");
    expect(pressLabel("video", null, true)).toBe("Replace and make video");
    current.slots!.video.replaces = null;
    expect(kindDrawBlock("video", VIDEO, current, jobs, null, null)?.reason).toBe("The video is still being made.");
  });
});

describe("openerValue", () => {
  it("puts a Change's chips ahead of its words, and nothing when there is neither", () => {
    expect(openerValue({ compose: "say it slower", mentions: ["video", "nope", "video"] })).toEqual({
      text: "@video say it slower",
      mentions: [{ kind: "video", start: 0, end: 6 }],
    });
    expect(openerValue({ compose: "just words" })).toEqual({ text: "just words", mentions: [] });
    expect(openerValue({ compose: "", mentions: [] })).toBeNull();
  });
});

describe("an over-long message", () => {
  it("blocks Send with the count, and only Send", () => {
    expect(lengthSendBlock({ text: "x".repeat(8_000), mentions: [] }, 8_000)).toBeNull();
    expect(lengthSendBlock({ text: "x".repeat(16_500), mentions: [] }, 8_000)).toBe("16,500 of 8,000 characters. Cut it down to send.");
  });
});

describe("a malformed video brief", () => {
  it("is left out of the entry's cards rather than drawn", () => {
    const briefs = entryBriefs({ briefs: [{ kind: "video", brief: { title: "no scenes" } as never, requestSeq: 1 }, { kind: "diagram", brief: DIAGRAM, requestSeq: 1 }] });
    expect(briefs.map((item) => item.kind)).toEqual(["diagram"]);
  });
});

describe("the runner's own slot fields (#207)", () => {
  it("takes live and busy from the slot when it sends them", () => {
    const current = bothAsked();
    current.slots!.video = slot({ ...current.slots!.video, state: "drawing", live: true, busy: { jobId: "v1", state: "running" } });
    expect(kindCardStatus(current, 2, "video")).toBe("live");
    expect(kindBusy(current, "video", [])?.jobId).toBe("v1");
    expect(kindBusy(current, "video", [job({ jobId: "v1", state: "accepted" })])).toBeNull();
    current.slots!.video = slot({ ...current.slots!.video, live: false, busy: null });
    expect(kindCardStatus(current, 2, "video")).toBe("drawn");
    expect(kindBusy(current, "video", [job({ jobId: "v1", state: "running" })])).toBeNull();
  });

  it("keeps an older card's own proposed topic from its brief", () => {
    const pending = { entry: { slug: "attn", title: "Attention", domain: "ml", summary: null, aliases: [], relations: [] }, nearMatches: [] };
    const entry = { briefs: [{ kind: "video" as const, brief: VIDEO, requestSeq: 1, pendingTopic: pending }] };
    expect(kindPendingTopic("stale", "video", entry, bothAsked())).toBe(pending);
  });
});
