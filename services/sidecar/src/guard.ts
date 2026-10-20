import type { IncomingMessage } from "node:http";

/**
 * The one guard loopback binding does not replace, copied in shape from the
 * studio service's (`services/studio/src/api.ts`): a web page in the user's
 * own browser. A page can POST to `127.0.0.1` and, while it cannot read the
 * reply, the side effect has already happened — here a paid provider call
 * under the owner's keys, where the studio's was an agent session.
 *
 * Three checks, the same three the studio makes and for the same reasons:
 *
 * 1. **`Host` must be this server.** DNS rebinding is how a page reaches a
 *    loopback service while looking same-origin to the browser.
 * 2. **A body-carrying method must be `application/json`.** Not a safelisted
 *    content type, so a cross-origin `fetch` has to preflight and this
 *    server answers no CORS headers — the browser never sends the request.
 * 3. **`Origin`, when present, must be this server.** `curl`, the Swift
 *    client and the `learn` CLI send none; a browser sends one on every
 *    non-GET request. `Sec-Fetch-Site` is checked the same way where the
 *    browser sends it: a native app sends neither header.
 */

/** The loopback names that are this machine, and nothing that merely resolves to it. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * Is `value` an authority naming this very socket? The port comes from the
 * socket, so an ephemeral listen — the default — is judged against the port
 * it actually got.
 */
function isOwnAuthority(value: string, localPort: number | undefined): boolean {
  const authority = value.includes("://") ? value.slice(value.indexOf("://") + 3) : value;
  const cut = authority.lastIndexOf(":");
  const host = (cut === -1 ? authority : authority.slice(0, cut)).toLowerCase();
  const port = cut === -1 ? "" : authority.slice(cut + 1);
  if (!LOOPBACK.has(host)) return false;
  return localPort === undefined ? port !== "" : port === String(localPort);
}

/**
 * The refusal sentence, or null to let the request through.
 */
export function guard(request: IncomingMessage): string | null {
  const port = request.socket.localPort;
  const host = request.headers.host ?? "";
  if (!isOwnAuthority(host, port)) {
    return (
      `this server answers to 127.0.0.1:${port ?? "?"} and nothing else, and this request arrived ` +
      `addressed to "${host}". A name that resolves here is not this server: that is what DNS ` +
      `rebinding looks like.`
    );
  }
  const method = request.method ?? "GET";
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    const type = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") {
      return (
        `${method} here takes an application/json body and this request is "${type || "untyped"}". ` +
        `A browser cannot send one cross-origin, which is the point.`
      );
    }
  }
  const origin = request.headers.origin;
  if (origin !== undefined && !isOwnAuthority(origin, port)) {
    return `this request's Origin is "${origin}", not this server.`;
  }
  const site = request.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin" && site !== "none") {
    return `this request's Sec-Fetch-Site is "${site}", not this server.`;
  }
  return null;
}
