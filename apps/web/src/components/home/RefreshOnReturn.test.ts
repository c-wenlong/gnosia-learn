// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
afterEach(() => vi.useRealTimers());

describe("RefreshOnReturn", () => {
  it("refreshes a page left for over a minute when the window comes back, and clears its timer when it goes", () => {
    vi.useFakeTimers();
    router.refresh.mockReset();
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(RefreshOnReturn, { asOf: "a" })));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(router.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(61_000);
    act(() => void window.dispatchEvent(new Event("focus")));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});
