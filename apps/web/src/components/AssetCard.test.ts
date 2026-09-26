// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { AssetCard } from "./AssetCard";
import {
  assetDisplayTitle,
  assetKindLabel,
  assetMetaLine,
  formatBytes,
  type AssetCardRef,
} from "./asset-meta";

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

function asset(over: Partial<AssetCardRef> = {}): AssetCardRef {
  return {
    id: "a1",
    kind: "video",
    path: "out/robotics/kinematics/ik/ik-explainer.mp4",
    url: null,
    bytes: 24_800_000,
    title: "Inverse kinematics, end to end",
    sourceRepo: "manimkc",
    ...over,
  };
}

describe("assetKindLabel", () => {
  it("names the kinds the catalog holds", () => {
    expect(assetKindLabel("video")).toBe("Video");
    expect(assetKindLabel("diagram_svg")).toBe("Diagram");
    expect(assetKindLabel("session")).toBe("Session log");
  });

  it("makes something readable out of a kind it has never seen", () => {
    expect(assetKindLabel("lecture_slides")).toBe("Lecture slides");
    expect(assetKindLabel("")).toBe("Asset");
  });
});

describe("assetDisplayTitle", () => {
  it("prefers the title", () => {
    expect(assetDisplayTitle(asset())).toEqual({
      text: "Inverse kinematics, end to end",
      source: "title",
    });
  });

  it("falls back to the filename, and says that is what it is", () => {
    expect(assetDisplayTitle(asset({ title: "   " }))).toEqual({
      text: "ik-explainer.mp4",
      source: "filename",
    });
  });

  it("falls back to the host of a link", () => {
    expect(
      assetDisplayTitle(
        asset({ kind: "link", title: null, path: null, url: "https://arxiv.org/abs/1234" }),
      ),
    ).toEqual({ text: "arxiv.org", source: "host" });
  });

  it("admits it when a row has no name at all", () => {
    expect(assetDisplayTitle(asset({ kind: "chapters", title: null, path: null }))).toEqual({
      text: "Untitled chapters",
      source: "none",
    });
  });
});

describe("formatBytes", () => {
  it("reads the way a file manager does", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(298_000)).toBe("298 kB");
    expect(formatBytes(1_500_000)).toBe("1.5 MB");
    expect(formatBytes(24_800_000)).toBe("25 MB");
  });

  it("says nothing when the size is unknown or nonsense", () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(-1)).toBeNull();
    expect(formatBytes(Number.NaN)).toBeNull();
  });
});

describe("assetMetaLine", () => {
  it("names the tool and the size, from what the row carries", () => {
    expect(assetMetaLine(asset())).toBe("manim · 25 MB");
    expect(
      assetMetaLine(asset({ kind: "diagram_svg", sourceRepo: "tldrawkc", bytes: 12_000 })),
    ).toBe("svg · tldraw · 12 kB");
    expect(assetMetaLine(asset({ kind: "note", sourceRepo: "self-learn", bytes: 3_100 }))).toBe(
      "concept note · 3.1 kB",
    );
  });

  it("gives a link its host, or says external when the URL does not parse", () => {
    expect(
      assetMetaLine(asset({ kind: "link", path: null, url: "https://www.scratchapixel.com/x" })),
    ).toBe("www.scratchapixel.com");
    expect(assetMetaLine(asset({ kind: "link", path: null, url: "not a url" }))).toBe("external");
  });

  it("says nothing it does not know", () => {
    expect(assetMetaLine(asset({ kind: "session", sourceRepo: "self-learn", bytes: null }))).toBe("");
  });
});

