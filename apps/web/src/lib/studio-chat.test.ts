import { describe, expect, it } from "vitest";

import type { DraftView, TranscriptEntry } from "@/lib/studio-drafts";
import type { Brief } from "@/lib/studio-jobs";

import {
  capFrom,
  capSentence,
  cardStatus,
  composerState,
  costLabel,
  EDITING_BRIEF,
  drawLabel,
  drawRefusal,
  isEmptyConversation,
  jobPatch,
  landedTurn,
  refusalNoted,
  sendRefusal,
  startOverStep,
  turnIndicator,
  turnKey,
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

  it("keeps an svg block in the prose: it is the picture, not machine text (D105)", () => {
    const text = 'Here.\n```svg\n<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n```\n';
    expect(splitReply(text)).toEqual({ prose: text.trim(), hadBrief: false, checking: false });
  });

  it("keeps an unclosed svg block while streaming, so the partial picture draws", () => {
    const text = 'Here.\n```svg\n<svg viewBox="0 0 1 1"><rect width="1"';
    expect(splitReply(text, true)).toMatchObject({ prose: text, checking: false });
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
    expect(cardStatus(view({ state: "open", transcript }), 6)).toBe("held");
    expect(cardStatus(view({ state: "open", transcript }), 4)).toBe("stale");
    expect(cardStatus(view({ state: "abandoned", transcript }), 6)).toBe("closed");
  });

  it("knows an empty conversation", () => {
    expect(isEmptyConversation([])).toBe(true);
    expect(isEmptyConversation([entry(1, "studio", "note")])).toBe(true);
    expect(isEmptyConversation(transcript)).toBe(false);
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
    expect(composerState(view(), null, false, true)).toEqual({
      disabled: false,
      sendDisabled: false,
      reason: null,
      placeholder: "Describe the diagram",
    });
    expect(composerState(view(), null).placeholder).toBe("Reply to the planner");
  });

  it("asks for another diagram once a job exists", () => {
    expect(composerState(view({ jobId: "j", state: "done" }), null).placeholder).toMatch(/another diagram/);
  });

  it("disables only Send while a reply arrives", () => {
    expect(composerState(view({ inFlight: true }), null)).toMatchObject({ disabled: false, sendDisabled: true, reason: STILL_ANSWERING });
    expect(composerState(view(), null, true)).toMatchObject({ sendDisabled: true });
  });

  it("holds Send, not typing, while the brief is edited on its card", () => {
    expect(composerState(view(), null, false, false, true)).toMatchObject({
      disabled: false,
      sendDisabled: true,
      reason: EDITING_BRIEF,
    });
    // A reply in flight says so first: it is what the person is waiting on.
    expect(composerState(view({ inFlight: true }), null, false, false, true).reason).toBe(STILL_ANSWERING);
  });

  it("closes for a drawing, the turn cap, the daily cap and an abandoned draft, in that order", () => {
    // A drawing job may be running or waiting for review: the sentence covers both.
    expect(composerState(view({ state: "drawing" }), cap).reason).toMatch(/accepted, discarded or cancelled/);
    expect(composerState(view({ turns: 20 }), cap).reason).toBe("This conversation has reached its 20-turn limit.");
    expect(composerState(view(), cap).reason).toMatch(/daily cap/);
    expect(composerState(view({ state: "abandoned" }), null)).toMatchObject({ disabled: true });
  });
});

