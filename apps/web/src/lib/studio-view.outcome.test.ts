import { describe, expect, it } from "vitest";

import { readOutcome, studioPath, withOutcome, withoutOutcome } from "./studio-url";

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
      headline: "Export finished.",
      said: "export finished",
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
    expect(read).toMatchObject({ ok: false, headline: "Verify did not pass.", said: "verify exited 1", detail: "x.svg does not exist" });
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

  it("keeps a headline and a detail whole when either holds the old separator (S2-10)", () => {
    const href = withOutcome("/studio", "export", { ok: false, headline: "export — stopped", detail: "line 1 — line 2 — line 3" });
    expect(readOutcome(paramsOf(href))).toMatchObject({ said: "export — stopped", detail: "line 1 — line 2 — line 3" });
  });

  it("caps the detail too", () => {
    const href = withOutcome("/studio", "inspect", { ok: false, headline: "it threw", detail: "x".repeat(2_000) });
    expect((paramsOf(href).d ?? "").length).toBeLessThanOrEqual(300);
    expect(withoutOutcome(href)).toBe("/studio");
  });
});

describe("what a link can put in the banner (S1-21)", () => {
  it("reads only a verb this studio has", () => {
    expect(readOutcome({ v: "Your session expired", ok: "0", m: "Sign in at evil.example" })).toBeNull();
    expect(readOutcome({ v: "export", ok: "1", m: "export finished" })?.verb).toBe("export");
  });

  it("caps what it reads, whatever the URL carried", () => {
    expect(readOutcome({ v: "verify", m: "x".repeat(5_000), d: "y".repeat(5_000) })).toMatchObject({
      said: "x".repeat(300),
      detail: "y".repeat(300),
    });
  });

  it("never draws a link's words as the studio's headline (R2-1-06)", () => {
    const read = readOutcome({ v: "export", ok: "0", m: "Your session expired. Sign in again at gnosia-login.example" });
    expect(read?.headline).toBe("Export did not finish.");
    expect(read?.said).toBe("Your session expired. Sign in again at gnosia-login.example");
    expect(readOutcome({ v: "commit", ok: "1" })).toEqual({ verb: "commit", ok: true, headline: "Committed.", said: null, detail: null });
    // Own keys only: a verb named after an Object method is no verb.
    expect(readOutcome({ v: "constructor", ok: "1" })).toBeNull();
  });

  it("carries no runner words when the runner gave none", () => {
    expect(paramsOf(withOutcome("/studio", "export", { ok: true, headline: "", detail: null }))).not.toHaveProperty("m");
  });
});

describe("where a verb redirects (S2-07)", () => {
  it.each(["https://evil.example/studio", "//evil.example/studio", "/\\evil.example", "/elsewhere", "", "studio"])(
    "sends %j back to the studio, not off the site",
    (path) => {
      expect(studioPath(path)).toBe("/studio");
      expect(withOutcome(path, "export", { ok: true, headline: "done", detail: null })).toMatch(/^\/studio\?/);
    },
  );

  it("keeps a studio path as it came", () => {
    expect(studioPath("/studio/d/dot-product")).toBe("/studio/d/dot-product");
    expect(studioPath("/studio?sel=a")).toBe("/studio?sel=a");
    expect(studioPath("/studio")).toBe("/studio");
    expect(studioPath("/studious")).toBe("/studio");
  });
});

function paramsOf(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, "http://x").searchParams);
}
