import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  HOME_PATH,
  isApiPath,
  isPublicPath,
  passwordMatches,
  readAuthConfig,
  safeNextPath,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
} from "./core";

const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = 1_800_000_000;

describe("signSession / verifySession", () => {
  it("round-trips a token signed with the same secret", async () => {
    const token = await signSession(SECRET, NOW);
    expect(token).toMatch(/^1800000000\.[A-Za-z0-9_-]{43}$/);
    await expect(verifySession(SECRET, token, NOW)).resolves.toBe(true);
    await expect(verifySession(SECRET, token, NOW + SESSION_TTL_SECONDS)).resolves.toBe(true);
  });

  it("refuses a different secret, a tampered time and a tampered signature", async () => {
    const token = await signSession(SECRET, NOW);
    await expect(verifySession(`${SECRET}x`, token, NOW)).resolves.toBe(false);
    const [issuedAt, sig] = token.split(".");
    await expect(verifySession(SECRET, `${Number(issuedAt) + 1}.${sig}`, NOW)).resolves.toBe(false);
    const flipped = sig[0] === "A" ? "B" : "A";
    await expect(verifySession(SECRET, `${issuedAt}.${flipped}${sig.slice(1)}`, NOW)).resolves.toBe(false);
  });

  it("expires after the TTL and refuses a token from the future", async () => {
    const token = await signSession(SECRET, NOW);
    await expect(verifySession(SECRET, token, NOW + SESSION_TTL_SECONDS + 1)).resolves.toBe(false);
    await expect(verifySession(SECRET, token, NOW - 61)).resolves.toBe(false);
    await expect(verifySession(SECRET, token, NOW - 59)).resolves.toBe(true);
  });

  it("is false for anything malformed, without throwing", async () => {
    for (const bad of [undefined, null, "", ".", "abc", "123", "123.", ".abc", "1e5.abc", "-1.abc", "1800000000.abc def"]) {
      await expect(verifySession(SECRET, bad, NOW)).resolves.toBe(false);
    }
    await expect(verifySession("", await signSession(SECRET, NOW), NOW)).resolves.toBe(false);
  });

  it("refuses to sign a non-integer time", async () => {
    await expect(signSession(SECRET, 1.5)).rejects.toThrow(RangeError);
    await expect(signSession(SECRET, -1)).rejects.toThrow(RangeError);
  });
});

describe("passwordMatches / constantTimeEqual", () => {
  it("matches only the exact string", () => {
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(passwordMatches("correct horse ", "correct horse")).toBe(false);
    expect(passwordMatches("Correct horse", "correct horse")).toBe(false);
    expect(passwordMatches("", "correct horse")).toBe(false);
  });

  it("never matches an empty expected password", () => {
    expect(passwordMatches("", "")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("compares by bytes, so multibyte text works", () => {
    expect(constantTimeEqual("γνῶσις", "γνῶσις")).toBe(true);
    expect(constantTimeEqual("γνῶσις", "γνῶσιs")).toBe(false);
  });
});

describe("readAuthConfig", () => {
  it("returns both values trimmed", () => {
    const result = readAuthConfig({ OWNER_PASSWORD: " pw ", AUTH_SECRET: ` ${SECRET} ` });
    expect(result).toEqual({ ok: true, config: { password: "pw", secret: SECRET } });
  });

  it("names every missing variable, and treats a short secret as missing", () => {
    expect(readAuthConfig({})).toEqual({ ok: false, missing: ["OWNER_PASSWORD", "AUTH_SECRET"] });
    expect(readAuthConfig({ OWNER_PASSWORD: "pw", AUTH_SECRET: "short" })).toEqual({
      ok: false,
      missing: ["AUTH_SECRET"],
    });
    expect(readAuthConfig({ OWNER_PASSWORD: "   ", AUTH_SECRET: SECRET })).toEqual({
      ok: false,
      missing: ["OWNER_PASSWORD"],
    });
  });
});

describe("safeNextPath", () => {
  it("keeps a same-origin path, query included", () => {
    expect(safeNextPath("/learn/bkt?tab=note#top")).toBe("/learn/bkt?tab=note#top");
    expect(safeNextPath("/today")).toBe("/today");
  });

  it("falls back to home for anything that could leave the origin or loop", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "evil",
      "/sign-in",
      "/sign-in?next=/today",
      "/",
      "/api/learner/export",
      "/a b",
      "/a\nb",
      `/${"x".repeat(2100)}`,
    ]) {
      expect(safeNextPath(bad)).toBe(HOME_PATH);
    }
  });
});

describe("isPublicPath / isApiPath", () => {
  it("opens exactly the landing, the sign-in page and the auth routes", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/api/auth/sign-in")).toBe(true);
    expect(isPublicPath("/api/auth/sign-out")).toBe(true);
    expect(isPublicPath("/today")).toBe(false);
    expect(isPublicPath("/sign-in/other")).toBe(false);
    expect(isPublicPath("/api/authx")).toBe(false);
  });

  it("treats the app API and the studio proxy as API", () => {
    expect(isApiPath("/api/learner/today")).toBe(true);
    expect(isApiPath("/studio/api/jobs")).toBe(true);
    expect(isApiPath("/studio")).toBe(false);
    expect(isApiPath("/library")).toBe(false);
  });
});
