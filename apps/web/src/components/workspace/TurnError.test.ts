// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TurnError } from "./TurnError";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

// Every root a test mounts, unmounted after it even when an expectation failed first.
const mounted: Array<() => void> = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

function mount(props: Parameters<typeof TurnError>[0]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(TurnError, props)));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

describe("TurnError", () => {
  it("is a warn callout alert with the error and a Try again that retries", () => {
    const onRetry = vi.fn();
    const host = mount({ error: "No model is set up.", onRetry });
    const box = host.querySelector('[role="alert"]')!;
    expect(box.textContent).toContain("No model is set up.");
    expect(box.className).toContain("bg-warn-tint");
    const button = [...box.querySelectorAll("button")].find((b) => b.textContent === "Try again")!;
    act(() => button.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers no Try again when there is nothing to send again", () => {
    const host = mount({ error: "The tutor could not answer." });
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("The tutor could not answer.");
    expect(host.querySelector("button")).toBeNull();
  });

  it("takes the danger tone when asked, as the course topic tutor does", () => {
    const box = mount({ error: "The tutor could not answer.", tone: "danger" }).querySelector('[role="alert"]')!;
    expect(box.className).toContain("bg-danger/8");
    expect(box.className).not.toContain("bg-warn-tint");
  });
});
