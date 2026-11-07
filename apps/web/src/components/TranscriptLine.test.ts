// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TranscriptLine } from "./TranscriptLine";

/**
 * One timecoded line, shared by the live transcript and a sidecar list: a
 * button that seeks when it can, a paragraph when it cannot, the words
 * capped at one measure.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

async function mount(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

describe("TranscriptLine", () => {
  it("is a button that seeks to its start when given onSeek, and says when it is the current line", async () => {
    const onSeek = vi.fn();
    const host = await mount(createElement(TranscriptLine, { start: 75, text: "Then the server answers.", current: true, onSeek }));
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-current")).toBe("true");
    expect(button.textContent).toBe("1:15Then the server answers.");
    await act(async () => button.click());
    expect(onSeek).toHaveBeenCalledWith(75);
  });

  it("is a paragraph with no hover or focus ring without onSeek, and not current unless told", async () => {
    const host = await mount(createElement(TranscriptLine, { start: 0, text: "Hello.", className: "text-text2" }));
    expect(host.querySelector("button")).toBeNull();
    const line = host.querySelector("p") as HTMLParagraphElement;
    expect(line.hasAttribute("aria-current")).toBe(false);
    expect(line.className).toContain("text-text2");
    expect(line.className).not.toContain("hover:");
  });

  it("caps the words at 70ch", async () => {
    const host = await mount(createElement(TranscriptLine, { start: 3, text: "Words." }));
    const [time, words] = [...(host.querySelector("p") as HTMLParagraphElement).children];
    expect(time.textContent).toBe("0:03");
    expect(words.className).toBe("max-w-[70ch]");
  });
});
