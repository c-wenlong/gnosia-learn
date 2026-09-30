import { afterEach, describe, expect, it, vi } from "vitest";

import {
  abandonDraft,
  createDraft,
  drawBoth,
  drawDraft,
  drawResults,
  releaseHold,
  stopWaiting,
  videoAvailability,
  diagramAvailability,
  getDraft,
  idempotencyKey,
  listDrafts,
  openDraftEvents,
  readDailyCap,
  reconnectDelay,
  refusalNumber,
  refusalReason,
  refusalString,
  saveBrief,
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
    await listDrafts({ state: ["open", "briefed"], nonEmpty: true, limit: 50 });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([path, init]) => `${init.method ?? "GET"} ${path} ${init.body ?? ""}`.trim())).toEqual([
      "GET /studio/api/drafts/a%20b",
      "GET /studio/api/drafts?state=open&limit=5",
      "GET /studio/api/drafts",
      'POST /studio/api/drafts/d1/messages {"text":"hello"}',
      'POST /studio/api/drafts/d1/draw {"idempotencyKey":"key"}',
      "POST /studio/api/drafts/d1/abandon {}",
      "GET /studio/api/drafts?state=open%2Cbriefed&nonEmpty=1&limit=50",
    ]);
  });

  it("puts a whole edited brief, and hands back the field a refusal names", async () => {
    const brief = {
      intent: "i",
      topic: "t",
      slug: "s",
      title: "T",
      mode: "new" as const,
      elements: [{ label: "A" }],
      relations: [],
    };
    const fetchMock = answer(400, { error: '"title" is required', detail: { field: "title" } });
    const result = await saveBrief("d 1", brief, 7);
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(`${init.method} ${path}`).toBe("PUT /studio/api/drafts/d%201/brief?base=7");
    expect(JSON.parse(String(init.body))).toEqual(brief);
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(refusalString(result.refusal, "field")).toBe("title");
  });

  it("leaves the model out of a saved brief: the runner keeps the replaced brief's own (#207)", async () => {
    const fetchMock = answer(200, {});
    await saveBrief("d1", { intent: "i", topic: "t", slug: "s", title: "T", mode: "new", model: "opus", elements: [], relations: [] } as never, 3);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("model");
    expect(JSON.parse(String(init.body)).title).toBe("T");
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
      ["brief", "brief-ignored", "brief-invalid", "delta", "error", "message", "reply", "state", "studio"].sort(),
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

describe("tags and cards per kind (docs/STUDIO-MENTIONS.md, API)", () => {
  it("sends mentions beside the text, and leaves them out when there are none", async () => {
    const fetchMock = answer(202, { draftId: "d1", seq: 3, note: "" });
    await sendMessage("d1", { text: "a @video", mentions: [{ kind: "video", start: 2, end: 8 }] });
    await sendMessage("d1", { text: "just words", mentions: [] });
    const bodies = (fetchMock.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => init.body);
    expect(bodies).toEqual(['{"text":"a @video","mentions":[{"kind":"video","start":2,"end":8}]}', '{"text":"just words"}']);
  });

  it("draws by kind, as Make both, and names the kind on a brief save and the slot routes", async () => {
    const fetchMock = answer(200, {});
    await drawDraft("d1", "k1", "video");
    await drawDraft("d1", "k2");
    await drawBoth("d1", [
      { kind: "diagram", idempotencyKey: "a" },
      { kind: "video", idempotencyKey: "b" },
    ]);
    await saveBrief("d1", { title: "x" } as never, 4, "video");
    await stopWaiting("d1", "video");
    await releaseHold("d1", "diagram", 6);
    await createDraft({ source: "tcp-video", sourceKind: "video", idempotencyKey: "c" });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([path, init]) => `${init.method} ${path} ${init.body ?? ""}`.trim())).toEqual([
      'POST /studio/api/drafts/d1/draw {"idempotencyKey":"k1","kind":"video"}',
      'POST /studio/api/drafts/d1/draw {"idempotencyKey":"k2"}',
      'POST /studio/api/drafts/d1/draw {"items":[{"kind":"diagram","idempotencyKey":"a"},{"kind":"video","idempotencyKey":"b"}]}',
      'PUT /studio/api/drafts/d1/brief?base=4&kind=video {"title":"x"}',
      "POST /studio/api/drafts/d1/slots/video/stop-waiting {}",
      "POST /studio/api/drafts/d1/slots/diagram/use?base=6 {}",
      'POST /studio/api/drafts {"source":"tcp-video","sourceKind":"video","idempotencyKey":"c"}',
    ]);
  });

  it("reads Make both's results one per item, started or refused, dropping what it cannot read", async () => {
    answer(200, {
      draftId: "d1",
      results: [
        { kind: "diagram", jobId: "j1", created: true, replaces: null },
        { kind: "video", status: 503, refusal: { error: "the video doctor fails", detail: { reason: "video-unavailable" } } },
        { kind: "nope", jobId: "j2" },
      ],
    });
    const result = await drawBoth("d1", []);
    expect(result.ok && result.data.results).toEqual([
      { kind: "diagram", jobId: "j1", created: true, replaces: null },
      { kind: "video", status: 503, refusal: { error: "the video doctor fails", detail: { reason: "video-unavailable" } } },
    ]);
    expect(drawResults(null)).toEqual([]);
  });

  it("reads the video doctor's reason from its first failing check, else its note", () => {
    expect(videoAvailability({ ok: true, checks: [] })).toEqual({ ok: true, reason: null });
    expect(
      videoAvailability({ ok: false, checks: [{ name: "sandbox", ok: true }, { name: "kokoro", ok: false, detail: "the kokoro model is not cached" }] }),
    ).toEqual({ ok: false, reason: "the kokoro model is not cached" });
    expect(videoAvailability({ ok: false, checks: [], note: "the video doctor has not finished its first check" }).reason).toBe(
      "the video doctor has not finished its first check",
    );
    expect(videoAvailability(undefined)).toEqual({ ok: false, reason: null });
  });

  it("reads health's video tools, keeping only well-formed ones it knows (STUDIO-VIDEO-TOOLS.md, D73)", () => {
    const tools = [
      { name: "manimkc", strength: "ManimGL", available: true, reason: null },
      { name: "revideokc", strength: "Revideo", available: false, reason: "revideokc is not in the studio yet" },
      { name: "blender", strength: "?", available: true, reason: null },
      "manimkc",
    ];
    expect(videoAvailability({ ok: true, checks: [], tools })).toEqual({
      ok: true,
      reason: null,
      tools: [
        { name: "manimkc", strength: "ManimGL", available: true, reason: null },
        { name: "revideokc", strength: "Revideo", available: false, reason: "revideokc is not in the studio yet" },
      ],
    });
    expect(videoAvailability({ ok: false, checks: [], note: "n", tools: "nonsense" })).toEqual({ ok: false, reason: "n", tools: [] });
  });

  it("reads the runner's speech rate from health's video narration, and nothing that is not a positive number", () => {
    const narration = { source: "gnosia-audio", version: "0.1.0", charsPerSecond: 15.2, spokenWords: 179 };
    expect(videoAvailability({ ok: true, checks: [], narration })).toEqual({ ok: true, reason: null, charsPerSecond: 15.2 });
    expect(videoAvailability({ ok: false, checks: [], note: "n", narration })).toEqual({ ok: false, reason: "n", charsPerSecond: 15.2 });
    for (const bad of [0, -3, "15.2", Number.NaN, null]) {
      expect(videoAvailability({ ok: true, checks: [], narration: { charsPerSecond: bad } })).toEqual({ ok: true, reason: null });
    }
  });
});

describe("diagramAvailability (#206)", () => {
  it("reads health's diagramAgent, and treats a runner without it as able", () => {
    expect(diagramAvailability({ ok: false, problem: " a bad path " })).toEqual({ ok: false, reason: "a bad path" });
    expect(diagramAvailability({ ok: true, problem: null })).toEqual({ ok: true, reason: null });
    expect(diagramAvailability(undefined)).toEqual({ ok: true, reason: null });
  });
});
