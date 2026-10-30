import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_COOKIE, signSession } from "@/lib/auth/core";

import { config, proxy } from "./proxy";

const ORIGIN = "http://localhost:3000";
const SECRET = "0123456789abcdef0123456789abcdef";
const PASSWORD = "correct horse battery staple";
const CONFIG = { secret: SECRET, password: PASSWORD, epoch: "" };

function get(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

/** Put an environment variable back as it was: unset when it was unset, since assigning `undefined` stores the string "undefined". */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("proxy", () => {
  const saved = { secret: process.env.AUTH_SECRET, password: process.env.OWNER_PASSWORD, epoch: process.env.SESSION_EPOCH };
  let token: string;
  beforeEach(async () => {
    process.env.AUTH_SECRET = SECRET;
    process.env.OWNER_PASSWORD = PASSWORD;
    delete process.env.SESSION_EPOCH;
    token = await signSession(CONFIG, Math.floor(Date.now() / 1000));
  });
  afterEach(() => {
    restoreEnv("AUTH_SECRET", saved.secret);
    restoreEnv("OWNER_PASSWORD", saved.password);
    restoreEnv("SESSION_EPOCH", saved.epoch);
  });

  it("lets an anonymous visitor see the landing page, sign-in and the auth routes", async () => {
    for (const path of ["/", "/sign-in", "/sign-in?next=%2Fhome", "/api/auth/sign-in"]) {
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
    for (const path of ["/api/learner/home", "/studio/api/jobs"]) {
      const response = await proxy(get(path));
      expect(response.status, path).toBe(401);
      expect(await response.json()).toEqual({ error: "UNAUTHENTICATED", signIn: "/sign-in" });
    }
  });

  it("lets the owner through, and sends them home from the landing and sign-in pages", async () => {
    expect((await proxy(get("/home", token))).status).toBe(200);
    expect((await proxy(get("/api/learner/home", token))).status).toBe(200);
    for (const path of ["/", "/sign-in"]) {
      const response = await proxy(get(path, token));
      expect(response.status, path).toBe(307);
      expect(response.headers.get("location"), path).toBe(`${ORIGIN}/home`);
    }
  });

  it("treats a forged or stale cookie as anonymous", async () => {
    const forged = await signSession({ ...CONFIG, secret: `${SECRET}x` }, Math.floor(Date.now() / 1000));
    expect((await proxy(get("/home", forged))).status).toBe(307);
    const stale = await signSession(CONFIG, Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 31);
    expect((await proxy(get("/home", stale))).status).toBe(307);
  });

  it("ends the session when OWNER_PASSWORD changes or SESSION_EPOCH is bumped (S7-03)", async () => {
    expect((await proxy(get("/home", token))).status).toBe(200);
    process.env.OWNER_PASSWORD = "a brand new password";
    expect((await proxy(get("/home", token))).status).toBe(307);
    expect((await proxy(get("/api/learner/settings", token))).status).toBe(401);
    process.env.OWNER_PASSWORD = PASSWORD;
    expect((await proxy(get("/home", token))).status).toBe(200);
    process.env.SESSION_EPOCH = "2";
    expect((await proxy(get("/home", token))).status).toBe(307);
    const fresh = await signSession({ ...CONFIG, epoch: "2" }, Math.floor(Date.now() / 1000));
    expect((await proxy(get("/home", fresh))).status).toBe(200);
  });

  it("fails closed when AUTH_SECRET is unset, even with a cookie", async () => {
    delete process.env.AUTH_SECRET;
    const response = await proxy(get("/home", token));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Fhome`);
    expect((await proxy(get("/"))).status).toBe(200);
  });

  it("fails closed when OWNER_PASSWORD is unset, so removing it ends every session", async () => {
    delete process.env.OWNER_PASSWORD;
    expect((await proxy(get("/home", token))).status).toBe(307);
    expect((await proxy(get("/api/learner/reset", token))).status).toBe(401);
  });

  it("redirects to the host the browser asked for, not the one request.url reports", async () => {
    const headers = new Headers({ host: "192.168.1.20:3000" });
    const lan = await proxy(new NextRequest(`${ORIGIN}/home`, { headers }));
    expect(lan.headers.get("location")).toBe("http://192.168.1.20:3000/sign-in?next=%2Fhome");
    const proxied = await proxy(
      new NextRequest(`${ORIGIN}/`, {
        headers: new Headers({ host: "gnosia.example", "x-forwarded-proto": "https", cookie: `${SESSION_COOKIE}=${token}` }),
      }),
    );
    expect(proxied.headers.get("location")).toBe("https://gnosia.example/home");
  });

  it("never lets a client-supplied X-Forwarded-Host choose the redirect host, and survives a malformed Host", async () => {
    const spoofed = await proxy(new NextRequest(`${ORIGIN}/home`, { headers: new Headers({ host: "localhost:3000", "x-forwarded-host": "evil.example" }) }));
    expect(spoofed.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Fhome`);
    const broken = await proxy(new NextRequest(`${ORIGIN}/home`, { headers: new Headers({ host: "not a host", "x-forwarded-proto": "https, http" }) }));
    expect(broken.status).toBe(307);
    expect(broken.headers.get("location")).toBe(`${ORIGIN}/sign-in?next=%2Fhome`);
  });

  it("gives every page a policy with a fresh nonce, on the response and on the request Next renders from", async () => {
    const policies: string[] = [];
    for (const [path, cookie] of [["/", undefined], ["/sign-in", undefined], ["/home", token], ["/home", token]] as const) {
      const response = await proxy(get(path, cookie));
      const policy = response.headers.get("content-security-policy");
      expect(policy, path).not.toBeNull();
      const nonce = /'nonce-([^']+)'/.exec(policy ?? "")?.[1];
      expect(nonce, path).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(policy, path).toContain("frame-ancestors 'none'");
      expect(policy, path).not.toContain("'unsafe-inline' 'strict-dynamic'");
      // NextResponse.next({ request }) hands the rewritten request headers to
      // the renderer through these two response headers.
      expect(response.headers.get("x-middleware-request-x-nonce"), path).toBe(nonce);
      expect(response.headers.get("x-middleware-request-content-security-policy"), path).toBe(policy);
      policies.push(policy ?? "");
    }
    expect(new Set(policies).size).toBe(policies.length);
  });

  it("lets a client-sent nonce choose nothing", async () => {
    const headers = new Headers({ cookie: `${SESSION_COOKIE}=${token}`, "x-nonce": "attacker", "content-security-policy": "script-src *" });
    const response = await proxy(new NextRequest(`${ORIGIN}/home`, { headers }));
    expect(response.headers.get("x-middleware-request-x-nonce")).not.toBe("attacker");
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(response.headers.get("content-security-policy"));
  });

  it("leaves an API answer's policy to its route handler", async () => {
    for (const path of ["/api/learner/home", "/api/assets/x/file", "/studio/api/jobs"]) {
      const response = await proxy(get(path, token));
      expect(response.headers.get("content-security-policy"), path).toBeNull();
    }
  });

  it("matcher skips static output and image files but covers the API", () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    for (const skipped of ["/_next/static/chunks/a.js", "/_next/image?url=x", "/icon.png", "/opengraph-image.png", "/banner.png", "/file.svg"]) {
      expect(pattern.test(skipped), skipped).toBe(false);
    }
    for (const covered of ["/", "/home", "/sign-in", "/api/learner/home", "/api/assets/x/file", "/library/link%3Aabc", "/studio/api/jobs"]) {
      expect(pattern.test(covered), covered).toBe(true);
    }
  });
});
