// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { StudioEvent } from "@/lib/studio-jobs";
import type { VideoJob } from "@/lib/studio-video-job";

import { MakingLog } from "./VideoJobPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

/**
 * The video job's making log keeps its foot in view as lines arrive. It shows
 * the newest 40, so once it is full a new line leaves the count at 40; the
 * log follows the newest line itself, and a full log still moves.
 *
 * jsdom lays nothing out: each line is `LINE` pixels tall, the box `VIEW`.
 */

const LINE = 20;
const VIEW = 200;
const tops = new WeakMap<Element, number>();
const proto = HTMLOListElement.prototype;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const height = (el: Element) => el.children.length * LINE;
  Object.defineProperty(proto, "scrollHeight", { configurable: true, get(this: Element) { return height(this); } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => VIEW });
  Object.defineProperty(proto, "scrollTop", {
    configurable: true,
    get(this: Element) {
      return tops.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      tops.set(this, Math.max(0, Math.min(value, height(this) - VIEW)));
    },
  });
});

afterAll(() => {
  // The stand-ins sit on the list's own prototype; dropping them leaves Element's.
  for (const name of ["scrollHeight", "clientHeight", "scrollTop"]) delete (proto as unknown as Record<string, unknown>)[name];
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

const JOB = { jobId: "v1", state: "running", seeded: null, classes: [], brief: null } as unknown as VideoJob;

const steps = (count: number): StudioEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    type: "step",
    seq: i + 1,
    at: new Date(Date.UTC(2026, 9, 5, 10, 0, i)).toISOString(),
    job: "v1",
    note: `rendered scene ${i + 1}`,
  }));

function mount(events: StudioEvent[]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const draw = (next: StudioEvent[]) => act(() => root.render(createElement(MakingLog, { job: JOB, events: next, chapters: null })));
  draw(events);
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { list: () => host.querySelector("ol")!, draw };
}

const foot = (list: HTMLOListElement) => list.scrollHeight - list.clientHeight;

describe("MakingLog", () => {
  it("opens at its foot", () => {
    const log = mount(steps(12));
    expect(log.list().scrollTop).toBe(foot(log.list()));
  });

  it("still follows a new line once it holds its whole 40", () => {
    const log = mount(steps(40));
    const list = log.list();
    expect(list.children).toHaveLength(40);
    // Somewhere short of the foot, though still near it: the reader is following.
    list.scrollTop = foot(list) - 10;
    act(() => {
      list.dispatchEvent(new Event("scroll"));
    });
    log.draw(steps(41));
    expect(list.children).toHaveLength(40);
    expect(list.lastElementChild!.textContent).toContain("Rendered scene 41");
    expect(list.scrollTop).toBe(foot(list));
  });

  it("leaves a reader who scrolled up where they are", () => {
    const log = mount(steps(40));
    const list = log.list();
    list.scrollTop = 100;
    act(() => {
      list.dispatchEvent(new Event("scroll"));
    });
    log.draw(steps(41));
    expect(list.scrollTop).toBe(100);
  });
});
