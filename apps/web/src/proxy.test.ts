import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_COOKIE, signSession } from "@/lib/auth/core";

import { config, proxy } from "./proxy";

const ORIGIN = "http://localhost:3000";
const SECRET = "0123456789abcdef0123456789abcdef";

function get(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

describe("proxy", () => {
  const saved = process.env.AUTH_SECRET;
  let token: string;
  beforeEach(async () => {
    process.env.AUTH_SECRET = SECRET;
    token = await signSession(SECRET, Math.floor(Date.now() / 1000));
  });
  afterEach(() => {
    process.env.AUTH_SECRET = saved;
  });

  it("lets an anonymous visitor see the landing page, sign-in and the auth routes", async () => {
    for (const path of ["/", "/sign-in", "/sign-in?next=%2Ftoday", "/api/auth/sign-in"]) {
      const response = await proxy(get(path));
      expect(response.status, path).toBe(200);
      expect(response.headers.get("location"), path).toBeNull();
    }
  });

  it("sends an anonymous visitor to sign-in, remembering where they were going", async () => {
    const response = await proxy(get("/learn/bkt?tab=note"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Flearn%2Fbkt%3Ftab%3Dnote`);
  });

  it("answers an anonymous API call with 401 JSON, not a redirect", async () => {
    for (const path of ["/api/learner/today", "/studio/api/jobs"]) {
      const response = await proxy(get(path));
      expect(response.status, path).toBe(401);
      expect(await response.json()).toEqual({ error: "UNAUTHENTICATED", signIn: "/sign-in" });
    }
  });

  it("lets the owner through, and sends them home from the landing and sign-in pages", async () => {
    expect((await proxy(get("/today", token))).status).toBe(200);
    expect((await proxy(get("/api/learner/today", token))).status).toBe(200);
    for (const path of ["/", "/sign-in"]) {
      const response = await proxy(get(path, token));
      expect(response.status, path).toBe(307);
      expect(response.headers.get("location"), path).toBe(`${ORIGIN}/today`);
    }
  });

  it("treats a forged or stale cookie as anonymous", async () => {
    const forged = await signSession(`${SECRET}x`, Math.floor(Date.now() / 1000));
    expect((await proxy(get("/today", forged))).status).toBe(307);
    const stale = await signSession(SECRET, Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 31);
    expect((await proxy(get("/today", stale))).status).toBe(307);
  });

  it("fails closed when AUTH_SECRET is unset, even with a cookie", async () => {
    delete process.env.AUTH_SECRET;
    const response = await proxy(get("/today", token));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Ftoday`);
    expect((await proxy(get("/"))).status).toBe(200);
  });

  it("matcher skips static output and image files but covers the API", () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    for (const skipped of ["/_next/static/chunks/a.js", "/_next/image?url=x", "/icon.png", "/opengraph-image.png", "/banner.png", "/file.svg"]) {
      expect(pattern.test(skipped), skipped).toBe(false);
    }
    for (const covered of ["/", "/today", "/sign-in", "/api/learner/today", "/api/assets/x/file", "/library/link%3Aabc", "/studio/api/jobs"]) {
      expect(pattern.test(covered), covered).toBe(true);
    }
  });
});
