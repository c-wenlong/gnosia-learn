import { beforeEach, describe, expect, it } from "vitest";

import { admitSignIn, releaseSignIn, resetSignInLimits, SIGN_IN_CLIENT_RULE, SIGN_IN_FAILURE_RULE } from "./sign-in-limit";

describe("sign-in limits", () => {
  beforeEach(() => resetSignInLimits());

  it("counts every attempt against its client, and each client apart", () => {
    for (let i = 0; i < SIGN_IN_CLIENT_RULE.limit; i += 1) expect(admitSignIn("a", 0).allowed).toBe(true);
    expect(admitSignIn("a", 0)).toEqual({ allowed: false, retryAfterSeconds: SIGN_IN_CLIENT_RULE.windowMs / 1000 });
    expect(admitSignIn("b", 0).allowed).toBe(true);
    expect(admitSignIn("a", SIGN_IN_CLIENT_RULE.windowMs).allowed).toBe(true);
  });

  it("shuts the door on every client once wrong passwords pass the shared limit, until the window ends", () => {
    for (let i = 0; i < SIGN_IN_FAILURE_RULE.limit - 1; i += 1) expect(admitSignIn(`c${i}`, 0).allowed).toBe(true);
    expect(admitSignIn("fresh", 1_000).allowed).toBe(true);
    const refused = admitSignIn("another", 60_000);
    expect(refused.allowed).toBe(false);
    expect(refused.allowed === false && refused.retryAfterSeconds).toBe((SIGN_IN_FAILURE_RULE.windowMs - 60_000) / 1000);
    expect(admitSignIn("another", SIGN_IN_FAILURE_RULE.windowMs).allowed).toBe(true);
  });

  it("starts a new shared window after the old one ends", () => {
    for (let i = 0; i < SIGN_IN_FAILURE_RULE.limit; i += 1) admitSignIn(`c${i}`, 0);
    expect(admitSignIn("x", 1).allowed).toBe(false);
    expect(admitSignIn("x", SIGN_IN_FAILURE_RULE.windowMs).allowed).toBe(true);
  });

  it("holds a slot for every attempt in flight, so parallel posts cannot pass the shared limit", () => {
    // Six clients at ten each would be sixty; only the first fifty get in.
    let admitted = 0;
    for (let c = 0; c < 6; c += 1) {
      for (let i = 0; i < SIGN_IN_CLIENT_RULE.limit; i += 1) if (admitSignIn(`p${c}`, 0).allowed) admitted += 1;
    }
    expect(admitted).toBe(SIGN_IN_FAILURE_RULE.limit);
  });

  it("gives the slot back for a right password, and never below zero", () => {
    for (let i = 0; i < SIGN_IN_FAILURE_RULE.limit; i += 1) admitSignIn(`c${i}`, 0);
    expect(admitSignIn("owner", 0).allowed).toBe(false);
    releaseSignIn(0);
    expect(admitSignIn("owner", 0).allowed).toBe(true);
    resetSignInLimits();
    releaseSignIn(0);
    for (let i = 0; i < SIGN_IN_FAILURE_RULE.limit; i += 1) expect(admitSignIn(`d${i}`, 0).allowed).toBe(true);
    expect(admitSignIn("one-more", 0).allowed).toBe(false);
  });
});
