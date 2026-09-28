import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { AssetRef, AssetWithTopics } from "@self-learn/catalog/state";

import { assetDisplayTitle, assetKindLabel, formatBytes } from "@/components/asset-meta";
import { DiagramView } from "@/components/DiagramView";
import { MarkWatched } from "@/components/library/MarkWatched";
import { Notice } from "@/components/library/Notice";
import { NoteProse } from "@/components/NoteProse";
import { formatTimecode, type VideoChapter } from "@/components/media";
import { Button } from "@/components/ui/Button";
import { Card, CardAction } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { Placeholder } from "@/components/ui/Placeholder";
import { cx } from "@/components/ui/classes";
import { VideoPlayer } from "@/components/VideoPlayer";
import { WidgetFailure } from "@/components/WidgetFailure";
import {
  loadAssetDetail,
  loadLastWatched,
  readAssetText,
  readFileProblems,
  withCatalog,
} from "@/lib/asset-library";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { habitTimeZone } from "@/lib/habit";
import { dayKey } from "@/lib/habit-core";
import { loadKnowledgeBase } from "@/lib/learner-store";
import {
  assetFileHref,
  assetHref,
  assetStatusHref,
  conceptHref,
  decodeAssetId,
  explainedConcepts,
  isCompanionKind,
  libraryHref,
  type ExplainedConcept,
} from "@/lib/library";
import { embedTargets } from "@/lib/note-embeds";
import { parseChapters, parseTranscript, type ParsedTranscript } from "@/lib/transcript";

/**
 * `/library/[id]` (hi-fi screen 11): one asset, rendered as the thing it
 * actually is, with what it explains beside it.
 *
 * **Two columns from 1024px.** The main column is the asset itself; the rail
 * is the header card (eyebrow, title, Mark watched, Add to note), Explains
 * (the `asset_concept` rows with mastery), Related (other assets under the
 * same topic) and where it came from. On a narrower screen the header comes
 * first, then the asset, then the rest of the rail, which is why the header is
 * its own grid item rather than the top of the rail.
 *
 * **Four shapes, and none of them is a broken version of another.** A video
 * gets a player with its chapter chips and its transcript beneath it. A
 * diagram gets the drawing, on a light mat. A text asset (a note, a session
 * log, a caption track, a chapter list) gets its own words, read on the
 * server. A link gets the link, because a row with a URL and no file has
 * nothing else to give and a player over it would be a lie.
 *
 * **The transcript is a prop, never a fetch.** It is a separate `asset` row
 * whose file the route serves, so the browser could ask for it, and then the
 * panel would need a loading state, a failure state and a second round trip
 * for text the server already had a request in which to read.
 * `readAssetText` reads it through `resolveAsset`, which is the module
 * holding every containment check the asset route makes, and
 * `parseTranscript` validates what comes back. A sidecar that is truncated,
 * half-written or simply not JSON costs the transcript and nothing else.
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
  const { asset } = await loadAssetDetail(id);
  if (asset === null) return { title: "Asset not found" };
  return {
    title: assetDisplayTitle(asset).text,
    description: `${assetKindLabel(asset.kind)} in the Gnosia library.`,
  };
}

/** How many related assets the rail lists before "See all". */
const RELATED_SHOWN = 5;

/** The tool that made a row, for the eyebrow. The repo's own rows need no name. */
const SOURCE_LABEL: Record<string, string> = { manimkc: "manim", tldrawkc: "tldraw" };

/**
 * The transcript beside a video, and the three answers that are not "here it
 * is". `none` when the video has no sidecar row at all, `unreadable` when it
 * has one whose bytes did not come back as a transcript. The player is told
 * different things for each, because "this video has no narration" and "the
 * narration file did not load" are different facts about the same screen.
 */
type Sidecars =
  | { state: "none" }
  | { state: "unreadable" }
  | { state: "read"; chapters: VideoChapter[]; cues: ParsedTranscript["cues"]; dropped: number };

