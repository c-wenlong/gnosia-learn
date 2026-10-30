// @vitest-environment jsdom
import { act, createElement, useEffect, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Job } from "@/lib/studio-jobs";

import { JobsProvider, postJob, useStudioJobs } from "./JobsProvider";

/**
 * The provider is a cache of `GET /api/jobs`, read by a timer, by a terminal
 * event and by every verb. Those reads overlap, and the list must be the
 * newest answer, not the last one to land (S1-01 of the web audit).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.unstubAllGlobals();
});

const job = (state: Job["state"]): Job =>
  ({
    jobId: "j1",
    kind: "diagram",
    state,
    phase: state === "awaiting_review" ? "ready" : null,
    title: "A diagram",
    target: "learn/assets/a.tldr",
    gate: null,
    error: null,
    errorKind: null,
    updated: "2026-10-30T00:00:00.000Z",
    cancelRequestedAt: null,
  }) as unknown as Job;

/** The provider's `refresh`, handed out by the probe below so a test can call it. */
const handle = { refresh: async (): Promise<void> => {} };

function Probe() {
  const jobs = useStudioJobs();
  useEffect(() => {
    handle.refresh = jobs.refresh;
  });
  return createElement("output", null, jobs.jobs.map((entry) => entry.state).join(","));
}

/** Every read of the list waits for the test to answer it, in whatever order the test likes. */
function deferredFetch() {
  const pending: Array<(jobs: Job[]) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          pending.push((jobs) => resolve(new Response(JSON.stringify({ jobs }), { status: 200 })));
        }),
    ),
  );
  return pending;
}

async function mount(initial: Job[]): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        JobsProvider as unknown as (props: { initialJobs: Job[]; streamEnabled: boolean }) => ReactElement,
        { initialJobs: initial, streamEnabled: false },
        createElement(Probe),
      ),
    );
  });
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

describe("refresh", () => {
  it("keeps the newer answer when an older read lands after it", async () => {
    const answers = deferredFetch();
    const host = await mount([job("awaiting_review")]);
    let older: Promise<void> = Promise.resolve();
    let newer: Promise<void> = Promise.resolve();
    await act(async () => {
      older = handle.refresh();
      newer = handle.refresh();
    });
    // The verb's read answers first, with the job accepted.
    await act(async () => {
      answers[1]!([job("accepted")]);
      await newer;
    });
    expect(host.textContent).toBe("accepted");
    // The timer's read, started before the press, lands last.
    await act(async () => {
      answers[0]!([job("awaiting_review")]);
      await older;
    });
    expect(host.textContent).toBe("accepted");
  });

  it("still applies an older read when nothing newer has landed", async () => {
    const answers = deferredFetch();
    const host = await mount([job("running")]);
    let older: Promise<void> = Promise.resolve();
    await act(async () => {
      older = handle.refresh();
      void handle.refresh();
    });
    await act(async () => {
      answers[0]!([job("awaiting_review")]);
      await older;
    });
    expect(host.textContent).toBe("awaiting_review");
  });
});

/** `postJob` is the verbs' request, which keeps the runner's error shape. */
describe("postJob", () => {
  it("posts JSON (an empty object for no body) and hands the answer back as it is", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ jobId: "j2" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await postJob("/studio/api/jobs/j1/revise")).toEqual({ ok: true, status: 202, data: { jobId: "j2" } });
    expect(fetchMock).toHaveBeenCalledWith("/studio/api/jobs/j1/revise", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
  });

  it("says the runner is not answering, with why, as status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await postJob("/studio/api/jobs/j1/revise", { changes: "x" })).toEqual({
      ok: false,
      status: 0,
      data: { error: "the studio runner is not answering", detail: "Failed to fetch" },
    });
  });
});
