// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { JobLog } from "./job-log";

/**
 * The raw log under a job panel. The panel switches job without remounting
 * it, so what was read belongs to the job it was read about: job A's tail
 * must not stay under job B, least of all when B's log does not answer
 * (R3-2-02).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A runner whose log route answers per job: lines, or a status that is not OK. `from` and `limit` are honoured, as the real route's. */
function runner(logs: Record<string, string[] | number>) {
  const fetch = vi.fn(async (url: string) => {
    const job = decodeURIComponent(/jobs\/([^/]+)\/log/.exec(url)![1]!);
    const log = logs[job];
    if (log === undefined || typeof log === "number") return new Response("{}", { status: typeof log === "number" ? log : 404 });
    const params = new URL(url, "http://x").searchParams;
    const from = Number(params.get("from") ?? 0);
    const limit = Number(params.get("limit") ?? log.length);
    return new Response(JSON.stringify({ total: log.length, lines: log.slice(from, from + limit) }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  const render = async (jobId: string, live = false) => {
    await act(async () => root.render(createElement(JobLog, { jobId, openByDefault: true, live })));
    // Let both reads of the load land, whichever clock is running.
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
      else await new Promise((resolve) => setTimeout(resolve, 0));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
  };
  const text = () => ({ log: host.querySelector("pre")!.textContent, foot: host.querySelector("p")?.textContent ?? null });
  return { render, text };
}

describe("JobLog", () => {
  it("shows a job's tail and how much of the log it is", async () => {
    runner({ a: ["one", "two"] });
    const { render, text } = mount();
    await render("a");
    expect(text()).toEqual({ log: "one\ntwo", foot: "The last 2 of 2 lines." });
  });

  it("drops the last job's lines when it switches job, and says when the new log does not answer", async () => {
    runner({ a: ["from a"], b: 503 });
    const { render, text } = mount();
    await render("a");
    expect(text().log).toBe("from a");
    await render("b");
    expect(text()).toEqual({ log: "The log could not be read.", foot: null });
  });

  it("says nothing is on disk for a job with an empty log", async () => {
    runner({ a: ["from a"], b: [] });
    const { render, text } = mount();
    await render("a");
    await render("b");
    expect(text()).toEqual({ log: "Nothing on disk yet.", foot: null });
  });

  it("reads only the tail window of a long log", async () => {
    const fetch = runner({ a: Array.from({ length: 250 }, (_, i) => `l${i + 1}`) });
    const { render, text } = mount();
    await render("a");
    // total - WINDOW, not the head: the tail is 200 lines of the 250.
    expect(fetch.mock.calls[1]![0]).toContain("from=50&limit=200");
    expect(text().log.startsWith("l51")).toBe(true);
    expect(text().log.endsWith("l250")).toBe(true);
    expect(text().foot).toBe("The last 200 of 250 lines.");
  });

  it("reads a finished job once, never polling it", async () => {
    vi.useFakeTimers();
    const fetch = runner({ a: ["one"] });
    const { render } = mount();
    await render("a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("re-reads a live job every four seconds", async () => {
    vi.useFakeTimers();
    const fetch = runner({ a: ["one", "two"] });
    const { render } = mount();
    await render("a", true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps the last read under the error line when a poll of a live job fails", async () => {
    vi.useFakeTimers();
    const logs: Record<string, string[] | number> = { a: ["one", "two"] };
    runner(logs);
    const { render, text } = mount();
    await render("a", true);
    logs["a"] = 503;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(text()).toEqual({
      log: "one\ntwo",
      foot: "The log could not be read just now. These are the last 2 of 2 lines read before.",
    });
  });

  it("drops a late answer for the job it just left", async () => {
    let landTailA: (response: Response) => void = () => undefined;
    const fetch = vi.fn((url: string) => {
      const job = decodeURIComponent(/jobs\/([^/]+)\/log/.exec(url)![1]!);
      if (job === "a") {
        // The count lands at once; only the tail is held, so the late answer
        // below is the read completing, not merely a first request ending.
        const params = new URL(url, "http://x").searchParams;
        if (params.get("limit") === "1") {
          return Promise.resolve(new Response(JSON.stringify({ total: 1, lines: ["from a"] }), { status: 200 }));
        }
        return new Promise<Response>((resolve) => {
          landTailA = resolve;
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ total: 1, lines: ["from b"] }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetch);
    const { render, text } = mount();
    // `a`'s tail read is still in flight when the panel moves on to `b`.
    await render("a");
    await render("b");
    expect(text().log).toBe("from b");

    // `a`'s tail lands a job too late: `b`'s tail stays, and nothing of `a` is drawn.
    await act(async () => {
      landTailA(new Response(JSON.stringify({ total: 1, lines: ["from a"] }), { status: 200 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(text().log).toBe("from b");
    expect(text().log).not.toContain("from a");
  });
});
