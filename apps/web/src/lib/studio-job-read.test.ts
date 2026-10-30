import { afterEach, describe, expect, it, vi } from "vitest";

import { CALL_TIMEOUT_MS } from "./studio-client";
import { getJob } from "./studio-job-read";
import { HEALTH_TIMEOUT_MS, readHealth } from "./tutor-studio";

/**
 * The two browser reads of the runner that do not go through `call` still
 * have its deadline, so a runner that takes the connection and hangs does
 * not leave them pending (R2-1-18).
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A fetch that answers only by failing when its signal aborts, as a hung runner's does. */
function hung() {
  const seen: (AbortSignal | undefined)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit = {}) =>
        new Promise((_resolve, reject) => {
          seen.push(init.signal ?? undefined);
          init.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    ),
  );
  return seen;
}

describe("the runner reads outside `call`", () => {
  it("gives up on a job read at the shared deadline and says it failed", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    hung();
    const pending = getJob("j1");
    expect(timeout).toHaveBeenCalledWith(CALL_TIMEOUT_MS);
    controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
    expect(await pending).toEqual({ kind: "failed", reason: "the runner did not answer (The operation timed out.)" });
  });

  it("gives up on a health read at its deadline and reads it as no answer", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    hung();
    const pending = readHealth();
    expect(timeout).toHaveBeenCalledWith(HEALTH_TIMEOUT_MS);
    controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
    expect(await pending).toBeNull();
  });
});
