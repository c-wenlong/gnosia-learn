/**
 * Where a resource row's link goes, for its meta line and its `<a>`.
 *
 * Pure and React-free, and beside `ModuleResources.tsx` for the same reason
 * `asset-meta.ts` sits beside `AssetCard.tsx`: a `"use client"` module's
 * exports are client references, so a function other code wants to call
 * lives in a module of its own.
 */

export interface ResourceLink {
  /** What the meta line prints where a host goes: `arxiv.org`, `Library`, `This site`. */
  where: string;
  /**
   * What the row's link points at: the URL with the characters a browser
   * drops removed, or null when it is neither an http(s) link nor a path on
   * this site (`javascript:`, `data:`, `mailto:`, plain text), which the row
   * then shows as text rather than as a link.
   */
  href: string | null;
  /** A link into this app. It opens in the same tab; an external one opens a new one. */
  internal: boolean;
}

/**
 * A curated resource can point at a page of this app (CS4223's week 3 videos
 * are `/library/manimkc%3A…` links), and the raw path is no place name. So a
 * `/library/` link reads "Library", any other site-relative link reads "This
 * site", an absolute http(s) link keeps its host (minus `www.`), and anything
 * else falls back to the raw text with no link at all. `//host/path` and
 * `/\host/path` point at another site, so they are not internal.
 *
 * A stored URL is not trusted: a curated one and one that came in through an
 * import are checked nowhere else. A browser removes tabs and line breaks
 * anywhere in a URL and control characters and spaces at either end, so
 * `"/\t/evil.example"` would go to `//evil.example`; the test runs on the URL
 * as the browser will read it.
 */
export function resourceLink(url: string): ResourceLink {
  const clean = url.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "");
  // A browser reads `\` as `/` in a URL, so `/\host/x` goes to another site
  // exactly as `//host/x` does: only a `/` followed by something else is ours.
  if (/^\/(?![/\\])/.test(clean)) {
    return { where: clean.startsWith("/library/") ? "Library" : "This site", href: clean, internal: true };
  }
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { where: parsed.hostname.replace(/^www\./, ""), href: clean, internal: false };
    }
  } catch {
    // Not a URL at all: fall through to the raw text.
  }
  return { where: url, href: null, internal: false };
}
