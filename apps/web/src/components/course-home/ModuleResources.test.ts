// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const learner = {
  state: { userResources: {} as Record<string, { id: string; title: string; url: string }[]> },
  addResource: vi.fn(),
  removeResource: vi.fn(),
};
vi.mock("@/lib/learner-context", () => ({ useLearner: () => learner }));

const { ModuleResources } = await import("./ModuleResources");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];

beforeEach(() => {
  // A remove lands in the learner's state, as the provider's does, so the row
  // it was on leaves the list on the next draw.
  learner.removeResource.mockImplementation((moduleId: string, id: string) => {
    learner.state.userResources = {
      ...learner.state.userResources,
      [moduleId]: (learner.state.userResources[moduleId] ?? []).filter((r) => r.id !== id),
    };
  });
});

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  learner.addResource.mockClear();
  learner.removeResource.mockClear();
  learner.state.userResources = {};
  vi.useRealTimers();
});

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const draw = () => act(() => root.render(createElement(ModuleResources, { moduleId: "m1", curated: [] })));
  draw();
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  // Open the form the way a reader does, so every field below is one they can reach.
  const toggle = [...host.querySelectorAll("button")].find((b) => b.textContent === "Add a resource") as HTMLButtonElement;
  act(() => toggle.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(host.querySelector("form")?.closest("[inert]")).toBeNull();
  return { host, draw };
}

/** Sets a controlled input's value the way typing does, so React sees the change. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function field(host: HTMLElement, label: string) {
  const tag = [...host.querySelectorAll("label")].find((l) => l.textContent === label);
  return host.querySelector(`#${CSS.escape(tag?.htmlFor ?? "")}`) as HTMLInputElement;
}

function submit(host: HTMLElement) {
  act(() => (host.querySelector('button[type="submit"]') as HTMLButtonElement).click());
}

/** The words a field's aria-describedby points at. */
function description(host: HTMLElement, input: HTMLInputElement) {
  const ids = input.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => host.querySelector(`#${CSS.escape(id)}`)?.textContent).join(" ");
}

describe("ModuleResources add form", () => {
  it("labels each field, and marks only the refused one invalid with its reason read with it", () => {
    const { host } = mount();
    const title = field(host, "Title");
    const url = field(host, "URL");
    expect(title).not.toBeNull();
    expect(url).not.toBeNull();
    expect(title.hasAttribute("aria-invalid")).toBe(false);

    type(title, "Attention is all you need");
    type(url, "javascript:alert(1)");
    submit(host);

    expect(learner.addResource).not.toHaveBeenCalled();
    expect(title.hasAttribute("aria-invalid")).toBe(false);
    expect(title.hasAttribute("aria-describedby")).toBe(false);
    expect(url.getAttribute("aria-invalid")).toBe("true");
    expect(description(host, url)).toBe("Enter a valid URL (including https://).");
    const alerts = [...host.querySelectorAll('[role="alert"]')].map((a) => a.textContent);
    expect(alerts).toEqual(["Enter a valid URL (including https://)."]);
  });

  it("names each empty field, and clears both once the resource is added", () => {
    const { host } = mount();
    submit(host);
    expect(description(host, field(host, "Title"))).toBe("Enter a title.");
    expect(description(host, field(host, "URL"))).toBe("Enter a URL.");
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(2);

    type(field(host, "Title"), "Docs");
    type(field(host, "URL"), "https://example.com/docs");
    submit(host);
    expect(learner.addResource).toHaveBeenCalledWith("m1", { title: "Docs", url: "https://example.com/docs" });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(field(host, "URL").hasAttribute("aria-invalid")).toBe(false);
    // The fields start over, ready for the next one.
    expect(field(host, "Title").value).toBe("");
    expect(field(host, "URL").value).toBe("");
  });
});

describe("ModuleResources remove", () => {
  it("removes your row through the provider, hands focus to Add a resource, and folds a copy away over 300ms", () => {
    vi.useFakeTimers();
    learner.state.userResources = { m1: [{ id: "u1", title: "Mine", url: "https://example.com/mine" }] };
    const { host, draw } = mount();
    const row = [...host.querySelectorAll("li")].find((li) => li.textContent?.includes("Mine"))!;
    const remove = [...row.querySelectorAll("button")].find((b) => b.textContent === "Remove")!;
    const addButton = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Add a resource"))!;

    act(() => remove.click());
    expect(learner.removeResource).toHaveBeenCalledTimes(1);
    expect(learner.removeResource).toHaveBeenCalledWith("m1", "u1");
    expect(document.activeElement).toBe(addButton);

    // The provider's state no longer holds it; a copy stays in place while it
    // folds away, inert, then goes at 300ms.
    draw();
    expect(host.textContent).toContain("Mine");
    act(() => void vi.advanceTimersByTime(299));
    expect(host.textContent).toContain("Mine");
    act(() => void vi.advanceTimersByTime(1));
    expect(host.textContent).not.toContain("Mine");
  });
});
