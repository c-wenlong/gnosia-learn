import { describe, expect, it } from "vitest";

import {
  chatTurns,
  citedNumbers,
  markerPieces,
  parseThread,
  RECALL_SEED,
  requestTurns,
  sessionKey,
  threadKey,
  trimForRequest,
  type HandoffMarker,
  type ThreadItem,
  type TutorTurn,
} from "@/lib/tutor-thread";

describe("tutor thread", () => {
  it("keys the thread per concept", () => {
    expect(threadKey("dot-product")).toBe("self-learn:tutor:dot-product");
  });

  it("reads back only well-formed turns", () => {
    expect(parseThread(null)).toEqual([]);
    expect(parseThread("not json")).toEqual([]);
    expect(parseThread('{"role":"user"}')).toEqual([]);
    expect(
      parseThread(JSON.stringify([{ role: "user", content: "hi" }, { role: "system", content: "x" }, { role: "assistant" }])),
    ).toEqual([{ role: "user", content: "hi" }]);
  });

  it("finds the citations a reply uses, known numbers only, in first-use order", () => {
    expect(citedNumbers("As the note says [2]. Also [1, 3] and [1][2].", [1, 2, 3])).toEqual([2, 1, 3]);
    expect(citedNumbers("A made-up source [7], and an array a[0].", [1, 2])).toEqual([]);
    expect(citedNumbers("No citations here.", [1])).toEqual([]);
  });

  it("trims a long thread from the front and starts on a user turn", () => {
    const turns: TutorTurn[] = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    const kept = trimForRequest(turns, { maxMessages: 5 });
    expect(kept.length).toBeLessThanOrEqual(5);
    expect(kept[0].role).toBe("user");
    expect(kept[kept.length - 1]).toEqual(turns[49]);

    const big: TutorTurn[] = [
      { role: "user", content: "x".repeat(15_000) },
      { role: "assistant", content: "y".repeat(10_000) },
      { role: "user", content: "last" },
    ];
    expect(trimForRequest(big)).toEqual([{ role: "user", content: "last" }]);
  });
});

describe("a hand-off's marker in the thread (D70 of STUDIO-TUTOR-HANDOFF.md)", () => {
  const marker: HandoffMarker = {
    role: "studio",
    content: "a @video of the handshake",
    mentions: [{ kind: "video", start: 2, end: 8 }],
    draftId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  };

  it("reads back with the turns around it, in order", () => {
    const stored: ThreadItem[] = [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }, marker];
    expect(parseThread(JSON.stringify(stored))).toEqual(stored);
  });

  it("drops a marker it cannot link to or draw, and a mention that is not one", () => {
    const bad = [
      { ...marker, draftId: "../../etc" },
      { ...marker, draftId: 7 },
      { ...marker, mentions: "video" },
      { role: "studio", content: "no draft" },
    ];
    expect(parseThread(JSON.stringify(bad))).toEqual([]);
    const oddMention = { ...marker, mentions: [marker.mentions[0], { kind: "video" }, null, "x"] };
    expect(parseThread(JSON.stringify([oddMention]))).toEqual([marker]);
  });

  it("is drawn with its chips where they were typed, and a range that does not read as a chip as words", () => {
    expect(markerPieces(marker)).toEqual([{ text: "a " }, { kind: "video" }, { text: " of the handshake" }]);
    const both = { content: "@video and @diagram", mentions: [{ kind: "diagram", start: 11, end: 19 }, { kind: "video", start: 0, end: 6 }] };
    expect(markerPieces(both)).toEqual([{ kind: "video" }, { text: " and " }, { kind: "diagram" }]);
    const off = { content: "a @video", mentions: [{ kind: "video", start: 0, end: 6 }, { kind: "video", start: 2, end: 99 }] };
    expect(markerPieces(off)).toEqual([{ text: "a @video" }]);
    const twice = { content: "@video @video", mentions: [{ kind: "video", start: 0, end: 6 }, { kind: "video", start: 7, end: 13 }] };
    expect(markerPieces(twice)).toEqual([{ kind: "video" }, { text: " @video" }]);
  });

  it("is never among the turns sent to the tutor or taken to the studio", () => {
    const thread: ThreadItem[] = [{ role: "user", content: "what is a SYN?" }, { role: "assistant", content: "The opener." }, marker];
    expect(chatTurns(thread)).toEqual(thread.slice(0, 2));
    expect(trimForRequest(chatTurns(thread)).some((turn) => (turn.role as string) === "studio")).toBe(false);
  });
});

describe("a thread's checks and verdicts (docs/proposals/recall-in-chat.md)", () => {
  const verdict = {
    question: "Q?",
    requestId: "chat-abc",
    source: "probe",
    judged: "ready",
    suggested: true,
    feedback: "Right.",
    state: "open",
    error: null,
    recorded: null,
  };

  it("keeps a tutor turn's check and a learner turn's verdict through storage", () => {
    const stored = JSON.stringify([
      { role: "assistant", content: "Try one.", check: { question: "Q?" } },
      { role: "user", content: "An answer", verdict },
    ]);
    const [asked, answered] = parseThread(stored) as TutorTurn[];
    expect(asked.check).toEqual({ question: "Q?" });
    expect(answered.verdict).toMatchObject({ requestId: "chat-abc", suggested: true });
  });

  it("drops a malformed check or verdict, and a check on a learner turn, but keeps the turn", () => {
    const stored = JSON.stringify([
      { role: "assistant", content: "A", check: { question: 3 } },
      { role: "user", content: "B", check: { question: "Q?" }, verdict: { requestId: "x" } },
    ]);
    expect(parseThread(stored)).toEqual([
      { role: "assistant", content: "A" },
      { role: "user", content: "B" },
    ]);
  });

  it("never sends a check or a verdict to a model", () => {
    const items = parseThread(
      JSON.stringify([
        { role: "assistant", content: "Try one.", check: { question: "Q?" } },
        { role: "user", content: "An answer", verdict },
      ]),
    );
    expect(chatTurns(items)).toEqual([
      { role: "assistant", content: "Try one." },
      { role: "user", content: "An answer" },
    ]);
  });
});

describe("a thread that opens on the tutor's recall question (R3)", () => {
  it("sends the seed before it, so the model sees a user turn first and its own question", () => {
    const items: ThreadItem[] = [
      { role: "assistant", content: "Welcome back. Q?", check: { question: "Q?" } },
      { role: "user", content: "An answer" },
    ];
    expect(requestTurns(items)).toEqual([
      { role: "user", content: RECALL_SEED },
      { role: "assistant", content: "Welcome back. Q?" },
      { role: "user", content: "An answer" },
    ]);
  });

  it("sends an ordinary thread as it is", () => {
    const items: ThreadItem[] = [
      { role: "user", content: "Q" },
      { role: "assistant", content: "A" },
    ];
    expect(requestTurns(items)).toEqual(items);
  });

  it("keeps the session id beside the thread, per concept", () => {
    expect(sessionKey("dot-product")).toBe("self-learn:tutor-session:dot-product");
    expect(sessionKey("dot-product")).not.toBe(threadKey("dot-product"));
  });
});
