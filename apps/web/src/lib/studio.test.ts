import { describe, expect, it } from "vitest";

import { STUDIO_ENV, studioEnabled, studioOrigin } from "./studio";

/**
 * D11's gate: production, where `STUDIO_ENABLED` is unset, serves 404 for
 * every studio surface. Every entry point calls `requireStudio()` first, which
 * the lint rule `gnosia/studio-gate` holds each one to and
 * app/(app)/studio/gate.test.ts proves by calling each with the studio off.
 */

describe("the gate itself", () => {
  it("is off when the variable is absent, which is what production looks like", () => {
    expect(studioEnabled({})).toBe(false);
  });

  it.each(["", "0", "false", "off", "no", " FALSE ", "Off"])(
    "treats %j as set-but-no rather than as enabled",
    (value) => {
      expect(studioEnabled({ [STUDIO_ENV]: value })).toBe(false);
    },
  );

  it.each(["1", "true", "yes", "please"])("treats %j as on", (value) => {
    expect(studioEnabled({ [STUDIO_ENV]: value })).toBe(true);
  });
});

describe("where the runner is", () => {
  it("defaults to the port the service binds", () => {
    expect(studioOrigin({})).toBe("http://127.0.0.1:7250");
  });

  it("follows STUDIO_PORT, so a moved runner is not configured twice", () => {
    expect(studioOrigin({ STUDIO_PORT: "7300" })).toBe("http://127.0.0.1:7300");
  });

  it("ignores a port that is not one, rather than building a broken URL", () => {
    expect(studioOrigin({ STUDIO_PORT: "banana" })).toBe("http://127.0.0.1:7250");
    expect(studioOrigin({ STUDIO_PORT: "80" })).toBe("http://127.0.0.1:7250");
  });
});
