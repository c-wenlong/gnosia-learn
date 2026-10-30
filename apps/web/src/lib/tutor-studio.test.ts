import { describe, expect, it } from "vitest";

import { studioCanTag } from "@/lib/tutor-studio";

/**
 * D67 of docs/STUDIO-TUTOR-HANDOFF.md: the tutor shows tags, and loads the
 * editor, only on a health answer where a tag can do something.
 */

const good = { ok: true, diagramAgent: { ok: true, problem: null }, video: { ok: true, checks: [] }, dailyCap: { totalUsd: 0, capUsd: null } };

describe("whether a health answer lets the tutor tag", () => {
  it("says no to anything that is not an answer: the runner down, the proxy refusing, another owner's runner", () => {
    expect(studioCanTag(null)).toBe(false);
    expect(studioCanTag(undefined)).toBe(false);
    expect(studioCanTag("ok")).toBe(false);
  });

  it("says no when the runner cannot run its planner", () => {
    expect(studioCanTag({ ...good, ok: false })).toBe(false);
    expect(studioCanTag({ diagramAgent: { ok: true }, video: { ok: true } })).toBe(false);
  });

  it("says yes even when neither machine kind can be made: an SVG is the reply itself, needing no machine (D105)", () => {
    expect(studioCanTag({ ...good, diagramAgent: { ok: false, problem: "a quote in the path" }, video: { ok: false } })).toBe(true);
    expect(studioCanTag({ ...good, diagramAgent: { ok: false }, video: undefined })).toBe(true);
  });

  it("says yes when one kind can be made", () => {
    expect(studioCanTag(good)).toBe(true);
    expect(studioCanTag({ ...good, video: { ok: false, note: "the video doctor has not finished its first check" } })).toBe(true);
    expect(studioCanTag({ ...good, diagramAgent: { ok: false, problem: "x" } })).toBe(true);
    // A runner from before `diagramAgent` could always queue a diagram.
    expect(studioCanTag({ ok: true })).toBe(true);
  });

  it("says yes with the day's cap spent: the menu shows, both entries disabled with the reason", () => {
    expect(studioCanTag({ ...good, dailyCap: { totalUsd: 12, capUsd: 10, exceeded: true } })).toBe(true);
  });
});
