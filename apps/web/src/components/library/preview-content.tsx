import "server-only";

import type { ReactNode } from "react";

import { assetDisplayTitle, assetKindLabel, familyOf } from "@/components/asset-meta";
import { FavoriteButton } from "@/components/library/AssetActions";
import { AssetBody } from "@/components/library/AssetBody";
import { loadAssetBody } from "@/components/library/asset-body-data";
import { MarkWatched } from "@/components/library/MarkWatched";
import { loadAssetDetail, loadAssetParents, loadFavorite, loadPlayback } from "@/lib/asset-library";
import { dayKey } from "@/lib/days";
import { loadKnowledgeBase } from "@/lib/learner-store";
import { assetHref, conceptHref, explainedConcepts } from "@/lib/library";
import { parseOpen, previewConversation, previewDate, type PreviewHeader } from "@/lib/library-preview";
import { appTimeZone } from "@/lib/time-zone";

/** What the previewer is handed for one asset. */
export type PreviewAnswer =
  | { state: "ok"; id: string; header: PreviewHeader; body: ReactNode }
  /** The catalog answered and holds no such row this owner can read. */
  | { state: "missing"; id: string }
  /** The catalog did not answer, so whether it exists is unknown. */
  | { state: "unreachable"; id: string };

/**
 * The Library previewer's content for one asset (L6 of
 * docs/proposals/library-by-type-and-day.md): the asset page's own
 * `AssetBody` from the page's own `loadAssetBody`, so the two cannot drift,
 * with Mark read and the star above a non-video's words, and the header's
 * facts.
 *
 * Called by `previewAsset`, the server function the panel asks when it
 * opens, and by the Library page itself when it is rendered with `?open=`
 * (a reload, a link), so that first paint already holds the body. The page
 * calling it is also what puts the body's client components (the player,
 * Mark read, the star) in the Library route's client manifest: a server
 * function's answer can only draw client components its route already
 * knows, and without the page's import the panel failed with "Could not
 * find the module … in the React Client Manifest".
 *
 * Every read is the owner's: `loadAssetDetail` and the playback and favorite
 * reads scope themselves to `currentOwner()`, so an id another owner holds
 * answers `missing`, as their page would 404.
 */
export async function loadPreview(requested: string): Promise<PreviewAnswer> {
  const id = typeof requested === "string" ? parseOpen(requested) : null;
  if (id === null) return { state: "missing", id: String(requested) };

  const [detail, { kb }, playback, favorite, parents] = await Promise.all([
    loadAssetDetail(id),
    loadKnowledgeBase(),
    loadPlayback(id),
    loadFavorite(id),
    loadAssetParents(id),
  ]);
  const { asset, derivations, reachable, notes, concepts } = detail;
  if (asset === null) return { state: reachable ? "missing" : "unreachable", id };

  const name = assetDisplayTitle(asset);
  const zone = appTimeZone();
  const body = await loadAssetBody(asset, derivations.derived);
  const first = explainedConcepts(concepts, new Map(kb.concepts.map((c) => [c.id, c])))[0];
  const family = familyOf(asset.kind);

  const when = previewDate(asset.createdAt, asset.editedAt, { now: new Date(), timeZone: zone });
  const header: PreviewHeader = {
    family,
    kindLabel: assetKindLabel(asset.kind),
    title: name.text,
    plainName: name.source !== "title",
    date: when.date,
    dateTime: when.dateTime,
    concept: first === undefined ? null : { href: conceptHref(first.slug), title: first.title },
    conversation: previewConversation(parents),
    download: body.servable ? { href: body.fileHref, filename: body.downloadName } : null,
    page: assetHref(asset.id),
    wide: asset.kind === "video" || asset.kind === "diagram_svg",
  };

  const isVideo = asset.kind === "video" && body.servable;
  return {
    state: "ok",
    id,
    header,
    body: (
      <div className="flex min-w-0 flex-col gap-4">
        {/* A video tracks itself and carries its own Favorite, Ask and
            Download under the player; anything else gets Mark read and the
            star above its words, as the page puts them beside its title. */}
        {!isVideo && (
          <div className="flex flex-wrap items-start gap-2.5">
            <MarkWatched assetId={asset.id} verb="read" lastWatchedDay={null} />
            <FavoriteButton assetId={asset.id} initial={favorite !== null} />
          </div>
        )}
        <AssetBody
          data={body}
          title={name.text}
          notes={notes}
          variant="preview"
          video={{
            // The panel's header names it.
            heading: null,
            playback,
            watchedDay: playback?.watchedAt ? dayKey(playback.watchedAt, zone) : null,
            favorite: favorite !== null,
          }}
        />
      </div>
    ),
  };
}
