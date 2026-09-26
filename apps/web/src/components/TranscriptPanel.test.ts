// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TranscriptPanel } from "./TranscriptPanel";
import type { TranscriptCue } from "./media";

/**
 * Behaviour, not markup. The three things worth pinning are the highlight
 * following playback, a click seeking, and the panel giving up the follow the
 * moment the reader scrolls somewhere else.
 *
 * Rendered with `react-dom/client` and React's own `act` rather than a testing
 * library: the repo's four runtime dependencies are the whole list, and one
 * `mount` helper is cheaper than a fifth.
 */

const cues: TranscriptCue[] = [
  { start: 0, end: 3, text: "First line." },
  { start: 4, end: 7, text: "Second line." },
  { start: 12, end: 15, text: "Third line." },
];

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(element: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return {
    host,
    rerender: (next: ReactElement) => act(() => root.render(next)),
  };
}

function lines(host: HTMLElement) {
  return [...host.querySelectorAll("li")];
}

function activeText(host: HTMLElement) {
  return host.querySelector('[aria-current="true"]')?.textContent ?? null;
}

/** The `X / Y` counter beside the "Transcript" heading, while following. */
function counterText(host: HTMLElement) {
  return host.querySelector("h3")?.parentElement?.querySelector("span")?.textContent ?? null;
}

/**
 * jsdom lays nothing out, so the panel's geometry has to be described to it:
 * a 100px window over lines 40px tall. Without this every element is 0x0 and
 * the follow logic has nothing to measure.
 */
function layout(host: HTMLElement, { lineHeight = 40, windowHeight = 100 } = {}) {
  const scroller = host.querySelector("ol") as HTMLElement;
  Object.defineProperty(scroller, "clientHeight", { value: windowHeight, configurable: true });
  lines(host).forEach((li, i) => {
    Object.defineProperty(li, "offsetTop", { value: i * lineHeight, configurable: true });
    Object.defineProperty(li, "offsetHeight", { value: lineHeight, configurable: true });
  });
  return scroller;
}

