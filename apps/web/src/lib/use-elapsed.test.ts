// @vitest-environment jsdom
import { createElement, type ReactElement } from "react";
import { act } from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatDuration, type Job } from "./studio-jobs";
import { useElapsed, useNow } from "./use-elapsed";

/**
 * The job clock, on both sides of hydration.
 *
 * The bug: the elapsed time was read from `Date.now()` during render, so the
 * server's HTML carried one second and the browser's first render another, and
 * React logged a text mismatch on /studio while a job ran. These render a
 * running job the way the server does, hydrate that HTML a few seconds later,
 * and fail on any hydration error.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T0 = Date.parse("2026-09-18T10:00:00.000Z");
const at = (seconds: number): string => new Date(T0 + seconds * 1000).toISOString();

function job(over: Partial<Job> = {}): Job {
  return { jobId: "job-1", started: at(0), requested: at(0), finished: null, ...over } as Job;
}

function Clock({ of }: { of: Job }): ReactElement {
  const ms = useElapsed(of);
  return createElement("span", null, ms === null ? "-" : formatDuration(ms));
}

function Raw(): ReactElement {
  const now = useNow();
  return createElement("span", null, now === null ? "-" : "now");
}

let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 + 10_000);
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  vi.useRealTimers();
  container.remove();
  vi.restoreAllMocks();
});

describe("the first render of a running job", () => {
  it("has no figure on the server", () => {
    expect(renderToString(createElement(Clock, { of: job() }))).toBe("<span>-</span>");
    expect(renderToString(createElement(Raw))).toBe("<span>-</span>");
  });

  it("hydrates the server's HTML without a mismatch, then shows the time and ticks", async () => {
    container.innerHTML = renderToString(createElement(Clock, { of: job() }));
    // The browser gets there seconds later than the server rendered.
    vi.setSystemTime(T0 + 13_000);
    const errors: unknown[] = [];
    const logged = vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(args));

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, createElement(Clock, { of: job() }), {
        onRecoverableError: (error) => void errors.push(error),
      });
    });

    expect(errors).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
    expect(container.textContent).toBe("13s");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.textContent).toBe("15s");
    await act(async () => root.unmount());
  });
});

describe("a component mounted after the page has loaded", () => {
  it("shows the time on its first render, with no server HTML to match", async () => {
    const root = createRoot(container);
    await act(async () => root.render(createElement(Clock, { of: job() })));
    expect(container.textContent).toBe("10s");
    await act(async () => root.unmount());
  });
});

describe("a finished job", () => {
  const done = job({ finished: at(75) });

  it("has its figure from the record on the server", () => {
    expect(renderToString(createElement(Clock, { of: done }))).toBe("<span>1:15</span>");
  });

  it("does not tick", async () => {
    const root = createRoot(container);
    await act(async () => root.render(createElement(Clock, { of: done })));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(container.textContent).toBe("1:15");
    await act(async () => root.unmount());
  });
});
