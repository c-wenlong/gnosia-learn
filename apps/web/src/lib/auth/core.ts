/**
 * Single-owner sessions: the pure half.
 *
 * Gnosia has one learner and no accounts, so signing in is proving you hold
 * the owner's password. The proof is a cookie carrying an HMAC over its own
 * issue time, signed with `AUTH_SECRET`; nothing is stored server-side, which
 * is what lets the check run in the proxy before any page renders and keeps
 * Postgres out of the request path. When accounts arrive this module is the
 * thing that gets replaced (Auth.js reads the same `AUTH_SECRET` name), and
 * `isSignedIn` in `./session.ts` is the seam every caller goes through.
 *
 * React-free and Node-free on purpose: Web Crypto only, so the same code runs
 * in the proxy, in a route handler and in vitest. Everything that touches
 * `cookies()` or `process.env` lives in `./session.ts`.
 */

export const SESSION_COOKIE = "gnosia_session";

/** Thirty days. The owner signs in on their own machines; a shorter life is a nag. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Clock skew tolerated before a token counts as issued in the future. */
const FUTURE_SKEW_SECONDS = 60;

/** Where a sign-in lands when the form carries no usable `next`. */
export const HOME_PATH = "/home";

/** The variables a deployment has to set before anyone can sign in. */
/**
 * The deployment secrets' environment names. The constants live in
 * `@gnosia/schema/shared` so the BYOK seal in `@gnosia/tutor` reads
 * the same variable this session cookie is signed with.
 */
export { OWNER_PASSWORD_VAR, AUTH_SECRET_VAR, LOCAL_TOKEN_VAR, MIN_SECRET_LENGTH } from "@gnosia/schema/shared";
import { AUTH_SECRET_VAR, MIN_SECRET_LENGTH, OWNER_PASSWORD_VAR } from "@gnosia/schema/shared";

export interface AuthConfig {
  password: string;
  secret: string;
}

export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; missing: string[] };

/**
 * Both variables, or the names of what is missing. An empty string counts as
 * missing, and a secret shorter than `MIN_SECRET_LENGTH` is reported as
 * missing too: a weak signing key is not a configuration, it is a hole.
 */
export function readAuthConfig(env: Record<string, string | undefined>): AuthConfigResult {
  const password = env[OWNER_PASSWORD_VAR]?.trim() ?? "";
  const secret = env[AUTH_SECRET_VAR]?.trim() ?? "";
  const missing: string[] = [];
  if (password.length === 0) missing.push(OWNER_PASSWORD_VAR);
  if (secret.length < MIN_SECRET_LENGTH) missing.push(AUTH_SECRET_VAR);
  return missing.length > 0 ? { ok: false, missing } : { ok: true, config: { password, secret } };
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Byte-wise comparison of two values of the same, public length (a session
 * signature against the one it should be). Its time does not depend on where
 * they differ. Unequal lengths are simply unequal: this is not for secrets
 * whose length is itself worth hiding, which go through `secretsEqual`.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  return equalBytes(x, y);
}

function equalBytes(x: Uint8Array, y: Uint8Array): boolean {
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * A key made once per process, only ever used to blind the two sides of a
 * `secretsEqual`. Nobody outside the process knows it, so nobody can work out
 * a digest ahead of time.
 */
let blindingKey: Promise<CryptoKey> | null = null;

function blinding(): Promise<CryptoKey> {
  blindingKey ??= crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return blindingKey;
}

/**
 * Whether a typed secret equals the real one, without its length or its
 * contents showing in the time taken.
 *
 * A byte loop over the raw strings walks `max(len(input), len(expected))`, so
 * an attacker growing the input sees the time stay flat until it passes the
 * real length: the length leaks. Both sides go through HMAC-SHA256 under a
 * per-process key first, and the loop compares two 32-byte digests, so every
 * comparison does the same work whatever was typed.
 */
export async function secretsEqual(input: string, expected: string): Promise<boolean> {
  const key = await blinding();
  const [x, y] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(input)),
    crypto.subtle.sign("HMAC", key, encoder.encode(expected)),
  ]);
  return equalBytes(new Uint8Array(x), new Uint8Array(y));
}

/** Whether the typed password is the owner's. Constant-time; never trims. */
export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  if (expected.length === 0) return false;
  return secretsEqual(input, expected);
}

async function signature(secret: string, issuedAt: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`gnosia-session:${issuedAt}`));
  return toBase64Url(new Uint8Array(mac));
}

/**
 * A session token: `<issuedAt>.<base64url HMAC-SHA256>`. `issuedAt` is whole
 * seconds since the epoch and is the only claim; the cookie's own `Max-Age`
 * is a courtesy to the browser, the expiry that counts is checked in
 * `verifySession` against this number.
 */
export async function signSession(secret: string, issuedAt: number): Promise<string> {
  if (!Number.isInteger(issuedAt) || issuedAt < 0) throw new RangeError("issuedAt must be a non-negative integer of seconds");
  return `${issuedAt}.${await signature(secret, issuedAt)}`;
}

