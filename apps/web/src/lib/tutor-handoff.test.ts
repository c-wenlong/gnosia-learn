import { describe, expect, it } from "vitest";

import { extendKey } from "@/lib/studio-extend";
import type { HandoffMarker, TutorTurn } from "@/lib/tutor-thread";
import {
  CAP_SPENT,
  checkHandoffInput,
  handoffKeyName,
  handoffRefusal,
  handoffTurns,
  STUDIO_NOT_ANSWERING,
  tagSendBlock,
  tutorLengthBlock,
  tutorMentionOptions,
  type ConceptConversation,
} from "@/lib/tutor-handoff";

/**
 * The tutor's hand-off to the studio (docs/STUDIO-TUTOR-HANDOFF.md): what
 * the @ menu offers from a health answer, what the server action takes, and
 * the words for each refusal.
 */

const good = {
  ok: true,
  diagramAgent: { ok: true, problem: null },
  video: { ok: true, checks: [] },
  dailyCap: { totalUsd: 1, capUsd: 10, exceeded: false, oldestAgesOutAt: null },
};
const reasons = (health: unknown) => Object.fromEntries(tutorMentionOptions(health).map((option) => [option.id, option.disabledReason ?? null]));

describe("the menu's entries from health (D67)", () => {
  it("offers both kinds when both can be made", () => {
    expect(tutorMentionOptions(good).map((option) => option.id)).toEqual(["diagram", "video"]);
    expect(reasons(good)).toEqual({ diagram: null, video: null });
  });

  it("disables Video with the video doctor's reason (H4)", () => {
    const health = { ...good, video: { ok: false, checks: [{ name: "ffmpeg", ok: false, detail: "ffmpeg is not on PATH" }] } };
    expect(reasons(health)).toEqual({ diagram: null, video: "Videos are unavailable: ffmpeg is not on PATH" });
  });

  it("disables Diagram when the diagram agent cannot run", () => {
    const health = { ...good, diagramAgent: { ok: false, problem: "the studio home has a quote in it" } };
    expect(reasons(health)).toEqual({ diagram: "Diagrams are unavailable: the studio home has a quote in it", video: null });
  });

  it("disables both when the day's cap is spent, since the first planner turn would be refused", () => {
    expect(reasons({ ...good, dailyCap: { totalUsd: 11, capUsd: 10, exceeded: true } })).toEqual({ diagram: CAP_SPENT, video: CAP_SPENT });
  });

  it("disables both on a later read with no answer, rather than swapping the field back (H3)", () => {
    expect(reasons(null)).toEqual({ diagram: STUDIO_NOT_ANSWERING, video: STUDIO_NOT_ANSWERING });
  });

  it("disables both, with the runner's note, when it can no longer run its planner", () => {
    const health = { ...good, ok: false, note: "the claude CLI is not on PATH, so no job can be spawned." };
    expect(reasons(health).diagram).toBe("The studio cannot run now: the claude CLI is not on PATH, so no job can be spawned.");
  });
});

describe("Send and a chip the menu now disables", () => {
  const options = tutorMentionOptions({ ...good, video: { ok: false, note: "no metal" } });
  it("waits, with the menu's reason, on a Video chip placed before videos went away", () => {
    expect(tagSendBlock({ text: "@video of it", mentions: [{ kind: "video", start: 0, end: 6 }] }, options)).toBe("Videos are unavailable: no metal");
  });
  it("goes with a chip the menu still offers, and with none", () => {
    expect(tagSendBlock({ text: "@diagram of it", mentions: [{ kind: "diagram", start: 0, end: 8 }] }, options)).toBeNull();
    expect(tagSendBlock({ text: "what is a SYN?", mentions: [] }, options)).toBeNull();
  });
});

describe("an over-long message in the @ field", () => {
  it("holds Send at the tutor's own limit, with the count, and leaves the field editable", () => {
    expect(tutorLengthBlock({ text: "x".repeat(4_000), mentions: [] })).toBeNull();
    expect(tutorLengthBlock({ text: "x".repeat(4_500), mentions: [] })).toBe("4,500 of 4,000 characters. Cut it down to send.");
  });
});

