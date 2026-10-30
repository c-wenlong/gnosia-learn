import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/core";
import { admitSignIn, resetSignInLimits, SIGN_IN_CLIENT_RULE, SIGN_IN_FAILURE_RULE } from "@/lib/auth/sign-in-limit";

import { LOCAL_TOKEN_HEADER, resetLocalTokenForTests } from "./local-token";
import { GET as localAuth } from "./local/route";
import { POST as signIn } from "./sign-in/route";
import { POST as signOut } from "./sign-out/route";

const ORIGIN = "http://localhost:3000";
const SECRET = "0123456789abcdef0123456789abcdef";
const PASSWORD = "correct horse battery staple";
const CONFIG = { secret: SECRET, password: PASSWORD, epoch: "" };

function post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  const body = new URLSearchParams(fields);
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", ...headers },
    body,
  });
}

// A SESSION_EPOCH exported by the shell would sign every cookie below under
// an epoch the assertions do not use; each test starts with none.
const shellEpoch = process.env.SESSION_EPOCH;
beforeEach(() => {
  delete process.env.SESSION_EPOCH;
});
afterEach(() => {
  if (shellEpoch === undefined) delete process.env.SESSION_EPOCH;
  else process.env.SESSION_EPOCH = shellEpoch;
});

function cookieOf(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

describe("POST /api/auth/sign-in", () => {
  const saved = { password: process.env.OWNER_PASSWORD, secret: process.env.AUTH_SECRET };
  beforeEach(() => {
    process.env.OWNER_PASSWORD = "correct horse battery staple";
    process.env.AUTH_SECRET = SECRET;
    resetSignInLimits();
  });
  afterEach(() => {
    process.env.OWNER_PASSWORD = saved.password;
    process.env.AUTH_SECRET = saved.secret;
    vi.useRealTimers();
    vi.unstubAllEnvs();
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
    await expect(verifySession(CONFIG, token, Math.floor(Date.now() / 1000))).resolves.toBe(true);
  });

  it("marks the cookie Secure over https", async () => {
    const request = new Request("https://gnosia.example/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" },
      body: new URLSearchParams({ password: "correct horse battery staple" }),
    });
    const response = await signIn(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/home");
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
    expect(response.headers.get("location")).toBe("/home");
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

  it("accepts a proxied post whose Origin is https while the hop to Node is http", async () => {
    const request = new Request(`${ORIGIN}/api/auth/sign-out`, {
      method: "POST",
      headers: { host: "gnosia.example", "x-forwarded-proto": "https", origin: "https://gnosia.example" },
    });
    expect((await signOut(request)).status).toBe(303);
  });

  it("waits before answering a wrong password", async () => {
    const started = Date.now();
    await signIn(post("/api/auth/sign-in", { password: "wrong" }));
    expect(Date.now() - started).toBeGreaterThanOrEqual(550);
  });

  it("stops taking attempts from one client past the limit, the right password included", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let i = 0; i < SIGN_IN_CLIENT_RULE.limit; i += 1) {
      const ok = await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple" }));
      expect(ok.headers.get("location"), `attempt ${i}`).toBe("/home");
    }
    const refused = await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple" }));
    expect(refused.status).toBe(303);
    expect(refused.headers.get("location")).toMatch(/^\/sign-in\?error=throttled&retry=\d+$/);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(cookieOf(refused)).toBe("");
    // A new X-Forwarded-For per request is not a new client on a server no proxy fronts.
    const rotated = await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple" }, { "x-forwarded-for": "10.9.0.1" }));
    expect(rotated.headers.get("location")).toMatch(/error=throttled/);
    // The window ends.
    vi.setSystemTime(Date.now() + SIGN_IN_CLIENT_RULE.windowMs + 1);
    expect((await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple" }))).headers.get("location")).toBe("/home");
  });

  it("closes sign-in for everyone after too many wrong passwords from all clients together", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    // A wrong password keeps its slot in everyone's window; the per-client
    // limit and the wait are covered above, so the other attempts are
    // admitted directly rather than waited out fifty times.
    const wrong = await signIn(post("/api/auth/sign-in", { password: "guess" }, { "x-forwarded-for": "203.0.113.1" }));
    expect(wrong.headers.get("location")).toBe("/sign-in?error=password");
    for (let i = 1; i < SIGN_IN_FAILURE_RULE.limit; i += 1) admitSignIn(`other-${i}`);
    const owner = await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple" }, { "x-forwarded-for": "198.51.100.1" }));
    expect(owner.headers.get("location")).toMatch(/error=throttled/);
    expect(cookieOf(owner)).toBe("");
  });

  it("keeps the return page through a throttle, and still vets it", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    for (let i = 0; i < SIGN_IN_FAILURE_RULE.limit; i += 1) admitSignIn(`other-${i}`);
    const kept = await signIn(post("/api/auth/sign-in?next=%2Freview", { password: "x", next: "/review" }));
    expect(kept.headers.get("location")).toMatch(/^\/sign-in\?error=throttled&retry=\d+&next=%2Freview$/);
    const offsite = await signIn(post("/api/auth/sign-in?next=%2F%2Fevil.example", { password: "x" }));
    expect(offsite.headers.get("location")).toMatch(/^\/sign-in\?error=throttled&retry=\d+$/);
  });

  it("gives the shared slot back on a right password", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    for (let i = 1; i < SIGN_IN_FAILURE_RULE.limit; i += 1) admitSignIn(`other-${i}`);
    const owner = await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple" }, { "x-forwarded-for": "198.51.100.2" }));
    expect(owner.headers.get("location")).toBe("/home");
    const again = await signIn(post("/api/auth/sign-in", { password: "correct horse battery staple" }, { "x-forwarded-for": "198.51.100.3" }));
    expect(again.headers.get("location")).toBe("/home");
  });

  it("refuses a sibling subdomain and an Origin of null", async () => {
    expect((await signIn(post("/api/auth/sign-in", { password: "x" }, { "sec-fetch-site": "same-site" }))).status).toBe(403);
    const nullOrigin = new Request(`${ORIGIN}/api/auth/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", host: "localhost:3000", origin: "null" },
      body: new URLSearchParams({ password: "correct horse battery staple" }),
    });
    expect((await signIn(nullOrigin)).status).toBe(403);
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

describe("GET /api/auth/local", () => {
  const TOKEN = "launch-secret-0123456789abcdef-0123456789";
  const saved = {
    secret: process.env.AUTH_SECRET,
    password: process.env.OWNER_PASSWORD,
    local: process.env.GNOSIA_LOCAL_TOKEN,
  };
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    process.env.OWNER_PASSWORD = "correct horse battery staple";
    process.env.GNOSIA_LOCAL_TOKEN = TOKEN;
    resetLocalTokenForTests();
  });
  afterEach(() => {
    process.env.AUTH_SECRET = saved.secret;
    process.env.OWNER_PASSWORD = saved.password;
    process.env.GNOSIA_LOCAL_TOKEN = saved.local;
  });

  function get(token?: string, path = "/api/auth/local"): Request {
    return new Request(`${ORIGIN}${path}`, token === undefined ? {} : { headers: { [LOCAL_TOKEN_HEADER]: token } });
  }

  it("redeems the launch token for a real session cookie and lands on /home", async () => {
    const response = await localAuth(get(TOKEN));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/home");
    const cookie = cookieOf(response);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toContain("HttpOnly");
    const token = decodeURIComponent(cookie.split(";")[0].slice(SESSION_COOKIE.length + 1));
    await expect(verifySession(CONFIG, token, Math.floor(Date.now() / 1000))).resolves.toBe(true);
  });

  it("refuses a wrong, absent or extra-character token", async () => {
    for (const token of ["wrong", undefined, `${TOKEN}-x`]) {
      const response = await localAuth(get(token));
      expect(response.status, String(token)).toBe(403);
      expect(cookieOf(response), String(token)).toBe("");
    }
  });

  it("reads the token from the header only, never the URL (S7-09)", async () => {
    const response = await localAuth(get(undefined, `/api/auth/local?token=${TOKEN}`));
    expect(response.status).toBe(403);
  });

  it("treats a token shorter than the secret floor as unset (S7-09)", async () => {
    process.env.GNOSIA_LOCAL_TOKEN = "dev";
    const response = await localAuth(get("dev"));
    expect(response.status).toBe(403);
    expect(cookieOf(response)).toBe("");
  });

  it("mints one cookie per process; the right token again just goes home (S7-09)", async () => {
    expect(cookieOf(await localAuth(get(TOKEN)))).not.toBe("");
    const again = await localAuth(get(TOKEN));
    expect(again.status).toBe(303);
    expect(again.headers.get("location")).toBe("/home");
    expect(cookieOf(again)).toBe("");
  });

  it("refuses everyone when the variable was never set: the deployed case", async () => {
    delete process.env.GNOSIA_LOCAL_TOKEN;
    const response = await localAuth(get(TOKEN));
    expect(response.status).toBe(403);
  });

  it("names the missing configuration instead of minting nothing silently", async () => {
    delete process.env.AUTH_SECRET;
    const response = await localAuth(get(TOKEN));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/sign-in?error=unconfigured");
    expect(cookieOf(response)).toBe("");
  });
});

describe("ending every session (S7-03)", () => {
  const saved = { password: process.env.OWNER_PASSWORD, secret: process.env.AUTH_SECRET, epoch: process.env.SESSION_EPOCH };
  beforeEach(() => {
    process.env.OWNER_PASSWORD = PASSWORD;
    process.env.AUTH_SECRET = SECRET;
    delete process.env.SESSION_EPOCH;
    resetSignInLimits();
  });
  afterEach(() => {
    for (const [name, value] of [["OWNER_PASSWORD", saved.password], ["AUTH_SECRET", saved.secret], ["SESSION_EPOCH", saved.epoch]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  async function sessionToken(): Promise<string> {
    const response = await signIn(post("/api/auth/sign-in", { password: PASSWORD }));
    const cookie = cookieOf(response);
    return decodeURIComponent(cookie.split(";")[0].slice(SESSION_COOKIE.length + 1));
  }

  it("a SESSION_EPOCH bump ends a session and leaves the saved provider keys readable", async () => {
    const { sealKey, openKey } = await import("@gnosia/tutor/server/seal");
    const sealed = sealKey("sk-or-v1-a-saved-provider-key-0001", { secret: SECRET, owner: "local", provider: "openrouter" });
    const token = await sessionToken();
    const now = Math.floor(Date.now() / 1000);
    await expect(verifySession(CONFIG, token, now)).resolves.toBe(true);
    process.env.SESSION_EPOCH = "1";
    await expect(verifySession({ ...CONFIG, epoch: "1" }, token, now)).resolves.toBe(false);
    // The sign-in that follows works under the new epoch.
    await expect(verifySession({ ...CONFIG, epoch: "1" }, await sessionToken(), now)).resolves.toBe(true);
    // AUTH_SECRET did not move, so the key sealed under it still opens.
    expect(openKey(sealed, { secret: SECRET, owner: "local", provider: "openrouter" })).toBe("sk-or-v1-a-saved-provider-key-0001");
  });

  it("a new password ends a session; signing in with it starts one", async () => {
    const token = await sessionToken();
    process.env.OWNER_PASSWORD = "a brand new password";
    const now = Math.floor(Date.now() / 1000);
    await expect(verifySession({ ...CONFIG, password: "a brand new password" }, token, now)).resolves.toBe(false);
    const response = await signIn(post("/api/auth/sign-in", { password: "a brand new password" }));
    const fresh = decodeURIComponent(cookieOf(response).split(";")[0].slice(SESSION_COOKIE.length + 1));
    await expect(verifySession({ ...CONFIG, password: "a brand new password" }, fresh, now)).resolves.toBe(true);
  });

  it("the desktop shell's launch token signs under the current epoch", async () => {
    process.env.SESSION_EPOCH = "7";
    process.env.GNOSIA_LOCAL_TOKEN = "launch-secret-0123456789abcdef-0123456789";
    resetLocalTokenForTests();
    try {
      const response = await localAuth(new Request(`${ORIGIN}/api/auth/local`, { headers: { [LOCAL_TOKEN_HEADER]: "launch-secret-0123456789abcdef-0123456789" } }));
      const token = decodeURIComponent(cookieOf(response).split(";")[0].slice(SESSION_COOKIE.length + 1));
      const now = Math.floor(Date.now() / 1000);
      await expect(verifySession({ ...CONFIG, epoch: "7" }, token, now)).resolves.toBe(true);
      await expect(verifySession(CONFIG, token, now)).resolves.toBe(false);
    } finally {
      delete process.env.GNOSIA_LOCAL_TOKEN;
    }
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
