// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioEvent } from "@/lib/studio-jobs";

import { JOB_EVENT_TYPES, useJobEventStream } from "./use-job-events";

/**
 * The one reader of a job's event stream, behind the provider and the video
 * panel (S1-13 of the web audit): events once each by `seq`, in order, for
 * the job they belong to.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

class FakeSource {
  static made: FakeSource[] = [];
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (message: MessageEvent<string>) => void>();
  constructor(url: string) {
    this.url = url;
    FakeSource.made.push(this);
  }
  addEventListener(type: string, listener: (message: MessageEvent<string>) => void) {
    this.listeners.set(type, listener);
  }
  removeEventListener(type: string) {
    this.listeners.delete(type);
  }
  close() {
    this.closed = true;
  }
  send(type: string, event: Partial<StudioEvent>) {
    this.listeners.get(type)?.({ data: JSON.stringify(event) } as MessageEvent<string>);
  }
}

const cleanups: Array<() => void> = [];
beforeEach(() => {
  FakeSource.made = [];
  vi.stubGlobal("EventSource", FakeSource);
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const seen: { events: StudioEvent[]; open: boolean; heard: StudioEvent[] } = { events: [], open: false, heard: [] };

function Probe(props: { jobId: string | null; enabled?: boolean; closeAfterMs?: number }) {
  const { events, open } = useJobEventStream(props.jobId, {
    enabled: props.enabled,
    closeAfterMs: props.closeAfterMs,
    onEvent: (event) => seen.heard.push(event),
  });
  useEffect(() => {
    seen.events = events;
    seen.open = open;
  });
  return null;
}

function mount(props: Parameters<typeof Probe>[0]) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(Probe, props)));
  cleanups.push(() => act(() => root.unmount()));
  return (next: Parameters<typeof Probe>[0]) => act(() => root.render(createElement(Probe, next)));
}

describe("useJobEventStream", () => {
  beforeEach(() => {
    seen.events = [];
    seen.open = false;
    seen.heard = [];
  });

  it("listens for every type, keeps each seq once, in seq order, and says when it is open", () => {
    mount({ jobId: "j1" });
    const source = FakeSource.made[0]!;
    expect(source.url).toBe("/studio/api/jobs/j1/events");
    expect([...source.listeners.keys()]).toEqual([...JOB_EVENT_TYPES]);
    act(() => source.onopen?.());
    expect(seen.open).toBe(true);
    act(() => {
      source.send("step", { seq: 2, type: "step" });
      source.send("phase", { seq: 1, type: "phase" });
      source.send("step", { seq: 2, type: "step" });
    });
    expect(seen.events.map((event) => event.seq)).toEqual([1, 2]);
    expect(seen.heard).toHaveLength(3);
    act(() => source.onerror?.());
    expect(seen.open).toBe(false);
  });

  it("opens nothing when turned off or with no job", () => {
    mount({ jobId: "j1", enabled: false });
    mount({ jobId: null });
    expect(FakeSource.made).toHaveLength(0);
  });

  it("drops the last job's events when it follows another, and closes the old stream", () => {
    const rerender = mount({ jobId: "j1" });
    act(() => FakeSource.made[0]!.send("step", { seq: 1, type: "step" }));
    rerender({ jobId: "j2" });
    expect(FakeSource.made[0]!.closed).toBe(true);
    expect(seen.events).toEqual([]);
  });

  it("closes a finished job's stream after its replay", () => {
    vi.useFakeTimers();
    mount({ jobId: "j1", closeAfterMs: 3_000 });
    act(() => vi.advanceTimersByTime(2_999));
    expect(FakeSource.made[0]!.closed).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeSource.made[0]!.closed).toBe(true);
  });
});
