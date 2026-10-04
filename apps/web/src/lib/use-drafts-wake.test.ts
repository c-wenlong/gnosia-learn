// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { announceDraftChange } from "./studio-draft-list";
import { DRAFTS_WAKE_SETTLE_MS, useDraftsWake } from "./use-drafts-wake";

/**
 * The sidebar's history and its search read the conversations again when the
 * window comes back into focus, at once, and when a conversation says it
 * changed, once a burst of changes has rested.
 */

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => vi.useFakeTimers());

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

function Waker({ wake, enabled }: { wake: () => void; enabled: boolean }): ReactElement | null {
  useDraftsWake(wake, enabled);
  return null;
}

function draw(wake: () => void, enabled: boolean) {
  if (container === null) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => root!.render(createElement(Waker, { wake, enabled })));
}

describe("useDraftsWake", () => {
  it("reads at once when the window takes the focus back", () => {
    const wake = vi.fn();
    draw(wake, true);
    window.dispatchEvent(new Event("focus"));
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it("covers a burst of changes with one read, once they rest", () => {
    const wake = vi.fn();
    draw(wake, true);
    announceDraftChange("d1");
    vi.advanceTimersByTime(DRAFTS_WAKE_SETTLE_MS - 100);
    announceDraftChange("d1");
    announceDraftChange("d2");
    vi.advanceTimersByTime(DRAFTS_WAKE_SETTLE_MS - 1);
    expect(wake).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it("listens to nothing while not enabled", () => {
    const wake = vi.fn();
    draw(wake, false);
    window.dispatchEvent(new Event("focus"));
    announceDraftChange("d1");
    vi.advanceTimersByTime(DRAFTS_WAKE_SETTLE_MS);
    expect(wake).not.toHaveBeenCalled();
  });

  it("drops a read still waiting when it stops listening", () => {
    const wake = vi.fn();
    draw(wake, true);
    announceDraftChange("d1");
    draw(wake, false);
    vi.advanceTimersByTime(DRAFTS_WAKE_SETTLE_MS);
    expect(wake).not.toHaveBeenCalled();
  });
});
