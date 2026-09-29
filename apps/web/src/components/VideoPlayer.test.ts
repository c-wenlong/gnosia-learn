// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { VideoPlayer } from "./VideoPlayer";
import type { TranscriptCue, VideoChapter } from "./media";

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
});
