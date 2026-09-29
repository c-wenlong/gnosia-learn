// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";

import { WatchProgress, WatchStatusContext, type WatchStatus } from "./WatchProgress";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function text(status: WatchStatus | null): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(WatchStatusContext, { value: status }, createElement(WatchProgress))));
  const out = host.textContent ?? "";
  act(() => root.unmount());
  return out;
}

describe("WatchProgress", () => {
  it("says a video nobody has played is not started", () => {
    expect(text({ coverage: 0, watched: false, position: 0, watchedDay: null })).toBe("Not started");
  });

  it("gives the share played and where it stopped", () => {
    expect(text({ coverage: 0.094, watched: false, position: 176, watchedDay: null })).toBe(
      "9%, stopped at 2:56",
    );
  });

  it("says watched, with the day when the server knows it", () => {
    expect(text({ coverage: 0.95, watched: true, position: 0, watchedDay: "2026-09-29" })).toBe(
      "Watched 2026-09-29 (95% played)",
    );
    expect(text({ coverage: 0.92, watched: true, position: 320, watchedDay: null })).toBe(
      "Watched (92% played, stopped at 5:20)",
    );
  });

  it("says unknown outside a player", () => {
    expect(text(null)).toBe("unknown");
  });
});
