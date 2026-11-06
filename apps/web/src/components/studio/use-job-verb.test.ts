// @vitest-environment jsdom
import { act, createElement, useEffect, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Job } from "@/lib/studio-jobs";

import type { HostControls } from "./panel-host";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: vi.fn() }) }));

const { JobsProvider } = await import("./JobsProvider");
const { HostContext } = await import("./panel-host");
const { useJobVerb } = await import("./use-job-verb");

/**
 * Every press on a job goes through `useJobVerb`: one reading of the answer,
 * and a job it queued opened through the panel host before the router
 * (S1-04 and S1-07 of the web audit).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.unstubAllGlobals();
  mocks.push.mockReset();
});

/** The runner: a verb answers `answer`, the list answers empty. */
function runner(answer: { status: number; body: Record<string, unknown> }) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(JSON.stringify(answer.body), { status: answer.status })
      : new Response(JSON.stringify({ jobs: [] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const handle: { verbs: ReturnType<typeof useJobVerb> | null } = { verbs: null };

function Probe() {
  const verbs = useJobVerb("/studio?view=grid");
  useEffect(() => {
    handle.verbs = verbs;
  });
  return createElement("output", null, verbs.busy ?? "idle");
}

async function mount(navigate: ((href: string) => boolean) | null): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const controls: HostControls | null =
    navigate === null
      ? null
      : { begin: () => 0, settle: () => false, navigate, path: "/studio?view=list", warmSettings: () => {} };
  await act(async () => {
    root.render(
      createElement(
        JobsProvider as unknown as (props: { initialJobs: Job[]; streamEnabled: boolean; children?: ReactNode }) => ReactElement,
        { initialJobs: [], streamEnabled: false },
        createElement(HostContext.Provider, { value: controls }, createElement(Probe)),
      ),
    );
  });
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

describe("useJobVerb", () => {
  it("posts to the verb's route and follows the job it queued through the host", async () => {
    const fetch = runner({ status: 202, body: { jobId: "j2", note: "Resumed" } });
    const navigate = vi.fn(() => true);
    await mount(navigate);
    let text = "";
    await act(async () => {
      text = (await handle.verbs!.run("j1", "resume", { follow: true })).text;
    });
    expect(fetch.mock.calls[0]?.[0]).toBe("/studio/api/jobs/j1/resume");
    expect(text).toBe("Resumed");
    // The host's path, which the browser may have moved on from the server's.
    expect(navigate).toHaveBeenCalledWith("/studio?view=list&job=j2");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("pushes through the router when the host does not draw the panel, or there is no host", async () => {
    runner({ status: 202, body: { jobId: "j2" } });
    await mount(null);
    await act(async () => {
      await handle.verbs!.run("j1", "resume", { follow: true });
    });
    expect(mocks.push).toHaveBeenCalledWith("/studio?view=grid&job=j2", { scroll: false });
  });

  it("stays put on a refusal", async () => {
    runner({ status: 409, body: { jobId: "j1", error: "not resumable" } });
    const navigate = vi.fn(() => true);
    await mount(navigate);
    let text = "";
    await act(async () => {
      text = (await handle.verbs!.run("j1", "resume", { follow: true })).text;
    });
    expect(text).toBe("not resumable");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("stays put on a good answer naming the job it was pressed on", async () => {
    runner({ status: 202, body: { jobId: "j1", note: "Already running" } });
    const navigate = vi.fn(() => true);
    await mount(navigate);
    await act(async () => {
      await handle.verbs!.run("j1", "resume", { follow: true });
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("follows any job a Retry-shaped send queues, from no job at all", async () => {
    runner({ status: 202, body: { jobId: "j9" } });
    const navigate = vi.fn(() => true);
    await mount(navigate);
    await act(async () => {
      await handle.verbs!.send("/studio/api/jobs", { label: "retry", body: { kind: "diagram" }, follow: { from: null } });
    });
    expect(navigate).toHaveBeenCalledWith("/studio?view=list&job=j9");
  });

  it("reads the job list after a post, and not after a quiet one", async () => {
    const fetch = runner({ status: 202, body: { jobId: "j2" } });
    await mount(null);
    const reads = () => fetch.mock.calls.filter(([, init]) => init?.method !== "POST").length;
    const before = reads();
    await act(async () => {
      await handle.verbs!.run("j1", "revise", { quiet: true });
    });
    expect(reads()).toBe(before);
    await act(async () => {
      await handle.verbs!.run("j1", "cancel");
    });
    expect(reads()).toBe(before + 1);
  });

  it("is busy with the verb while it is in flight, and idle after", async () => {
    let answer: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? new Promise<Response>((resolve) => (answer = resolve))
          : Promise.resolve(new Response(JSON.stringify({ jobs: [] }), { status: 200 })),
      ),
    );
    const host = await mount(null);
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = handle.verbs!.run("j1", "cancel");
    });
    expect(host.textContent).toBe("cancel");
    await act(async () => {
      answer(new Response("{}", { status: 200 }));
      await pending;
    });
    expect(host.textContent).toBe("idle");
  });
});
