// @vitest-environment jsdom
import { act, createElement, use, type ComponentProps, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PreviewHeader } from "@/lib/library-preview";

import type { PreviewAnswer } from "./preview-content";

/**
 * The Library's previewer around a list of rows: which asset's body it asks
 * the server for, and what an arrow that has to load the next page does when
 * the panel was closed while the page loaded.
 */

const previewAsset = vi.hoisted(() => vi.fn<(id: string) => Promise<PreviewAnswer>>());
vi.mock("@/app/(app)/library/preview-action", () => ({ previewAsset }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { Previewer } = await import("./Previewer");
const { LibraryMoreContext } = await import("./library-more");
type MoreRows = () => Promise<boolean>;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

function header(id: string): PreviewHeader {
  return {
    family: "diagram",
    kindLabel: "Diagram",
    title: `Title of ${id}`,
    plainName: false,
    date: "30 Sept",
    dateTime: "2026-09-30T00:00:00.000Z",
    concept: null,
    conversation: null,
    download: null,
    page: `/library/${id}`,
    wide: false,
  };
}

const answerFor = (id: string): PreviewAnswer => ({
  state: "ok",
  id,
  header: header(id),
  body: createElement("p", { "data-body": id }, `Body of ${id}`),
});

beforeEach(() => {
  previewAsset.mockReset();
  previewAsset.mockImplementation(async (id) => answerFor(id));
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
});

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return { container, draw: (next: ReactElement) => act(() => root.render(next)) };
}

/** Rows as links to each asset's page, the shape the previewer looks for. */
function Rows({ ids, more }: { ids: string[]; more?: MoreRows }) {
  const slot = use(LibraryMoreContext);
  if (slot !== null && more !== undefined) slot.current = more;
  return createElement(
    "ul",
    null,
    ids.map((id) => createElement("li", { key: id }, createElement("a", { href: `/library/${id}` }, id))),
  );
}

/** The previewer as the page renders it for `?open=a`, around `rows`. */
const previewer = (rows: ReactElement) =>
  createElement(Previewer, { initialOpen: "a", initial: answerFor("a") } as ComponentProps<typeof Previewer>, rows);

/** Lets the pending promises and the transitions they start land. */
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
});

describe("Previewer's first body", () => {
  it("asks for the asset the URL names when the body it was rendered with is another one's", async () => {
    // Back restored a render of `?open=a` under a URL an arrow moved to `?open=b`.
    window.history.replaceState(null, "", "/library?open=b");
    const { container } = mount(
      previewer(createElement(Rows, { ids: ["a", "b"] })),
    );
    await settle();
    expect(previewAsset).toHaveBeenCalledWith("b");
    expect(container.ownerDocument.querySelector("[data-body='b']")).not.toBeNull();
    expect(container.ownerDocument.querySelector("[aria-busy='true']")).toBeNull();
  });

  it("paints the body it was rendered with when it is the one the URL names, asking nothing", async () => {
    window.history.replaceState(null, "", "/library?open=a");
    mount(previewer(createElement(Rows, { ids: ["a"] })));
    await settle();
    expect(previewAsset).not.toHaveBeenCalled();
    expect(document.querySelector("[data-body='a']")).not.toBeNull();
  });
});

describe("Previewer's right arrow past the last row", () => {
  it("does not reopen the panel when it was closed while the next page loaded", async () => {
    window.history.replaceState(null, "", "/library?open=a");
    let land: (added: boolean) => void = () => undefined;
    const more: MoreRows = () =>
      new Promise<boolean>((resolve) => {
        land = resolve;
      });
    const element = (ids: string[]) =>
      previewer(createElement(Rows, { ids, more }));
    const { draw } = mount(element(["a"]));
    await settle();

    const panel = document.querySelector<HTMLElement>("[aria-busy]")!;
    act(() => {
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    // The page is loading; the reader closes the panel.
    act(() => document.querySelector<HTMLButtonElement>("button[data-dialog-close]")!.click());
    expect(window.location.search).toBe("");

    // The next page lands with its row.
    draw(element(["a", "b"]));
    await act(async () => {
      land(true);
      await Promise.resolve();
    });
    await settle();

    expect(window.location.search).toBe("");
    expect(previewAsset).not.toHaveBeenCalledWith("b");
  });

  it("does not reopen a panel opened from a row while its close waits for the back to land", async () => {
    window.history.replaceState(null, "", "/library");
    let land: (added: boolean) => void = () => undefined;
    const more: MoreRows = () =>
      new Promise<boolean>((resolve) => {
        land = resolve;
      });
    const element = (ids: string[]) =>
      createElement(Previewer, { initialOpen: null, initial: null } as ComponentProps<typeof Previewer>, createElement(Rows, { ids, more }));
    const { draw } = mount(element(["a"]));
    // Opened from the row, so the panel pushed its own entry and Close goes back.
    act(() => document.querySelector<HTMLAnchorElement>('a[href="/library/a"]')!.click());
    await settle();
    expect(window.location.search).toBe("?open=a");

    act(() => {
      document
        .querySelector<HTMLElement>("[aria-busy]")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    // The back has not landed yet when the next page does.
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    try {
      act(() => document.querySelector<HTMLButtonElement>("button[data-dialog-close]")!.click());
      expect(back).toHaveBeenCalledTimes(1);
      draw(element(["a", "b"]));
      await act(async () => {
        land(true);
        await Promise.resolve();
      });
      await settle();
    } finally {
      back.mockRestore();
    }

    expect(window.location.search).toBe("?open=a");
    expect(previewAsset).not.toHaveBeenCalledWith("b");
  });

  it("goes on into the next page when the panel is still open", async () => {
    window.history.replaceState(null, "", "/library?open=a");
    let land: (added: boolean) => void = () => undefined;
    const more: MoreRows = () =>
      new Promise<boolean>((resolve) => {
        land = resolve;
      });
    const element = (ids: string[]) =>
      previewer(createElement(Rows, { ids, more }));
    const { draw } = mount(element(["a"]));
    await settle();

    act(() => {
      document
        .querySelector<HTMLElement>("[aria-busy]")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    draw(element(["a", "b"]));
    await act(async () => {
      land(true);
      await Promise.resolve();
    });
    await settle();

    expect(window.location.search).toBe("?open=b");
    expect(previewAsset).toHaveBeenCalledWith("b");
  });
});
