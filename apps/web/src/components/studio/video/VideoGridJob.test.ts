// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { HostContext, type HostControls } from "@/components/studio/panel-host";

/**
 * Change on a landed video: it opens a conversation on the video. Inside the
 * studio's host the conversation opens over the grid, which stays mounted, so
 * the button has to be pressable again when the person comes back (S1-02),
 * and a refusal has to be readable without a hover (S1-25).
 */

const mocks = vi.hoisted(() => ({ createDraft: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/studio-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-drafts")>()),
  createDraft: mocks.createDraft,
}));

const { VideoChangeButton } = await import("./VideoGridJob");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  mocks.createDraft.mockReset();
  mocks.push.mockReset();
  sessionStorage.clear();
});

async function mount(host: HostControls | null): Promise<HTMLElement> {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const button = createElement(VideoChangeButton, { slug: "softmax", title: "Softmax", path: "/studio" });
  await act(async () => {
    root.render(host === null ? button : createElement(HostContext.Provider, { value: host }, button));
  });
  cleanups.push(() => {
    act(() => root.unmount());
    element.remove();
  });
  return element;
}

const press = async (element: HTMLElement) => {
  await act(async () => {
    element.querySelector("button")!.click();
  });
};

describe("VideoChangeButton", () => {
  it("is pressable again once the host has opened the conversation over the grid", async () => {
    mocks.createDraft.mockResolvedValue({ ok: true, status: 201, data: { draftId: "d9", sourceKind: "video", kind: "video" } });
    const navigate = vi.fn(() => true);
    const element = await mount({ begin: () => 0, settle: () => true, navigate, path: "/studio", warmSettings: () => {} });
    await press(element);
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("draft=d9"));
    expect(mocks.push).not.toHaveBeenCalled();
    const button = element.querySelector("button")!;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Change");
    expect(button.hasAttribute("data-pending")).toBe(false);
  });

  it("shows a refusal as words beside the button, not only in a tooltip", async () => {
    mocks.createDraft.mockResolvedValue({ ok: false, status: 409, refusal: { error: "no", detail: { reason: "no-video" } } });
    const element = await mount(null);
    await press(element);
    const alert = element.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("no longer in the catalog");
    expect(alert.className).not.toContain("sr-only");
    expect(element.querySelector("[data-problem]")).not.toBeNull();
    expect(element.querySelector("button")!.textContent).toBe("Try again");
  });
});
