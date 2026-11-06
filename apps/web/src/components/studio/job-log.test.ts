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
});

/** A runner whose log route answers per job: lines, or a status that is not OK. */
function runner(logs: Record<string, string[] | number>) {
  const fetch = vi.fn(async (url: string) => {
    const job = decodeURIComponent(/jobs\/([^/]+)\/log/.exec(url)![1]!);
    const log = logs[job];
    if (log === undefined || typeof log === "number") return new Response("{}", { status: typeof log === "number" ? log : 404 });
    const limit = Number(new URL(url, "http://x").searchParams.get("limit"));
    const body = limit === 1 ? { total: log.length, lines: log.slice(0, 1) } : { total: log.length, lines: log };
    return new Response(JSON.stringify(body), { status: 200 });
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
  const render = async (jobId: string) => {
    await act(async () => root.render(createElement(JobLog, { jobId, openByDefault: true, live: false })));
    // Let both reads of the load land.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
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

  it("reads a finished job once", async () => {
    const fetch = runner({ a: ["one"] });
    const { render } = mount();
    await render("a");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
