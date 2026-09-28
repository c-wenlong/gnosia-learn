import { describe, expect, it } from "vitest";

import type { DraftView, TranscriptEntry } from "@/lib/studio-drafts";
import type { Brief, Job } from "@/lib/studio-jobs";

import {
  askAgainText,
  capFrom,
  capSentence,
  cardStatus,
  composerState,
  costLabel,
  drawBlock,
  drawLabel,
  drawRefusal,
  isEmptyConversation,
  lastPersonText,
  latestBriefSeq,
  modeLine,
  splitReply,
  STILL_ANSWERING,
  suggestions,
  targetSlug,
  threadProblem,
  visibleEntries,
} from "./studio-chat";

const BRIEF: Brief = {
  intent: "Show how tailscale tunnels traffic",
  title: "Tailscale tunnels",
  topic: "networking",
  slug: "tailscale-tunnels",
  mode: "new",
  elements: [{ label: "Laptop" }, { label: "Relay" }],
  relations: [{ from: "Laptop", to: "Relay", label: "WireGuard" }],
};

const entry = (seq: number, role: TranscriptEntry["role"], text: string, extra: Partial<TranscriptEntry> = {}): TranscriptEntry => ({
  seq,
  role,
  text,
  at: "2026-09-29T00:00:00Z",
  ...extra,
});

const view = (over: Partial<DraftView> = {}): DraftView => ({
  draftId: "d1",
  kind: "diagram",
  state: "open",
  source: null,
  title: null,
  transcript: [],
  brief: null,
  pendingTopic: null,
  jobId: null,
  turns: 0,
  turnCap: 20,
  costUsd: null,
  costSource: null,
  inFlight: false,
  error: null,
  created: "2026-09-29T00:00:00Z",
  updated: "2026-09-29T00:00:00Z",
  note: "",
  ...over,
});

describe("splitReply", () => {
  it("removes a finished brief block and keeps the prose around it", () => {
    const text = 'Here is the brief.\n\n```brief\n{"intent": "x"}\n```\n';
    expect(splitReply(text)).toEqual({ prose: "Here is the brief.", hadBrief: true, checking: false });
  });

  it("removes a topic block too, and never says checking once finished", () => {
    const text = 'Nothing fits.\n```topic\n{"slug":"a"}\n```\nThen:\n```brief\n{}\n```';
    expect(splitReply(text)).toEqual({ prose: "Nothing fits.\n\nThen:", hadBrief: true, checking: false });
  });

  it("keeps any other fenced block", () => {
    const text = "Like this:\n```mermaid\ngraph LR\n```";
    expect(splitReply(text).prose).toBe(text);
  });

  it("cuts an unclosed brief while streaming and says it is checking", () => {
    expect(splitReply('Summary.\n```brief\n{"intent": "Sh', true)).toEqual({
      prose: "Summary.",
      hadBrief: true,
      checking: true,
    });
  });

  it("holds back the first characters of a fence at the end of a stream", () => {
    expect(splitReply("Summary.\n```br", true)).toMatchObject({ prose: "Summary.", checking: true });
    expect(splitReply("Summary.\n``", true)).toMatchObject({ prose: "Summary.", checking: false });
    expect(splitReply("Summary.\n```mer", true).prose).toBe("Summary.\n```mer");
  });

  it("drops an unclosed brief in a finished reply without saying checking", () => {
    expect(splitReply("Summary.\n```brief\n{", false)).toEqual({ prose: "Summary.", hadBrief: true, checking: false });
  });
});

describe("the thread", () => {
  const transcript = [
    entry(1, "person", "draw tailscale"),
    entry(2, "planner", "first", { superseded: true }),
    entry(3, "studio", "retry", { internal: true }),
    entry(4, "planner", "Brief one", { brief: BRIEF }),
    entry(5, "person", "change it"),
    entry(6, "planner", "Brief two", { brief: { ...BRIEF, title: "Two" } }),
  ];

  it("hides superseded replies and internal notes", () => {
    expect(visibleEntries(transcript).map((e) => e.seq)).toEqual([1, 4, 5, 6]);
  });

  it("finds the newest brief", () => expect(latestBriefSeq(transcript)).toBe(6));

  it("gives the one live Draw to the newest brief of a briefed draft", () => {
    expect(cardStatus(view({ state: "briefed", transcript }), 6)).toBe("live");
    expect(cardStatus(view({ state: "briefed", transcript }), 4)).toBe("stale");
    expect(cardStatus(view({ state: "drawing", transcript }), 6)).toBe("drawn");
    expect(cardStatus(view({ state: "open", transcript }), 6)).toBe("stale");
  });

  it("knows an empty conversation, and the last thing the person said", () => {
    expect(isEmptyConversation([])).toBe(true);
    expect(isEmptyConversation([entry(1, "studio", "note")])).toBe(true);
    expect(isEmptyConversation(transcript)).toBe(false);
    expect(lastPersonText(transcript)).toBe("change it");
    expect(lastPersonText([])).toBeNull();
  });
});

