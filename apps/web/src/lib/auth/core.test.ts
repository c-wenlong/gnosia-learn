import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  HOME_PATH,
  isApiPath,
  isPublicPath,
  originFromHeaders,
  passwordMatches,
  requestIsSameOrigin,
  secretsEqual,
  readAuthConfig,
  safeNextPath,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
} from "./core";

const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = 1_800_000_000;
const CONFIG = { secret: SECRET, password: "correct horse battery staple", epoch: "" };

describe("signSession / verifySession", () => {
  it("round-trips a token signed with the same secret", async () => {
    const token = await signSession(CONFIG, NOW);
    expect(token).toMatch(/^1800000000\.[A-Za-z0-9_-]{43}$/);
    await expect(verifySession(CONFIG, token, NOW)).resolves.toBe(true);
    await expect(verifySession(CONFIG, token, NOW + SESSION_TTL_SECONDS)).resolves.toBe(true);
  });

  it("refuses a different secret, a tampered time and a tampered signature", async () => {
    const token = await signSession(CONFIG, NOW);
    await expect(verifySession({ ...CONFIG, secret: `${SECRET}x` }, token, NOW)).resolves.toBe(false);
    const [issuedAt, sig] = token.split(".");
    await expect(verifySession(CONFIG, `${Number(issuedAt) + 1}.${sig}`, NOW)).resolves.toBe(false);
    const flipped = sig[0] === "A" ? "B" : "A";
    await expect(verifySession(CONFIG, `${issuedAt}.${flipped}${sig.slice(1)}`, NOW)).resolves.toBe(false);
  });

  it("expires after the TTL and refuses a token from the future", async () => {
    const token = await signSession(CONFIG, NOW);
    await expect(verifySession(CONFIG, token, NOW + SESSION_TTL_SECONDS + 1)).resolves.toBe(false);
    await expect(verifySession(CONFIG, token, NOW - 61)).resolves.toBe(false);
    await expect(verifySession(CONFIG, token, NOW - 59)).resolves.toBe(true);
  });

  it("is false for anything malformed, without throwing", async () => {
    for (const bad of [undefined, null, "", ".", "abc", "123", "123.", ".abc", "1e5.abc", "-1.abc", "1800000000.abc def"]) {
      await expect(verifySession(CONFIG, bad, NOW)).resolves.toBe(false);
    }
    await expect(verifySession({ ...CONFIG, secret: "" }, await signSession(CONFIG, NOW), NOW)).resolves.toBe(false);
    await expect(verifySession({ ...CONFIG, password: "" }, await signSession(CONFIG, NOW), NOW)).resolves.toBe(false);
  });

  it("refuses to sign a non-integer time, or without a secret and a password", async () => {
    await expect(signSession(CONFIG, 1.5)).rejects.toThrow(RangeError);
    await expect(signSession(CONFIG, -1)).rejects.toThrow(RangeError);
    await expect(signSession({ ...CONFIG, password: "" }, NOW)).rejects.toThrow(RangeError);
  });

  it("ends every session when the password or the epoch changes, with AUTH_SECRET untouched (S7-03)", async () => {
    const token = await signSession(CONFIG, NOW);
    await expect(verifySession({ ...CONFIG, password: "a new password" }, token, NOW)).resolves.toBe(false);
    await expect(verifySession({ ...CONFIG, epoch: "1" }, token, NOW)).resolves.toBe(false);
    // A new session under the new epoch works, and the old configuration does not take it.
    const bumped = await signSession({ ...CONFIG, epoch: "1" }, NOW);
    await expect(verifySession({ ...CONFIG, epoch: "1" }, bumped, NOW)).resolves.toBe(true);
    await expect(verifySession(CONFIG, bumped, NOW)).resolves.toBe(false);
    // Back to the old values is back to the old sessions: the key is a function of the three.
    await expect(verifySession(CONFIG, token, NOW)).resolves.toBe(true);
  });

  it("cannot be confused by an epoch that looks like a separator", async () => {
    const a = await signSession({ ...CONFIG, password: "pw", epoch: '","x' }, NOW);
    await expect(verifySession({ ...CONFIG, password: 'pw","', epoch: "x" }, a, NOW)).resolves.toBe(false);
  });

  it("refuses a token signed the old way, with AUTH_SECRET alone (sessions end once at deploy)", async () => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`gnosia-session:${NOW}`)));
    const legacy = `${NOW}.${btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    await expect(verifySession(CONFIG, legacy, NOW)).resolves.toBe(false);
  });
});

describe("passwordMatches / secretsEqual / constantTimeEqual", () => {
  it("matches only the exact string", async () => {
    await expect(passwordMatches("correct horse", "correct horse")).resolves.toBe(true);
    await expect(passwordMatches("correct horse ", "correct horse")).resolves.toBe(false);
    await expect(passwordMatches("Correct horse", "correct horse")).resolves.toBe(false);
    await expect(passwordMatches("", "correct horse")).resolves.toBe(false);
    await expect(passwordMatches("correct horsf", "correct horse")).resolves.toBe(false);
  });

  it("never matches an empty expected password", async () => {
    await expect(passwordMatches("", "")).resolves.toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("compares by bytes, so multibyte text works", async () => {
    expect(constantTimeEqual("γνῶσις", "γνῶσις")).toBe(true);
    expect(constantTimeEqual("γνῶσις", "γνῶσιs")).toBe(false);
    await expect(secretsEqual("γνῶσις", "γνῶσις")).resolves.toBe(true);
    await expect(secretsEqual("γνῶσις", "γνῶσιs")).resolves.toBe(false);
  });

  it("treats a prefix or an extension of the secret as wrong", async () => {
    await expect(secretsEqual("launch", "launch-secret")).resolves.toBe(false);
    await expect(secretsEqual("launch-secret-x", "launch-secret")).resolves.toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("requestIsSameOrigin", () => {
  const at = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/x", { method: "POST", headers: { host: "gnosia.example", ...headers } });

  it("takes this site, by Sec-Fetch-Site or by an Origin naming the host the browser addressed", () => {
    expect(requestIsSameOrigin(at({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(requestIsSameOrigin(at({ origin: "https://gnosia.example" }))).toBe(true);
    expect(requestIsSameOrigin(at({ origin: "http://gnosia.example", "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("refuses another site, a sibling subdomain, null, nonsense, and a forwarded host the client chose", () => {
    expect(requestIsSameOrigin(at({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(requestIsSameOrigin(at({ "sec-fetch-site": "same-site", origin: "https://gnosia.example" }))).toBe(false);
    expect(requestIsSameOrigin(at({ origin: "https://evil.example" }))).toBe(false);
    expect(requestIsSameOrigin(at({ origin: "https://evil.example", "x-forwarded-host": "evil.example" }))).toBe(false);
    expect(requestIsSameOrigin(at({ origin: "null" }), { allowMissing: true })).toBe(false);
    expect(requestIsSameOrigin(at({ origin: "not a url" }), { allowMissing: true })).toBe(false);
    // Sec-Fetch-Site says same-origin and Origin says otherwise: both must hold.
    expect(requestIsSameOrigin(at({ "sec-fetch-site": "same-origin", origin: "https://evil.example" }))).toBe(false);
  });

  it("takes a request with neither header only when the caller opts in", () => {
    expect(requestIsSameOrigin(at({}))).toBe(false);
    expect(requestIsSameOrigin(at({}), { allowMissing: true })).toBe(true);
    expect(requestIsSameOrigin(at({ "sec-fetch-site": "none" }))).toBe(false);
    expect(requestIsSameOrigin(at({ "sec-fetch-site": "none" }), { allowMissing: true })).toBe(true);
  });
});

describe("readAuthConfig", () => {
  it("returns both values trimmed, and the epoch, empty when unset", () => {
    const result = readAuthConfig({ OWNER_PASSWORD: " pw ", AUTH_SECRET: ` ${SECRET} ` });
    expect(result).toEqual({ ok: true, config: { password: "pw", secret: SECRET, epoch: "" } });
    expect(readAuthConfig({ OWNER_PASSWORD: "pw", AUTH_SECRET: SECRET, SESSION_EPOCH: " 3 " })).toEqual({
      ok: true,
      config: { password: "pw", secret: SECRET, epoch: "3" },
    });
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
    expect(safeNextPath("/home")).toBe("/home");
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
      "/sign-in?next=/home",
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

describe("originFromHeaders", () => {
  const fallback = "http://localhost:3000";
  const of = (h: Record<string, string>) => originFromHeaders(new Headers(h), fallback);

  it("names the host the browser addressed, with the request's own scheme", () => {
    expect(of({ host: "192.168.1.20:3000" })).toBe("http://192.168.1.20:3000");
    expect(of({ host: "gnosia.example" })).toBe("http://gnosia.example");
  });

  it("takes the scheme from a TLS-terminating proxy, and ignores X-Forwarded-Host", () => {
    expect(of({ host: "gnosia.example", "x-forwarded-proto": "https" })).toBe("https://gnosia.example");
    expect(of({ host: "gnosia.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" })).toBe("https://gnosia.example");
    expect(of({ host: "gnosia.example", "x-forwarded-proto": "javascript" })).toBe("http://gnosia.example");
  });

  it("uses only the first value of a forwarding chain", () => {
    expect(of({ host: "a.example, b.example", "x-forwarded-proto": "https, http" })).toBe("https://a.example");
  });

  it("falls back rather than throwing on a missing or malformed host", () => {
    expect(of({})).toBe(fallback);
    expect(of({ host: "" })).toBe(fallback);
    expect(of({ host: "not a host" })).toBe(fallback);
    expect(of({ host: "[::1" })).toBe(fallback);
  });
});

describe("isPublicPath / isApiPath", () => {
  it("opens exactly the landing, the sign-in page and the auth routes", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/api/auth/sign-in")).toBe(true);
    expect(isPublicPath("/api/auth/sign-out")).toBe(true);
    expect(isPublicPath("/home")).toBe(false);
    expect(isPublicPath("/sign-in/other")).toBe(false);
    expect(isPublicPath("/api/authx")).toBe(false);
  });

  it("treats the app API and the studio proxy as API", () => {
    expect(isApiPath("/api/learner/home")).toBe(true);
    expect(isApiPath("/studio/api/jobs")).toBe(true);
    expect(isApiPath("/studio")).toBe(false);
    expect(isApiPath("/library")).toBe(false);
  });
});