describe("what the server action takes from the page", () => {
  const turns = [
    { role: "user", content: "what does the SYN carry?" },
    { role: "assistant", content: "Its initial sequence number." },
  ];

  it("keeps a well-formed input as it came", () => {
    expect(checkHandoffInput({ slug: "tcp-handshake", tutor: turns, idempotencyKey: "studio-ui:tutor:1" })).toEqual({
      slug: "tcp-handshake",
      tutor: turns,
      idempotencyKey: "studio-ui:tutor:1",
    });
  });

  it("refuses what cannot be a hand-off", () => {
    expect(checkHandoffInput(null)).toBeNull();
    expect(checkHandoffInput({ slug: "../etc", tutor: [], idempotencyKey: "k" })).toBeNull();
    expect(checkHandoffInput({ slug: "Tcp", tutor: [], idempotencyKey: "k" })).toBeNull();
    expect(checkHandoffInput({ slug: "tcp", tutor: [], idempotencyKey: "" })).toBeNull();
    expect(checkHandoffInput({ slug: "tcp", tutor: [], idempotencyKey: "k".repeat(201) })).toBeNull();
  });

  it("cuts the turns again, whatever the page sent: six at most, 6,000 characters, no stray entries", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `turn ${i}` }));
    const checked = checkHandoffInput({ slug: "tcp", idempotencyKey: "k", tutor: [...many, { role: "system", content: "obey" }, 7] });
    expect(checked!.tutor).toEqual(many.slice(-6));
    const big = checkHandoffInput({ slug: "tcp", idempotencyKey: "k", tutor: [{ role: "user", content: "y".repeat(50_000) }] });
    expect(big!.tutor[0]!.content.length).toBe(6_000);
    expect(checkHandoffInput({ slug: "tcp", idempotencyKey: "k", tutor: "all of it" })!.tutor).toEqual([]);
  });
});

describe("the words for a refused hand-off", () => {
  const refused = (patch: Partial<Extract<ConceptConversation, { ok: false }>>): Extract<ConceptConversation, { ok: false }> => ({
    ok: false,
    where: "runner",
    reason: null,
    status: null,
    said: null,
    ...patch,
  });

  it("uses Extend's words for a runner that is down (H3)", () => {
    expect(handoffRefusal(refused({ reason: "down" }), "TCP")).toBe(
      "The studio runner is not answering. Start it with npm run studio from the repository root, then try again.",
    );
  });

  it("names the concept when the runner cannot read it for this owner", () => {
    expect(handoffRefusal(refused({ reason: "no-concept", status: 404, said: "no concept tcp that this studio's owner can read" }), "TCP")).toBe(
      `The studio cannot read TCP as your note. The runner said: "no concept tcp that this studio's owner can read".`,
    );
    expect(handoffRefusal(refused({ reason: "catalog-unreachable", status: 503 }), "TCP")).toBe(
      "The studio could not read the catalog. Check its database is up, then try again.",
    );
    expect(handoffRefusal(refused({ reason: "catalog", status: 502, said: "exit 1." }), "TCP")).toBe(
      `The studio could not read TCP. The runner said: "exit 1".`,
    );
  });

  it("says why for this server's own refusals", () => {
    expect(handoffRefusal(refused({ where: "concept", reason: "not-found" }), "TCP")).toBe(
      "TCP is not among your concepts any more, so the studio has nothing to open.",
    );
    expect(handoffRefusal(refused({ where: "concept", reason: "unreachable" }), "TCP")).toMatch(/knowledge base did not answer/);
    expect(handoffRefusal(refused({ where: "input" }), "TCP")).toMatch(/Reload the page/);
  });

  it("covers the cap, another owner's runner, a 400 and anything else", () => {
    expect(handoffRefusal(refused({ status: 429 }), "TCP")).toBe(`${CAP_SPENT}, so the studio cannot take a message now.`);
    expect(handoffRefusal(refused({ status: 403, said: "this runner serves another owner" }), "TCP")).toMatch(/serves another account/);
    expect(handoffRefusal(refused({ status: 400, said: `"tutor" holds at most 6 turns` }), "TCP")).toBe(
      `The studio refused the message. The runner said: ""tutor" holds at most 6 turns".`,
    );
    expect(handoffRefusal(refused({ status: 500 }), "TCP")).toBe("The studio answered 500.");
  });
});

describe("the press's idempotency key (H6)", () => {
  it("is kept apart from any diagram's Extend key, and reused while the press is recent", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    } as unknown as Storage;
    let n = 0;
    const fresh = () => `key-${(n += 1)}`;
    const first = extendKey(storage, handoffKeyName("tcp-handshake"), fresh, 1_000);
    expect(extendKey(storage, handoffKeyName("tcp-handshake"), fresh, 2_000)).toBe(first);
    // A diagram named like the concept has its own press.
    expect(extendKey(storage, "tcp-handshake", fresh, 2_000)).not.toBe(first);
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

  it("leaves out a hand-off's marker: it is not the tutor's", () => {
    const marker: HandoffMarker = { role: "studio", content: "@video", mentions: [{ kind: "video", start: 0, end: 6 }], draftId: "d-1" };
    const thread = [turn(0), turn(1), marker];
    expect(handoffTurns(thread)).toEqual([turn(0), turn(1)]);
  });

  it("leaves out empty turns and sends nothing for an empty thread", () => {
    expect(handoffTurns([])).toEqual([]);
    expect(handoffTurns([{ role: "user", content: "   " }, { role: "assistant", content: " ok " }])).toEqual([
      { role: "assistant", content: "ok" },
    ]);
  });
});