describe("Draw", () => {

  it("reads a slug from a target path", () => {
    expect(targetSlug("learn/assets/dot-product.tldr")).toBe("dot-product");
    expect(targetSlug("dot-product")).toBe("dot-product");
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
    expect(drawRefusal(409, { error: "held by job j9", detail: { holder: "j9", state: "running" } })).toEqual({
      text: "Held by job j9.",
      holder: "j9",
      error: "held by job j9",
    });
    expect(drawRefusal(409, { error: "x", detail: { reason: "topic-exists", pendingTopicCleared: true } }).text).toMatch(/Draw again/);
    expect(drawRefusal(409, { error: "it exists", detail: { reason: "topic-exists", pendingTopicCleared: false } }).text).toBe("It exists.");
    expect(drawRefusal(409, { error: "x", detail: { reason: "not-briefed", state: "open" } }).text).toMatch(/no brief/);
    expect(drawRefusal(409, { error: "x", detail: { reason: "not-briefed", state: "drawing" } }).text).toMatch(/already in progress/);
    expect(drawRefusal(409, { error: "x", detail: { reason: "in-flight" } }).text).toMatch(/still answering/);
    expect(drawRefusal(409, { error: "x", detail: { reason: "change-not-in-conversation", kind: "video", slug: "tcp-handshake" } }).text).toBe(
      "This brief changes tcp-handshake, which this conversation did not open on or make. Start the change from that video's Change, or ask for a new video here.",
    );
    expect(drawRefusal(400, { error: "items must be a list", detail: { field: "items" } }).text).toBe(
      "Make both was sent without its two cards. Press each card on its own.",
    );
    expect(drawRefusal(409, { error: "x", detail: { reason: "draw-in-progress" } }).text).toMatch(/just pressed/);
    expect(drawRefusal(409, { error: 'a new topic can only be created as "local"', detail: { reason: "topic-owner" } }).text).toBe(
      'A new topic can only be created as "local".',
    );
    expect(drawRefusal(429, { error: "cap", detail: { totalUsd: 6, capUsd: 5, oldestAgesOutAt: null } }).text).toMatch(/\$6.00 of the \$5.00/);
    expect(drawRefusal(429, { error: "cap", detail: null }).text).toBe("Cap.");
    expect(drawRefusal(503, { error: "the catalog cannot be reached", detail: { reason: "catalog-unreachable" } }).text).toBe(
      "The catalog cannot be reached. Nothing was queued.",
    );
    expect(drawRefusal(503, { error: "tldrawkc cannot run on this machine, so nothing was queued", detail: null }).text).toBe(
      "Tldrawkc cannot run on this machine, so nothing was queued.",
    );
    expect(drawRefusal(400, { error: "no such domain", detail: { reason: "topic-add" } }).text).toBe("The new topic was refused: No such domain.");
    expect(drawRefusal(0, { error: "down", detail: null }).text).toMatch(/not answering/);
  });

  it("keeps a refusal's line until the runner's note for that same refusal", () => {
    const refused = { seq: 6, error: "learn/assets/x.tldr is already held by job j9" };
    expect(refusalNoted(refused, [entry(7, "studio", "The topic was created.")])).toBe(false);
    expect(refusalNoted(refused, [entry(5, "studio", `Draw was refused: ${refused.error}`)])).toBe(false);
    expect(refusalNoted(refused, [entry(7, "studio", `Draw was refused: ${refused.error}`)])).toBe(true);
    expect(refusalNoted({ seq: 6, error: "" }, [entry(7, "studio", "anything")])).toBe(false);
  });

  it("opens another conversation's job outside this one", () => {
    const draft = { draftId: "d1", jobId: "j1" };
    expect(jobPatch("j1", draft, [])).toEqual({ job: "j1" });
    expect(jobPatch("j0", draft, [{ jobId: "j0", draftId: "d1" }])).toEqual({ job: "j0" });
    expect(jobPatch("j9", draft, [{ jobId: "j9", draftId: "d2" }])).toEqual({ job: "j9", draft: null });
    expect(jobPatch("j9", draft, [])).toEqual({ job: "j9", draft: null });
  });

  it("abandons only an open or briefed draft before starting over", () => {
    expect(startOverStep("open")).toBe("abandon");
    expect(startOverStep("briefed")).toBe("abandon");
    expect(startOverStep("drawing")).toBe("refuse");
    expect(startOverStep("done")).toBe("skip");
    expect(startOverStep("abandoned")).toBe("skip");
  });
});

describe("sendRefusal", () => {
  it("names each reason the runner gives", () => {
    const say = (status: number, reason: string | null, error = "x") => sendRefusal(status, { error, detail: reason === null ? null : { reason } });
    expect(say(409, "in-flight")).toMatch(/still answering/);
    expect(say(409, "drawing")).toMatch(/Accept, discard or cancel/);
    expect(say(409, "abandoned")).toMatch(/was closed/);
    expect(say(409, "draw-in-progress")).toMatch(/just pressed/);
    expect(say(503, "planner-busy")).toMatch(/busy/);
    expect(say(503, "shutdown")).toMatch(/shutting down/);
    expect(say(422, "turn-cap")).toBeNull();
    expect(say(429, "daily-cap")).toBeNull();
    expect(say(0, null)).toMatch(/still in the box/);
    // Past the deadline the message may have landed, and a resend reuses its key.
    const slow = { error: "the studio runner did not answer in time", detail: null };
    expect(sendRefusal(0, slow)).toMatch(/may have gone through.*will not send it twice/);
    expect(sendRefusal(0, slow, "change")).toMatch(/the change may still land/);
    expect(say(400, null, "text is over 8000 characters")).toBe("Text is over 8000 characters.");
  });
});

