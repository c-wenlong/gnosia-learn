import { notFound } from "next/navigation";

import { assetDisplayTitle, assetKindLabel } from "@gnosia/tutor/asset-meta";
import { PAGE_ENTER } from "@/components/PageLoading";
import { AssetBody } from "@/components/library/AssetBody";
import { loadAssetBody } from "@/components/library/asset-body-data";
import { DownloadButton, FavoriteButton } from "@/components/library/AssetActions";
import { AskableTitle } from "@/components/library/AskableTitle";
import { AssetTabs, assetTabItems, type AssetTabsInput } from "@/components/library/AssetTabs";
import { AssetTitle } from "@/components/library/AssetTitle";
import { WatchProgress } from "@/components/library/WatchProgress";
import { MarkWatched } from "@/components/library/MarkWatched";
import { Notice } from "@/components/ui/Notice";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { TextLink } from "@/components/ui/TextLink";
import { loadAssetDetail, loadFavorite, loadLastWatched, loadPlayback } from "@/lib/asset-library";
import { appTimeZone } from "@gnosia/tutor/server/time-zone";
import { dayKey } from "@gnosia/tutor/days";
import { loadKnowledgeBase } from "@/lib/learner-store";
import { assetBackLink, conceptHref, decodeAssetId, explainedConcepts, isCompanionKind } from "@/lib/library";

