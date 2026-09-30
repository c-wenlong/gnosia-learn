// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { panelSignature } from "@/lib/studio-view";

/**
 * The conversation panel opens and closes in the browser: the address bar
 * moves with `history.pushState` and the page is not drawn on the server
 * again, which was 2 to 3 seconds each way. These pin that, that a panel the
 * server drew only shows while the URL still names it, and that the dialog
 * opens at the press, before the runner has made the draft.
 */

const mocks = vi.hoisted(() => ({ search: "", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
  usePathname: () => "/studio",
}));
vi.mock("@/components/studio/DraftPanel", async () => {
  // The real header, which is where the panel's Close is.
  const { DialogHeader } = await import("./StudioDialog");
  return {
    DraftPanel: ({ draftId, path }: { draftId: string; path: string }) =>
      createElement("div", { "data-draft": draftId, "data-path": path }, createElement(DialogHeader, { title: draftId })),
  };
});

const { ConversationHost } = await import("./ConversationHost");
const { useConversationHost } = await import("./conversation-host");

type Controls = NonNullable<ReturnType<typeof useConversationHost>>;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom's dialog does not open itself.
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

let pushState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mocks.search = "";
  mocks.push.mockReset();
  pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => undefined);
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  pushState.mockRestore();
});

/** Hands the host's controls to the test, as the plus card would use them. */
const grabbed: { controls: Controls | null } = { controls: null };
function Grab(): ReactNode {
  const value = useConversationHost();
  useEffect(() => {
    grabbed.controls = value;
  });
  return null;
}

function mount(options: { panel?: ReactNode; panelKey?: string } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const props: Omit<ComponentProps<typeof ConversationHost>, "children"> = {
    panel: options.panel ?? null,
    panelKey: options.panelKey ?? panelSignature({}),
    topics: [],
    titles: {},
    suggestions: [],
    cap: null,
  };
  const draw = () =>
    act(() =>
      root.render(
        // Children as an argument, as the lint rule wants; the props type
        // requires them, hence the cast.
        createElement(ConversationHost, props as ComponentProps<typeof ConversationHost>, createElement(Grab)),
      ),
    );
  draw();
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  /** The address bar moved (Next syncs `useSearchParams` with pushState): draw again. */
  const go = (search: string) => {
    mocks.search = search;
    draw();
  };
  return { container, go };
}

const close = (container: HTMLElement) =>
  act(() => container.querySelector<HTMLButtonElement>("[data-dialog-close]")!.click());

describe("the conversation panel", () => {
  it("opens from the URL, and Close moves the address bar without a router push", () => {
    mocks.search = "topic=graphs&draft=d1";
    const { container } = mount();
    const panel = container.querySelector("[data-draft]");
    expect(panel?.getAttribute("data-draft")).toBe("d1");
    expect(panel?.getAttribute("data-path")).toBe("/studio?topic=graphs&draft=d1");

    close(container);
    expect(pushState).toHaveBeenCalledWith(null, "", "/studio?topic=graphs");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("is not open under a picture or the settings, as the server's order has it", () => {
    mocks.search = "draft=d1&job=j1&shot=after";
    const first = mount();
    expect(first.container.querySelector("[data-draft]")).toBeNull();
    first.go("draft=d1&settings=1");
    expect(first.container.querySelector("[data-draft]")).toBeNull();
  });

  it("opens at the press, and becomes the conversation once the URL names it", () => {
    const { container, go } = mount();
    let token = 0;
    act(() => {
      token = grabbed.controls!.begin();
    });
    expect(container.querySelector("dialog[open]")?.textContent).toContain("Opening a conversation");

    act(() => grabbed.controls!.settle(token, "/studio?draft=d9"));
    expect(pushState).toHaveBeenCalledWith(null, "", "/studio?draft=d9");
    // Still open until the address bar has the draft: no frame with neither.
    expect(container.querySelector("dialog[open]")).not.toBeNull();

    go("draft=d9");
    expect(container.querySelector("[data-draft]")?.getAttribute("data-draft")).toBe("d9");
    expect(container.textContent).not.toContain("Opening a conversation");

    // And closing it does not bring the placeholder back.
    close(container);
    go("");
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("closes again when the draft could not be made", () => {
    const { container } = mount();
    let token = 0;
    act(() => {
      token = grabbed.controls!.begin();
    });
    act(() => grabbed.controls!.settle(token, null));
    expect(container.querySelector("dialog")).toBeNull();
    expect(pushState).not.toHaveBeenCalled();
  });

  it("does not open a draft that arrives after the person closed the wait", () => {
    const { container } = mount();
    let token = 0;
    act(() => {
      token = grabbed.controls!.begin();
    });
    close(container);
    expect(container.querySelector("dialog")).toBeNull();
    act(() => grabbed.controls!.settle(token, "/studio?draft=late"));
    expect(pushState).not.toHaveBeenCalled();
  });
});

describe("a panel the server drew", () => {
  const drawn = createElement("div", { "data-server-panel": true });

  it("shows while the URL names the panel it was drawn for, whatever the filters", () => {
    mocks.search = "sel=graph&topic=a";
    const { container, go } = mount({ panel: drawn, panelKey: panelSignature({ sel: "graph" }) });
    expect(container.querySelector("[data-server-panel]")).not.toBeNull();
    go("sel=graph&topic=b");
    expect(container.querySelector("[data-server-panel]")).not.toBeNull();
  });

  it("gives way to a conversation opened over it, and does not come back when that closes", () => {
    mocks.search = "job=j1";
    const { container, go } = mount({ panel: drawn, panelKey: panelSignature({ job: "j1" }) });
    go("draft=d2");
    expect(container.querySelector("[data-server-panel]")).toBeNull();
    expect(container.querySelector("[data-draft]")).not.toBeNull();
    go("");
    expect(container.querySelector("[data-server-panel]")).toBeNull();
  });
});
