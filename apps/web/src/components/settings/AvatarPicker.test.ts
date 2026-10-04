// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Profile tab's avatar picker: twelve radios with the stored sprite
 * checked, a choice saved through the provider and reported, and a group
 * that cannot be used while the sprite is unknown.
 */

const learner = vi.hoisted(() => ({ avatar: undefined as string | undefined, setAvatar: vi.fn() }));
vi.mock("@/lib/learner-context", () => ({
  useLearner: () => ({ state: { avatar: learner.avatar }, setAvatar: learner.setAvatar }),
}));

const { AvatarPicker } = await import("./SettingsForm");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  learner.avatar = "owl";
  learner.setAvatar.mockReset().mockResolvedValue(true);
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(createElement(AvatarPicker)));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const radios = () => [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  return { container, radios };
}

describe("AvatarPicker", () => {
  it("lists the twelve sprites by name with the stored one checked", () => {
    const { radios, container } = mount();
    expect(radios()).toHaveLength(12);
    expect(radios().filter((r) => r.checked).map((r) => r.value)).toEqual(["owl"]);
    expect(container.textContent).toContain("Hedgehog");
  });

  it("saves a choice through the provider and says so", async () => {
    const { radios, container } = mount();
    await act(async () => radios().find((r) => r.value === "fox")?.click());
    expect(learner.setAvatar).toHaveBeenCalledWith("fox");
    expect(container.textContent).toContain("Saved");
  });

  it("says when a choice was not stored", async () => {
    learner.setAvatar.mockResolvedValue(false);
    const { radios, container } = mount();
    await act(async () => radios().find((r) => r.value === "bat")?.click());
    expect(container.textContent).toContain("Not saved");
  });

  it("cannot be used while the sprite is unknown", () => {
    learner.avatar = undefined;
    const { radios, container } = mount();
    expect(radios().every((r) => r.disabled && !r.checked)).toBe(true);
    expect(container.textContent).toContain("unreachable");
  });
});
