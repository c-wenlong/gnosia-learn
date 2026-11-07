import { afterEach, describe, expect, it, vi } from "vitest";

import { HEALTH_TIMEOUT_MS, readHealth, studioCanTag, whenIdle } from "@/lib/tutor-studio";

/**
 * D67 of docs/STUDIO-TUTOR-HANDOFF.md: the tutor shows tags, and loads the
 * editor, only on a health answer where a tag can do something.
 */

const good = { ok: true, diagramAgent: { ok: true, problem: null }, video: { ok: true, checks: [] }, dailyCap: { totalUsd: 0, capUsd: null } };

describe("whether a health answer lets the tutor tag", () => {
  it("says no to anything that is not an answer: the runner down, the proxy refusing, another owner's runner", () => {
    expect(studioCanTag(null)).toBe(false);
    expect(studioCanTag(undefined)).toBe(false);
    expect(studioCanTag("ok")).toBe(false);
  });

  it("says no when the runner cannot run its planner", () => {
    expect(studioCanTag({ ...good, ok: false })).toBe(false);
    expect(studioCanTag({ diagramAgent: { ok: true }, video: { ok: true } })).toBe(false);
  });

  it("says yes even when neither machine kind can be made: an SVG is the reply itself, needing no machine (D105)", () => {
    expect(studioCanTag({ ...good, diagramAgent: { ok: false, problem: "a quote in the path" }, video: { ok: false } })).toBe(true);
    expect(studioCanTag({ ...good, diagramAgent: { ok: false }, video: undefined })).toBe(true);
  });

  it("says yes when one kind can be made", () => {
    expect(studioCanTag(good)).toBe(true);
    expect(studioCanTag({ ...good, video: { ok: false, note: "the video doctor has not finished its first check" } })).toBe(true);
    expect(studioCanTag({ ...good, diagramAgent: { ok: false, problem: "x" } })).toBe(true);
    // A runner from before `diagramAgent` could always queue a diagram.
    expect(studioCanTag({ ok: true })).toBe(true);
  });

  it("says yes with the day's cap spent: the menu shows, both entries disabled with the reason", () => {
    expect(studioCanTag({ ...good, dailyCap: { totalUsd: 12, capUsd: 10, exceeded: true } })).toBe(true);
  });
});

describe("readHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches through the studio's proxy, uncached and on the one deadline every runner read shares", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await readHealth()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/studio/api/health", expect.objectContaining({ cache: "no-store" }));
    expect(timeout).toHaveBeenCalledWith(HEALTH_TIMEOUT_MS);
  });

  it("is null when the proxy refuses, when the runner cannot be reached, and when the answer is not one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    expect(await readHealth()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await readHealth()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    expect(await readHealth()).toBeNull();
  });
});

describe("whenIdle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("schedules on the browser's idle callback when there is one, and cancels it", () => {
    const task = vi.fn();
    const windowStub = {
      requestIdleCallback: vi.fn(() => 42),
      cancelIdleCallback: vi.fn(),
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    };
    vi.stubGlobal("window", windowStub);
    const stop = whenIdle(task);
    expect(windowStub.requestIdleCallback).toHaveBeenCalledWith(task, { timeout: 4_000 });
    expect(windowStub.setTimeout).not.toHaveBeenCalled();
    stop();
    expect(windowStub.cancelIdleCallback).toHaveBeenCalledWith(42);
  });

  it("falls back to a short timer where there is no idle callback, and cancels it", () => {
    const task = vi.fn();
    const windowStub = { requestIdleCallback: undefined, setTimeout: vi.fn(() => 7), clearTimeout: vi.fn() };
    vi.stubGlobal("window", windowStub);
    const stop = whenIdle(task);
    expect(windowStub.setTimeout).toHaveBeenCalledWith(task, 200);
    stop();
    expect(windowStub.clearTimeout).toHaveBeenCalledWith(7);
  });
});
