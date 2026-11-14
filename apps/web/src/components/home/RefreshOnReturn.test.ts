// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Home reads itself again when the window comes back after a minute, once
 * per return, and leaves no timer behind when the page goes.
 */

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { RefreshOnReturn } = await import("./RefreshOnReturn");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let visibility: DocumentVisibilityState = "visible";
let root: Root | null = null;
beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockReset();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  delete (document as unknown as Record<string, unknown>).visibilityState;
  vi.useRealTimers();
});

function draw(asOf: string) {
  root ??= createRoot(document.createElement("div"));
  act(() => root!.render(createElement(RefreshOnReturn, { asOf })));
}
const focus = () => act(() => void window.dispatchEvent(new Event("focus")));
const shown = () => act(() => void document.dispatchEvent(new Event("visibilitychange")));

describe("RefreshOnReturn", () => {
  it("refreshes a page left for over a minute when the window comes back, and clears its timer when it goes", () => {
    draw("a");
    focus();
    expect(router.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(61_000);
    focus();
    focus();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    act(() => root!.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts the clock again when a new read arrives", () => {
    draw("a");
    vi.advanceTimersByTime(61_000);
    focus();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The wait for that refresh runs out, so only the clock can hold the next return.
    vi.advanceTimersByTime(11_000);
    draw("b");
    focus();
    expect(router.refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61_000);
    focus();
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("lets the next return ask again once a new read arrives, before the wait runs out", () => {
    draw("a");
    vi.advanceTimersByTime(61_000);
    focus();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    draw("b");
    // A minute passes on the clock with no timer run, so the ten-second
    // release has not fired: only the new read can have cleared the wait.
    vi.setSystemTime(Date.now() + 61_000);
    focus();
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("asks again after ten seconds when a refresh never lands", () => {
    draw("a");
    vi.advanceTimersByTime(61_000);
    focus();
    vi.advanceTimersByTime(9_999);
    focus();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    focus();
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshes when the tab is shown again, not when it is hidden", () => {
    draw("a");
    vi.advanceTimersByTime(61_000);
    visibility = "hidden";
    shown();
    expect(router.refresh).not.toHaveBeenCalled();
    visibility = "visible";
    shown();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
