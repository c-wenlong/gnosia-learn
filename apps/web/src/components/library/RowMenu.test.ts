// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { rowMenuItems } from "@/lib/row-menu";

import { RowMenu } from "./RowMenu";

/**
 * The Library row's menu doing what its items say: Copy link writes the asset
 * page's absolute URL and says "Copied", Favorite writes the star and
 * refreshes the page, Mark read appends the event, Download is the file
 * route's `?download=1`, and each says what happened beside the button.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
