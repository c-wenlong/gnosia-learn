import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/core";

import { POST as signIn } from "./sign-in/route";
import { POST as signOut } from "./sign-out/route";

const ORIGIN = "http://localhost:3000";
const SECRET = "0123456789abcdef0123456789abcdef";

function post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  const body = new URLSearchParams(fields);
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", ...headers },
    body,
  });
}

function cookieOf(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

describe("POST /api/auth/sign-in", () => {
  const saved = { password: process.env.OWNER_PASSWORD, secret: process.env.AUTH_SECRET };
  beforeEach(() => {
    process.env.OWNER_PASSWORD = "correct horse battery staple";
    process.env.AUTH_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.OWNER_PASSWORD = saved.password;
    process.env.AUTH_SECRET = saved.secret;
  });

  it("sets a verifiable session cookie and lands on next", async () => {
    const response = await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple", next: "/learn/bkt" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/learn/bkt");
    const cookie = cookieOf(response);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).not.toContain("Secure");
    const token = decodeURIComponent(cookie.split(";")[0].slice(SESSION_COOKIE.length + 1));
    await expect(verifySession(SECRET, token, Math.floor(Date.now() / 1000))).resolves.toBe(true);
  });

  it("marks the cookie Secure over https", async () => {
    const request = new Request("https://gnosia.example/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" },
      body: new URLSearchParams({ password: "correct horse battery staple" }),
    });
    const response = await signIn(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/today");
    expect(cookieOf(response)).toContain("Secure");
  });

  it("marks the cookie Secure behind a proxy that terminated TLS", async () => {
    const request = new Request("http://localhost:3000/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", "x-forwarded-proto": "https" },
      body: new URLSearchParams({ password: "correct horse battery staple" }),
    });
    expect(cookieOf(await signIn(request))).toContain("Secure");
  });

  it("accepts a form posted from a LAN address, where request.url still says localhost", async () => {
    const request = new Request(`${ORIGIN}/api/auth/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", host: "192.168.1.20:3000", origin: "http://192.168.1.20:3000" },
      body: new URLSearchParams({ password: "correct horse battery staple", next: "/review" }),
    });
    const response = await signIn(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/review");
    expect(cookieOf(response)).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
  });

  it("refuses an off-origin next and lands on home instead", async () => {
    const response = await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple", next: "//evil.example" }));
    expect(response.headers.get("location")).toBe("/today");
  });

  it("bounces a wrong password back to the form with no cookie, keeping next", async () => {
    const response = await signIn(post("/api/auth/sign-in", { password: "wrong", next: "/review" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/sign-in?error=password&next=%2Freview");
    expect(cookieOf(response)).toBe("");
  });

  it("says so when the deployment has no password or secret", async () => {
    delete process.env.OWNER_PASSWORD;
    const response = await signIn(post("/api/auth/sign-in", { password: "anything" }));
    expect(response.headers.get("location")).toBe("/sign-in?error=unconfigured");
    expect(cookieOf(response)).toBe("");
  });

  it("refuses a cross-site post before reading the body", async () => {
    const response = await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple" }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    const byOrigin = await signIn(
      new Request(`${ORIGIN}/api/auth/sign-in`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", host: "localhost:3000", origin: "https://evil.example" },
        body: new URLSearchParams({ password: "correct horse battery staple" }),
      }),
    );
    expect(byOrigin.status).toBe(403);
  });
});

describe("POST /api/auth/sign-out", () => {
  it("clears the cookie and lands on the landing page", async () => {
    const response = await signOut(post("/api/auth/sign-out", {}));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    const cookie = cookieOf(response);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(cookie).toContain("Max-Age=0");
  });

  it("refuses a cross-site post", async () => {
    const response = await signOut(post("/api/auth/sign-out", {}, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
  });
});