describe("money and the cap", () => {
  it("labels an estimate with a tilde", () => {
    expect(costLabel(0.07, "result")).toBe("$0.070");
    expect(costLabel(0.07, "stream")).toBe("~$0.070");
    expect(costLabel(null, null)).toBeNull();
  });

  it("reads the cap from health or a 429", () => {
    expect(capFrom({ totalUsd: 5, capUsd: 5 })).toMatchObject({ exceeded: true });
    expect(capFrom({ totalUsd: 1, capUsd: 5, exceeded: false })).toMatchObject({ exceeded: false });
    expect(capFrom({ totalUsd: 1, capUsd: null })).toMatchObject({ exceeded: false, capUsd: null });
    expect(capFrom(null)).toBeNull();
    expect(capFrom({})).toBeNull();
  });

  it("says what is spent and when it frees", () => {
    const format = (iso: string) => `at ${iso}`;
    expect(capSentence({ capUsd: 5, totalUsd: 5.2, exceeded: true, oldestAgesOutAt: "T" }, format)).toBe(
      "$5.20 of the $5.00 daily cap is spent. It frees from at T, or raise STUDIO_DAILY_USD.",
    );
    expect(capSentence({ capUsd: null, totalUsd: 1, exceeded: true })).toContain("Wait for the 24-hour window");
  });
});

describe("composerState", () => {
  const cap = { capUsd: 5, totalUsd: 6, exceeded: true, oldestAgesOutAt: null };

  it("is open on a fresh draft", () => {
    expect(composerState(view(), null)).toEqual({
      disabled: false,
      sendDisabled: false,
      reason: null,
      placeholder: "Describe the diagram",
    });
  });

  it("asks for another diagram once a job exists", () => {
    expect(composerState(view({ jobId: "j", state: "done" }), null).placeholder).toMatch(/another diagram/);
  });

  it("disables only Send while a reply arrives", () => {
    expect(composerState(view({ inFlight: true }), null)).toMatchObject({ disabled: false, sendDisabled: true, reason: STILL_ANSWERING });
    expect(composerState(view(), null, true)).toMatchObject({ sendDisabled: true });
  });

  it("closes for a drawing, the turn cap, the daily cap and an abandoned draft, in that order", () => {
    expect(composerState(view({ state: "drawing" }), cap).reason).toMatch(/drawing/);
    expect(composerState(view({ turns: 20 }), cap).reason).toBe("This conversation has reached its 20-turn limit.");
    expect(composerState(view(), cap).reason).toMatch(/daily cap/);
    expect(composerState(view({ state: "abandoned" }), null)).toMatchObject({ disabled: true });
  });
});

