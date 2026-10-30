import { checkRateLimit, type RateLimitRule, type RateLimitStore } from "@gnosia/tutor/guards";

/**
 * How many passwords anyone gets to try (S7-02 of the 2026-10 audit).
 *
 * The sign-in route used to wait 600 ms after a wrong password and nothing
 * else, so N parallel connections were N guesses every 600 ms. Two limits
 * now sit in front of the comparison:
 *
 * 1. **Per client**: `SIGN_IN_CLIENT_RULE` attempts per window, right or
 *    wrong, keyed by `clientIp`. That is the client's address only behind a
 *    proxy that sets it (`VERCEL=1` or `TRUST_PROXY=1`); on a directly
 *    exposed `next start` the forwarded headers are the client's own words,
 *    so every request shares one bucket and this limit counts everyone.
 * 2. **Everyone together**: `SIGN_IN_FAILURE_RULE` wrong passwords per
 *    window across all clients. Past it, every sign-in is refused until the
 *    window ends, the owner's included. That is the trade: a stranger can keep
 *    the form shut, but cannot keep guessing. The desktop shell signs in with
 *    its launch token (`/api/auth/local`), which this does not touch.
 *
 * At most 4,800 guesses a day get through, which is nothing against a long
 * password. The state is in this process's memory, so on Vercel each
 * instance counts on its own; the platform's WAF rule on `/api/auth/sign-in`
 * (docs/DEPLOYMENT.md) is still the bound across instances.
 */

/** Attempts per client in a window, right or wrong. */
export const SIGN_IN_CLIENT_RULE: RateLimitRule = { limit: 10, windowMs: 15 * 60_000 };

/** Wrong passwords from everyone together in a window. */
export const SIGN_IN_FAILURE_RULE: RateLimitRule = { limit: 50, windowMs: 15 * 60_000 };

export type SignInVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

interface FailureWindow {
  count: number;
  resetAt: number;
}

let clients: RateLimitStore = new Map();
let failures: FailureWindow | null = null;

/**
 * Whether this client may try a password now. Counts the attempt against the
 * client when it may. Call before reading the body.
 */
export function admitSignIn(client: string, now: number = Date.now()): SignInVerdict {
  if (failures !== null && failures.resetAt <= now) failures = null;
  if (failures !== null && failures.count >= SIGN_IN_FAILURE_RULE.limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((failures.resetAt - now) / 1000)) };
  }
  const verdict = checkRateLimit(clients, client, SIGN_IN_CLIENT_RULE, now);
  return verdict.allowed ? { allowed: true } : { allowed: false, retryAfterSeconds: verdict.retryAfterSeconds };
}

/** Count one wrong password against everyone's window. */
export function recordSignInFailure(now: number = Date.now()): void {
  if (failures === null || failures.resetAt <= now) failures = { count: 0, resetAt: now + SIGN_IN_FAILURE_RULE.windowMs };
  failures.count += 1;
}

/** For tests: forget every attempt. */
export function resetSignInLimits(): void {
  clients = new Map();
  failures = null;
}