describe("AssetCard", () => {
  it("shows the kind, the title and the topic", () => {
    const host = mount(
      createElement(AssetCard, { asset: asset(), topic: "kinematics", href: "/a/a1" }),
    );
    expect(host.querySelector("h3")?.textContent).toBe("Inverse kinematics, end to end");
    expect(host.textContent).toContain("Video");
    expect(host.textContent).toContain("kinematics");
    expect(host.textContent).toContain("25 MB");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/a/a1");
  });

  it("shows the poster when there is one", () => {
    const host = mount(
      createElement(AssetCard, { asset: asset(), thumbnailSrc: "/posters/ik.jpg" }),
    );
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/posters/ik.jpg");
    expect(host.querySelector('[data-thumbnail="placeholder"]')).toBeNull();
  });

  it("labels the placeholder when a video has no poster, rather than leaving a black hole", () => {
    const host = mount(createElement(AssetCard, { asset: asset() }));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector('[data-thumbnail="placeholder"]')?.textContent).toBe("video");
  });

  it("says so when a preview fails to load", () => {
    const host = mount(
      createElement(AssetCard, {
        asset: asset({ kind: "diagram_svg", path: "learn/assets/bkt.svg" }),
        thumbnailSrc: "/learn/assets/bkt.svg",
      }),
    );
    const img = host.querySelector("img") as HTMLImageElement;
    act(() => img.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("Preview unavailable");
  });

  it("tries the new preview after an earlier one failed", () => {
    const host = mount(
      createElement(AssetCard, {
        asset: asset({ kind: "diagram_svg", path: "learn/assets/bkt.svg" }),
        thumbnailSrc: "/learn/assets/bkt.svg",
      }),
    );
    act(() =>
      (host.querySelector("img") as HTMLImageElement).dispatchEvent(new Event("error")),
    );
    expect(host.textContent).toContain("Preview unavailable");

    rerender(
      host,
      createElement(AssetCard, {
        asset: asset({ id: "a2", kind: "diagram_svg", path: "learn/assets/decay.svg" }),
        thumbnailSrc: "/learn/assets/decay.svg",
      }),
    );

    const img = host.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/learn/assets/decay.svg");
    expect(host.textContent).not.toContain("Preview unavailable");
  });

  it("gives a text asset the same labelled box, named for its kind", () => {
    const host = mount(
      createElement(AssetCard, {
        asset: asset({ kind: "transcript", title: null, bytes: 8_400 }),
        thumbnailSrc: "/never-used.jpg",
      }),
    );
    expect(host.textContent).toContain("Transcript");
    expect(host.textContent).toContain("ik-explainer.mp4");
    expect(host.textContent).toContain("8.4 kB");
    // A transcript has no picture, so a thumbnail handed to it is ignored.
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector('[data-thumbnail="placeholder"]')?.textContent).toBe("transcript");
  });

  it("names the concept it explains with a mastery dot, and counts the rest", () => {
    const host = mount(
      createElement(AssetCard, {
        asset: asset({ kind: "session", title: "Transformer block", path: "learn/sessions/t.md" }),
        concept: { title: "Dot product", bucket: "mastered", more: 2 },
        topic: "transformers",
      }),
    );
    expect(host.textContent).toContain("Dot product");
    expect(host.textContent).toContain("+2");
    expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Mastered");
    // The concept wins over the topic; the topic is the fallback, not a second line.
    expect(host.textContent).not.toContain("transformers");
  });

  it("falls back to the topic, with no dot, when no concept is linked", () => {
    const host = mount(createElement(AssetCard, { asset: asset(), topic: "Kinematics" }));
    expect(host.textContent).toContain("Kinematics");
    expect(host.querySelector('[role="img"]')).toBeNull();
  });

  it("says what made a video and how big it is", () => {
    const host = mount(createElement(AssetCard, { asset: asset() }));
    expect(host.textContent).toContain("manim · 25 MB");
  });

  it("renders a kind it has no special treatment for", () => {
    const host = mount(
      createElement(AssetCard, {
        asset: asset({ kind: "lecture_slides", title: "Week 3 deck", path: "w3.pdf" }),
      }),
    );
    expect(host.textContent).toContain("Lecture slides");
    expect(host.querySelector("h3")?.textContent).toBe("Week 3 deck");
  });

  it("is a description, not a link, when there is nowhere to go", () => {
    const host = mount(createElement(AssetCard, { asset: asset() }));
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelector("article")).not.toBeNull();
  });
});
