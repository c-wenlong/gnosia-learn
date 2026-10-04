"use server";

import { loadPreview, type PreviewAnswer } from "@/components/library/preview-content";

/**
 * What the Library's previewer asks when it opens an asset (L6 of
 * docs/proposals/library-by-type-and-day.md): the header's facts and the
 * asset page's body, rendered on the server and handed back as React.
 *
 * **Why a server function and not an intercepted route.** Next's docs
 * recommend an intercepting route in a parallel slot for a detail over a
 * list, which masks the URL as `/library/<id>`; a reload of that URL renders
 * the full page, not the list with the panel over it. The previewer's URL is
 * `/library?open=<id>` instead, so a reload and a link reopen the panel over
 * the view the reader was in, and the page stays the deep link. A search
 * parameter cannot select an intercepting route, and a parallel slot keyed
 * on it would re-render the Library's own page (every row, the whole
 * catalog read) on each open and close, since a page segment is keyed by its
 * search parameters. So the panel sets `?open=` with the native History API,
 * which Next keeps in step without a server round trip, and asks this
 * function for the body alone. Server functions run one at a time per
 * client, which suits a panel that shows one asset at a time.
 */
export async function previewAsset(id: string): Promise<PreviewAnswer> {
  return loadPreview(id);
}
