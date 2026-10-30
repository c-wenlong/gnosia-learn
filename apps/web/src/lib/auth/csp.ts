/**
 * The Content-Security-Policy every page carries, and the other response
 * headers that go with it.
 *
 * Two copies of the policy reach a browser, and both are built here so they
 * cannot drift:
 *
 * - **With a nonce**, set by the proxy (`src/proxy.ts`) on every page it lets
 *   through. Every page is dynamic (the root layout reads cookies), so a fresh
 *   nonce per request is possible, and Next attaches it to its own scripts by
 *   reading this header off the request. `'strict-dynamic'` then lets those
 *   scripts load their chunks. An injected `<script>` has no nonce and does not
 *   run, whatever page text or model output it came in on.
 * - **Without one**, from `headers()` in `next.config.ts`, for the pages the
 *   proxy's matcher skips (a path ending in an image extension, such as
 *   `/learn/x.png`). Those still need a policy, and with no nonce to name the
 *   two inline scripts in the layouts (the theme and motion scripts), scripts
 *   fall back to `'self' 'unsafe-inline'`. When both copies arrive a browser
 *   enforces each, so the nonce copy still decides inline scripts.
 *
 * The rest of the policy is the same in both. What each source allows, and why:
 *
 * | Directive | Allows | Because |
 * | --- | --- | --- |
 * | `style-src` | `'self' 'unsafe-inline'` | React `style` attributes, KaTeX's inline sizes and next/font all write inline styles. A nonce here would switch `'unsafe-inline'` off and break all three. |
 * | `img-src` | `'self' data: blob:` | Covers, posters, diagrams and avatars are served by this app; the studio's live tile decodes a fetched picture through a `blob:` URL. No other host, so a model reply cannot turn an image into a beacon carrying page text to a server elsewhere. |
 * | `media-src` | `'self' blob:` | Videos come from `/api/assets/*`. |
 * | `font-src` | `'self' data:` | next/font serves its files from `/_next/static`; KaTeX's stylesheet may inline small faces. |
 * | `connect-src` | `'self'` | Every `fetch` and `EventSource` is to this app; provider calls are made by the server. Development adds `ws:` for hot reload. |
 * | `frame-src` | `'self'` plus loopback on any port | The studio's live canvas (`/studio/d/<name>`) frames `tldrawkc serve` at `http://127.0.0.1:<port>`, a port it picks per mirror. |
 * | `object-src` | `'self'` | A stored PDF is drawn in an `<object>` from `/api/assets/<id>/file` (`AssetBody`); `'none'` would blank it. Plugins from any other origin stay off. |
 * | `frame-ancestors` | `'none'` | No page here is meant to be framed. |
 * | `base-uri`, `form-action` | `'self'` | A `<base>` or a form pointing elsewhere is an injection, never a feature. |
 *
 * There is no `upgrade-insecure-requests`: the homeserver serves plain http
 * over Tailscale, and the studio frames plain-http loopback.
 */

/** The loopback origins `tldrawkc serve` binds, on whatever port it picked. */
const MIRROR_ORIGINS = ["http://127.0.0.1:*", "http://localhost:*"];

export interface PolicyOptions {
  /** A fresh per-request nonce, or null for the copy with none. */
  nonce: string | null;
  /** `next dev`: React needs `eval` for its error stacks, and hot reload a websocket. */
  dev: boolean;
}

export function contentSecurityPolicy({ nonce, dev }: PolicyOptions): string {
  const script =
    nonce === null
      ? ["'self'", "'unsafe-inline'"]
      : [`'nonce-${nonce}'`, "'strict-dynamic'"];
  if (dev) script.push("'unsafe-eval'");
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", script],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["media-src", ["'self'", "blob:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", dev ? ["'self'", "ws:", "wss:"] : ["'self'"]],
    ["frame-src", ["'self'", ...MIRROR_ORIGINS]],
    ["object-src", ["'self'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

/**
 * A nonce: 16 random bytes, base64. Web Crypto, so it runs in the proxy.
 */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The request header the proxy passes the nonce to the layouts in. */
export const NONCE_HEADER = "x-nonce";

/**
 * The headers every response carries, API included.
 *
 * `X-Frame-Options` is `SAMEORIGIN` here, not `DENY`, because the PDF
 * `<object>` frames `/api/assets/<id>/file` from this origin. Pages override
 * it with `DENY` (see `PAGE_HEADERS`), and their CSP says `frame-ancestors
 * 'none'`, which a current browser reads instead.
 */
export const BASE_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** Added on top of `BASE_HEADERS` for every page (anything outside the API). */
export function pageHeaders(dev: boolean): Array<{ key: string; value: string }> {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ nonce: null, dev }) },
  ];
}

/**
 * The `source` pattern for pages: every path except the two API trees and
 * Next's own output. A route handler that serves a document sets its own
 * policy (the asset file route's `ASSET_CSP`, which sandboxes it), and a page
 * policy laid over it would only get in the way.
 */
export const PAGE_SOURCE = "/((?!api/|studio/api/|_next/).*)";
