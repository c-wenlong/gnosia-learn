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

function chapterButtons(host: HTMLElement) {
  return [...(host.querySelector("nav")?.querySelectorAll("button") ?? [])];
}

function currentChapter(host: HTMLElement) {
  return host.querySelector('nav [aria-current="true"]')?.textContent ?? null;
}

describe("VideoPlayer", () => {
  it("seeks the video when a chapter is clicked", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4", chapters }));
    act(() => chapterButtons(host)[2].click());
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

    act(() => chapterButtons(host)[2].click());
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

  it("renders the video alone when it is given nothing else", () => {
    const host = mount(createElement(VideoPlayer, { src: "/v.mp4" }));
    expect(host.querySelector("nav")).toBeNull();
    expect(host.querySelector('ol[aria-label="Transcript"]')).toBeNull();
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });

  it("says so when the sidecars are there but empty", () => {
    const host = mount(
      createElement(VideoPlayer, { src: "/v.mp4", chapters: [], transcript: [] }),
    );
    expect(host.textContent).toContain("No chapters for this video.");
    expect(host.textContent).toContain("No transcript beside this video.");
  });

  it("names itself for assistive technology when given a title", () => {
    const host = mount(
      createElement(VideoPlayer, { src: "/v.mp4", title: "Inverse kinematics", chapters }),
    );
    expect(video(host).getAttribute("aria-label")).toBe("Inverse kinematics");
    expect(host.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Chapters of Inverse kinematics",
    );
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
    act(() => chapterButtons(host)[1].click());
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

    act(() => chapterButtons(host)[1].click());
    expect(stored).toBe(0);

    ready = true;
    act(() => el.dispatchEvent(new Event("loadedmetadata")));
    // The chapter the reader clicked is where playback actually starts.
    expect(stored).toBe(8);
    expect(currentChapter(host)).toContain("The body");
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

    act(() => chapterButtons(host)[2].click());
    rerender(host, createElement(VideoPlayer, { src: "/b.mp4", chapters }));

    ready = true;
    act(() => video(host).dispatchEvent(new Event("loadedmetadata")));
    // The new video starts at its own beginning, not 20s into the old one.
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
