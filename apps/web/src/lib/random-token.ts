/**
 * A random token for a request id: 32 hex characters from `randomUUID`, or a
 * time-and-`Math.random` stand-in where there is none. `randomUUID` needs a
 * secure context, and a LAN address over http is not one. Either form passes
 * the catalog's request id rule (`[A-Za-z0-9_-]{1,128}`). Unique enough to
 * name one retry, never a secret.
 */
export function randomToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