describe("turnIndicator", () => {
  it("thinks until a reply lands, then checks the brief while the turn stays open", () => {
    const asked = [entry(1, "person", "draw it")];
    expect(turnIndicator(view({ inFlight: true, transcript: asked }), false)).toBe("thinking");
    expect(turnIndicator(view({ inFlight: true, transcript: asked }), true)).toBeNull();
    const replied = [...asked, entry(2, "planner", "Here it is")];
    expect(turnIndicator(view({ inFlight: true, transcript: replied }), false)).toBe("checking");
    expect(turnIndicator(view({ inFlight: false, transcript: replied }), false)).toBeNull();
    const again = [...replied, entry(3, "person", "change it")];
    expect(turnIndicator(view({ inFlight: true, transcript: again }), false)).toBe("thinking");
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

describe("tags (docs/STUDIO-MENTIONS.md)", () => {
  it("hides suggest and hold blocks from the prose, and does not call them a brief being checked", () => {
    const reply = "A picture would help here.\n\n```suggest\n{\"kinds\": [\"diagram\"]}\n```\n\n```hold\n{\"kinds\": [\"video\"], \"reason\": \"wrong topic\"}\n```";
    expect(splitReply(reply)).toEqual({ prose: "A picture would help here.", hadBrief: false, checking: false });
    expect(splitReply("Try one.\n```sugg", true)).toEqual({ prose: "Try one.", hadBrief: false, checking: false });
    expect(splitReply("Here.\n```suggest\n{\"kinds\"", true).checking).toBe(false);
    expect(splitReply("Here.\n```brief\n{\"kind\"", true).checking).toBe(true);
  });

  it("takes messages while a job runs once the runner has slots (C14 lifted), and opens as a chat", () => {
    const drawing = { ...view({ state: "drawing", jobId: "j1" }), slots: {} };
    const state = composerState(drawing, null, false, false);
    expect(state.disabled).toBe(false);
    expect(state.placeholder).toBe("Reply, or type @ to make something");
    expect(composerState({ ...drawing, state: "open", jobId: null }, null, false, true).placeholder).toBe(
      "Ask about an idea, or type @ to make something",
    );
    expect(composerState(view({ state: "drawing", jobId: "j1" }), null).disabled).toBe(true);
  });
});

describe("Start over with per-kind slots (Greptile on #204)", () => {
  it("leaves a drawing draft alone and opens a new one, where the old runner refused", () => {
    expect(startOverStep("drawing", true)).toBe("skip");
    expect(startOverStep("drawing")).toBe("refuse");
    expect(startOverStep("briefed", true)).toBe("abandon");
  });
});

describe("the press refusals #207 adds", () => {
  it("words kind-busy, held and a video's not-briefed", () => {
    expect(drawRefusal(409, { error: "busy", detail: { reason: "kind-busy", kind: "video", jobId: "v1", state: "awaiting_review" } })).toEqual({
      text: "The video from this conversation is made and ready for review. Accept, discard or cancel it first.",
      holder: "v1",
      error: "busy",
    });
    expect(drawRefusal(409, { error: "busy", detail: { reason: "kind-busy", kind: "diagram", jobId: "j1", state: "running" } }).text).toBe(
      "The diagram from this conversation is still being drawn. Accept, discard or cancel it first.",
    );
    expect(drawRefusal(409, { error: "held", detail: { reason: "held", kind: "video", held: { reason: "You said the topic is wrong" } } }).text).toBe(
      "This brief is on hold: You said the topic is wrong. Press Use this brief to make it, or ask for a new one.",
    );
    expect(drawRefusal(409, { error: "x", detail: { reason: "not-briefed", kind: "video", state: "open" } }).text).toBe(
      "There is no video brief to make right now.",
    );
  });
});

describe("a send that timed out (R2-1-01)", () => {
  it("reuses the held key for the same words and makes a new one for others", () => {
    let made = 0;
    const fresh = () => `k${(made += 1)}`;
    expect(turnKey(null, "a", fresh)).toBe("k1");
    expect(turnKey({ print: "a", key: "held" }, "a", fresh)).toBe("held");
    expect(turnKey({ print: "a", key: "held" }, "b", fresh)).toBe("k2");
  });

  it("finds the person turn sent with the key, never another with the same words", () => {
    const transcript = [
      { ...entry(1, "person", "make it blue"), key: "other-tab" },
      entry(2, "planner", "Done."),
      { ...entry(3, "person", "make it blue"), key: "mine" },
    ];
    expect(landedTurn(transcript, "mine")).toBe(3);
    expect(landedTurn(transcript.slice(0, 2), "mine")).toBeNull();
  });
});

describe("a Draw past the deadline (R2-1-01)", () => {
  it("does not say nothing was queued", () => {
    const text = drawRefusal(0, { error: "the studio runner did not answer in time", detail: null }).text;
    expect(text).toMatch(/may still be queuing/);
    expect(text).not.toMatch(/nothing was queued/);
    expect(drawRefusal(0, { error: "the studio runner is not answering", detail: null }).text).toMatch(/nothing was queued/);
  });
});
