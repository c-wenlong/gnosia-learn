import { describe, expect, it } from "vitest";

import {
  readOutcome,
  withOutcome,
} from "./studio-url";

/**
 * A verb's answer, carried in the URL the action redirects to.
 *
 * Before this existed the actions discarded what the runner said, so a 409
 * ("there is no SVG to verify") or a 502 carrying the snippet's own stack line
 * looked exactly like a button that did nothing. Caught in review on the phase
 * 2 PR.
 */

describe("carrying an outcome back to the page", () => {
  it("round-trips a success", () => {
    const href = withOutcome("/studio/d/dot-product", "export", {
      ok: true,
      headline: "export finished",
      detail: null,
    });
    expect(readOutcome(paramsOf(href))).toEqual({
      verb: "export",
      ok: true,
      headline: "export finished",
      detail: null,
    });
  });

  it("round-trips a failure with its detail", () => {
    const href = withOutcome("/studio/d/x", "verify", {
      ok: false,
      headline: "verify exited 1",
      detail: "x.svg does not exist",
    });
    const read = readOutcome(paramsOf(href));
    expect(read).toMatchObject({ ok: false, headline: "verify exited 1", detail: "x.svg does not exist" });
  });

  it("keeps the view the person was looking at", () => {
    const href = withOutcome("/studio?topic=alpha&view=list", "inspect", {
      ok: true,
      headline: "inspect finished",
      detail: null,
    });
    const params = paramsOf(href);
    expect(params.topic).toBe("alpha");
    expect(params.view).toBe("list");
  });

  it("replaces a previous outcome rather than stacking them", () => {
    const once = withOutcome("/studio", "export", { ok: false, headline: "no", detail: null });
    const twice = withOutcome(once, "verify", { ok: true, headline: "yes", detail: null });
    expect(twice.match(/[?&]v=/g)).toHaveLength(1);
    expect(readOutcome(paramsOf(twice))?.verb).toBe("verify");
  });

  it("caps the message, because a stack trace does not belong in a URL", () => {
    const href = withOutcome("/studio", "inspect", {
      ok: false,
      headline: "it threw",
      detail: "x".repeat(2_000),
    });
    expect((paramsOf(href).m ?? "").length).toBeLessThanOrEqual(300);
  });

  it("is null on a page nobody reached through a verb", () => {
    expect(readOutcome({ topic: "alpha" })).toBeNull();
  });
});

function paramsOf(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, "http://x").searchParams);
}
