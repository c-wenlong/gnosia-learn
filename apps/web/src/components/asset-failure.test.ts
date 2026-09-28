// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ASSET_PROBLEMS } from "@/lib/asset-problems";

import { AssetCard } from "./AssetCard";
import { DiagramView } from "./DiagramView";
import { NoteProse } from "./NoteProse";
import { VideoPlayer } from "./VideoPlayer";

/**
 * Every asset surface, failing, and saying why.
 *
 * Each test fires the element's own `error` event, which is all a browser
 * gives a component, and asserts that the one shared panel appears, asks the
 * status route it was handed, and then shows the reason and the fix for the
 * code that route answered. `fetch` is a stub, so "which URL was asked" is a
 * recorded fact rather than an inference.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
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
  return host;
}

/** The status route, stubbed to answer one body, with every URL it is asked recorded. */
function statusAnswers(body: unknown, status = 404) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return asked;
}

/** Fire `error` on the element, then let the probe's promise settle inside act. */
async function failAndSettle(element: Element) {
  act(() => {
    element.dispatchEvent(new Event("error"));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const panel = (host: HTMLElement) => host.querySelector("[data-problem]");

describe("the video player", () => {
  it("replaces a dead player with the panel, and says the video is not uploaded", async () => {
    const asked = statusAnswers({ ok: false, code: "not-uploaded" }, 404);
    const host = mount(
      createElement(VideoPlayer, { src: "/api/assets/v/file", statusHref: "/api/assets/v/status" }),
    );
    await failAndSettle(host.querySelector("video")!);

    expect(host.querySelector("video")).toBeNull();
    expect(asked).toEqual(["/api/assets/v/status"]);
    expect(panel(host)?.getAttribute("data-problem")).toBe("not-uploaded");
    expect(host.textContent).toContain("This video did not load.");
    expect(host.textContent).toContain(ASSET_PROBLEMS["not-uploaded"].reason);
    expect(host.textContent).toContain("npm run catalog -- asset upload --source manimkc");
  });

  it("offers Try again when the server can serve the file, and puts the player back", async () => {
    statusAnswers({ ok: true }, 200);
    const host = mount(
      createElement(VideoPlayer, { src: "/api/assets/v/file", statusHref: "/api/assets/v/status" }),
    );
    await failAndSettle(host.querySelector("video")!);
    expect(panel(host)?.getAttribute("data-problem")).toBe("undecodable");

    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Try again");
    act(() => button!.click());
    expect(host.querySelector("video")).not.toBeNull();
    expect(panel(host)).toBeNull();
  });

  it("asks once however many times the element reports the same failure", async () => {
    const asked = statusAnswers({ ok: false, code: "not-in-catalog" });
    const host = mount(
      createElement(VideoPlayer, { src: "/api/assets/v/file", statusHref: "/api/assets/v/status" }),
    );
    const video = host.querySelector("video")!;
    act(() => {
      video.dispatchEvent(new Event("error"));
      video.dispatchEvent(new Event("error"));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(asked).toHaveLength(1);
  });
});

describe("the diagram view", () => {
  it("shows the panel at once, then the reason when it arrives", async () => {
    statusAnswers({ ok: false, code: "not-in-catalog" });
    const host = mount(
      createElement(DiagramView, {
        src: "/api/assets/d/file",
        statusHref: "/api/assets/d/status",
        title: "A diagram",
      }),
    );
    const img = host.querySelector("img")!;
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    // The question is in flight, and the panel already says so.
    expect(panel(host)?.getAttribute("data-problem")).toBe("checking");
    expect(host.textContent).toContain("Checking why");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(panel(host)?.getAttribute("data-problem")).toBe("not-in-catalog");
    expect(host.textContent).toContain(ASSET_PROBLEMS["not-in-catalog"].reason);
    expect(host.textContent).toContain("npm run catalog -- import");
  });

  it("drops an answer about a diagram it is no longer showing", async () => {
    let release: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const view = (src: string) =>
      createElement(DiagramView, { src, statusHref: `${src}/status`, title: "A diagram" });
    act(() => root.render(view("/one")));
    mounted.push(() => {
      act(() => root.unmount());
      host.remove();
    });

    act(() => {
      host.querySelector("img")!.dispatchEvent(new Event("error"));
    });
    act(() => root.render(view("/two")));
    await act(async () => {
      release(new Response(JSON.stringify({ ok: false, code: "not-in-catalog" })));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host.querySelector("img")?.getAttribute("src")).toBe("/two");
    expect(panel(host)).toBeNull();
  });
});

describe("a card's thumbnail", () => {
  it("shows the compact panel with the short reason and asks the poster's status", async () => {
    const asked = statusAnswers({ ok: false, code: "blob-store-unavailable" }, 503);
    const host = mount(
      createElement(AssetCard, {
        asset: {
          id: "v",
          kind: "video",
          path: "out/a/b.mp4",
          url: null,
          bytes: 1,
          title: "A video",
          sourceRepo: "manimkc",
        },
        thumbnailSrc: "/api/assets/v/poster",
        thumbnailStatusHref: "/api/assets/v/status?for=poster",
        href: "/library/v",
      }),
    );
    await failAndSettle(host.querySelector("img")!);

    expect(asked).toEqual(["/api/assets/v/status?for=poster"]);
    expect(panel(host)?.getAttribute("data-problem")).toBe("blob-store-unavailable");
    expect(host.textContent).toContain("Preview unavailable");
    expect(host.textContent).toContain(ASSET_PROBLEMS["blob-store-unavailable"].label);
    // The card is a link, so the compact panel never holds a button.
    expect(host.querySelector("a button")).toBeNull();
  });
});

describe("a note's embed", () => {
  it("asks why an embedded picture failed and says so inside the figure", async () => {
    const asked = statusAnswers({ ok: false, code: "unsupported-type" });
    const host = mount(
      createElement(NoteProse, {
        source: "![[a.svg|The caption]]",
        resolveEmbed: () => ({ src: "/api/assets/a/file", statusHref: "/api/assets/a/status" }),
      }),
    );
    await failAndSettle(host.querySelector("figure img")!);

    expect(asked).toEqual(["/api/assets/a/status"]);
    expect(host.querySelector("figure [data-problem]")?.getAttribute("data-problem")).toBe(
      "unsupported-type",
    );
    expect(host.textContent).toContain("a.svg did not load.");
    // The caption the note wrote survives the failure.
    expect(host.querySelector("figcaption")?.textContent).toBe("The caption");
  });

  it("catches a picture that failed before the page hydrated", async () => {
    // The browser fetches an `<img>` from the server's HTML before React has
    // attached `onError`, so a quick refusal fires its event into nothing and
    // leaves a finished image with no width. That state is faked here, with
    // `decode()` rejecting the way a browser's does for a broken image.
    statusAnswers({ ok: false, code: "not-in-catalog" });
    const proto = HTMLImageElement.prototype;
    const complete = vi.spyOn(proto, "complete", "get").mockReturnValue(true);
    const width = vi.spyOn(proto, "naturalWidth", "get").mockReturnValue(0);
    Object.defineProperty(proto, "decode", {
      configurable: true,
      value: () => Promise.reject(new DOMException("broken", "EncodingError")),
    });
    try {
      const host = mount(
        createElement(NoteProse, {
          source: "![[a.svg]]",
          resolveEmbed: () => ({ src: "/api/assets/a/file", statusHref: "/api/assets/a/status" }),
        }),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(host.querySelector("img")).toBeNull();
      expect(panel(host)?.getAttribute("data-problem")).toBe("not-in-catalog");
    } finally {
      complete.mockRestore();
      width.mockRestore();
      delete (proto as { decode?: unknown }).decode;
    }
  });

  it("renders a problem the server already knows without an image or a request", () => {
    const asked = statusAnswers({ ok: true }, 200);
    const host = mount(
      createElement(NoteProse, {
        source: "![[gone.svg]]",
        resolveEmbed: () => ({ problem: "not-in-catalog" as const }),
      }),
    );
    expect(host.querySelector("img")).toBeNull();
    expect(panel(host)?.getAttribute("data-problem")).toBe("not-in-catalog");
    expect(host.textContent).toContain("gone.svg cannot be shown here.");
    expect(asked).toHaveLength(0);
  });

  it("still accepts a bare URL from a resolver, as before", () => {
    const host = mount(createElement(NoteProse, { source: "![[a.svg]]", resolveEmbed: () => "/a.svg" }));
    expect(host.querySelector("figure img")?.getAttribute("src")).toBe("/a.svg");
  });

  it("refuses a status URL the note gate would refuse, and still shows the picture", () => {
    const host = mount(
      createElement(NoteProse, {
        source: "![[a.svg]]",
        resolveEmbed: () => ({ src: "/a.svg", statusHref: "javascript:alert(1)" }),
      }),
    );
    expect(host.querySelector("figure img")?.getAttribute("src")).toBe("/a.svg");
  });
});
