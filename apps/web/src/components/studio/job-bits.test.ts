// @vitest-environment jsdom
import { act, createElement, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Job } from "@/lib/studio-jobs";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn(), replace: vi.fn() }) }));

const { JobsProvider } = await import("./JobsProvider");
const { CancelJobButton } = await import("./job-bits");

/**
 * Cancel on the strip, a tile and the video job panel: Stopping on the press,
 * and a refusal said where the press was rather than only to a panel that
 * passed `onDone` (R2-1-03).
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.unstubAllGlobals();
});

/** The runner: the cancel answers once `release` is called, the list answers empty. */
function runner(answer: { status: number; body: Record<string, unknown> }) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
      await gate;
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    }),
  );
  return () => release();
}

async function mount(props: { cancelRequestedAt?: string | null; onDone?: (outcome: { ok: boolean; text: string }) => void; problemAt?: "inline" | "above" }) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        JobsProvider as unknown as (props: { initialJobs: Job[]; streamEnabled: boolean; children?: ReactNode }) => ReactElement,
        { initialJobs: [], streamEnabled: false },
        createElement(CancelJobButton, {
          job: { jobId: "j1", cancelRequestedAt: props.cancelRequestedAt ?? null },
          path: "/studio",
          onDone: props.onDone,
          problemAt: props.problemAt,
        }),
      ),
    );
  });
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const press = async (host: HTMLElement) => {
  await act(async () => host.querySelector("button")!.click());
};
const settle = async () => {
  for (let at = 0; at < 5; at += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

describe("CancelJobButton", () => {
  it("says Stopping from the press, then Cancel again and the runner's words when it refuses", async () => {
    const release = runner({ status: 409, body: { error: "job j1 has already finished" } });
    const host = await mount({});
    await press(host);
    expect(host.querySelector("button")!.textContent).toBe("Stopping");
    expect(host.querySelector("button")!.disabled).toBe(true);
    release();
    await settle();
    expect(host.querySelector("button")!.textContent).toBe("Cancel");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("job j1 has already finished");
  });

  it("says a runner that is down, and clears the line on the next press", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const host = await mount({ problemAt: "above" });
    await press(host);
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/not answering/);
    const release = runner({ status: 202, body: { note: "stopping" } });
    await press(host);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    release();
    await settle();
  });

  it("leaves the words to a panel that passes onDone", async () => {
    const release = runner({ status: 503, body: { error: "the studio is shutting down" } });
    const said: string[] = [];
    const host = await mount({ onDone: (outcome) => said.push(outcome.text) });
    await press(host);
    release();
    await settle();
    expect(said).toEqual(["the studio is shutting down"]);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("is Stopping while the record carries the request", async () => {
    const host = await mount({ cancelRequestedAt: "2026-10-30T00:00:00Z" });
    expect(host.querySelector("button")!.textContent).toBe("Stopping");
  });
});
