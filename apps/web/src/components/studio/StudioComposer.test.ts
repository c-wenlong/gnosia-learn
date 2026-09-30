// @vitest-environment jsdom
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { MentionComposerHandle } from "@/components/ui/MentionComposer";
import type { MentionValue } from "@/components/ui/mention-text";
import type { DraftKind } from "@/lib/studio-drafts";

/**
 * The plain composer that stands in when Lexical's chunk will not load, the
 * path both the conversation and the Extend panel fall back to (#204).
 */

// The chunk fails, as it does after a rebuild while the tab is open.
vi.mock("@/components/ui/MentionComposer", () => {
  throw new Error("Loading chunk failed");
});

const { MentionComposer } = await import("./StudioComposer");

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

async function mount(value: MentionValue<DraftKind>, handleRef = createRef<MentionComposerHandle>()) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(MentionComposer, { value, onChange, onSubmit, label: "Tell", mentions: OPTIONS, handleRef }),
    );
  });
  for (let at = 0; at < 5; at += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, onChange, onSubmit, handleRef };
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
