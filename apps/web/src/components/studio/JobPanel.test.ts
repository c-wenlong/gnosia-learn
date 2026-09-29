// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * A job the provider does not list is read once by `JobPanel`. Only a 404 is
 * "the runner does not have this job"; a read that failed (the runner down, a
 * 5xx) is said as such and asked again, on a press and when the window
 * regains focus, so the panel recovers when the runner comes back.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: unknown; href: string }) => createElement("a", { href, ...rest }, children as never),
}));

const { JobPanel } = await import("./JobPanel");
const { JobsProvider } = await import("./JobsProvider");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.unstubAllGlobals();
});

const DIAGRAM = {
  jobId: "old-1",
  kind: "diagram",
  state: "accepted",
  phase: "ready",
  title: "An old diagram job",
  topic: "networking",
  target: "learn/assets/old.tldr",
  candidate: "jobs/old-1/candidate/old.tldr",
  attempt: 1,
  turns: 3,
  costUsd: 0.4,
  costSource: "result",
  exitCode: 0,
  gate: null,
  comparison: null,
  written: [],
  indexed: true,
  error: null,
  errorKind: null,
  requested: "2026-09-01T10:00:00.000Z",
  started: "2026-09-01T10:00:01.000Z",
  finished: "2026-09-01T10:05:00.000Z",
  updated: "2026-09-01T10:05:00.000Z",
  cancelRequestedAt: null,
  note: "accepted",
};

/** Answers for the one job's read, in order; the list the provider polls is always empty. */
function stubFetch(answers: Array<"network" | { status: number; body: unknown }>) {
  const reads: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.startsWith("/studio/api/jobs?")) return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      reads.push(input);
      const next = answers.shift() ?? { status: 404, body: { error: "no job" } };
      if (next === "network") throw new TypeError("fetch failed");
      return new Response(JSON.stringify(next.body), { status: next.status });
    }),
  );
  return reads;
}

async function mount(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        // Its `children` prop is required in its type; here it is the third argument.
        JobsProvider as unknown as (props: { initialJobs: never[]; streamEnabled: boolean }) => ReactElement,
        { initialJobs: [], streamEnabled: false },
        createElement(JobPanel, { jobId: "old-1", path: "/studio", embedded: true }),
      ),
    );
  });
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

describe("a job the provider does not list", () => {
  it("says a failed read failed, and a press after the runner is back finds the answer", async () => {
    const reads = stubFetch(["network", { status: 404, body: { error: "no job old-1" } }]);
    const host = await mount();
    await settle();
    expect(host.textContent).toContain("Could not look up");
    expect(host.textContent).not.toContain("does not have a job");

    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Try again");
    await act(async () => retry?.click());
    await settle();
    expect(reads).toHaveLength(2);
    // A 404 is an answer: now, and only now, the job is said not to exist.
    expect(host.textContent).toContain("does not have a job");
  });

  it("treats a 5xx as a failure too, and asks again when the window regains focus", async () => {
    const reads = stubFetch([{ status: 503, body: { error: "catalog down" } }, { status: 200, body: DIAGRAM }]);
    const host = await mount();
    await settle();
    expect(host.textContent).toContain("the runner answered 503");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await settle();
    expect(reads).toHaveLength(2);
    expect(host.textContent).not.toContain("Could not look up");
    expect(host.textContent).not.toContain("does not have a job");
    expect(host.textContent).toContain("accepted");
  });
});
