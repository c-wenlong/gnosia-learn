import { describe, expect, it } from "vitest";

import {
  chatTurns,
  citedNumbers,
  handoffTurns,
  parseThread,
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

  it("is never among the turns sent to the tutor or taken to the studio", () => {
    const thread: ThreadItem[] = [{ role: "user", content: "what is a SYN?" }, { role: "assistant", content: "The opener." }, marker];
    expect(chatTurns(thread)).toEqual(thread.slice(0, 2));
    expect(trimForRequest(chatTurns(thread)).some((turn) => (turn.role as string) === "studio")).toBe(false);
    expect(handoffTurns(thread)).toEqual(thread.slice(0, 2));
  });
});

describe("the turns a hand-off carries (D69)", () => {
  const turn = (i: number, size = 10): TutorTurn => ({ role: i % 2 === 0 ? "user" : "assistant", content: `${i}`.padEnd(size, "x") });

  it("takes the last six, oldest first", () => {
    const thread = Array.from({ length: 11 }, (_, i) => turn(i));
    expect(handoffTurns(thread)).toEqual(thread.slice(-6));
  });

  it("drops the oldest to fit 6,000 characters, and cuts the oldest kept at its start", () => {
    const thread = [turn(0, 4_000), turn(1, 3_000), turn(2, 2_500)];
    const kept = handoffTurns(thread);
    expect(kept.map((t) => t.content.length)).toEqual([500, 3_000, 2_500]);
    // The end of the cut turn is kept: the part nearest what came next.
    expect(kept[0]!.content).toBe(thread[0]!.content.slice(-500));
    expect(kept.reduce((sum, t) => sum + t.content.length, 0)).toBe(6_000);
    expect(handoffTurns([turn(0, 4_000), turn(1, 3_000), turn(2, 3_000)]).map((t) => t.content.length)).toEqual([3_000, 3_000]);
  });

  it("keeps the end of one turn longer than the whole budget", () => {
    const long = { role: "assistant" as const, content: "a".repeat(100) + "b".repeat(6_000) };
    expect(handoffTurns([long])).toEqual([{ role: "assistant", content: "b".repeat(6_000) }]);
  });

  it("leaves out empty turns and sends nothing for an empty thread", () => {
    expect(handoffTurns([])).toEqual([]);
    expect(handoffTurns([{ role: "user", content: "   " }, { role: "assistant", content: " ok " }])).toEqual([
      { role: "assistant", content: "ok" },
    ]);
  });
});