describe("Draw", () => {
  const job = (over: Partial<Job>): Job => ({ jobId: "j1", state: "running", title: "Other", target: "learn/assets/tailscale-tunnels.tldr", ...over }) as Job;

  it("reads a slug from a target path", () => {
    expect(targetSlug("learn/assets/dot-product.tldr")).toBe("dot-product");
    expect(targetSlug("dot-product")).toBe("dot-product");
  });

  it("is live when nothing is in the way", () => {
    expect(drawBlock(BRIEF, { inFlight: false }, [], null)).toBeNull();
    expect(drawBlock(BRIEF, { inFlight: false }, [job({ state: "accepted" })], null)).toBeNull();
  });

  it("waits for a reply in flight", () => {
    expect(drawBlock(BRIEF, { inFlight: true }, [], null)?.reason).toBe(STILL_ANSWERING);
  });

  it("names the job holding the target, with its id to open", () => {
    const block = drawBlock(BRIEF, { inFlight: false }, [job({ state: "awaiting_review" })], null);
    expect(block?.holder).toBe("j1");
    expect(block?.reason).toContain("waiting for review");
  });

  it("says when the cap frees", () => {
    expect(drawBlock(BRIEF, { inFlight: false }, [], { capUsd: 1, totalUsd: 2, exceeded: true })?.reason).toMatch(/daily cap/);
  });

  it("reads the words for a proposed topic, and the mode line", () => {
    expect(drawLabel(null)).toBe("Draw");
    expect(drawLabel({ entry: { slug: "a", title: "A", domain: "d", summary: null, aliases: [], relations: [] }, nearMatches: [] })).toBe(
      "Create topic and draw",
    );
    expect(modeLine(BRIEF)).toEqual({ lead: "New diagram, saved as", slug: "tailscale-tunnels" });
    expect(modeLine({ ...BRIEF, mode: "extend" }).lead).toBe("Extends");
  });

  it("turns a refused Draw into a sentence and an action", () => {
    expect(drawRefusal(409, { error: "held", detail: { holder: "j9", state: "running" } })).toEqual({ text: "held", holder: "j9" });
    expect(drawRefusal(409, { error: "x", detail: { reason: "topic-exists", pendingTopicCleared: true } }).text).toMatch(/Draw again/);
    expect(drawRefusal(409, { error: "x", detail: { reason: "not-briefed" } }).text).toMatch(/no brief/);
    expect(drawRefusal(429, { error: "cap", detail: { totalUsd: 6, capUsd: 5, oldestAgesOutAt: null } }).text).toMatch(/\$6.00 of the \$5.00/);
    expect(drawRefusal(429, { error: "cap", detail: null }).text).toBe("cap");
    expect(drawRefusal(503, { error: "catalog unreachable", detail: null }).text).toBe("catalog unreachable. Nothing was queued.");
    expect(drawRefusal(400, { error: "bad topic", detail: null }).text).toBe("bad topic");
  });
});

describe("threadProblem", () => {
  it("is nothing while a turn is in flight", () => {
    expect(threadProblem(view({ inFlight: true, error: { kind: "agent", message: "no" } }))).toBeNull();
  });

  it("shows E1 with the API's own sentence", () => {
    const problem = threadProblem(view({ transcript: [entry(1, "person", "hi")], error: { kind: "agent", message: "invalid x-api-key" } }));
    expect(problem).toEqual({ case: "E1", text: "invalid x-api-key" });
  });

  it("shows E2 for a cut-off reply or a timeout", () => {
    expect(threadProblem(view({ transcript: [entry(2, "planner", "par", { interrupted: true })] }))?.case).toBe("E2");
    expect(threadProblem(view({ transcript: [entry(1, "person", "hi")], error: { kind: "timeout", message: "t" } }))?.case).toBe("E2");
  });

  it("shows E6 for a brief refused twice, not for one the retry replaced", () => {
    const twice = entry(4, "planner", "p", { briefInvalid: { field: "relations[2].to", message: "not an element", retried: false } });
    const problem = threadProblem(view({ transcript: [twice] }));
    expect(problem).toEqual({ case: "E6", text: "relations[2].to: not an element", field: "relations[2].to" });
    if (problem?.case === "E6") expect(askAgainText(problem)).toContain("relations[2].to");
    const once = entry(4, "planner", "p", { briefInvalid: { field: "f", message: "m", retried: true } });
    expect(threadProblem(view({ transcript: [once] }))).toBeNull();
    expect(threadProblem(view({ transcript: [entry(1, "person", "x")], error: { kind: "brief-invalid", message: "m" } }))?.case).toBe("E6");
  });

  it("drops an error the planner has since answered past", () => {
    expect(threadProblem(view({ transcript: [entry(3, "planner", "fine")], error: { kind: "agent", message: "old" } }))).toBeNull();
  });
});

describe("suggestions", () => {
  it("offers the corpus's three most used topics, as prefills", () => {
    const titles = new Map([["a", "Alpha"], ["b", "Beta"]]);
    const got = suggestions(["a", "b", "a", null, "c", "d"], titles);
    expect(got.map((s) => s.label)).toEqual(["Alpha", "Beta", "c"]);
    expect(got[0]?.text).toBe("A diagram for Alpha that shows ");
  });

  it("falls back to three examples on an empty corpus", () => {
    expect(suggestions([], new Map())).toHaveLength(3);
  });
});
