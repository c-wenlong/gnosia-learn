// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { BriefEdit } from "@/lib/studio-brief-edit";

import { ElementsEditor } from "./brief-editor";

/**
 * The diagram card's element editor on its own, now that it can render
 * without the whole card: Enter is the next element, Backspace on an empty
 * one removes it, and the last element cannot go.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
