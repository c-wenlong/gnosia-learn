import { beforeEach, describe, expect, it } from "vitest";

import { admitSignIn, recordSignInFailure, resetSignInLimits, SIGN_IN_CLIENT_RULE, SIGN_IN_FAILURE_RULE } from "./sign-in-limit";

describe("sign-in limits", () => {
  beforeEach(() => resetSignInLimits());

  it("counts every attempt against its client, and each client apart", () => {
    for (let i = 0; i < SIGN_IN_CLIENT_RULE.limit; i += 1) expect(admitSignIn("a", 0).allowed).toBe(true);
    expect(admitSignIn("a", 0)).toEqual({ allowed: false, retryAfterSeconds: SIGN_IN_CLIENT_RULE.windowMs / 1000 });
    expect(admitSignIn("b", 0).allowed).toBe(true);
    expect(admitSignIn("a", SIGN_IN_CLIENT_RULE.windowMs).allowed).toBe(true);
  });

  it("shuts the door on every client once wrong passwords pass the shared limit, until the window ends", () => {
    for (let i = 0; i < SIGN_IN_FAILURE_RULE.limit - 1; i += 1) recordSignInFailure(0);
    expect(admitSignIn("fresh", 1_000).allowed).toBe(true);
    recordSignInFailure(1_000);
    const refused = admitSignIn("another", 60_000);
    expect(refused.allowed).toBe(false);
    expect(refused.allowed === false && refused.retryAfterSeconds).toBe((SIGN_IN_FAILURE_RULE.windowMs - 60_000) / 1000);
    expect(admitSignIn("another", SIGN_IN_FAILURE_RULE.windowMs).allowed).toBe(true);
  });

  it("starts a new shared window after the old one ends", () => {
    for (let i = 0; i < SIGN_IN_FAILURE_RULE.limit - 1; i += 1) recordSignInFailure(0);
    recordSignInFailure(SIGN_IN_FAILURE_RULE.windowMs);
    expect(admitSignIn("x", SIGN_IN_FAILURE_RULE.windowMs + 1).allowed).toBe(true);
  });
});
