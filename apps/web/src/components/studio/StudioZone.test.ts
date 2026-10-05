// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { StudioTime, StudioZone } from "@/components/studio/StudioZone";

/**
 * The studio's times in a DOM: the zone the layout hands down decides the
 * day, a diagram's panel prints no raw ISO text, and with no provider the
 * runtime's zone is used.
 */

const NOW = Date.parse("2026-10-05T06:00:00.000Z"); // 14:00 on 5 Oct in Singapore
const CREATED = "2026-09-29T20:25:41.649Z"; // 30 Sept in Singapore, 29 Sept in UTC

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function render(timeZone: string | undefined, at: string, as: "ago" | "day" | "dayTime"): string {
  vi.useFakeTimers({ now: NOW });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(StudioZone, { timeZone }, createElement(StudioTime, { at, as }))));
  const text = host.textContent ?? "";
  act(() => root.unmount());
  return text;
}

describe("StudioTime", () => {
  it("files the Created day under the app zone's day, as the Library does", () => {
    expect(render("Asia/Singapore", CREATED, "day")).toBe("30 Sept");
    expect(render("UTC", CREATED, "day")).toBe("29 Sept");
  });

  it("prints the day and clock time, never an ISO string", () => {
    const text = render("Asia/Singapore", CREATED, "dayTime");
    expect(text).toBe("30 Sept, 04:25");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("words an age by calendar day in that zone", () => {
    // 01:00 on 4 Oct in Singapore, 37 hours before NOW.
    expect(render("Asia/Singapore", new Date(NOW - 37 * 3_600_000).toISOString(), "ago")).toBe("Yesterday");
  });
});
