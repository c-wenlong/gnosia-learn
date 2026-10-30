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
    expect(host.textContent).toContain("Accepted");
  });
});

describe("a diagram job's panel", () => {
  // Nothing a person reads names a file: not the job's workspace, not the
  // logical names it landed as, not an absolute path.
  const pathLike = /jobs\/|candidate\/|\.tldr|\.svg|learn\/assets|\$STUDIO_HOME|\/Users\//;

  it("says where a job in review stands without printing its candidate's path", async () => {
    stubFetch([
      {
        status: 200,
        body: {
          ...DIAGRAM,
          state: "awaiting_review",
          candidate: "jobs/old-1/candidate/old.tldr",
          comparison: {
            before: { shot: true, shapes: 4, bindings: 2, svgBytes: 1000 },
            after: { shot: true, shapes: 6, bindings: 3, svgBytes: 1200 },
            fixed: [],
            added: [],
            beforeHash: null,
            refreshedAt: null,
          },
          note: "the candidate is written and checked in the job's workspace, and nothing has landed. 6 shapes, 0 lints.",
        },
      },
    ]);
    const host = await mount();
    await settle();
    expect(host.textContent).toContain("Accept");
    expect(host.textContent).not.toMatch(pathLike);
    const alts = [...host.querySelectorAll("img")].map((img) => img.getAttribute("alt") ?? "");
    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) expect(alt).not.toMatch(pathLike);
  });

  it("says a job landed without listing the names it was stored under", async () => {
    stubFetch([
      {
        status: 200,
        body: {
          ...DIAGRAM,
          written: ["learn/assets/old.tldr", "learn/assets/old.svg"],
          note: "accepted: learn/assets/old.tldr and learn/assets/old.svg landed in the database.",
        },
      },
    ]);
    const host = await mount();
    await settle();
    expect(host.textContent).toContain("Landed in the catalog");
    expect(host.textContent).not.toMatch(pathLike);
  });
});

describe("the phase list, read aloud (S1-10)", () => {
  it("says each phase's state in words, not only by a mark and a colour", async () => {
    stubFetch([{ status: 200, body: { ...DIAGRAM, state: "failed", phase: "drawing", errorKind: "timeout", error: "no answer" } }]);
    const host = await mount();
    await settle();
    const words = [...host.querySelectorAll("ol .sr-only")].map((node) => node.textContent);
    expect(words).toContain("Done: ");
    expect(words).toContain("Failed: ");
    expect(words).toContain("Not started: ");
  });
});

describe("a failed job's buttons", () => {
  const button = (host: HTMLElement, label: string) => [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === label);

  it("Recheck says what doctor says now, not nothing (R2-1-19)", async () => {
    const reads: string[] = [];
    const spawnFailed = { ...DIAGRAM, state: "failed", phase: "drawing", errorKind: "spawn", error: "claude: command not found" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        reads.push(input);
        if (input.startsWith("/studio/api/jobs?")) return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
        if (input === "/studio/api/health") return new Response(JSON.stringify({ ok: true, tldrawkc: true, checks: [{ name: "claude", status: "pass", detail: "" }] }), { status: 200 });
        return new Response(JSON.stringify(spawnFailed), { status: 200 });
      }),
    );
    const host = await mount();
    await settle();
    await act(async () => button(host, "Recheck")!.click());
    await settle();
    expect(reads).toContain("/studio/api/health");
    expect(host.textContent).toContain("Doctor passes now. Press Retry to run it again.");
  });

  it("Talk it through says a read that failed, not a job with no brief (R2-1-20)", async () => {
    let reads = 0;
    const threw = { ...DIAGRAM, state: "failed", phase: "drawing", exitCode: 2, error: "the snippet threw" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input.startsWith("/studio/api/jobs?")) return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
        reads += 1;
        // The panel's own read answers; Talk it through's read finds the runner down.
        if (reads === 1) return new Response(JSON.stringify(threw), { status: 200 });
        throw new TypeError("fetch failed");
      }),
    );
    const host = await mount();
    await settle();
    await act(async () => button(host, "Talk it through")!.click());
    await settle();
    expect(host.textContent).toContain("this job's brief could not be read: the runner did not answer");
    expect(host.textContent).not.toContain("did not return this job's brief");
  });
});
