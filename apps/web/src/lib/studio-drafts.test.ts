import { afterEach, describe, expect, it, vi } from "vitest";

import {
  abandonDraft,
  createDraft,
  drawDraft,
  getDraft,
  idempotencyKey,
  listDrafts,
  openDraftEvents,
  readDailyCap,
  reconnectDelay,
  refusalNumber,
  refusalReason,
  refusalString,
  sendMessage,
  type DraftEvent,
} from "./studio-drafts";

/**
 * The client's contract with the runner's draft routes: the paths, the bodies
 * and how a refusal comes back. The routes themselves are the runner's tests;
 * these pin what this side sends, so a change to either shows up here.
 */

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("the calls", () => {
  it("creates a draft with its idempotency key", async () => {
    const fetchMock = answer(201, { draftId: "d1", state: "open", note: "" });
    const result = await createDraft({ idempotencyKey: "k" });
    expect(result).toEqual({ ok: true, status: 201, data: { draftId: "d1", state: "open", note: "" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/studio/api/drafts",
      expect.objectContaining({ method: "POST", body: '{"idempotencyKey":"k"}', headers: { "content-type": "application/json" } }),
    );
  });

  it("reads, lists, messages, draws and abandons on the documented paths", async () => {
    const fetchMock = answer(200, {});
    await getDraft("a b");
    await listDrafts({ state: "open", limit: 5 });
    await listDrafts();
    await sendMessage("d1", "hello");
    await drawDraft("d1", "key");
    await abandonDraft("d1");
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([path, init]) => `${init.method ?? "GET"} ${path} ${init.body ?? ""}`.trim())).toEqual([
      "GET /studio/api/drafts/a%20b",
      "GET /studio/api/drafts?state=open&limit=5",
      "GET /studio/api/drafts",
      'POST /studio/api/drafts/d1/messages {"text":"hello"}',
      'POST /studio/api/drafts/d1/draw {"idempotencyKey":"key"}',
      "POST /studio/api/drafts/d1/abandon {}",
    ]);
  });

  it("returns a refusal rather than throwing, with its detail", async () => {
    answer(422, { error: "turn cap", detail: { reason: "turn-cap", turns: 20, turnCap: 20 } });
    const result = await sendMessage("d1", "x");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(refusalReason(result.refusal)).toBe("turn-cap");
    expect(refusalNumber(result.refusal, "turnCap")).toBe(20);
    expect(refusalString(result.refusal, "turns")).toBeNull();
  });

  it("names a refusal with no body, and a runner that is not there", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 404 })));
    const gone = await getDraft("d1");
    expect(gone).toEqual({ ok: false, status: 404, refusal: { error: "the runner answered 404", detail: null } });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    const down = await getDraft("d1");
    expect(down).toMatchObject({ ok: false, status: 0, refusal: { error: "the studio runner is not answering" } });
    expect(refusalReason({ error: "x", detail: "a sentence" })).toBeNull();
  });

  it("makes a fresh key for each new conversation (Draw's key is deterministic: drawKey)", () => {
    expect(idempotencyKey("draft")).not.toBe(idempotencyKey("draft"));
    expect(idempotencyKey("draft")).toMatch(/^studio-ui:draft:/);
  });

  it("reads the daily cap from health, or nothing", async () => {
    answer(200, { ok: true, dailyCap: { capUsd: 5, totalUsd: 1, exceeded: false } });
    expect(await readDailyCap()).toEqual({ capUsd: 5, totalUsd: 1, exceeded: false });
    answer(502, { error: "down" });
    expect(await readDailyCap()).toBeNull();
  });
});

describe("openDraftEvents", () => {
  class FakeSource {
    static CLOSED = 2;
    static last: FakeSource | null = null;
    static made: FakeSource[] = [];
    listeners = new Map<string, (message: MessageEvent<string>) => void>();
    closed = false;
    readyState = 1;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public url: string) {
      FakeSource.last = this;
      FakeSource.made.push(this);
    }
    addEventListener(type: string, listener: (message: MessageEvent<string>) => void) {
      this.listeners.set(type, listener);
    }
    removeEventListener(type: string) {
      this.listeners.delete(type);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
    emit(type: string, data: string) {
      this.listeners.get(type)?.({ data } as MessageEvent<string>);
    }
  }

  it("asks for what came after the record, and hands on each named event", () => {
    vi.stubGlobal("EventSource", FakeSource);
    const seen: DraftEvent[] = [];
    const open = vi.fn();
    const drop = vi.fn();
    const stop = openDraftEvents("d1", 7, { onEvent: (event) => seen.push(event), onOpen: open, onDrop: drop });
    const source = FakeSource.last!;
    expect(source.url).toBe("/studio/api/drafts/d1/events?after=7");
    expect([...source.listeners.keys()].sort()).toEqual(
      ["brief", "brief-invalid", "delta", "error", "message", "reply", "state", "studio"].sort(),
    );
    source.onopen?.();
    source.emit("delta", '{"turn":3,"text":"Hel"}');
    source.emit("reply", "not json");
    source.emit("state", "null");
    source.onerror?.();
    expect(seen).toEqual([{ type: "delta", data: { turn: 3, text: "Hel" } }]);
    expect(open).toHaveBeenCalledOnce();
    expect(drop).toHaveBeenCalledOnce();
    stop();
    expect(source.closed).toBe(true);
    expect(source.listeners.size).toBe(0);
  });

  it("retries nothing itself while the browser is reconnecting", () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeSource);
    FakeSource.made = [];
    const stop = openDraftEvents("d1", 0, { onEvent: () => {} });
    const source = FakeSource.last!;
    source.readyState = 0; // CONNECTING: the browser's own retry
    source.onerror?.();
    vi.advanceTimersByTime(60_000);
    expect(FakeSource.made).toHaveLength(1);
    stop();
    vi.useRealTimers();
  });

  it("reopens a stream the browser closed for good, from the record's newest seq, with backoff", () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeSource);
    FakeSource.made = [];
    let seq = 3;
    const reopened = vi.fn();
    const stop = openDraftEvents("d1", () => seq, { onEvent: () => {}, onReopen: reopened });
    expect(FakeSource.last!.url).toBe("/studio/api/drafts/d1/events?after=3");

    // The runner restarted: the retry got a 502 and the browser gave up.
    const first = FakeSource.last!;
    first.readyState = 2;
    first.onerror?.();
    expect(first.closed).toBe(true);
    seq = 9;
    vi.advanceTimersByTime(999);
    expect(FakeSource.made).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(reopened).toHaveBeenCalledOnce();
    expect(FakeSource.made).toHaveLength(2);
    expect(FakeSource.last!.url).toBe("/studio/api/drafts/d1/events?after=9");

    // A second failure waits twice as long; an open resets the backoff.
    FakeSource.last!.readyState = 2;
    FakeSource.last!.onerror?.();
    vi.advanceTimersByTime(1_999);
    expect(FakeSource.made).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSource.made).toHaveLength(3);

    // Stopping cancels a pending reopen.
    FakeSource.last!.readyState = 2;
    FakeSource.last!.onerror?.();
    stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSource.made).toHaveLength(3);
    vi.useRealTimers();
  });

  it("backs off to thirty seconds at most", () => {
    expect([0, 1, 2, 5, 10].map(reconnectDelay)).toEqual([1_000, 2_000, 4_000, 30_000, 30_000]);
  });
});
