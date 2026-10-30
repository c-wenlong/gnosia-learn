"use server";

import { loadLibraryView, renderLibraryPage, type LibraryParams, type RenderedPage } from "@/components/library/library-view";
import { parseCursor, parseOrder, type StalePage } from "@/lib/library-pages";

/** What the Library asks for when the reader scrolls past the rows it holds. */
export type LibraryPageAnswer = RenderedPage | StalePage | { state: "unreachable" };

/**
 * The next page of the Library's rows (L9 of
 * docs/proposals/library-by-type-and-day.md), drawn on the server exactly as
 * the page draws its first (`loadLibraryView`, `renderLibraryPage`) and
 * handed back as React, the way the previewer's `previewAsset` hands back an
 * asset's body.
 *
 * `href` is the view's own URL (`libraryHref`), so the page after is the one
 * for the same tab, filters, search, sort, grouping and layout; only its
 * query is read. `cursor` is the one the last page handed over: the place of
 * the last row drawn, never an offset (`@/lib/library-pages`). A cursor that
 * does not parse, or whose group has gone, answers `stale`, and the reader is
 * told the Library changed. `order` is the first page's groups in the order
 * it drew them, which later pages keep, so a group that moved meanwhile is
 * not skipped (`pageOf`).
 *
 * Server functions run one at a time per client, which suits a list that
 * asks for one page at a time.
 */
export async function libraryPage(href: string, cursor: string, order?: string[]): Promise<LibraryPageAnswer> {
  const after = parseCursor(cursor);
  const groups = parseOrder(order);
  if (after === null || groups === null || typeof href !== "string") return { state: "stale" };
  // The page drew the first page of this view moments ago: take what it
  // worked out rather than reading the whole catalog again for fifty rows.
  const view = await loadLibraryView(paramsOf(href), { reuse: true });
  if (!view.library.reachable) return { state: "unreachable" };
  return renderLibraryPage(view, after, groups);
}

/** The Library's parameters from its URL, every value kept, as a page's `searchParams` would hold them. */
function paramsOf(href: string): LibraryParams {
  const at = href.indexOf("?");
  const search = new URLSearchParams(at === -1 ? "" : href.slice(at + 1));
  const params: LibraryParams = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    params[key] = values.length === 1 ? values[0] : values;
  }
  return params;
}
