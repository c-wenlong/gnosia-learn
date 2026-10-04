// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { COPIED_MS, useCopied } from "./use-copied";

/**
 * "Copied" on the button that copied, for one beat, with one timer: a second
 * copy restarts the beat rather than being cut short by the first one's.
 */

type Copied = ReturnType<typeof useCopied<"a" | "b">>;
let state: Copied;
const report = (next: Copied) => {
  state = next;
};
function Probe({ onRender }: { onRender: (next: Copied) => void }) {
  onRender(useCopied<"a" | "b">());
  return null;
}

const writeText = vi.fn<(text: string) => Promise<void>>();
let root: Root;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe, { onRender: report })));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("useCopied", () => {
  it("says which copy happened, then clears after the beat", async () => {
    await act(async () => {
      expect(await state.copy("text", "a")).toBe(true);
    });
    expect(writeText).toHaveBeenCalledWith("text");
    expect(state.copied).toBe("a");
    act(() => vi.advanceTimersByTime(COPIED_MS));
    expect(state.copied).toBeNull();
  });

  it("restarts the beat on a second copy instead of letting the first timer end it", async () => {
    await act(async () => {
      await state.copy("one", "a");
    });
    act(() => vi.advanceTimersByTime(COPIED_MS - 200));
    await act(async () => {
      await state.copy("two", "b");
    });
    // The first copy's beat would have ended here.
    act(() => vi.advanceTimersByTime(400));
    expect(state.copied).toBe("b");
    act(() => vi.advanceTimersByTime(COPIED_MS - 400));
    expect(state.copied).toBeNull();
  });

  it("resolves false and shows nothing when the browser refuses", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => {
      expect(await state.copy("text", "a")).toBe(false);
    });
    expect(state.copied).toBeNull();
  });
});
