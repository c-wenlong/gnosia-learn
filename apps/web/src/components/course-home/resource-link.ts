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
  /** A link into this app. It opens in the same tab; an external one opens a new one. */
  internal: boolean;
}

/**
 * A curated resource can point at a page of this app (CS4223's week 3 videos
 * are `/library/manimkc%3A…` links), and the raw path is no place name. So a
 * `/library/` link reads "Library", any other site-relative link reads "This
 * site", an absolute http(s) link keeps its host (minus `www.`), and anything
 * that parses as neither falls back to the raw text. `//host/path` and `/\host/path`
 * point at another site, so they are not internal.
 */
export function resourceLink(url: string): ResourceLink {
  // A browser reads `\` as `/` in a URL, so `/\host/x` goes to another site
  // exactly as `//host/x` does: only a `/` followed by something else is ours.
  if (/^\/(?![/\\])/.test(url)) {
    return { where: url.startsWith("/library/") ? "Library" : "This site", internal: true };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { where: parsed.hostname.replace(/^www\./, ""), internal: false };
    }
  } catch {
    // Not a URL at all: fall through to the raw text.
  }
  return { where: url, internal: false };
}
