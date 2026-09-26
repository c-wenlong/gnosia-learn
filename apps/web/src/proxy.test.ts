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
  const saved = { secret: process.env.AUTH_SECRET, password: process.env.OWNER_PASSWORD };
  let token: string;
  beforeEach(async () => {
    process.env.AUTH_SECRET = SECRET;
    process.env.OWNER_PASSWORD = "correct horse battery staple";
    token = await signSession(SECRET, Math.floor(Date.now() / 1000));
  });
  afterEach(() => {
    process.env.AUTH_SECRET = saved.secret;
    process.env.OWNER_PASSWORD = saved.password;
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

  it("fails closed when OWNER_PASSWORD is unset, so removing it ends every session", async () => {
    delete process.env.OWNER_PASSWORD;
    expect((await proxy(get("/today", token))).status).toBe(307);
    expect((await proxy(get("/api/learner/reset", token))).status).toBe(401);
  });

  it("redirects to the host the browser asked for, not the one request.url reports", async () => {
    const headers = new Headers({ host: "192.168.1.20:3000" });
    const lan = await proxy(new NextRequest(`${ORIGIN}/today`, { headers }));
    expect(lan.headers.get("location")).toBe("http://192.168.1.20:3000/sign-in?next=%2Ftoday");
    const proxied = await proxy(
      new NextRequest(`${ORIGIN}/`, {
        headers: new Headers({ host: "gnosia.example", "x-forwarded-proto": "https", cookie: `${SESSION_COOKIE}=${token}` }),
      }),
    );
    expect(proxied.headers.get("location")).toBe("https://gnosia.example/today");
  });

  it("never lets a client-supplied X-Forwarded-Host choose the redirect host, and survives a malformed Host", async () => {
    const spoofed = await proxy(new NextRequest(`${ORIGIN}/today`, { headers: new Headers({ host: "localhost:3000", "x-forwarded-host": "evil.example" }) }));
    expect(spoofed.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Ftoday`);
    const broken = await proxy(new NextRequest(`${ORIGIN}/today`, { headers: new Headers({ host: "not a host", "x-forwarded-proto": "https, http" }) }));
    expect(broken.status).toBe(307);
    expect(broken.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Ftoday`);
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
