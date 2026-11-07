// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { FactList } from "./FactList";

/**
 * The kit's facts: a description list, a `dt` and a `dd` per fact, for the
 * library's asset facts and the studio inspector's dense rows.
 */

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

const pairs = (host: HTMLElement) =>
  [...host.querySelectorAll("dl > div")].map((row) => [...row.children].map((cell) => `${cell.tagName}:${cell.textContent}`));

describe("FactList", () => {
  it("renders each fact as a dt and dd pair inside one dl", async () => {
    const host = await mount(
      createElement(FactList, {
        facts: [
          { label: "Kind", value: "Video" },
          { label: "Id", value: createElement("span", { className: "font-mono" }, "manimkc:x") },
        ],
      }),
    );
    expect(host.querySelectorAll("dl")).toHaveLength(1);
    expect(pairs(host)).toEqual([
      ["DT:Kind", "DD:Video"],
      ["DT:Id", "DD:manimkc:x"],
    ]);
    // Every dt and dd sits in a div straight under the dl, which HTML allows and nothing else.
    for (const cell of host.querySelectorAll("dt, dd")) expect(cell.parentElement?.parentElement?.tagName).toBe("DL");
  });

  it("skips a fact given as false, null or undefined", async () => {
    const host = await mount(
      createElement(FactList, { facts: [false, { label: "Kind", value: "Note" }, null, undefined, { label: "Size", value: "2 KB" }] }),
    );
    expect(pairs(host)).toEqual([
      ["DT:Kind", "DD:Note"],
      ["DT:Size", "DD:2 KB"],
    ]);
  });

  it("stacks on a phone at the comfortable density, and keeps two columns with hairlines when dense", async () => {
    const facts = [{ label: "Shapes", value: 12 }];
    const comfortable = (await mount(createElement(FactList, { facts }))).querySelector("dl > div") as HTMLElement;
    expect(comfortable.className).toContain("grid-cols-1");
    expect(comfortable.className).toContain("sm:grid-cols-[6rem_minmax(0,1fr)]");
    expect(comfortable.className).not.toContain("border-b");

    const dense = (await mount(createElement(FactList, { facts, density: "dense" }))).querySelector("dl > div") as HTMLElement;
    expect(dense.className).toMatch(/(^|\s)grid-cols-\[6rem_minmax\(0,1fr\)\]/);
    expect(dense.className).toContain("min-h-8");
    expect(dense.className).toContain("border-b");
    expect(dense.querySelector("dd")?.className).toContain("text-xs");
  });
});
