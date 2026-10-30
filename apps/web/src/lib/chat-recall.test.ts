import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  chatRequestId,
  closeChatSession,
  judgeAnswer,
  keptScopes,
  recordAnswer,
  releaseScope,
  sessionRefused,
  type RecordInput,
} from "./chat-recall";

/**
 * The browser half both tutors share (recall in the chat). `fetch` is a
 * stand-in, and with no `window` the session id lives in the module's memory,
 * which is the fallback a refused `sessionStorage` takes.
 */
const fetchMock = vi.fn();

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const RESULT = { correct: true, pLBefore: 0.25, pLAfter: 0.6, card: { intervalDays: 1 } };

function input(over: Partial<RecordInput> = {}): RecordInput {
  return {
    scope: `s-${Math.random().toString(36).slice(2)}`,
    sessionLabel: "dot-product",
    conceptSlug: "dot-product",
    correct: true,
    source: "probe",
    requestId: "chat-r1",
    question: "Q?",
    answer: "A",
    ...over,
  };
}

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;

describe("chat recall", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("makes request ids the observe route accepts", () => {
    expect(chatRequestId()).toMatch(/^chat-[A-Za-z0-9]{8,}$/);
  });

  it("returns the judge's verdict, or null when it gives none", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { verdict: { correct: false, feedback: "Missing the cosine." } }));
    expect(await judgeAnswer("dot-product", "Q?", "A")).toEqual({ correct: false, feedback: "Missing the cosine." });
    fetchMock.mockResolvedValueOnce(json(502, { code: "UNSTRUCTURED_REPLY" }));
    expect(await judgeAnswer("dot-product", "Q?", "A")).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await judgeAnswer("dot-product", "Q?", "A")).toBeNull();
  });

  it("records under one chat session per scope, and closes it once", async () => {
    const at = input();
    fetchMock.mockResolvedValue(json(200, { ok: true, result: RESULT }));
    expect(await recordAnswer(at)).toEqual({ correct: true, pLBefore: 0.25, pLAfter: 0.6, intervalDays: 1 });
    await recordAnswer({ ...at, requestId: "chat-r2" });
    const [first, second] = fetchMock.mock.calls.map(bodyOf);
    expect(first.sessionId).toMatch(/^chat-\d{4}-\d{2}-\d{2}-dot-product-/);
    expect(second.sessionId).toBe(first.sessionId);
    expect(first.chosen).toBe("A");
    expect(first).not.toHaveProperty("sessionTitle");

    closeChatSession(at.scope);
    const close = fetchMock.mock.calls.at(-1) as unknown[];
    expect(close[0]).toBe("/api/learner/session/close");
    expect(bodyOf(close)).toEqual({ sessionId: first.sessionId });
    const calls = fetchMock.mock.calls.length;
    closeChatSession(at.scope);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("forgets a released scope, once its save in flight has finished", async () => {
    const at = input();
    const before = keptScopes();
    let answer: (r: Response) => void = () => {};
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const saving = recordAnswer(at);
    await Promise.resolve();
    closeChatSession(at.scope);
    releaseScope(at.scope);
    // The save is still in flight: the scope is kept until it lands.
    expect(keptScopes()).toBeGreaterThan(before);
    answer(json(200, { ok: true, result: RESULT }));
    await saving;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(keptScopes()).toBe(before);
  });

  it("closes with the answer still saving, so the close cannot beat the answer that opens the session", async () => {
    const at = input();
    let finish: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    fetchMock.mockResolvedValue(json(200, { ok: true, result: RESULT }));
    const saving = recordAnswer(at);
    closeChatSession(at.scope);
    const close = fetchMock.mock.calls[1] as unknown[];
    expect(close[0]).toBe("/api/learner/observe");
    expect(bodyOf(close)).toMatchObject({ requestId: "chat-r1", closeSession: true });
    finish(json(200, { ok: true, result: RESULT }));
    await saving;
  });

  it("starts a fresh session when the server says the old one is closed, and says why a write failed", async () => {
    const at = input();
    fetchMock
      .mockResolvedValueOnce(json(400, { ok: false, error: 'session "x" is closed; start a new one.' }))
      .mockResolvedValueOnce(json(200, { ok: true, result: RESULT }));
    await recordAnswer(at);
    const [refused, again] = fetchMock.mock.calls.map(bodyOf);
    expect(again.sessionId).not.toBe(refused.sessionId);
    expect(again.requestId).toBe(refused.requestId);

    fetchMock.mockResolvedValueOnce(json(429, {}));
    await expect(recordAnswer(input())).rejects.toThrow("Too many answers in a minute.");
    fetchMock.mockResolvedValueOnce(json(400, { ok: false, error: "Unknown concept." }));
    await expect(recordAnswer(input())).rejects.toThrow("Unknown concept.");
  });

  it("sends once under a fresh session when the id is taken, and never on a field's validation error", async () => {
    fetchMock
      .mockResolvedValueOnce(json(400, { ok: false, error: 'session id "x" is already in use; start a new session.' }))
      .mockResolvedValueOnce(json(200, { ok: true, result: RESULT }));
    await recordAnswer(input());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Names a session, and is no refusal a fresh one would fix.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(json(400, { ok: false, error: '"sessionTitle" must be 1 to 200 characters.' }));
    await expect(recordAnswer(input({ sessionTitle: "t" }))).rejects.toThrow('"sessionTitle" must be 1 to 200 characters.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sessionRefused", () => {
  it("is the catalog's two session refusals, whole, and nothing else that names a session", () => {
    expect(sessionRefused('session "chat-1" is closed; start a new one.')).toBe(true);
    expect(sessionRefused('session "chat-1" is abandoned; start a new one.')).toBe(true);
    expect(sessionRefused('session id "chat-1" is already in use; start a new session.')).toBe(true);
    expect(sessionRefused('"sessionGoal" must be a short id of letters, digits, "-" and "_".')).toBe(false);
    expect(sessionRefused('"sessionId" must be a short token of letters, digits, "-" and "_".')).toBe(false);
    expect(sessionRefused(undefined)).toBe(false);
  });
});

describe("chat recall's save queue", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends one save at a time per thread", async () => {
    const at = input();
    let finish: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    fetchMock.mockResolvedValue(json(200, { ok: true, result: RESULT }));
    const first = recordAnswer(at);
    const second = recordAnswer({ ...at, requestId: "chat-r2" });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(json(200, { ok: true, result: RESULT }));
    await first;
    await second;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops a save that waited past a close, so it opens no session nobody closes", async () => {
    const at = input();
    let finish: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    fetchMock.mockResolvedValue(json(200, { ok: true, result: RESULT }));
    const first = recordAnswer(at);
    const waiting = recordAnswer({ ...at, requestId: "chat-r2" });
    closeChatSession(at.scope);
    finish(json(200, { ok: true, result: RESULT }));
    await first;
    await expect(waiting).rejects.toThrow("closed before this answer was sent");
    // The first save, then the close that resent it; the waiting one never went out.
    expect(fetchMock.mock.calls.map((c) => bodyOf(c).requestId)).toEqual(["chat-r1", "chat-r1"]);
  });

  it("names a write that timed out, and keeps it for the close, since the server may still be saving it", async () => {
    const at = input();
    fetchMock.mockRejectedValueOnce(new DOMException("signal timed out", "TimeoutError"));
    await expect(recordAnswer(at)).rejects.toThrow("The answer took too long to save.");
    fetchMock.mockResolvedValue(json(200, { ok: true, result: RESULT }));
    closeChatSession(at.scope);
    const close = fetchMock.mock.calls.at(-1) as unknown[];
    expect(close[0]).toBe("/api/learner/observe");
    expect(bodyOf(close)).toMatchObject({ requestId: "chat-r1", closeSession: true });
  });
});

describe("a chat that names its session", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the topic's title and goal for the session the answer may open", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, result: RESULT }));
    await recordAnswer(input({ sessionTitle: "CP4284 · Attention", sessionGoal: "cp4284-m1-t1" }));
    expect(bodyOf(fetchMock.mock.calls[0])).toMatchObject({ sessionTitle: "CP4284 · Attention", sessionGoal: "cp4284-m1-t1" });
  });
});
