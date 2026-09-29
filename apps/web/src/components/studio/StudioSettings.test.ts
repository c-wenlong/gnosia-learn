// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The settings panel's saves (review of #204, Greptile 4131699279): the last
 * pick is the last write, an older answer never speaks over a newer one, and
 * a save that throws is a refused save rather than a crashed page.
 */

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/app/(app)/studio/actions", () => ({ saveStudioAgent: mocks.save }));
vi.mock("next/link", () => ({ default: () => null }));

const { StudioSettings } = await import("./StudioSettings");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

const options = (values: string[]) => values.map((value) => ({ value, label: value }));

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(StudioSettings, {
        reachable: true,
        rows: [
          {
            kind: "video",
            name: "Videos",
            value: { model: "default", effort: "default" },
            fallback: { model: "default", effort: "default" },
            models: options(["default", "fable", "opus", "sonnet"]),
            efforts: options(["default", "low", "high"]),
          },
        ],
      }),
    );
  });
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  const select = (label: string) =>
    [...host.querySelectorAll("select")].find((element) => host.querySelector(`label[for="${element.id}"]`)?.textContent === label)!;
  const pick = async (label: string, value: string) => {
    await act(async () => {
      const element = select(label);
      element.value = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  return { host, select, pick };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe("StudioSettings saves", () => {
  it("writes in the order picked, and a failed older save does not undo a newer one", async () => {
    const first = deferred<{ ok: boolean; error: string | null }>();
    const second = deferred<{ ok: boolean; error: string | null }>();
    mocks.save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { host, select, pick } = await mount();
    await pick("Model", "opus");
    await pick("Effort", "high");
    await flush();
    // The second save waits for the first: one write at a time, in order.
    expect(mocks.save).toHaveBeenCalledTimes(1);
    first.resolve({ ok: false, error: "Not saved: the catalog did not answer." });
    await flush();
    expect(mocks.save).toHaveBeenCalledTimes(2);
    const sent = mocks.save.mock.calls[1]![0] as FormData;
    expect([sent.get("model"), sent.get("effort")]).toEqual(["opus", "high"]);
    second.resolve({ ok: true, error: null });
    await flush();
    expect(select("Model").value).toBe("opus");
    expect(select("Effort").value).toBe("high");
    expect(host.textContent).toContain("Saved");
    expect(host.textContent).not.toContain("Not saved");
  });

  it("says a thrown save was not saved, puts the stored value back, and does not throw", async () => {
    mocks.save.mockRejectedValueOnce(new Error("fetch failed"));
    const { host, select, pick } = await mount();
    await pick("Model", "sonnet");
    await flush();
    expect(host.textContent).toContain("Not saved: the studio did not answer.");
    expect(select("Model").value).toBe("default");
  });
});
