// @vitest-environment jsdom
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { MentionComposerHandle } from "@/components/ui/MentionComposer";
import type { MentionValue } from "@/lib/mentions";
import type { DraftKind } from "@/lib/studio-drafts";

/**
 * The plain composer that stands in when Lexical's chunk will not load, the
 * path both the conversation and the Extend panel fall back to (#204).
 */

// The chunk fails, as it does after a rebuild while the tab is open.
vi.mock("@/components/ui/MentionComposer", () => {
  throw new Error("Loading chunk failed");
});

const { MentionComposer, MentionComposerBox } = await import("./StudioComposer");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

const OPTIONS = [
  { id: "diagram" as const, name: "Diagram", description: "" },
  { id: "video" as const, name: "Video", description: "" },
];

async function mount(
  value: MentionValue<DraftKind>,
  handleRef = createRef<MentionComposerHandle>(),
  extra: Record<string, unknown> = {},
  component: typeof MentionComposer = MentionComposer,
) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (next: MentionValue<DraftKind>) =>
    act(async () => {
      root.render(
        createElement(component, { value: next, onChange, onSubmit, label: "Tell", mentions: OPTIONS, handleRef, ...extra }),
      );
    });
  await render(value);
  for (let at = 0; at < 5; at += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, onChange, onSubmit, handleRef, render };
}

describe("the plain fallback", () => {
  it("draws the words in a textarea, says which tags it carries, and focuses through the handle", async () => {
    const { host, handleRef } = await mount({ text: "A @video of it", mentions: [{ kind: "video", start: 2, end: 8 }] });
    const field = host.querySelector("textarea")!;
    expect(field.value).toBe("A @video of it");
    expect(host.textContent).toContain("Sends tagged: Video.");
    expect(handleRef.current).not.toBeNull();
    handleRef.current!.focus();
    expect(document.activeElement).toBe(field);
    expect(() => handleRef.current!.insertMention("video")).not.toThrow();
  });

  it("keeps a tag through an edit that misses it, and drops one the edit touched", async () => {
    const value = { text: "A @video of it", mentions: [{ kind: "video" as const, start: 2, end: 8 }] };
    const { host, onChange } = await mount(value);
    const field = host.querySelector("textarea")!;
    const edit = async (text: string) => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      await act(async () => {
        set.call(field, text);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await edit("A @video of it, please");
    expect(onChange).toHaveBeenLastCalledWith({ text: "A @video of it, please", mentions: [{ kind: "video", start: 2, end: 8 }] });
    await edit("A @vid of it");
    expect(onChange).toHaveBeenLastCalledWith({ text: "A @vid of it", mentions: [] });
  });
});

describe("the plain fallback's note and focus", () => {
  it("says the panel's own sentence in place of the reload line", async () => {
    const empty = { text: "", mentions: [] };
    const { host } = await mount(empty);
    expect(host.textContent).toContain("reload the page to add one");
    const other = await mount(empty, createRef<MentionComposerHandle>(), { fallbackNote: "Tags could not load, so none can be added here." });
    expect(other.host.textContent).toContain("Tags could not load, so none can be added here.");
    expect(other.host.textContent).not.toContain("reload");
  });

  it("takes focus when it mounts if asked, and asks a function first", async () => {
    const empty = { text: "", mentions: [] };
    const on = await mount(empty, createRef<MentionComposerHandle>(), { autoFocus: true });
    expect(document.activeElement).toBe(on.host.querySelector("textarea"));
    (document.activeElement as HTMLElement).blur();
    const asked = vi.fn(() => false);
    const no = await mount(empty, createRef<MentionComposerHandle>(), { autoFocus: asked });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(no.host.querySelector("textarea"));
    const yes = await mount(empty, createRef<MentionComposerHandle>(), { autoFocus: () => true });
    expect(document.activeElement).toBe(yes.host.querySelector("textarea"));
  });

  it("does not take focus while disabled", async () => {
    const empty = { text: "", mentions: [] };
    const off = await mount(empty, createRef<MentionComposerHandle>(), { autoFocus: true, disabled: true });
    expect(document.activeElement).not.toBe(off.host.querySelector("textarea"));
  });
});

describe("the plain fallback in the box layout (D88)", () => {
  it("is a box too: the caller's toolbar and a round Send in a row under the field, and Enter still sends", async () => {
    const toolbar = createElement("button", { type: "button", "data-toggle": "diagram" }, "Diagram");
    const { host, onSubmit } = await mount(
      { text: "A @video of it", mentions: [{ kind: "video", start: 2, end: 8 }] },
      createRef<MentionComposerHandle>(),
      { toolbar },
      MentionComposerBox,
    );
    const field = host.querySelector("textarea")!;
    expect(field.rows).toBe(3);
    expect(host.querySelector("[data-toggle=diagram]")).not.toBeNull();
    const send = host.querySelector<HTMLButtonElement>("button[type=submit]")!;
    expect(send.getAttribute("aria-label")).toBe("Send");
    expect(send.textContent).toBe("");
    expect(host.textContent).toContain("Sends tagged: Video.");
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith({ text: "A @video of it", mentions: [{ kind: "video", start: 2, end: 8 }] });
  });

  it("puts the textarea's selection back where it was, moved by a toggle's edit (Greptile on #306)", async () => {
    const handleRef = createRef<MentionComposerHandle>();
    const value = { text: "how raft works", mentions: [] };
    const { host, render } = await mount(value, handleRef, {}, MentionComposerBox);
    const field = host.querySelector("textarea")!;
    field.focus();
    field.setSelectionRange(4, 8);
    const next = { text: "@diagram how raft works", mentions: [{ kind: "diagram" as const, start: 0, end: 8 }] };
    handleRef.current!.keepCaretThrough(next, { at: 0, removed: 0, inserted: 9 });
    await render(next);
    expect([field.selectionStart, field.selectionEnd]).toEqual([13, 17]);
    expect(field.value.slice(13, 17)).toBe("raft");

    // And back out: the selection moves back with the text.
    handleRef.current!.keepCaretThrough(value, { at: 0, removed: 9, inserted: 0 });
    await render(value);
    expect([field.selectionStart, field.selectionEnd]).toEqual([4, 8]);
  });

  it("keeps the row layout everywhere else: Send is the pill beside the field, and there is no toolbar", async () => {
    const toolbar = createElement("button", { type: "button", "data-toggle": "diagram" }, "Diagram");
    const { host } = await mount({ text: "words", mentions: [] }, createRef<MentionComposerHandle>(), { toolbar });
    expect(host.querySelector("textarea")!.rows).toBe(1);
    expect(host.querySelector("[data-toggle]")).toBeNull();
    expect(host.querySelector("button[type=submit]")!.textContent).toBe("Send");
  });
});
