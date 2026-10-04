// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Settings name field: it saves on blur, follows a newer name while
 * untouched, retries after a failed save, and refuses a long name in words
 * rather than cutting it.
 */

const learner = vi.hoisted(() => ({ displayName: undefined as string | undefined, setDisplayName: vi.fn() }));
vi.mock("@/lib/learner-context", () => ({
  useLearner: () => ({ state: { displayName: learner.displayName }, setDisplayName: learner.setDisplayName }),
}));

const { NameField } = await import("./SettingsForm");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  learner.displayName = undefined;
  learner.setDisplayName.mockReset().mockResolvedValue(true);
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const draw = () => act(() => root.render(createElement(NameField)));
  draw();
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const input = () => container.querySelector("input")!;
  const type = (value: string) =>
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input(), value);
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
  const blur = async () => {
    await act(async () => {
      input().focus();
      input().blur();
    });
  };
  return { container, input, type, blur, draw };
}

describe("the name field", () => {
  it("saves the cleaned name on blur, and not an unchanged one", async () => {
    const field = mount();
    field.type("  Ada   Lovelace ");
    await field.blur();
    expect(learner.setDisplayName).toHaveBeenCalledWith("Ada Lovelace");
    learner.displayName = "Ada Lovelace";
    field.draw();
    learner.setDisplayName.mockClear();
    await field.blur();
    expect(learner.setDisplayName).not.toHaveBeenCalled();
  });

  it("follows a newer saved name while untouched, so a blur cannot save the old one over it", async () => {
    learner.displayName = "Ada";
    const field = mount();
    learner.displayName = "Grace";
    field.draw();
    expect(field.input().value).toBe("Grace");
    await field.blur();
    expect(learner.setDisplayName).not.toHaveBeenCalled();
  });

  it("keeps a name whose save is in flight when a refresh carries the old one", async () => {
    learner.displayName = "Ada";
    let finish: (ok: boolean) => void = () => undefined;
    learner.setDisplayName.mockReturnValue(new Promise<boolean>((resolve) => (finish = resolve)));
    const field = mount();
    field.type("Grace");
    await field.blur();
    // Optimistic, then a refresh with the row as it was before the write.
    learner.displayName = "Grace";
    field.draw();
    learner.displayName = "Ada";
    field.draw();
    expect(field.input().value).toBe("Grace");
    await act(async () => finish(true));
    expect(field.input().value).toBe("Grace");
  });

  it("sends the same name again after a failed save", async () => {
    learner.setDisplayName.mockResolvedValue(false);
    const field = mount();
    field.type("Ada");
    await field.blur();
    // The provider keeps the name it tried.
    learner.displayName = "Ada";
    field.draw();
    expect(field.container.textContent).toContain("Not saved");
    await field.blur();
    expect(learner.setDisplayName).toHaveBeenCalledTimes(2);
  });

  it("refuses a long name in words rather than cutting it", async () => {
    const field = mount();
    field.type("x".repeat(70));
    expect(field.input().value).toHaveLength(70);
    await field.blur();
    expect(learner.setDisplayName).not.toHaveBeenCalled();
    expect(field.container.textContent).toContain("At most 60 characters");
  });
});
