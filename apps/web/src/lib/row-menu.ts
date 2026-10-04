import type { AssetParents } from "@self-learn/catalog/state";

import { moduleHref } from "@/lib/course-path";
import { assetFileHref, assetHref, conceptHref } from "@/lib/library";
import { orderedConcepts, pickPlace } from "@/lib/library-source";

/**
 * Which actions a Library row's and card's more menu offers, and in what
 * order (L5 of docs/proposals/library-by-type-and-day.md). Pure and
 * React-free: the server page decides the items per row, and the client
 * `RowMenu` draws what it is handed, so which item shows for which asset has
 * a test of its own and the client holds no rule.
 *
 * Three groups, a divider between each, as Manus's row menu has:
 *
 * 1. where to go: Open, Open the concept (when it explains one, the first in
 *    the graph's order, the one its source line names), Open in course (when
 *    a course holds it: its module's page, or the course's for an asset on
 *    the course itself);
 * 2. what to do to it: Rename (any asset, #370's `asset_name`), Favorite or
 *    Unfavorite (#372's star; left out when the stars could not be read, since
 *    the menu could not say which), Ask (#374: a video, a note or a diagram the
 *    app can read, the kinds the chat route answers for), Mark watched for a
 *    video and Mark read for the rest (`MarkWatched`'s event);
 * 3. the file: Copy link (the asset page's absolute URL), Download (only for
 *    an asset whose bytes are stored, through the file route's `?download=1`).
 *
 * Nothing destructive: an asset is deleted by the import that stops seeing it.
 */

export type RowMenuItem =
  | { action: "open"; label: "Open"; href: string }
  | { action: "concept"; label: "Open the concept"; href: string }
  | { action: "course"; label: "Open in course"; href: string }
  | { action: "rename"; label: "Rename" }
  | { action: "favorite"; label: "Favorite" | "Unfavorite"; on: boolean }
  | { action: "ask"; label: "Ask"; subject: AskSubject }
  | { action: "mark"; label: "Mark watched" | "Mark read"; verb: "watched" | "read" }
  | { action: "copy"; label: "Copy link"; href: string }
  | { action: "download"; label: "Download"; href: string };

/** What Ask names the asset: the chat route answers for these three kinds. */
export type AskSubject = "video" | "note" | "diagram";

/** The menu's items, in groups drawn with a divider between them; no group is empty. */
export type RowMenuSections = RowMenuItem[][];

export interface RowMenuInput {
  id: string;
  kind: string;
  /** Where it came from (`assetParents`); undefined when the read had nothing for it. */
  parents: AssetParents | undefined;
  /** `conceptOrder` of the knowledge base. */
  order: ReadonlyMap<string, number>;
  /** The open `?course=` filter, which wins the place as it does on the source line. */
  course: string | null;
  /** Its bytes resolve: a blob in the store, or a note, log or `.tldr` the database owns. */
  served: boolean;
  /** Starred, not starred, or null when the stars could not be read. */
  starred: boolean | null;
}

/** The kind's Ask subject, or null for a kind Ask does not answer for. */
export function askSubjectOf(kind: string): AskSubject | null {
  return kind === "video" ? "video" : kind === "note" ? "note" : kind === "diagram_svg" ? "diagram" : null;
}

/** `?download=1` on the file route: the same bytes, saved under the asset's name rather than shown. */
export function assetDownloadHref(id: string): string {
  return `${assetFileHref(id)}?download=1`;
}

export function rowMenuItems(input: RowMenuInput): RowMenuSections {
  const go: RowMenuItem[] = [{ action: "open", label: "Open", href: assetHref(input.id) }];
  const [concept] = orderedConcepts(input.parents?.concepts ?? [], input.order);
  if (concept !== undefined) go.push({ action: "concept", label: "Open the concept", href: conceptHref(concept) });
  const place = pickPlace(input.parents?.places ?? [], input.course);
  if (place !== null) {
    go.push({
      action: "course",
      label: "Open in course",
      href: place.module === null ? `/courses/${place.course}` : moduleHref(place.course, place.module),
    });
  }

  const act: RowMenuItem[] = [{ action: "rename", label: "Rename" }];
  if (input.starred !== null) {
    act.push({ action: "favorite", label: input.starred ? "Unfavorite" : "Favorite", on: input.starred });
  }
  const subject = askSubjectOf(input.kind);
  if (subject !== null && input.served) act.push({ action: "ask", label: "Ask", subject });
  act.push(
    input.kind === "video"
      ? { action: "mark", label: "Mark watched", verb: "watched" }
      : { action: "mark", label: "Mark read", verb: "read" },
  );

  const file: RowMenuItem[] = [{ action: "copy", label: "Copy link", href: assetHref(input.id) }];
  if (input.served) file.push({ action: "download", label: "Download", href: assetDownloadHref(input.id) });

  return [go, act, file];
}