describe("TranscriptPanel", () => {
  it("highlights the line being spoken and follows the clock", () => {
    const { host, rerender } = mount(
      createElement(TranscriptPanel, { cues, currentTime: 0 }),
    );
    expect(activeText(host)).toContain("First line.");

    rerender(createElement(TranscriptPanel, { cues, currentTime: 5 }));
    expect(activeText(host)).toContain("Second line.");

    // 7 to 12 is silence: the highlight rests rather than blinking out.
    rerender(createElement(TranscriptPanel, { cues, currentTime: 9 }));
    expect(activeText(host)).toContain("Second line.");

    rerender(createElement(TranscriptPanel, { cues, currentTime: 13 }));
    expect(activeText(host)).toContain("Third line.");
  });

  it("highlights nothing before the first line starts", () => {
    const { host } = mount(createElement(TranscriptPanel, { cues, currentTime: -1 }));
    expect(activeText(host)).toBeNull();
  });

  it("gives the length before the first line starts, never a false position", () => {
    // No cue has started yet, so there is no position to report. "0 / 3"
    // names a line that does not exist, "1 / 3" claims the reader is on a line
    // nobody has heard, and "- / 3" reads as a value that failed to load.
    const { host } = mount(createElement(TranscriptPanel, { cues, currentTime: -1 }));
    expect(counterText(host)).toBe("3 lines");
  });

  it("gives the length on a video at rest whose first line starts after 0:00", () => {
    // The asset page's case: the player reports 0 until playback starts, and
    // manimkc's first segment begins a moment into the video.
    const late = cues.map((cue) => ({ ...cue, start: cue.start + 0.4 }));
    const { host, rerender } = mount(
      createElement(TranscriptPanel, { cues: late, currentTime: 0 }),
    );
    expect(counterText(host)).toBe("3 lines");

    rerender(createElement(TranscriptPanel, { cues: late, currentTime: 5 }));
    expect(counterText(host)).toBe("2 / 3");

    // Seeking back before the first line returns to the length, not a stale position.
    rerender(createElement(TranscriptPanel, { cues: late, currentTime: 0 }));
    expect(counterText(host)).toBe("3 lines");
  });

  it("says line, not lines, for a one-line transcript", () => {
    const one = [{ start: 2, end: 3, text: "Only line." }];
    const { host, rerender } = mount(
      createElement(TranscriptPanel, { cues: one, currentTime: 0 }),
    );
    expect(counterText(host)).toBe("1 line");
    rerender(createElement(TranscriptPanel, { cues: one, currentTime: 2 }));
    expect(counterText(host)).toBe("1 / 1");
  });

  it("counts the line being spoken", () => {
    const { host } = mount(createElement(TranscriptPanel, { cues, currentTime: 0 }));
    expect(counterText(host)).toBe("1 / 3");
  });

  it("counts the last line spoken through a gap between cues", () => {
    // 7 to 12 is silence between the second and third lines; the count rests
    // on the second line rather than dropping back to the dash.
    const { host } = mount(createElement(TranscriptPanel, { cues, currentTime: 9 }));
    expect(counterText(host)).toBe("2 / 3");
  });

  it("counts the last line once playback runs past it", () => {
    const { host } = mount(createElement(TranscriptPanel, { cues, currentTime: 999 }));
    expect(counterText(host)).toBe("3 / 3");
  });

  it("seeks to a line when it is clicked", () => {
    const onSeek = vi.fn();
    const { host } = mount(
      createElement(TranscriptPanel, { cues, currentTime: 0, onSeek }),
    );
    const third = lines(host)[2].querySelector("button") as HTMLButtonElement;
    act(() => third.click());
    expect(onSeek).toHaveBeenCalledWith(12);
  });

  it("renders lines as plain text when there is nothing to seek", () => {
    const { host } = mount(createElement(TranscriptPanel, { cues, currentTime: 0 }));
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.textContent).toContain("Third line.");
  });

  it("scrolls the current line into view", () => {
    const { host, rerender } = mount(
      createElement(TranscriptPanel, { cues, currentTime: 0 }),
    );
    const scroller = layout(host);
    expect(scroller.scrollTop).toBe(0);

    // Line 3 sits at 80, past the 100px window once its 40px height is counted.
    rerender(createElement(TranscriptPanel, { cues, currentTime: 13 }));
    expect(scroller.scrollTop).toBeGreaterThan(0);
  });

  it("stops following once the reader scrolls away, and stays stopped", () => {
    const { host, rerender } = mount(
      createElement(TranscriptPanel, { cues, currentTime: 0 }),
    );
    const scroller = layout(host);

    // The reader drags the panel somewhere the current line is not.
    scroller.scrollTop = 400;
    act(() => scroller.dispatchEvent(new Event("scroll")));

    expect(host.textContent).toContain("Follow along");

    // Playback moves on. The panel leaves the reader where they put it.
    rerender(createElement(TranscriptPanel, { cues, currentTime: 5 }));
    rerender(createElement(TranscriptPanel, { cues, currentTime: 13 }));
    expect(scroller.scrollTop).toBe(400);
    expect(activeText(host)).toContain("Third line.");
  });

  it("does not mistake its own scroll for the reader's", () => {
    const { host, rerender } = mount(
      createElement(TranscriptPanel, { cues, currentTime: 0 }),
    );
    const scroller = layout(host);

    rerender(createElement(TranscriptPanel, { cues, currentTime: 13 }));
    const own = scroller.scrollTop;
    expect(own).toBeGreaterThan(0);

    // The browser reports the move this component just made.
    act(() => scroller.dispatchEvent(new Event("scroll")));
    expect(host.textContent).not.toContain("Follow along");
  });

  it("picks the follow back up when asked", () => {
    const { host, rerender } = mount(
      createElement(TranscriptPanel, { cues, currentTime: 0 }),
    );
    const scroller = layout(host);
    scroller.scrollTop = 400;
    act(() => scroller.dispatchEvent(new Event("scroll")));
    rerender(createElement(TranscriptPanel, { cues, currentTime: 13 }));
    expect(scroller.scrollTop).toBe(400);

    const resume = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Follow along"),
    ) as HTMLButtonElement;
    act(() => resume.click());
    expect(scroller.scrollTop).not.toBe(400);
    expect(host.textContent).not.toContain("Follow along");
  });

  it("resumes on its own when the reader scrolls back to the current line", () => {
    const { host } = mount(createElement(TranscriptPanel, { cues, currentTime: 13 }));
    const scroller = layout(host);
    scroller.scrollTop = 400;
    act(() => scroller.dispatchEvent(new Event("scroll")));
    expect(host.textContent).toContain("Follow along");

    // Back to the top, where line 3 (at 80, 40 tall) fits the 100px window.
    scroller.scrollTop = 20;
    act(() => scroller.dispatchEvent(new Event("scroll")));
    expect(host.textContent).not.toContain("Follow along");
  });

  it("says so when there is no transcript, with no counter at all", () => {
    // The chapters-only fallback and a silent render both land here: there
    // are no lines, so neither a length nor a position is shown.
    const { host } = mount(createElement(TranscriptPanel, { cues: [], currentTime: 0 }));
    expect(host.textContent).toContain("No transcript beside this video.");
    expect(host.querySelector("ol")).toBeNull();
    expect(counterText(host)).toBeNull();
    expect(host.textContent).not.toMatch(/\d+ lines?|\/ 0/);
  });
});
