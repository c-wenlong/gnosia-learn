import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `doctor` cache, which exists to stop a browser being launched on a timer.
 *
 * Every tldrawkc verb launches its own Chromium and `doctor` is no exception —
 * it loads the page bundle to check that the bridge answers. Two callers ask:
 * `POST /api/jobs` before queueing anything, and `/api/health`, which a panel
 * polls. Both ways the first cache leaked were about time rather than logic, so
 * both are tested by controlling the clock and when the subprocess returns.
 */

const procMock = vi.hoisted(() => ({ run: vi.fn(), NPM: "npm", parseJson: vi.fn() }));
vi.mock("../src/proc", () => procMock);

const { doctor, forgetDoctor, DOCTOR_TTL_MS } = await import("../src/canvas");

const result = { code: 0, signal: null, stdout: "ok", stderr: "", json: null, timedOut: false };

beforeEach(() => {
  forgetDoctor();
  procMock.run.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  forgetDoctor();
});

describe("two callers arriving on a cold cache", () => {
  it("share one subprocess instead of launching a Chromium each", async () => {
    let settle: (value: unknown) => void = () => undefined;
    procMock.run.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );

    // A health poll and an enqueue, both while the first check is still open.
    const both = Promise.all([doctor(), doctor()]);
    expect(procMock.run).toHaveBeenCalledTimes(1);

    settle(result);
    expect(await both).toEqual([result, result]);
    expect(procMock.run).toHaveBeenCalledTimes(1);
  });
});

describe("a doctor slower than the cache's own lifetime", () => {
  it("is still cached afterwards, because the stamp is when it answered", async () => {
    // The first cache stamped the moment the call was *made*, so on the machine
    // where launching a browser is slow — the one the cache is for — the result
    // was already expired by the time it was stored, and every caller after it
    // launched another.
    procMock.run.mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(DOCTOR_TTL_MS * 2);
      return result;
    });

    await doctor();
    expect(procMock.run).toHaveBeenCalledTimes(1);

    procMock.run.mockResolvedValue(result);
    await doctor();
    expect(procMock.run).toHaveBeenCalledTimes(1);
  });

  it("expires on its own schedule once it has answered", async () => {
    procMock.run.mockResolvedValue(result);
    await doctor();
    await vi.advanceTimersByTimeAsync(DOCTOR_TTL_MS + 1);
    await doctor();
    expect(procMock.run).toHaveBeenCalledTimes(2);
  });
});

describe("a studio home the diagram agent could not type", () => {
  it("leaves the doctor alone: the studio's own canvas calls take paths as argv, with no shell (Greptile on #206)", async () => {
    vi.useRealTimers();
    const saved = process.env.STUDIO_HOME;
    process.env.STUDIO_HOME = "/tmp/studio-$dollar-home";
    try {
      procMock.run.mockResolvedValue(result);
      expect(await doctor(true)).toEqual(result);
    } finally {
      process.env.STUDIO_HOME = saved;
    }
  });
});