async function videoSidecars(derived: AssetRef[]): Promise<Sidecars> {
  const transcript = derived.find((row) => row.kind === "transcript");
  const chapters = derived.find((row) => row.kind === "chapters");
  if (transcript === undefined && chapters === undefined) return { state: "none" };

  const parsed =
    transcript === undefined
      ? null
      : await withCatalog(async (db) => {
          const raw = await readAssetText(db, transcript.id);
          return raw === null ? null : parseTranscript(raw);
        });

  if (parsed != null) {
    return { state: "read", chapters: parsed.chapters, cues: parsed.cues, dropped: parsed.dropped };
  }

  // The transcript carries the chapter list too, so this only runs when it is
  // absent or unreadable, and then the chapter sidecar is the second, separate
  // row that can still give the video its chapters.
  const fromChapters =
    chapters === undefined
      ? null
      : await withCatalog(async (db) => {
          const raw = await readAssetText(db, chapters.id);
          return raw === null ? null : parseChapters(raw);
        });

  if (fromChapters != null) {
    return { state: "read", chapters: fromChapters, cues: [], dropped: 0 };
  }
  return { state: "unreadable" };
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeAssetId((await params).id);
  const [detail, { kb }, lastWatched] = await Promise.all([
    loadAssetDetail(id),
    loadKnowledgeBase(),
    loadLastWatched(id),
  ]);
  const { asset, derivations, related, reachable, titles, notes, concepts } = detail;

  if (asset === null) {
    // A reachable catalog that has no such row is a 404. An unreachable one is
    // not: the row may well exist, and answering "not found" would be a
    // statement about the catalog this page is in no position to make.
    if (reachable) notFound();
    return (
      <div data-layout="app" className="flex flex-col gap-4">
        <Link
          href="/library"
          className="self-start rounded-sm text-[13px] font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden>←</span> Library
        </Link>
        <Notice title="The catalog is unreachable" command="npm run catalog -- status">
          This asset could not be looked up, which is not the same as it not existing. The row is
          where it was.
        </Notice>
      </div>
    );
  }

  const name = assetDisplayTitle(asset);
  const label = assetKindLabel(asset.kind);
  const size = formatBytes(asset.bytes);
  const fileHref = assetFileHref(asset.id);
  const statusHref = assetStatusHref(asset.id);
  const zone = habitTimeZone();

  const explained = explainedConcepts(concepts, new Map(kb.concepts.map((c) => [c.id, c])));
  const firstConcept = explained[0];
  // Companion files of other assets are not worth a place in a five-row rail;
  // each is listed on the page of what it belongs to.
  const neighbours = related.filter((row) => !isCompanionKind(row.kind)).slice(0, RELATED_SHOWN);

  // Everything about this file the server can know before render, so the page
  // sends a failure panel rather than a player that is certain to fail. Asked
  // of this row through the route's own `resolveAsset`, so the page and the
  // route give one answer: a blob in the store, or a note, log or `.tldr` the
  // database owns, is servable, and anything else is `not-uploaded`.
  const fileProblem: RouteProblemCode | null =
    asset.kind === "link" ? null : ((await readFileProblems([asset.id])).get(asset.id) ?? null);
  const servable = asset.kind !== "link" && fileProblem === null;

  const sidecars =
    asset.kind === "video" && servable ? await videoSidecars(derivations.derived) : null;

  // Anything that is neither a player nor a picture nor a bare URL has words,
  // so it is read on the server and the page arrives with them. Attempted for
  // any kind rather than a fixed list, so a kind a future indexer adds shows
  // its contents instead of nothing; `resolveAsset`'s closed extension list is
  // what refuses a binary, and `readAssetText` refuses anything over the
  // preview cap. A null lands on `UnreadableFile`, which says so. A note or a
  // log is read from its row.
  const rendered = ["video", "diagram_svg", "link"];
  const text =
    servable && !rendered.includes(asset.kind) ? await withCatalog((db) => readAssetText(db, asset.id)) : null;

  // The pictures a note embeds are `learn/assets/<name>`, the same files the
  // diagram rows point at, so they resolve through the file route. Each one is
  // checked here first, for the same reason as the asset itself.
  const embedId = (embed: string) => `diagram:learn/assets/${embed}`;
  const embedProblems =
    text !== null && asset.path?.endsWith(".md")
      ? await readFileProblems(embedTargets(text).map(embedId))
      : new Map<string, RouteProblemCode | null>();

  const eyebrow = [
    label,
    SOURCE_LABEL[asset.sourceRepo],
    size,
    `indexed ${dayKey(asset.createdAt, zone)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      data-layout="app"
      className="grid items-start gap-x-5 gap-y-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr]"
    >
      <Card className="min-w-0 gap-2.5 lg:col-start-2 lg:row-start-1">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1
          className={cx(
            "break-words text-text",
            name.source === "title"
              ? "font-display text-[22px] leading-tight font-bold"
              : "font-mono text-[17px] leading-snug font-semibold",
          )}
        >
          {name.text}
        </h1>
        <div className="flex flex-wrap items-start gap-2.5">
          <MarkWatched
            assetId={asset.id}
            verb={asset.kind === "video" ? "watched" : "read"}
            lastWatchedDay={lastWatched === null ? null : dayKey(lastWatched, zone)}
          />
          {firstConcept !== undefined && (
            <Button
              variant="secondary"
              href={conceptHref(firstConcept.slug)}
              title={`Open the workspace for ${firstConcept.title}, where the note is`}
            >
              Add to note
            </Button>
          )}
        </div>
      </Card>

      <div className="flex min-w-0 flex-col gap-3.5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {asset.kind === "video" ? (
          servable ? (
            <>
              <VideoPlayer
                src={fileHref}
                statusHref={statusHref}
                title={name.text}
                chapters={sidecars?.state === "read" ? sidecars.chapters : undefined}
                transcript={sidecars?.state === "read" ? sidecars.cues : undefined}
              />
              {sidecars?.state === "none" && (
                <Aside>No transcript or chapter sidecar is indexed beside this render.</Aside>
              )}
              {sidecars?.state === "unreadable" && (
                <Aside>
                  The sidecars beside this render are indexed but could not be read back as a
                  transcript, so the chapters and the transcript are not shown. The video itself is
                  unaffected.
                </Aside>
              )}
              {sidecars?.state === "read" && sidecars.dropped > 0 && (
                <Aside>
                  {sidecars.dropped} {sidecars.dropped === 1 ? "entry" : "entries"} in the transcript
                  had no usable timecode or text and were left out.
                </Aside>
              )}
            </>
          ) : (
            fileProblem !== null && <Unavailable kind={asset.kind} code={fileProblem} />
          )
        ) : asset.kind === "diagram_svg" ? (
          servable ? (
            <DiagramView src={fileHref} statusHref={statusHref} title={name.text} />
          ) : (
            fileProblem !== null && <Unavailable kind={asset.kind} code={fileProblem} />
          )
        ) : asset.kind === "link" ? (
          <LinkPanel url={asset.url} />
        ) : text !== null ? (
          asset.kind === "transcript" ? (
            <TranscriptSidecar text={text} href={fileHref} />
          ) : asset.kind === "chapters" ? (
            <ChapterSidecar text={text} href={fileHref} />
          ) : (
            <TextPanel title={asset.path?.split("/").pop() ?? label} href={fileHref}>
              {asset.path?.endsWith(".md") ? (
                <NoteProse
                  source={text}
                  // A wikilink carries a slug and a note's id carries its domain
                  // folder too, so the index built alongside the row is what
                  // closes that gap. An unresolved slug stays readable text.
                  resolveNote={(slug) => {
                    const noteId = notes[slug];
                    return noteId === undefined ? undefined : assetHref(noteId);
                  }}
                  // Checked above: a known problem renders the failure panel on
                  // the server, anything else is an `<img>` with somewhere to
                  // ask why if it fails anyway.
                  resolveEmbed={(embed) => {
                    const embedAsset = embedId(embed);
                    const problem = embedProblems.get(embedAsset) ?? null;
                    if (problem !== null) return { problem };
                    return { src: assetFileHref(embedAsset), statusHref: assetStatusHref(embedAsset) };
                  }}
                />
              ) : (
                <RawText text={text} />
              )}
            </TextPanel>
          )
        ) : fileProblem !== null ? (
          <Unavailable kind={asset.kind} code={fileProblem} />
        ) : (
          // The file resolves and still did not come back as text: larger than
          // the preview cap, not UTF-8, or gone in the moment since it was
          // checked. Without this branch the page would drop the body and the
          // raw-file link without a word.
          <UnreadableFile path={asset.path} href={fileHref} />
        )}

        <CatalogRow asset={asset} titles={titles} />
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-2">
        <Explains concepts={explained} />

        {neighbours.length > 0 && (
          <Card
            title="Related"
            // The library filters by one topic at a time, so "See all" is only
            // honest when this asset has exactly one: with two, the neighbours
            // from the second would be missing from the page it opens. Each
            // topic's own view is a chip in the catalog row instead.
            action={
              asset.topics.length === 1 && asset.topics[0] !== undefined ? (
                <CardAction href={libraryHref({ topic: asset.topics[0] })}>See all</CardAction>
              ) : undefined
            }
          >
            <ul className="flex flex-col gap-3">
              {neighbours.map((row) => (
                <RelatedRow key={row.id} asset={row} />
              ))}
            </ul>
          </Card>
        )}

        {derivations.sources.length > 0 && (
          <Card title="Derived from">
            <ul className="flex flex-col gap-2">
              {derivations.sources.map((row) => (
                <FamilyRow key={row.id} asset={row} />
              ))}
            </ul>
          </Card>
        )}
        {derivations.derived.length > 0 && (
          <Card title={asset.kind === "video" ? "Companion files" : "Produced from this"}>
            <ul className="flex flex-col gap-2">
              {derivations.derived.map((row) => (
                <FamilyRow key={row.id} asset={row} />
              ))}
            </ul>
            <p className="text-[12px] leading-relaxed text-text3">
              Kept out of the library&rsquo;s default view so they do not bury what they accompany.
              Each one has a page of its own.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

/** A quiet note under the asset: 12px, tertiary. */
function Aside({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-text3">{children}</p>;
}

/**
 * The `asset_concept` rows with mastery (hi-fi 11, "Explains"): each concept
 * with its dot and p(L), and the way into the first one's workspace. A concept
 * with no evidence yet says "not started" rather than printing a prior as if it
 * were a measurement.
 */
function Explains({ concepts }: { concepts: ExplainedConcept[] }) {
  const first = concepts[0];
  return (
    <Card title="Explains">
      {concepts.length === 0 ? (
        <p className="text-[14px] text-text2">No concept is linked to this asset yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {concepts.map((c) => (
            <li key={c.slug} className="flex min-w-0 items-center gap-2.5">
              <MasteryDot bucket={c.bucket} />
              <Link
                href={conceptHref(c.slug)}
                className="min-w-0 flex-1 truncate rounded-sm text-[14px] text-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {c.title}
              </Link>
              <span className="shrink-0 text-[12px] tabular-nums text-text2">
                {c.observations > 0 && c.pL !== null ? c.pL.toFixed(2) : "not started"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {first !== undefined && (
        <Button
          variant="secondary"
          size="sm"
          href={conceptHref(first.slug)}
          className="self-start"
        >
          Open workspace
        </Button>
      )}
    </Card>
  );
}

/** One neighbour under the same topic: a small labelled box and its title. */
function RelatedRow({ asset }: { asset: AssetWithTopics }) {
  const name = assetDisplayTitle(asset);
  return (
    <li>
      <Link
        href={assetHref(asset.id)}
        className="group flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="w-16 shrink-0">
          <Placeholder label={assetKindLabel(asset.kind).toLowerCase()} height={44} className="px-1" />
        </span>
        <span
          className={cx(
            "line-clamp-2 min-w-0 text-[13px] text-text underline-offset-4 group-hover:underline",
            name.source !== "title" && "font-mono",
          )}
        >
          {name.text}
        </span>
      </Link>
    </li>
  );
}

/**
 * A source or a companion file, named by what it is ("Transcript", "Diagram
 * source") with its filename and size beside it. Not by title: a companion
 * carries the title of the video or drawing it belongs to, which is the title
 * this page is already showing, so a list of them would say it three times.
 */
function FamilyRow({ asset }: { asset: AssetRef }) {
  const size = formatBytes(asset.bytes);
  const file = asset.path?.split("/").pop() ?? asset.url ?? null;
  return (
    <li>
      <Link
        href={assetHref(asset.id)}
        className="group flex min-w-0 items-baseline justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="shrink-0 text-[13px] text-text underline-offset-4 group-hover:underline">
          {assetKindLabel(asset.kind)}
        </span>
        <span className="min-w-0 truncate text-right text-[12px] text-text2" title={file ?? undefined}>
          {[file, size].filter(Boolean).join(" · ")}
        </span>
      </Link>
    </li>
  );
}

/**
 * The row as the catalog holds it, folded away under the asset: the id, the
 * path, the source, the size and the topic slugs. A reader here is checking
 * what to type, so every value is the identifier rather than a label.
 */
function CatalogRow({ asset, titles }: { asset: AssetWithTopics; titles: Record<string, string> }) {
  return (
    <details className="group rounded-[20px] border-2 border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[18px] px-5 py-4 text-[16px] font-bold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className="size-3 text-text3 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 2.5 8 6l-3.5 3.5" />
        </svg>
        Catalog row
      </summary>
      <dl className="flex flex-col gap-2 px-5 pb-5">
        <Fact label="Id">
          <span className="font-mono text-[12px]">{asset.id}</span>
        </Fact>
        <Fact label={asset.path === null ? "URL" : "Path"}>
          <span className="font-mono text-[12px]">{asset.path ?? asset.url ?? "none"}</span>
        </Fact>
        <Fact label="Source">{asset.sourceRepo}</Fact>
        <Fact label="Bytes">{asset.bytes === null ? "unknown" : asset.bytes.toLocaleString("en")}</Fact>
        <Fact label="Topics">
          {asset.topics.length === 0 ? (
            "none"
          ) : (
            <span className="flex flex-wrap gap-1.5">
              {asset.topics.map((slug) => (
                <Chip key={slug} size="sm" href={libraryHref({ topic: slug })} title={titles[slug] ?? slug}>
                  <span className="font-mono">{slug}</span>
                </Chip>
              ))}
            </span>
          )}
        </Fact>
      </dl>
    </details>
  );
}

/** A labelled fact. Two columns on anything wider than a phone. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4">
      <dt className="pt-0.5 text-[11px] font-bold tracking-[0.05em] text-text3 uppercase">{label}</dt>
      <dd className="min-w-0 break-words text-[13px] text-text2">{children}</dd>
    </div>
  );
}

/*
 * 80ch, not the full column. Text set to the width of a wide column is
 * unreadable however good the rest of the page is. Markdown is written at
 * about 80 columns, so the source wraps where its author wrapped it.
 */
function RawText({ text }: { text: string }) {
  return (
    <pre className="max-h-[36rem] max-w-[80ch] overflow-auto font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-text2">
      {text}
    </pre>
  );
}

/** "Raw file", the ghost link at the right of a text card's title. */
function RawLink({ href, children = "Raw file" }: { href: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-sm text-[13px] font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </a>
  );
}

/**
 * A file's own words, in a card titled with its filename and a Raw file link.
 * `children` is what varies: a markdown note is rendered as prose, everything
 * else is shown as it is on disk.
 */
function TextPanel({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <Card title={<span className="block truncate">{title}</span>} action={<RawLink href={href} />}>
      {children}
    </Card>
  );
}

/**
 * The asset itself could not be shown, for a reason the server already knows.
 *
 * The shared Widget placeholder failure panel, rendered here on the server with
 * no probe: the switch being off, the manimkc index being missing or stale, and
 * a file that is already gone are all decided before render, so the page never
 * sends a player or an `<img>` that is certain to fail. A video's panel takes
 * the player's footprint, as the hi-fi's 400px placeholder does.
 */
function Unavailable({ kind, code }: { kind: string; code: RouteProblemCode }) {
  const subject = kind === "video" ? "This video" : kind === "diagram_svg" ? "This diagram" : "This file";
  return (
    <WidgetFailure
      headline={`${subject} cannot be shown here.`}
      code={code}
      className={kind === "video" ? "min-h-64 w-full sm:min-h-[400px]" : "min-h-48"}
    />
  );
}

/** A timecoded list: a standalone transcript or chapter sidecar, read on its own. */
function CueList({
  title,
  entries,
  href,
}: {
  title: string;
  entries: { start: number; text: string }[];
  href: string;
}) {
  return (
    <Card
      title={
        <>
          {title} <span className="text-[12px] font-normal tabular-nums text-text3">{entries.length}</span>
        </>
      }
      action={<RawLink href={href} />}
    >
      <ol className="-mx-2 max-h-[36rem] overflow-y-auto">
        {entries.map((entry, i) => (
          <li
            key={`${entry.start}-${i}`}
            className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1 text-[14px] leading-[22px] text-text2"
          >
            <span className="pt-px text-[12px] tabular-nums text-text3">{formatTimecode(entry.start)}</span>
            {/* Capped for the same reason as the raw file above: a spoken line
                set across the whole of a wide column is a line nobody reads. */}
            <span className="max-w-[70ch]">{entry.text}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * The route said this asset is servable, and its text did not come back.
 *
 * `readAssetText` deliberately collapses the reasons (an object the store
 * lost since the check, an extension the route refuses, larger than the
 * preview cap) because the reader's next move is the same for all of them,
 * so the card lists them rather than guessing between them. The raw link
 * stays, since it is the one way to find out which it was.
 */
function UnreadableFile({ path, href }: { path: string | null; href: string }) {
  return (
    <Notice
      title={path === null ? "This row names no file." : "This file could not be read."}
      command={path === null ? "npm run catalog -- index" : "npm run catalog -- blob audit"}
      className="border-dashed"
    >
      {path === null ? (
        <p>
          The catalog holds it with neither a path nor a URL, which no indexer should produce. The
          catalog row below is what the row does say.
        </p>
      ) : (
        <>
          <p>
            The row is real and its bytes are stored, so this is about the file itself: the store
            may have lost it since the page checked, it may be larger than the page reads in one
            go, or it may be a kind of file this page does not show. A blob audit finds a lost
            object.
          </p>
          <p className="mt-2 font-mono text-[12px] break-all text-text3">{path}</p>
          <p className="mt-2">
            <RawLink href={href}>Try the raw file</RawLink>
          </p>
        </>
      )}
    </Notice>
  );
}

/** A row with a URL and no file. There is nothing to play, so there is a link. */
function LinkPanel({ url }: { url: string | null }) {
  if (url === null) {
    return (
      <Notice title="This link has no URL" command="npm run catalog -- index" className="border-dashed">
        This link row carries no URL, which should not happen: the course indexer writes one for
        every resource it reads. Re-index to correct it.
      </Notice>
    );
  }
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // A malformed URL is still shown as written, rather than hidden behind a
    // parse this page has no reason to insist on.
  }
  return (
    <Card title="On the web" className="items-start">
      <Button variant="secondary" href={url} target="_blank" rel="noopener noreferrer" prefetch={false}>
        Open {host}
        <span aria-hidden>↗</span>
      </Button>
      <p className="font-mono text-[12px] break-all text-text3">{url}</p>
    </Card>
  );
}

/** A transcript opened on its own, rather than beside the video it belongs to. */
function TranscriptSidecar({ text, href }: { text: string; href: string }) {
  const parsed = parseTranscript(text);
  if (parsed === null || parsed.cues.length === 0) {
    return (
      <TextPanel title="Transcript" href={href}>
        <RawText text={text} />
      </TextPanel>
    );
  }
  return <CueList title="Transcript" entries={parsed.cues} href={href} />;
}

/** A chapter list opened on its own. */
function ChapterSidecar({ text, href }: { text: string; href: string }) {
  const parsed = parseChapters(text);
  if (parsed === null || parsed.length === 0) {
    return (
      <TextPanel title="Chapters" href={href}>
        <RawText text={text} />
      </TextPanel>
    );
  }
  return (
    <CueList
      title="Chapters"
      entries={parsed.map((chapter) => ({ start: chapter.start, text: chapter.title }))}
      href={href}
    />
  );
}
