// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { BriefEdit } from "@/lib/studio-brief-edit";

import { ElementsEditor, RelationsEditor } from "./brief-editor";

/**
 * The diagram card's element editor on its own, now that it can render
 * without the whole card: Enter is the next element, Backspace on an empty
 * one removes it, and the last element cannot go.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom draws no layout: the arrow ends' lists scroll their row into view.
  Element.prototype.scrollIntoView ??= () => undefined;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

const edit = (labels: string[]): BriefEdit =>
  ({
    title: "A diagram",
    topic: "networking",
    elements: labels.map((label, at) => ({ id: `e${at}`, label })),
    relations: [],
  }) as unknown as BriefEdit;

async function mount(labels: string[]) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(ElementsEditor, {
        edit: edit(labels),
        locked: false,
        problemFor: () => null,
        messageId: (field: string) => `m-${field}`,
        onLabel: vi.fn(),
        onAdd,
        onRemove,
      }),
    ),
  );
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, onAdd, onRemove };
}

const field = (host: HTMLElement, at: number) => host.querySelectorAll("input")[at]!;
const key = (target: HTMLElement, name: string) =>
  act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });

describe("ElementsEditor", () => {
  it("adds the next element after the one Enter was pressed in", async () => {
    const { host, onAdd } = await mount(["Client", "Server"]);
    await key(field(host, 0), "Enter");
    expect(onAdd).toHaveBeenCalledWith(0);
  });

  it("removes an empty element on Backspace, and leaves one with a label alone", async () => {
    const { host, onRemove } = await mount(["Client", ""]);
    await key(field(host, 0), "Backspace");
    expect(onRemove).not.toHaveBeenCalled();
    await key(field(host, 1), "Backspace");
    expect(onRemove).toHaveBeenCalledWith("e1");
  });

  it("keeps the only element: no Backspace removal, and its remove is disabled", async () => {
    const { host, onRemove } = await mount([""]);
    await key(field(host, 0), "Backspace");
    expect(onRemove).not.toHaveBeenCalled();
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="Remove element 1"]')!;
    expect(remove.disabled).toBe(true);
  });
});

describe("ElementsEditor's remove", () => {
  it("is in the tab order, so an element with a label can be removed from the keyboard (R3-2-10)", async () => {
    const { host } = await mount(["Client", "Server"]);
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="Remove Client"]')!;
    expect(remove.disabled).toBe(false);
    expect(remove.tabIndex).toBe(0);
  });
});

describe("RelationsEditor", () => {
  async function relations(locked: boolean) {
    const onChange = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const brief = {
      ...edit(["Client", "Server"]),
      relations: [{ id: "r0", from: "e0", to: "e1", label: "asks" }],
    } as unknown as BriefEdit;
    const draw = (isLocked: boolean) =>
      act(async () =>
        root.render(
          createElement(RelationsEditor, {
            edit: brief,
            locked: isLocked,
            problemFor: () => null,
            messageId: (field: string) => `m-${field}`,
            onChange,
            onAdd: vi.fn(),
            onRemove: vi.fn(),
          }),
        ),
      );
    await draw(locked);
    cleanups.push(() => {
      act(() => root.unmount());
      host.remove();
    });
    const end = (which: "from" | "to") => host.querySelector<HTMLButtonElement>(`button[data-field="relation:r0:${which}"]`)!;
    return { end, onChange, rerender: draw };
  }

  it("disables both arrow ends while the editor is locked, as it does the fields beside them (R3-2-10)", async () => {
    const { end } = await relations(true);
    expect(end("from").disabled).toBe(true);
    expect(end("to").disabled).toBe(true);
  });

  it("closes an open arrow end when the editor locks, and does not reopen it when it unlocks", async () => {
    const { end, rerender } = await relations(false);
    await act(async () => end("from").click());
    expect(end("from").getAttribute("aria-expanded")).toBe("true");
    await rerender(true);
    expect(end("from").getAttribute("aria-expanded")).toBe("false");
    expect(end("from").getAttribute("aria-controls")).toBeNull();
    await rerender(false);
    expect(end("from").getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves the ends open while the editor is not locked", async () => {
    const { end } = await relations(false);
    expect(end("from").disabled).toBe(false);
    expect(end("from").getAttribute("aria-label")).toBe("Arrow 1 from: Client");
  });
});
