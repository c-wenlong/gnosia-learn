// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { WorkspaceHeading } from "./WorkspaceHeading";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

async function mount(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

describe("WorkspaceHeading", () => {
  it("is an h3 at the workspace's 13px bold, around what it is given", async () => {
    const host = await mount(createElement(WorkspaceHeading, null, "Checks · 3"));
    const heading = host.querySelector("h3") as HTMLHeadingElement;
    expect(host.children).toHaveLength(1);
    expect(heading.textContent).toBe("Checks · 3");
    expect(heading.className).toBe("text-[13px] font-bold text-text");
  });
});
