// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Job } from "@/lib/studio-jobs";

/**
 * A verb's own post reads the job list again, so the panel reads nothing
 * more after it, and asks the server to draw the page again only for the two
 * verbs that change what the server draws (R2-1-15 of the round-2 audit).
 */

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: unknown; href: string }) => createElement("a", { href, ...rest }, children as never),
}));
const verb = {
  run: vi.fn(async () => ({ ok: true, text: "Done.", next: null, data: {} })),
  refresh: vi.fn(async () => {}),
};
vi.mock("@/components/studio/use-job-verb", () => ({
  useJobVerb: () => ({ run: verb.run, refresh: verb.refresh, busy: null, send: vi.fn(), go: vi.fn() }),
}));

const { ComparisonPanel } = await import("./ComparisonPanel");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.clearAllMocks();
});

const job = (patch: Partial<Job>): Job =>
  ({
    jobId: "j1",
    kind: "diagram",
    state: "awaiting_review",
    phase: "ready",
    title: "A diagram",
    topic: "networking",
    target: "learn/assets/a.tldr",
    candidate: "jobs/j1/candidate/a.tldr",
    attempt: 1,
    turns: 3,
    costUsd: null,
    costSource: null,
    exitCode: 0,
    gate: null,
    comparison: null,
    written: [],
    indexed: true,
    error: null,
    errorKind: null,
    requested: "2026-10-30T10:00:00.000Z",
    started: null,
    finished: null,
    updated: "2026-10-30T10:05:00.000Z",
    cancelRequestedAt: null,
    ...patch,
  }) as Job;

async function mount(shown: Job): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ComparisonPanel, { job: shown, path: "/studio?job=j1" }));
  });
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

async function press(host: HTMLElement, name: string): Promise<void> {
  const button = [...host.querySelectorAll("button")].find((entry) => entry.textContent === name);
  if (button === undefined) throw new Error(`no ${name} button`);
  await act(async () => {
    button.click();
  });
}

describe("a verb on the comparison", () => {
  it("draws the page again after an accept, and reads the list no second time", async () => {
    const host = await mount(job({}));
    await press(host, "Accept");
    expect(verb.run).toHaveBeenCalledWith("j1", "accept");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(verb.refresh).not.toHaveBeenCalled();
  });

  it("leaves the page as it is after a reindex, which changes the job's record alone", async () => {
    const host = await mount(job({ state: "accepted", indexed: false }));
    await press(host, "Reindex");
    expect(verb.run).toHaveBeenCalledWith("j1", "reindex");
    expect(router.refresh).not.toHaveBeenCalled();
    expect(verb.refresh).not.toHaveBeenCalled();
  });
});