/**
 * True for a token this secret signed, issued no more than `SESSION_TTL_SECONDS`
 * ago and not in the future. Anything malformed is simply false: the caller
 * only ever asks "is this visitor the owner", never "why not".
 */
export async function verifySession(
  secret: string,
  token: string | undefined | null,
  nowSeconds: number,
): Promise<boolean> {
  if (!token || secret.length === 0) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const issuedAtText = token.slice(0, dot);
  if (!/^\d{1,12}$/.test(issuedAtText)) return false;
  const issuedAt = Number(issuedAtText);
  if (issuedAt > nowSeconds + FUTURE_SKEW_SECONDS) return false;
  if (nowSeconds - issuedAt > SESSION_TTL_SECONDS) return false;
  const expected = await signature(secret, issuedAt);
  return constantTimeEqual(token.slice(dot + 1), expected);
}

/**
 * The path a sign-in returns to. Only a same-origin absolute path is allowed:
 * it has to start with a single `/`, so `//evil.example` (a scheme-relative
 * URL) and `/\evil.example` (which browsers normalise to the same thing) are
 * refused, as is anything with a scheme. The sign-in page itself is refused
 * too, or a stale link would loop. Everything else falls back to `HOME_PATH`.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return HOME_PATH;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return HOME_PATH;
  if (/[\u0000-\u001f\s]/.test(next)) return HOME_PATH;
  const path = next.split(/[?#]/)[0];
  if (path === "/" || path === "/sign-in" || path.startsWith("/api/")) return HOME_PATH;
  return next;
}

/**
 * The origin the browser addressed, from the request headers.
 *
 * `request.url` under `next start` always names `localhost`, so anything that
 * has to name the app's own origin (a redirect, the same-origin check) reads
 * `Host` instead: it is what the browser typed, and Vercel forwards it
 * unchanged. `X-Forwarded-Proto` supplies the scheme behind a proxy that
 * terminated TLS. `X-Forwarded-Host` is deliberately *not* read: a client can
 * send it to a directly exposed `next start`, and a redirect built from it
 * would point wherever the client said. Only the first value of a
 * comma-separated chain counts, and anything that does not form a valid URL
 * falls back to `fallback` rather than throwing on the request path.
 */
export function originFromHeaders(headers: Headers, fallback: string): string {
  const first = (value: string | null) => value?.split(",")[0]?.trim() ?? "";
  const host = first(headers.get("host"));
  if (host.length === 0) return fallback;
  const forwardedProto = first(headers.get("x-forwarded-proto"));
  const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : new URL(fallback).protocol.replace(/:$/, "");
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return fallback;
  }
}

/**
 * Whether a request came from a page on this site, or from no page at all.
 *
 * The one same-origin rule every guarded route uses: the auth routes, the
 * learner and agent routes (`enforceSameOrigin` in `@/lib/agent/guard`) and
 * the studio proxy. In order:
 *
 * 1. `Sec-Fetch-Site`, which a browser always sends and a page cannot forge:
 *    anything but `same-origin` or `none` (a typed address) is refused. A
 *    sibling subdomain is `same-site`, and is refused too.
 * 2. `Origin`, when present, must name the host the browser addressed
 *    (`originFromHeaders`: `Host`, never `X-Forwarded-Host`, which a client
 *    can send to a directly exposed `next start`). The literal `null` a
 *    sandboxed frame, a `data:` page or a cross-site redirect sends is refused.
 *    The scheme is left out: behind a proxy that terminated TLS the page is
 *    https and the hop to Node is http.
 * 3. With no `Origin`, the request passes when the browser said
 *    `same-origin` (a same-origin GET carries no `Origin`), or when the caller
 *    opts in with `allowMissing` for clients that send neither header (curl,
 *    a test). Without the opt-in, a request with neither is refused.
 *
 * None of this stops a program, which can send any header it likes. It stops
 * a page on another site from acting with this browser's cookie.
 */
export function requestIsSameOrigin(request: Request, options: { allowMissing?: boolean } = {}): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (origin === null || origin === "") return site === "same-origin" || options.allowMissing === true;
  if (origin === "null") return false;
  try {
    return new URL(origin).host === new URL(originFromHeaders(request.headers, request.url)).host;
  } catch {
    return false;
  }
}

/**
 * The paths a visitor may reach without a session: the landing page, the
 * sign-in page and the two auth routes. Everything else is the owner's.
 */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/sign-in" || pathname.startsWith("/api/auth/");
}

/**
 * Whether a request for this path wants JSON rather than a redirect when it
 * is unauthenticated: the app's own API and the studio's proxied one. A
 * `fetch` from a page that lost its session should see a 401 it can show,
 * not a 200 carrying the sign-in page's HTML.
 */
export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.startsWith("/studio/api/");
}

