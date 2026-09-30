import { beforeEach, describe, expect, it, vi } from "vitest";

import { readOpener } from "@/lib/studio-extend";
import type { ThreadItem } from "@/lib/tutor-thread";

/**
 * `openInStudio`, the tutor's hand-off itself (D64, D70 of
 * docs/STUDIO-TUTOR-HANDOFF.md), against a mocked server action and a store
 * of the test's own: which idempotency key a press uses, when it is kept,
 * and the opener the conversation is handed.
 */

const mocks = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/app/(app)/studio/actions", () => ({ openConceptConversation: mocks.action }));
// The field is not under test, and Lexical has no business in a node test.
vi.mock("@/components/ui/MentionComposer", () => ({ MentionComposer: () => null }));

const { openInStudio } = await import("./TutorStudioKit");

const KEY = "studio:extend-key:tutor:tcp-handshake";

function memory(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const thread: ThreadItem[] = [
  { role: "user", content: "What is a SYN?" },
  { role: "assistant", content: "The opener [1]." },
  { role: "studio", content: "@video", mentions: [{ kind: "video", start: 0, end: 6 }], draftId: "old" },
];
const sent = { text: "@diagram of that", mentions: [{ kind: "diagram" as const, start: 0, end: 8 }] };
const press = (store: Storage | null, value = sent, items = thread) =>
  openInStudio({ slug: "tcp-handshake", title: "The TCP handshake", items, value, store });

const keyOf = (store: Storage) => (JSON.parse(store.getItem(KEY)!) as { key: string }).key;
const sentKey = (call: number) => (mocks.action.mock.calls[call]![0] as { idempotencyKey: string }).idempotencyKey;

beforeEach(() => {
  mocks.action.mockReset();
});

describe("a press that opens a conversation", () => {
  it("posts the tutor's turns without the marker, forgets its key, and leaves exactly the opener", async () => {
    const store = memory();
    mocks.action.mockResolvedValue({ ok: true, draftId: "d-1" });
    const done = await press(store);
    expect(mocks.action).toHaveBeenCalledWith({
      slug: "tcp-handshake",
      tutor: [thread[0], thread[1]],
      idempotencyKey: sentKey(0),
    });
    expect(store.getItem(KEY)).toBeNull();
    expect(JSON.parse(store.getItem("studio:extend-opener:d-1")!)).toEqual({
      send: "@diagram of that",
      sendMentions: sent.mentions,
      compose: "",
      source: null,
    });
    expect(done).toEqual({
      ok: true,
      href: "/studio?draft=d-1",
      marker: { role: "studio", content: sent.text, mentions: sent.mentions, draftId: "d-1" },
    });
  });

  it("makes a new conversation on the next press, since the key went with the first (D70)", async () => {
    const store = memory();
    mocks.action.mockResolvedValue({ ok: true, draftId: "d-1" });
    await press(store);
    await press(store);
    expect(sentKey(1)).not.toBe(sentKey(0));
  });

  it("hands the message over in memory when the store refuses it", async () => {
    const refusing = { ...memory(), setItem: () => {}, getItem: () => null } as Storage;
    mocks.action.mockResolvedValue({ ok: true, draftId: "d-mem" });
    expect((await press(refusing)).ok).toBe(true);
    expect(readOpener(null, "d-mem")).toMatchObject({ send: sent.text, sendMentions: sent.mentions });
  });
});

describe("a refused press", () => {
  it("keeps its key, and leaves no opener", async () => {
    const store = memory();
    mocks.action.mockResolvedValue({ ok: false, where: "runner", reason: "down", status: null, said: null, undelivered: false });
    const done = await press(store);
    expect(done).toEqual({ ok: false, text: "The studio did not answer in time. Try again in a moment." });
    expect(keyOf(store)).toBe(sentKey(0));
    expect([...store.map.keys()].some((k) => k.startsWith("studio:extend-opener:"))).toBe(false);
  });

  it("is retried with the same key when nothing changed, so a draft the timeout hid is found", async () => {
    const store = memory();
    mocks.action.mockResolvedValue({ ok: false, where: "runner", reason: "down", status: null, said: null, undelivered: false });
    await press(store);
    mocks.action.mockResolvedValue({ ok: true, draftId: "d-first" });
    await press(store);
    expect(sentKey(1)).toBe(sentKey(0));
    expect(readOpener(store, "d-first")?.send).toBe(sent.text);
  });

  it("gets a new key when the message or the tutor turns changed since (Greptile on #234)", async () => {
    const store = memory();
    mocks.action.mockResolvedValue({ ok: false, where: "runner", reason: "down", status: null, said: null, undelivered: false });
    await press(store);
    await press(store, { text: "@diagram of the ACK", mentions: sent.mentions });
    await press(store, { text: "@diagram of the ACK", mentions: sent.mentions }, [...thread, { role: "user", content: "And the ACK?" }]);
    expect(new Set([sentKey(0), sentKey(1), sentKey(2)]).size).toBe(3);
  });

  it("says so when the action itself does not come back", async () => {
    mocks.action.mockRejectedValue(new Error("fetch failed"));
    expect(await press(memory())).toEqual({ ok: false, text: "The page could not reach its server, so nothing was sent. Try again." });
  });
});
