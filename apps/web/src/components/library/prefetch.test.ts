// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AssetCard } from "@/components/AssetCard";

import { AssetRow } from "./AssetRow";

/**
 * Every row and card is a `next/link` to `/library/<id>`, and Next prefetches
 * each one as it enters the viewport and cancels it as it scrolls away, which
 * the owner saw logged as "destination stream closed early" on long scrolls
 * (L9). A press
 * opens the previewer, so the prefetch is off. `prefetch={false}` leaves no
 * trace in the markup, so the mocked link records the prop it was given.
 */
const seen = vi.hoisted(() => [] as Array<{ href: string; prefetch: unknown }>);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...rest }: { href: string; children: unknown; prefetch?: unknown }) => {
    seen.push({ href, prefetch });
    return createElement("a", { href, ...rest }, children as never);
  },
}));

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  seen.length = 0;
});

function mount(element: ReturnType<typeof createElement>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
}

const asset = {
  id: "a1",
  kind: "video",
  path: "out/x/y/z/clip.mp4",
  url: null,
  bytes: 1000,
  title: "A clip",
  sourceRepo: "manimkc",
};

describe("Library row and card links", () => {
  it("the row's link does not prefetch", () => {
    mount(
      createElement(AssetRow, {
        asset: { ...asset, createdAt: "2026-10-05T10:00:00Z" } as never,
        source: null,
        time: null,
        edited: null,
        href: "/library/a1",
      }),
    );
    expect(seen).toEqual([{ href: "/library/a1", prefetch: false }]);
  });

  it("the card's link does not prefetch", () => {
    mount(createElement(AssetCard, { asset: asset as never, href: "/library/a1" }));
    expect(seen).toEqual([{ href: "/library/a1", prefetch: false }]);
  });
});
