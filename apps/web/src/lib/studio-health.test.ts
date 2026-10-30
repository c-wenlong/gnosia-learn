import { describe, expect, it } from "vitest";

import { doctorVerdict } from "./studio-health";

describe("doctorVerdict (R2-1-19)", () => {
  it("passes when no check fails, tldrawkc runs and diagram jobs can be queued", () => {
    expect(doctorVerdict({ tldrawkc: true, checks: [{ name: "node", status: "pass", detail: "" }, { name: "fonts", status: "warn", detail: "x" }] })).toEqual({
      ok: true,
      text: "Doctor passes now.",
    });
  });

  it("names the first failing check, and the other two reasons", () => {
    expect(doctorVerdict({ tldrawkc: false, checks: [{ name: "chromium", status: "fail", detail: "not installed." }] })).toEqual({
      ok: false,
      text: "Doctor still fails on chromium: not installed.",
    });
    expect(doctorVerdict({ tldrawkc: false, checks: [] }).text).toMatch(/tldrawkc cannot run/);
    expect(doctorVerdict({ tldrawkc: true, checks: [], diagramAgent: { ok: false, problem: "the home path holds a quote" } }).text).toBe(
      "Diagram jobs still cannot be queued: the home path holds a quote.",
    );
  });

  it("says a runner that did not answer", () => {
    expect(doctorVerdict(null)).toEqual({ ok: false, text: "The studio runner did not answer, so doctor could not be read." });
  });
});
