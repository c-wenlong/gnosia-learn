// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "./VideoPlayer";
import type { TranscriptCue, VideoChapter } from "@gnosia/tutor/media";

const chapters: VideoChapter[] = [
  { scene: "T1_Intro", title: "Intro", start: 0, end: 8 },
  { scene: "T2_Body", title: "The body", start: 8, end: 20 },
  { scene: "T3_Close", title: "Close", start: 20, end: 30 },
];

const transcript: TranscriptCue[] = [
  { start: 0, end: 3, text: "First line." },
  { start: 20, end: 24, text: "Last line." },
];

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

const roots = new WeakMap<HTMLElement, ReturnType<typeof createRoot>>();

function mount(element: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.set(host, root);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

/** Re-renders into the same root, which is what a soft navigation does: the
    component instance and its state are kept, only the props change. */
function rerender(host: HTMLElement, element: ReactElement) {
  act(() => roots.get(host)?.render(element));
}

function video(host: HTMLElement) {
  return host.querySelector("video") as HTMLVideoElement;
}

function slider(host: HTMLElement) {
  return host.querySelector('[role="slider"]') as HTMLElement;
}

function press(target: HTMLElement, key: string) {
  act(() => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
}

/** Chapters are on the scrub bar now: Page Down from the top reaches chapter `index`. */
function goToChapter(host: HTMLElement, index: number) {
  press(slider(host), "Home");
  for (let i = 0; i < index; i += 1) press(slider(host), "PageDown");
}

function currentChapter(host: HTMLElement) {
  return host.querySelector("[data-chapter-label]")?.textContent ?? null;
}

describe("VideoPlayer", () => {
  it("seeks the video when a chapter is clicked", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    goToChapter(host, 2);
    expect(video(host).currentTime).toBe(20);
    expect(currentChapter(host)).toContain("Close");
  });

  it("moves the current chapter as the video plays", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    expect(currentChapter(host)).toContain("Intro");

    const el = video(host);
    el.currentTime = 12;
    act(() => el.dispatchEvent(new Event("timeupdate")));
    expect(currentChapter(host)).toContain("The body");
  });

  it("carries the seek through to the transcript beside it", () => {
    const host = mount(
      createElement(VideoPlayer, { src: "/v.mp4", chapters, transcript }),
    );
    expect(host.querySelector('ol[aria-label="Transcript"] [aria-current="true"]')?.textContent)
      .toContain("First line.");

    goToChapter(host, 2);
    expect(host.querySelector('ol[aria-label="Transcript"] [aria-current="true"]')?.textContent)
      .toContain("Last line.");
  });

  it("seeks the video when a transcript line is clicked", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", transcript }));
    const line = host.querySelectorAll('ol[aria-label="Transcript"] button')[1] as HTMLButtonElement;
    act(() => line.click());
    expect(video(host).currentTime).toBe(20);
  });

  it("uses the poster when there is one and asks for metadata when there is not", () => {
    const withPoster = mount(
      createElement(VideoPlayer, { src: "/v.mp4", poster: "/v.jpg" }),
    );
    expect(video(withPoster).getAttribute("poster")).toBe("/v.jpg");

    const without = mount(createElement(VideoPlayer, { src: "/v.mp4" }));
    expect(video(without).hasAttribute("poster")).toBe(false);
    expect(video(without).getAttribute("preload")).toBe("metadata");
  });

  it("renders the video and its controls alone when it is given nothing else", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4" }));
    expect(host.querySelector('ol[aria-label="Transcript"]')).toBeNull();
    expect(currentChapter(host)).toBeNull();
    expect(host.querySelector('[aria-label^="Subtitles"]')).toBeNull();
    expect(slider(host)).not.toBeNull();
    // Native controls cannot draw chapters, so the element has none.
    expect(video(host).hasAttribute("controls")).toBe(false);
  });

  it("says so when the transcript is there but empty, and offers no subtitles", () => {
    const host = mount(
      createElement(VideoPlayer, { src: "/v.mp4", chapters: [], transcript: [] }),
    );
    expect(host.textContent).toContain("No transcript beside this video.");
    expect(host.querySelector('[aria-label^="Subtitles"]')).toBeNull();
  });

  it("names itself for assistive technology when given a title", () => {
    const host = mount(
      createElement(VideoPlayer, { src: "/v.mp4", title: "Inverse kinematics", chapters }),
    );
    expect(video(host).getAttribute("aria-label")).toBe("Inverse kinematics");
    expect(slider(host).getAttribute("aria-label")).toBe("Seek in Inverse kinematics");
    expect(slider(host).getAttribute("aria-valuetext")).toContain("Intro");
  });

  it("shows the line being spoken over the picture when subtitles are on", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", transcript }));
    const subtitle = () => host.querySelector("[data-subtitle]")?.textContent ?? null;
    expect(subtitle()).toBeNull();

    const button = host.querySelector('[aria-label^="Subtitles"]') as HTMLButtonElement;
    act(() => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(subtitle()).toBe("First line.");

    const el = video(host);
    el.currentTime = 10;
    act(() => el.dispatchEvent(new Event("timeupdate")));
    // Between two lines nothing is spoken, so nothing is shown.
    expect(subtitle()).toBeNull();

    press(slider(host), "End");
    press(button, "c");
    expect(subtitle()).toBeNull();
  });

  it("starts at a resume point once the metadata arrives", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters, startAt: 21 }));
    const el = video(host);
    expect(currentChapter(host)).toContain("Close");
    act(() => el.dispatchEvent(new Event("loadedmetadata")));
    expect(el.currentTime).toBe(21);
  });

  it("puts the transcript and the caller's sections in one tabbed card", () => {
    const host = mount(
      createElement(VideoPlayer, {
        src: "/v.mp4",
        transcript,
        header: createElement("h1", null, "Title"),
        tabs: [{ id: "details", label: "Details", content: createElement("p", null, "The row.") }],
      }),
    );
    const tabs = [...host.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    expect(tabs.map((t) => t.textContent)).toEqual(["Transcript", "Details"]);
    const panels = [...host.querySelectorAll('[role="tabpanel"]')] as HTMLElement[];
    expect(panels.map((p) => p.hidden)).toEqual([false, true]);
    // Inside the tab the transcript has no heading of its own.
    expect(host.querySelector("h3")).toBeNull();

    press(tabs[0], "ArrowRight");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(panels.map((p) => p.hidden)).toEqual([true, false]);
    // Hidden, not unmounted: the transcript keeps following playback.
    expect(host.querySelector('ol[aria-label="Transcript"]')).not.toBeNull();
  });

  it("reports playback to a caller that records it", () => {
    const signals: string[] = [];
    const host = mount(
      createElement(VideoPlayer, {
        src: "/v.mp4",
        onPlayback: (signal) => signals.push(`${signal.type}@${signal.time}`),
      }),
    );
    const el = video(host);
    el.currentTime = 4;
    act(() => el.dispatchEvent(new Event("timeupdate")));
    act(() => el.dispatchEvent(new Event("pause")));
    expect(signals).toEqual(["time@4", "pause@4"]);
  });

  it("survives a seek the element refuses", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    const el = video(host);
    Object.defineProperty(el, "currentTime", {
      get: () => 0,
      set: () => {
        throw new Error("The element has not loaded metadata yet.");
      },
      configurable: true,
    });
    goToChapter(host, 1);
    // The click still lands: the chapter the reader asked for is the one shown.
    expect(currentChapter(host)).toContain("The body");
  });

  it("applies a refused seek once the metadata arrives", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    const el = video(host);
    let stored = 0;
    let ready = false;
    Object.defineProperty(el, "currentTime", {
      get: () => stored,
      set: (value: number) => {
        // What a browser does before `loadedmetadata`: it refuses the write.
        if (!ready) throw new Error("The element has not loaded metadata yet.");
        stored = value;
      },
      configurable: true,
    });

    goToChapter(host, 1);
    expect(stored).toBe(0);

    ready = true;
    act(() => el.dispatchEvent(new Event("loadedmetadata")));
    // The chapter the reader clicked is where playback actually starts.
    expect(stored).toBe(8);
    expect(currentChapter(host)).toContain("The body");
  });

  it("jumps when asked from outside, holding a jump made before the metadata", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    const el = video(host);
    let stored = 0;
    let ready = false;
    let plays = 0;
    Object.defineProperty(el, "currentTime", {
      get: () => stored,
      set: (value: number) => {
        if (!ready) throw new Error("The element has not loaded metadata yet.");
        stored = value;
      },
      configurable: true,
    });
    el.play = () => {
      plays += 1;
      return Promise.resolve();
    };

    rerender(host, createElement(VideoPlayer, { src: "/v.mp4", chapters, seekTo: { seconds: 20, key: 1 } }));
    expect(stored).toBe(0);
    expect(plays).toBe(1);
    ready = true;
    act(() => el.dispatchEvent(new Event("loadedmetadata")));
    expect(stored).toBe(20);

    // The same chapter pressed again is a second jump: the key, not the time, says so.
    act(() => {
      stored = 3;
    });
    rerender(host, createElement(VideoPlayer, { src: "/v.mp4", chapters, seekTo: { seconds: 20, key: 2 } }));
    expect(stored).toBe(20);
    expect(plays).toBe(2);
  });

  it("drops a pending seek when the source is swapped before it lands", () => {
    const host = mount(createElement(VideoPlayer, { src: "/a.mp4", chapters }));
    const el = video(host);
    let stored = 0;
    let ready = false;
    Object.defineProperty(el, "currentTime", {
      get: () => stored,
      set: (value: number) => {
        if (!ready) throw new Error("The element has not loaded metadata yet.");
        stored = value;
      },
      configurable: true,
    });

    goToChapter(host, 2);
    rerender(host, createElement(VideoPlayer, { src: "/b.mp4", chapters }));

    ready = true;
    act(() => video(host).dispatchEvent(new Event("loadedmetadata")));
    // The new video starts at its own beginning, not 20s into the old one.
    expect(stored).toBe(0);
  });

  it("drops a pending seek even when the same source comes back around", () => {
    const host = mount(createElement(VideoPlayer, { src: "/a.mp4", chapters }));
    const el = video(host);
    let stored = 0;
    let ready = false;
    Object.defineProperty(el, "currentTime", {
      get: () => stored,
      set: (value: number) => {
        if (!ready) throw new Error("The element has not loaded metadata yet.");
        stored = value;
      },
      configurable: true,
    });

    goToChapter(host, 2);
    // Away and back before the first load ever reported itself. The URL is the
    // same string again; the load is not.
    rerender(host, createElement(VideoPlayer, { src: "/b.mp4", chapters }));
    rerender(host, createElement(VideoPlayer, { src: "/a.mp4", chapters }));

    ready = true;
    act(() => video(host).dispatchEvent(new Event("loadedmetadata")));
    expect(stored).toBe(0);
  });

  it("forgets the playback position when the source changes", () => {
    const host = mount(
      createElement(VideoPlayer, { src: "/a.mp4", chapters, transcript }),
    );
    const el = video(host);
    el.currentTime = 25;
    act(() => el.dispatchEvent(new Event("timeupdate")));
    expect(currentChapter(host)).toContain("Close");

    rerender(host, createElement(VideoPlayer, { src: "/b.mp4", chapters, transcript }));

    expect(video(host).getAttribute("src")).toBe("/b.mp4");
    expect(currentChapter(host)).toContain("Intro");
    expect(
      host.querySelector('ol[aria-label="Transcript"] [aria-current="true"]')?.textContent,
    ).toContain("First line.");
  });

  it("reads a length the element already had when it hydrated", () => {
    // The server's <video preload="metadata"> starts loading before React is
    // attached, so `loadedmetadata` and `durationchange` can fire before any
    // listener exists: the element knows its length and never says so again.
    const element = createElement(VideoPlayer, { src: "/v.mp4", chapters, transcript });
    const host = document.createElement("div");
    host.innerHTML = renderToString(element);
    document.body.append(host);
    const el = video(host);
    Object.defineProperty(el, "readyState", { get: () => 1, configurable: true });
    Object.defineProperty(el, "duration", { get: () => 30, configurable: true });
    let root: ReturnType<typeof hydrateRoot> | null = null;
    act(() => {
      root = hydrateRoot(host, element);
    });
    mounted.push(() => {
      act(() => root?.unmount());
      host.remove();
    });
    expect(host.textContent).toContain("0:00 / 0:30");
    expect(host.textContent).not.toContain("–:––");
    expect(slider(host).getAttribute("aria-valuemax")).toBe("30");
  });

  it("names the subtitles toggle once, and says whether it is on by aria-pressed alone", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", transcript }));
    const button = () => host.querySelector('[aria-label^="Subtitles"]') as HTMLButtonElement;
    const before = button().getAttribute("aria-pressed") === "true";
    act(() => button().click());
    // A toggle keeps its name; its state is aria-pressed. "Subtitles off" while
    // pressed read as the action and the state at once, one of them wrong.
    expect(button().getAttribute("aria-label")).toBe("Subtitles (c)");
    expect(button().getAttribute("title")).toBe("Subtitles (c)");
    expect(button().getAttribute("aria-pressed")).toBe(String(!before));
    act(() => button().click());
    expect(button().getAttribute("aria-label")).toBe("Subtitles (c)");
    expect(button().getAttribute("aria-pressed")).toBe(String(before));
  });

  it("names the speed button with the rate it plays at", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4" }));
    const button = () => host.querySelector('[aria-label^="Playback speed"]') as HTMLButtonElement;
    // The name replaces the visible "1×", so it has to carry the rate itself.
    expect(button().getAttribute("aria-label")).toBe("Playback speed, 1×");
    act(() => button().click());
    act(() => video(host).dispatchEvent(new Event("ratechange")));
    expect(video(host).playbackRate).toBe(1.25);
    expect(button().getAttribute("aria-label")).toBe("Playback speed, 1.25×");
  });

  it("gives the scrub bar no range until the length is known, and the time in words throughout", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters, startAt: 21 }));
    const el = video(host);
    // A max of 0 under a resume point of 21 is an invalid slider.
    for (const name of ["aria-valuemin", "aria-valuemax", "aria-valuenow"]) {
      expect(slider(host).hasAttribute(name)).toBe(false);
    }
    expect(slider(host).getAttribute("aria-valuetext")).toBe("0:21, Close");
    Object.defineProperty(el, "duration", { get: () => 30, configurable: true });
    act(() => el.dispatchEvent(new Event("loadedmetadata")));
    expect(slider(host).getAttribute("aria-valuemin")).toBe("0");
    expect(slider(host).getAttribute("aria-valuemax")).toBe("30");
    expect(slider(host).getAttribute("aria-valuenow")).toBe("21");
    expect(slider(host).getAttribute("aria-valuetext")).toBe("0:21 of 0:30, Close");
  });

  it("moves five seconds on an arrow and flashes a total that grows while it is up", () => {
    vi.useFakeTimers();
    try {
      const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
      const el = video(host);
      el.currentTime = 10;
      const frame = el.parentElement as HTMLElement;
      const flash = () => host.querySelector("[data-skip]");

      press(frame, "ArrowRight");
      expect(el.currentTime).toBe(15);
      expect(flash()?.textContent).toBe("+ 5");

      act(() => vi.advanceTimersByTime(600));
      press(frame, "ArrowRight");
      act(() => vi.advanceTimersByTime(600));
      press(frame, "ArrowRight");
      // Each press restarts the second, so three presses 600 ms apart are one run.
      expect(el.currentTime).toBe(25);
      expect(flash()?.textContent).toBe("+ 15");
      expect(flash()?.getAttribute("data-skip")).toBe("shown");

      act(() => vi.advanceTimersByTime(1000));
      expect(flash()?.getAttribute("data-skip")).toBe("away");

      // After it went, a press starts over, and back reads with a minus.
      press(frame, "ArrowLeft");
      expect(el.currentTime).toBe(20);
      expect(flash()?.textContent).toBe("\u2212 5");
      expect(flash()?.getAttribute("data-skip")).toBe("shown");
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a new run when the direction turns, and stops at the start", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    const el = video(host);
    el.currentTime = 7;
    const frame = el.parentElement as HTMLElement;
    press(frame, "ArrowRight");
    press(frame, "ArrowRight");
    press(frame, "ArrowLeft");
    expect(host.querySelector("[data-skip]")?.textContent).toBe("\u2212 5");
    press(frame, "ArrowLeft");
    press(frame, "ArrowLeft");
    press(frame, "ArrowLeft");
    expect(el.currentTime).toBe(0);
  });

  it("steps and flashes from the scrub bar the same way", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    press(slider(host), "ArrowRight");
    press(slider(host), "ArrowUp");
    expect(video(host).currentTime).toBe(10);
    expect(host.querySelector("[data-skip]")?.textContent).toBe("+ 10");
  });

  it("leaves the arrows to the volume slider when it has them", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    const volume = host.querySelector('input[aria-label="Volume"]') as HTMLInputElement;
    press(volume, "ArrowRight");
    expect(video(host).currentTime).toBe(0);
    expect(host.querySelector("[data-skip]")).toBeNull();
  });

  it("adds up presses made before the metadata, and flashes nothing when it cannot move", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    const el = video(host);
    let stored = 0;
    let ready = false;
    Object.defineProperty(el, "currentTime", {
      get: () => stored,
      set: (value: number) => {
        if (!ready) throw new Error("The element has not loaded metadata yet.");
        stored = value;
      },
      configurable: true,
    });
    const frame = el.parentElement as HTMLElement;
    press(frame, "ArrowRight");
    press(frame, "ArrowRight");
    press(frame, "ArrowRight");
    expect(host.querySelector("[data-skip]")?.textContent).toBe("+ 15");
    ready = true;
    act(() => el.dispatchEvent(new Event("loadedmetadata")));
    expect(stored).toBe(15);

    // From the start, back goes nowhere and says nothing.
    const fresh = mount(createElement(VideoPlayer, { src: "/w.mp4", chapters }));
    press(video(fresh).parentElement as HTMLElement, "ArrowLeft");
    expect(fresh.querySelector("[data-skip]")).toBeNull();
  });

  it("keeps focus in the player, so the keys answer after a click", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    const frame = video(host).parentElement as HTMLElement;
    // A click on the picture focuses the nearest focusable ancestor, which is
    // the browser's doing (jsdom does not model it); this is what it needs.
    expect(frame.tabIndex).toBe(-1);
    // The big play button goes inert as play starts, so it hands focus on.
    const play = host.querySelector("[data-big-play]") as HTMLButtonElement;
    act(() => play.click());
    expect(document.activeElement).toBe(frame);
    press(document.activeElement as HTMLElement, "ArrowRight");
    expect(video(host).currentTime).toBe(5);
  });

  it("shows the big play button until the first play, then flashes play and pause for a second", async () => {
    vi.useFakeTimers();
    try {
      const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
      const el = video(host);
      let paused = true;
      Object.defineProperty(el, "paused", { get: () => paused, configurable: true });
      el.play = () => {
        paused = false;
        el.dispatchEvent(new Event("play"));
        return Promise.resolve();
      };
      el.pause = () => {
        paused = true;
        el.dispatchEvent(new Event("pause"));
      };
      const big = () => host.querySelector("[data-big-play]")?.getAttribute("data-big-play");
      const flash = () => host.querySelector("[data-toggle-flash]")?.getAttribute("data-toggle-flash");
      const frame = el.parentElement as HTMLElement;

      expect(big()).toBe("shown");
      // The first play answers with the big button going, not a flash.
      press(frame, "k");
      expect(big()).toBe("away");
      expect(flash()).toBeUndefined();

      // A pause after that flashes pause and leaves the big button away.
      press(frame, "k");
      expect(big()).toBe("away");
      expect(flash()).toBe("pause");
      act(() => vi.advanceTimersByTime(1000));
      expect(flash()).toBe("away");

      await act(async () => el.click());
      expect(flash()).toBe("play");
      act(() => vi.advanceTimersByTime(1000));
      expect(flash()).toBe("away");

      // A resume the browser refuses flashes nothing.
      press(frame, "k");
      act(() => vi.advanceTimersByTime(1000));
      el.play = () => Promise.reject(new Error("NotAllowedError"));
      await act(async () => el.click());
      expect(flash()).toBe("away");

      // A new video starts over with the big button.
      rerender(host, createElement(VideoPlayer, { src: "/w.mp4", chapters }));
      expect(big()).toBe("shown");
      expect(flash()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