/**
 * `/library/[id]` (hi-fi screen 11): one asset, rendered as the thing it
 * actually is, with what it explains under it.
 *
 * **One layout for every kind, like a video site's watch page.** The asset
 * takes the whole width at the top, then its title and actions, then one
 * card of tabs (`AssetTabs`: Explains, Related, Files, Details) rather than
 * a pile of cards. A video's player draws that card itself, with a live
 * Transcript tab in front, and its chapters in the scrub bar. There is no
 * "Mark watched" button on a video: `LibraryVideo` saves the position and
 * the stretches that played, resumes there on the next visit, and appends
 * the `watched` event itself once most of it has played. Anything else keeps
 * "Mark read" beside its title, and Details says when it was last read.
 * Every asset gets Favorite (the star) and, when it has a file to hand over,
 * Download; a video, a note and a diagram get Ask too, an unsaved chat about
 * it (`LibraryVideo`, `AskableTitle`).
 *
 * **Four shapes, and none of them is a broken version of another.** A video
 * gets a player with its chapters on the scrub bar and its transcript beneath it. A
 * diagram gets the drawing, on a light mat. A text asset (a note, a session
 * log, a caption track, a chapter list) gets its own words, read on the
 * server. A link gets the link, because a row with a URL and no file has
 * nothing else to give and a player over it would be a lie.
 *
 * **The body is `AssetBody`**, the same server component the Library's
 * previewer draws (L6 of docs/proposals/library-by-type-and-day.md), from
 * the same `loadAssetBody`, so the panel and this page cannot drift apart.
 * The page adds what the panel leaves out: the back link, the renameable
 * title with its actions, and the tabs.
 *
 * **The id is percent-encoded in the URL.** Asset ids are
 * `manimkc:out/algorithms/…/cs3230_a1.mp4` (colons and slashes), so the link
 * is built by `assetHref` and this page decodes the segment itself: a page's
 * dynamic segment arrives exactly as it appears in the URL. The string is
 * used as a primary key and is never joined onto a path; every filesystem
 * decision is made from the row it finds.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeAssetId((await params).id);
  const { asset, reachable } = await loadAssetDetail(id);
  // With the catalog down nothing is known about the asset, so the tab says
  // where the reader is rather than that it does not exist (as the body does).
  if (asset === null) return { title: reachable ? "Asset not found" : "Library" };
  return {
    title: assetDisplayTitle(asset).text,
    description: `${assetKindLabel(asset.kind)} in the Gnosia library.`,
  };
}

/** How many related assets the Related tab lists before "See all". */
const RELATED_SHOWN = 5;

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = decodeAssetId((await params).id);
  const back = assetBackLink((await searchParams).from);
  // Every state of the page has a way back to where it was opened from.
  const backLink = (
    <TextLink href={back.href} size="sm" className="self-start">
      <span aria-hidden>←</span> {back.label}
    </TextLink>
  );
  const detailRead = loadAssetDetail(id);
  const [detail, { kb }, lastWatched, playback, favorite] = await Promise.all([
    detailRead,
    loadKnowledgeBase(),
    // Only Details' "Read" line wants it, and a video tracks itself instead:
    // the whole event log is not read for a page that would not show it.
    detailRead.then(({ asset }) => (asset === null || asset.kind === "video" ? undefined : loadLastWatched(id))),
    loadPlayback(id),
    loadFavorite(id),
  ]);
  const { asset, derivations, related, reachable, titles, notes, concepts, naming } = detail;

  if (asset === null) {
    // A reachable catalog that has no such row is a 404. An unreachable one is
    // not: the row may well exist, and answering "not found" would be a
    // statement about the catalog this page is in no position to make.
    if (reachable) notFound();
    return (
      <div data-layout="app" className={cx("flex flex-col gap-4", PAGE_ENTER)}>
        {backLink}
        <Notice title="The catalog is unreachable" command="npm run catalog -- status">
          This asset could not be looked up, which is not the same as it not existing. The row is
          where it was.
        </Notice>
      </div>
    );
  }

  const name = assetDisplayTitle(asset);
  const zone = appTimeZone();

  const explained = explainedConcepts(concepts, new Map(kb.concepts.map((c) => [c.id, c])));
  const firstConcept = explained[0];
  // Companion files of other assets are not worth a place in a five-row list;
  // each is listed on the page of what it belongs to.
  const neighbours = related.filter((row) => !isCompanionKind(row.kind)).slice(0, RELATED_SHOWN);

  // The file's state, its words, a video's sidecars and poster: what the
  // body draws from, read the way the previewer reads them.
  const body = await loadAssetBody(asset, derivations.derived);
  const { servable, downloadHref } = body;

  const tabInput: AssetTabsInput = {
    asset,
    titles,
    concepts: explained,
    related: neighbours,
    derivations,
    indexed: dayKey(asset.createdAt, zone),
  };

  const addToNote =
    firstConcept === undefined ? null : (
      <Button
        variant="secondary"
        size="sm"
        href={conceptHref(firstConcept.slug)}
        title={`Open the workspace for ${firstConcept.title}, where the note is`}
      >
        Add to note
      </Button>
    );

  // The key is for React's development build, not for a list. A video's
  // props carry its transcript, which pushes the Flight row past its size
  // limit, so the server sends this element as a deferred chunk. The client
  // then checks the chunk's contents for a key without seeing that
  // `LibraryVideo` placed it in static JSX, and warns "Each child in a list
  // should have a unique key". A key satisfies that check and changes nothing
  // else.
  const heading = (
    <AssetTitle
      key="heading"
      assetId={asset.id}
      text={name.text}
      // What it is called with no name of the learner's, for the field's reset.
      fallback={assetDisplayTitle({ ...asset, title: naming?.original ?? null }).text}
      naming={naming}
      headingClassName={cx(
        "break-words text-text",
        name.source === "title"
          ? "text-[22px] leading-snug font-bold tracking-[-0.01em] sm:text-[24px]"
          : "font-mono text-[17px] leading-snug font-semibold",
      )}
    />
  );

  if (asset.kind === "video" && servable) {
    return (
      <div data-layout="app" className={cx("flex flex-col gap-4", PAGE_ENTER)}>
        {backLink}
        <AssetBody
          data={body}
          title={name.text}
          notes={notes}
          variant="page"
          video={{
            heading,
            playback,
            watchedDay: playback?.watchedAt ? dayKey(playback.watchedAt, zone) : null,
            favorite: favorite !== null,
            actions: addToNote ?? undefined,
            tabs: assetTabItems({ ...tabInput, progress: { label: "Watched", value: <WatchProgress /> } }),
          }}
        />
      </div>
    );
  }

  // A picture reads like a video: the thing first, its title under it. Words
  // read like a page: the title and "Mark read" above them, where a reader
  // starts, rather than after a long note.
  const pictureFirst = asset.kind === "diagram_svg" || asset.kind === "poster" || asset.kind === "video";
  const leading = (
    <>
      {/* A video tracks itself (`LibraryVideo`); one that cannot be
          played here has nothing to mark. */}
      {asset.kind !== "video" && (
        // Details says when it was last read, so the button does not.
        <MarkWatched assetId={asset.id} />
      )}
      <FavoriteButton assetId={asset.id} initial={favorite !== null} />
    </>
  );
  const trailing = (
    <>
      {servable && <DownloadButton href={downloadHref} />}
      {addToNote}
    </>
  );
  // A note or a diagram the page can read gets Ask, an unsaved chat about it,
  // whose words the chat route reads on the server.
  const askAbout = !servable ? null : asset.kind === "note" ? "note" : asset.kind === "diagram_svg" ? "diagram" : null;
  const titleRow =
    askAbout !== null ? (
      <AskableTitle heading={heading} before={leading} after={trailing} assetId={asset.id} subject={askAbout} />
    ) : (
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {heading}
        <div className="flex shrink-0 flex-wrap items-start gap-2.5">
          {leading}
          {trailing}
        </div>
      </div>
    );

  return (
    <div data-layout="app" className={cx("flex flex-col gap-4", PAGE_ENTER)}>
      {backLink}
      {!pictureFirst && titleRow}
      <div className="min-w-0">
        <AssetBody data={body} title={name.text} notes={notes} variant="page" />
      </div>
      {pictureFirst && titleRow}

      <AssetTabs
        label={`About ${name.text}`}
        {...tabInput}
        progress={
          asset.kind === "video"
            ? undefined
            : {
                label: "Read",
                value:
                  lastWatched === undefined
                    ? "unknown (the event log could not be read)"
                    : lastWatched === null
                      ? "Not yet"
                      : `Last marked ${dayKey(lastWatched, zone)}`,
              }
        }
      />
    </div>
  );
}
