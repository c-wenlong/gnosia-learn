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
  // Draws again with whatever `learner` holds now, as the provider's new state would.
  const draw = () => act(() => root.render(createElement(AvatarPicker)));
  draw();
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const radios = () => [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const radio = (value: string) => radios().find((r) => r.value === value)!;
  return { container, radios, radio, draw };
}

describe("AvatarPicker", () => {
  it("lists the twelve sprites by name with the stored one checked", () => {
    const { radios, container } = mount();
    expect(radios()).toHaveLength(12);
    expect(radios().filter((r) => r.checked).map((r) => r.value)).toEqual(["owl"]);
    expect(container.textContent).toContain("Hedgehog");
  });

  it("saves a choice through the provider and says so", async () => {
    const { radio, container } = mount();
    await act(async () => radio("fox").click());
    expect(learner.setAvatar).toHaveBeenCalledWith("fox");
    expect(container.textContent).toContain("Saved");
  });

  it("says when a choice was not stored", async () => {
    learner.setAvatar.mockResolvedValue(false);
    const { radio, container } = mount();
    await act(async () => radio("bat").click());
    expect(container.textContent).toContain("Not saved");
  });

  it("tries again when the sprite a failed save left showing is chosen again", async () => {
    learner.setAvatar.mockResolvedValue(false);
    const { radio, container, draw } = mount();
    await act(async () => radio("bat").click());
    expect(container.textContent).toContain("Not saved");
    // The provider keeps the attempted sprite in its state, as it does for a
    // refused write, so the picker now draws bat as the current sprite.
    learner.avatar = "bat";
    draw();
    expect(radio("bat").checked).toBe(true);
    learner.setAvatar.mockResolvedValue(true);
    await act(async () => radio("bat").click());
    expect(learner.setAvatar).toHaveBeenCalledTimes(2);
    expect(learner.setAvatar).toHaveBeenLastCalledWith("bat");
    expect(container.textContent).toContain("Saved");
    expect(container.textContent).not.toContain("Not saved");
  });

  it("does not save again when the sprite a good save stored is chosen again", async () => {
    const { radio, container, draw } = mount();
    await act(async () => radio("bat").click());
    expect(container.textContent).toContain("Saved");
    learner.avatar = "bat";
    draw();
    await act(async () => radio("bat").click());
    expect(learner.setAvatar).toHaveBeenCalledTimes(1);
  });

  it("does not save again when the stored sprite is chosen", async () => {
    const { radio } = mount();
    await act(async () => radio("owl").click());
    expect(learner.setAvatar).not.toHaveBeenCalled();
  });

  it("cannot be used while the sprite is unknown", () => {
    learner.avatar = undefined;
    const { radios, container } = mount();
    expect(radios().every((r) => r.disabled && !r.checked)).toBe(true);
    expect(container.textContent).toContain("unreachable");
  });
});
