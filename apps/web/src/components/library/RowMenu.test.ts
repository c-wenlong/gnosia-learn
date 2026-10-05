// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DIALOG_CLOSE_MS } from "@/components/ui/Dialog";
import { rowMenuItems } from "@/lib/row-menu";

import { RowMenu, rowMenuOwnsKey } from "./RowMenu";

/**
 * The Library row's menu doing what its items say: Copy link writes the asset
 * page's absolute URL and says "Copied", Favorite writes the star and
 * refreshes the page, Mark read appends the event, Download is the file
 * route's `?download=1`, and each says what happened beside the button. Ask's
 * dialog, kept between showings, fades out to nothing and shuts there.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom's dialog does not open itself; this opens and shuts it as a browser's does.
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const mounted: Array<() => void> = [];
const fetchMock = vi.fn();
const writeText = vi.fn();

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ID = "note:learn/concepts/os/tlb.md";

function mount(starred: boolean | null = false) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const sections = rowMenuItems({
    id: ID,
    kind: "note",
    parents: undefined,
    order: new Map(),
    course: null,
    served: true,
    starred,
  });
  act(() => root.render(createElement(RowMenu, { assetId: ID, title: "The TLB", sections })));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const button = container.querySelector("button[aria-haspopup]") as HTMLButtonElement;
  const choose = async (label: string) => {
    act(() => button.click());
    const item = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (el) => el.textContent?.trim() === label,
    );
    if (item === undefined) throw new Error(`no item ${label}`);
    await act(async () => {
      item.click();
    });
    return item;
  };
  const status = () => container.querySelector('[role="status"]')?.textContent;
  return { container, button, choose, status };
}

describe("RowMenu", () => {
  it("names its button for the asset", () => {
    const { button } = mount();
    expect(button.getAttribute("aria-label")).toBe("More actions for The TLB");
  });

  it("copies the asset page's absolute URL and says so", async () => {
    const { choose, status, button } = mount();
    await choose("Copy link");
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/library/note%3Alearn%2Fconcepts%2Fos%2Ftlb.md`);
    expect(status()).toBe("Copied");
    expect(document.activeElement).toBe(button);
  });

  it("says so when the clipboard refuses", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const { choose, status } = mount();
    await choose("Copy link");
    expect(status()).toBe("Could not copy the link");
  });

  it("stars through the favorite route, refreshes the page, and offers Unfavorite next", async () => {
    const { choose, status, container, button } = mount(false);
    await choose("Favorite");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/learner/favorite",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ assetId: ID, favorite: true }) }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(status()).toBe("Starred");
    act(() => button.click());
    expect([...container.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent?.trim())).toContain("Unfavorite");
  });

  it("puts the star back and says so when the write is refused", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const { choose, status } = mount(true);
    await choose("Unfavorite");
    expect(refresh).not.toHaveBeenCalled();
    expect(status()).toBe("Not saved. Try again.");
  });

  it("marks a note read through the watched event", async () => {
    const { choose, status } = mount();
    await choose("Mark read");
    expect(fetchMock).toHaveBeenCalledWith("/api/learner/watched", expect.objectContaining({ method: "POST" }));
    expect(status()).toBe("Marked read");
  });

  it("downloads through the file route with download on", () => {
    const { container, button } = mount();
    act(() => button.click());
    const download = [...container.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')].find(
      (el) => el.textContent?.trim() === "Download",
    );
    expect(download?.getAttribute("href")).toBe("/api/assets/note%3Alearn%2Fconcepts%2Fos%2Ftlb.md/file?download=1");
    expect(download?.hasAttribute("download")).toBe(true);
  });
});

describe("RowMenu's keys", () => {
  const press = (on: Element, init: KeyboardEventInit) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    act(() => {
      on.dispatchEvent(event);
    });
  };

  it("lets a shortcut and Escape through to the window, and keeps the menu's own keys from the row", () => {
    const { container, button } = mount();
    const menu = container.firstElementChild as HTMLElement;
    const row: string[] = [];
    const win: string[] = [];
    const onRow = (event: KeyboardEvent) => row.push(event.key);
    const onWindow = (event: KeyboardEvent) => win.push(event.key);
    // The row around the menu, which opens its asset on a key. Above React's
    // root (the container), since a stop there cannot keep a listener on the
    // same element from hearing it.
    document.body.addEventListener("keydown", onRow);
    window.addEventListener("keydown", onWindow);
    try {
      // Cmd+K and Escape are the shell's: the row menu stops neither. Pressed
      // on the row menu's own wrapper; from the More button, the kit Menu
      // around it applies its own rule first (ui/Menu.tsx).
      press(menu, { key: "k", metaKey: true });
      press(menu, { key: "Escape" });
      expect(win).toEqual(["k", "Escape"]);
      expect(row).toEqual(["k", "Escape"]);

      // Enter, Space and the arrows from the More button are the menu's: the row never hears them.
      for (const key of ["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"]) press(button, { key });
      for (const key of ["Enter", "ArrowDown"]) press(menu, { key });
      expect(row).toEqual(["k", "Escape"]);
      expect(win).toEqual(["k", "Escape"]);
    } finally {
      document.body.removeEventListener("keydown", onRow);
      window.removeEventListener("keydown", onWindow);
    }
  });

  it("owns a letter only inside the open list, and nothing held with a modifier", () => {
    const plain = { ctrlKey: false, metaKey: false, altKey: false };
    expect(rowMenuOwnsKey({ ...plain, key: "Enter" }, false)).toBe(true);
    expect(rowMenuOwnsKey({ ...plain, key: " " }, false)).toBe(true);
    expect(rowMenuOwnsKey({ ...plain, key: "ArrowDown" }, false)).toBe(true);
    expect(rowMenuOwnsKey({ ...plain, key: "c" }, true)).toBe(true);
    expect(rowMenuOwnsKey({ ...plain, key: "c" }, false)).toBe(false);
    expect(rowMenuOwnsKey({ ...plain, key: "?" }, false)).toBe(false);
    expect(rowMenuOwnsKey({ ...plain, key: "Escape" }, true)).toBe(false);
    expect(rowMenuOwnsKey({ ...plain, metaKey: true, key: "k" }, true)).toBe(false);
    expect(rowMenuOwnsKey({ ...plain, ctrlKey: true, key: "Enter" }, false)).toBe(false);
  });
});

describe("RowMenu's Ask dialog", () => {
  it("keeps its closed style until it has shut, so the fade never steps back, and opens again on the same thread", async () => {
    vi.useFakeTimers();
    const { choose, container, button } = mount();
    await choose("Ask");
    const dialog = container.querySelector<HTMLDialogElement>('dialog[aria-label="Ask about The TLB"]');
    if (dialog === null) throw new Error("no Ask dialog");
    expect(dialog.open).toBe(true);
    expect(dialog.hasAttribute("data-closing")).toBe(false);
    const draft = dialog.querySelector("textarea");
    if (draft === null) throw new Error("no Ask field");
    // Typed, as a person would: the field is React's, so through its setter and an input event.
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(draft, "kept");
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // What the dialog looked like at the moment it left the top layer. A
    // dialog shut after its closed style was dropped paints one frame of its
    // open style first: the fade going 0, then back up, then gone.
    const atShut: boolean[] = [];
    const shut = dialog.close.bind(dialog);
    dialog.close = () => {
      atShut.push(dialog.hasAttribute("data-closing"));
      shut();
    };

    act(() => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(dialog.hasAttribute("data-closing")).toBe(true);
    act(() => vi.advanceTimersByTime(DIALOG_CLOSE_MS));
    expect(atShut).toEqual([true]);
    expect(dialog.open).toBe(false);
    expect(dialog.hasAttribute("data-closing")).toBe(true);
    expect(document.activeElement).toBe(button);

    // Opened again: the same element, its open style back, the draft still in it.
    await choose("Ask");
    expect(container.querySelector('dialog[aria-label="Ask about The TLB"]')).toBe(dialog);
    expect(dialog.open).toBe(true);
    expect(dialog.hasAttribute("data-closing")).toBe(false);
    expect(dialog.querySelector("textarea")?.value).toBe("kept");
  });

  it("shuts at once when motion is reduced", async () => {
    document.documentElement.dataset.motion = "reduce";
    try {
      const { choose, container, button } = mount();
      await choose("Ask");
      const dialog = container.querySelector<HTMLDialogElement>('dialog[aria-label="Ask about The TLB"]');
      act(() => {
        dialog?.dispatchEvent(new Event("cancel", { cancelable: true }));
      });
      expect(dialog?.open).toBe(false);
      expect(document.activeElement).toBe(button);
    } finally {
      delete document.documentElement.dataset.motion;
    }
  });
});
