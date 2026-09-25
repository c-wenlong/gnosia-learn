import Link from "next/link";
import { notFound } from "next/navigation";
import type { AssetRef, AssetWithTopics } from "@self-learn/catalog/state";

import { AssetCard } from "@/components/AssetCard";
import { assetDisplayTitle, assetKindLabel, formatBytes } from "@/components/asset-meta";
import { DiagramView } from "@/components/DiagramView";
import { NoteProse } from "@/components/NoteProse";
import { formatTimecode, type VideoChapter } from "@/components/media";
import { VideoPlayer } from "@/components/VideoPlayer";
import { WidgetFailure } from "@/components/WidgetFailure";
import {
  accessFor,
  loadAssetDetail,
  loadFileAccess,
  readAssetText,
  readFileProblems,
  withCatalog,
  thumbnailFor,
  thumbnailStatusFor,
} from "@/lib/asset-library";
import { problemForAccess, type RouteProblemCode } from "@/lib/asset-problems";
import {
  assetFileHref,
  assetHref,
  assetStatusHref,
  decodeAssetId,
  libraryHref,
} from "@/lib/library";
import { embedTargets } from "@/lib/note-embeds";
import { parseChapters, parseTranscript, type ParsedTranscript } from "@/lib/transcript";

/**
 * `/library/[id]` — one asset, rendered as the thing it actually is.
 *
 * **Four shapes, and none of them is a broken version of another.** A video
 * gets a player with its chapter rail and its transcript beside it. A diagram
 * gets the drawing, on a light mat, at the size of the page. A text asset — a
 * note, a session log, a caption track, a chapter list — gets its own words,
 * read on the server. A link gets the link, because a row with a URL and no
 * file has nothing else to give and a player over it would be a lie.
 *
 * **The transcript is a prop, never a fetch.** It is a separate `asset` row
 * whose file the route serves, so the browser could ask for it — and then the
 * panel would need a loading state, a failure state and a second round trip for
 * text the server already had a request in which to read. `readAssetText`
 * reads it through `resolveAssetFile`, which is the module holding every
 * containment check the asset route makes, and `parseTranscript` validates what
 * comes back. A sidecar that is truncated, half-written or simply not JSON
 * costs the transcript panel and nothing else.
 *
 * **The id is percent-encoded in the URL.** Asset ids are
 * `manimkc:out/algorithms/…/cs3230_a1.mp4` — colons and slashes — so the link
 * is built by `assetHref` and Next decodes the segment back into `params.id`.
 * The string is used as a primary key and is never joined onto a path; every
 * filesystem decision is made from the row it finds.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeAssetId((await params).id);
  const { asset } = await loadAssetDetail(id);
  if (asset === null) return { title: "Asset not found" };
  return {
    title: assetDisplayTitle(asset).text,
    description: `${assetKindLabel(asset.kind)} in the self-learn catalog.`,
  };
}

/** A labelled fact. Two columns on anything wider than a phone. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4 sm:py-1.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)] sm:pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-[var(--muted-strong)]">{children}</dd>
    </div>
  );
}

/*
 * 80ch, not the full column. These pages are wide so a video can have a
 * transcript beside it, and text set to a 1030px measure is unreadable
 * however good the rest of the page is. Markdown is written at about 80
 * columns, so the source wraps where its author wrapped it.
 */
function RawText({ text }: { text: string }) {
  return (
    <pre className="max-h-[36rem] max-w-[80ch] overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[13px] leading-relaxed text-[var(--muted-strong)]">
      {text}
    </pre>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The asset itself could not be shown, for a reason the server already knows.
 *
 * The shared Widget placeholder failure panel, rendered here on the server with
 * no probe: the switch being off, the manimkc index being missing or stale, and
 * a file that is already gone are all decided before render, so the page never
 * sends a player or an `<img>` that is certain to fail.
 */
function Unavailable({ kind, code }: { kind: string; code: RouteProblemCode }) {
  const subject = kind === "video" ? "This video" : kind === "diagram_svg" ? "This diagram" : "This file";
  return (
    <WidgetFailure
      headline={`${subject} cannot be shown here.`}
      code={code}
      className={kind === "video" ? "min-h-64 w-full sm:min-h-80" : "min-h-48"}
    />
  );
}

/**
 * A file's own words.
 *
 * `body` is what varies: a markdown note is rendered as prose, everything
 * else is shown as it is on disk. Both keep the same panel, the same title
 * and the same Raw file action, because the reader's next move is identical
 * either way and only the middle of the panel differs.
 */
function TextPanel({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Panel
      title={title}
      action={
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--accent-strong)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Raw file
        </a>
      }
    >
      {children}
    </Panel>
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
    <Panel
      title={title}
      action={
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
          {entries.length}
        </span>
      }
    >
      <ol className="max-h-[36rem] overflow-y-auto p-2">
        {entries.map((entry, i) => (
          <li
            key={`${entry.start}-${i}`}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-lg px-2 py-1.5 text-sm leading-relaxed text-[var(--muted-strong)]"
          >
            <span className="pt-px font-mono text-[11px] tabular-nums text-[var(--muted)]">
              {formatTimecode(entry.start)}
            </span>
            {/* Capped for the same reason as the raw file above: a spoken line
                set across the whole of a wide page is a line nobody reads. */}
            <span className="max-w-[70ch]">{entry.text}</span>
          </li>
        ))}
      </ol>
      <p className="border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--muted)]">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--accent-strong)] hover:underline"
        >
          Raw file
        </a>
      </p>
    </Panel>
  );
}

/** One derived or source asset, as a row that says what the relation is. */
function RelatedRow({ asset }: { asset: AssetRef }) {
  const name = assetDisplayTitle(asset);
  const size = formatBytes(asset.bytes);
  return (
    <li>
      <Link
        href={assetHref(asset.id)}
        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm text-[var(--foreground)]">{name.text}</span>
          <span className="block truncate text-[11px] text-[var(--muted)]">
            {assetKindLabel(asset.kind)}
            {size && ` · ${size}`}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[var(--muted)]">
          →
        </span>
      </Link>
    </li>
  );
}

/**
 * The transcript beside a video, and the three answers that are not "here it
 * is". `null` when the video has no sidecar row at all, `"unreadable"` when it
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
  // absent or unreadable — and then the chapter sidecar is the second, separate
  // row that can still give the video a chapter rail.
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
  // Decoded by hand: a page's dynamic segment arrives exactly as it appears in
  // the URL. `decodeAssetId` is where the reason this is not `params.id` lives.
  const id = decodeAssetId((await params).id);
  const [{ asset, derivations, related, reachable, titles, notes }, access] = await Promise.all([
    loadAssetDetail(id),
    loadFileAccess(),
  ]);

  if (asset === null) {
    // A reachable catalog that has no such row is a 404. An unreachable one is
    // not: the row may well exist, and answering "not found" would be a
    // statement about the catalog this page is in no position to make.
    if (reachable) notFound();
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h1 className="text-lg font-semibold">The catalog is unreachable</h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--muted-strong)]">
            This asset could not be looked up, which is not the same as it not
            existing. The row is where it was.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)] p-3 font-mono text-xs">
            {`npm run catalog -- status`}
          </pre>
        </div>
      </div>
    );
  }

  const name = assetDisplayTitle(asset);
  const label = assetKindLabel(asset.kind);
  const size = formatBytes(asset.bytes);
  const fileAccess = accessFor(access, asset.sourceRepo);
  const fileHref = assetFileHref(asset.id);
  const statusHref = assetStatusHref(asset.id);

  // Everything about this file the server can know before render, so the page
  // sends a failure panel rather than a player that is certain to fail. The
  // switch and the manimkc index are page-wide answers; a file that is gone is
  // this row's own, and one `resolveAssetFile` finds it.
  const fileProblem: RouteProblemCode | null = !fileAccess.ok
    ? problemForAccess(fileAccess.reason)
    : asset.path === null
      ? null
      : ((await readFileProblems([asset.id])).get(asset.id) ?? null);
  const servable = fileAccess.ok && asset.path !== null && fileProblem === null;

  const sidecars =
    asset.kind === "video" && servable ? await videoSidecars(derivations.derived) : null;

  // Anything that is neither a player nor a picture nor a bare URL has words,
  // so it is read on the server and the page arrives with them. Attempted for
  // any kind rather than a fixed list, so a kind a future indexer adds shows
  // its contents instead of nothing; `resolveAssetFile`'s closed extension list
  // is what refuses a binary, and `readAssetText` refuses anything over the
  // preview cap. A null lands on `UnreadableFile`, which says so.
  const rendered = ["video", "diagram_svg", "link"];
  const text =
    servable && !rendered.includes(asset.kind)
      ? await withCatalog((db) => readAssetText(db, asset.id))
      : null;

  // The pictures a note embeds are `learn/assets/<name>`, the same files the
  // diagram rows point at, so they resolve through the file route. Each one is
  // checked here first, for the same reason as the asset itself: an embed
  // whose file is gone, or whose name no row has, gets the failure panel from
  // the server, and only an embed that fails for a reason nobody could predict
  // costs the browser a probe.
  const embedId = (name: string) => `diagram:learn/assets/${name}`;
  const embedProblems =
    text !== null && asset.path?.endsWith(".md")
      ? await readFileProblems(embedTargets(text).map(embedId))
      : new Map<string, RouteProblemCode | null>();

  return (
    <div data-layout="wide" className="space-y-8">
      <BackLink />

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-[var(--border)] bg-[var(--chip-bg)] px-1.5 py-0.5 font-medium text-[var(--muted-strong)]">
            {label}
          </span>
          {asset.topics.map((slug) => (
            <Link
              key={slug}
              href={libraryHref({ topic: slug })}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--muted-strong)] transition-colors duration-150 hover:border-[var(--accent)]/40 hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {titles[slug] ?? slug}
            </Link>
          ))}
          {size && <span className="tabular-nums text-[var(--muted)]">{size}</span>}
        </div>
        <h1
          className={`text-2xl font-semibold tracking-tight sm:text-3xl ${
            name.source === "title" ? "" : "font-mono text-xl sm:text-2xl"
          }`}
        >
          {name.text}
        </h1>
      </header>

      {/* The thing itself. */}
      {asset.kind === "video" ? (
        servable ? (
          <div className="space-y-2">
            <VideoPlayer
              src={fileHref}
              statusHref={statusHref}
              title={name.text}
              chapters={sidecars?.state === "read" ? sidecars.chapters : undefined}
              transcript={sidecars?.state === "read" ? sidecars.cues : undefined}
            />
            {sidecars?.state === "none" && (
              <p className="text-xs text-[var(--muted)]">
                No transcript or chapter sidecar is indexed beside this render.
              </p>
            )}
            {sidecars?.state === "unreadable" && (
              <p className="text-xs text-[var(--muted)]">
                The sidecars beside this render are indexed but could not be read
                back as a transcript, so the chapter rail and the transcript are
                not shown. The video itself is unaffected.
              </p>
            )}
            {sidecars?.state === "read" && sidecars.dropped > 0 && (
              <p className="text-xs text-[var(--muted)]">
                {sidecars.dropped} {sidecars.dropped === 1 ? "entry" : "entries"} in
                the transcript had no usable timecode or text and were left out.
              </p>
            )}
          </div>
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
          <TextPanel title={`${label} · ${asset.path?.split("/").pop() ?? "file"}`} href={fileHref}>
            {asset.path?.endsWith(".md") ? (
              <NoteProse
                source={text}
                className="px-4 py-4"
                // A wikilink carries a slug and a note's id carries its domain
                // folder too, so the index built alongside the row is what
                // closes that gap. An unresolved slug stays readable text.
                resolveNote={(slug) => {
                  const id = notes[slug];
                  return id === undefined ? undefined : assetHref(id);
                }}
                // Checked above: a known problem renders the failure panel on
                // the server, anything else is an `<img>` with somewhere to ask
                // why if it fails anyway.
                resolveEmbed={(name) => {
                  if (!fileAccess.ok) return { problem: problemForAccess(fileAccess.reason) };
                  const id = embedId(name);
                  const problem = embedProblems.get(id) ?? null;
                  if (problem !== null) return { problem };
                  return { src: assetFileHref(id), statusHref: assetStatusHref(id) };
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

      {/* What it came from, and what came out of it. */}
      {derivations.sources.length > 0 && (
        <Panel title={asset.kind === "diagram_svg" ? "Exported from" : "Companion of"}>
          <ul className="p-1.5">
            {derivations.sources.map((row) => (
              <RelatedRow key={row.id} asset={row} />
            ))}
          </ul>
        </Panel>
      )}
      {derivations.derived.length > 0 && (
        <Panel title={asset.kind === "video" ? "Companion files" : "Produced from this"}>
          <ul className="p-1.5">
            {derivations.derived.map((row) => (
              <RelatedRow key={row.id} asset={row} />
            ))}
          </ul>
          <p className="border-t border-[var(--border)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
            Companion files are kept out of the library&rsquo;s default view so
            they do not bury what they accompany. Each one has a page of its own.
          </p>
        </Panel>
      )}

      <Panel title="Catalog row">
        <dl className="divide-y divide-[var(--border)] px-4 py-1">
          <Fact label="Id">
            <span className="font-mono text-[12px]">{asset.id}</span>
          </Fact>
          <Fact label={asset.path === null ? "URL" : "Path"}>
            <span className="font-mono text-[12px]">{asset.path ?? asset.url ?? "—"}</span>
          </Fact>
          <Fact label="Source">{asset.sourceRepo}</Fact>
          <Fact label="Bytes">{asset.bytes === null ? "—" : asset.bytes.toLocaleString()}</Fact>
          <Fact label="Topics">
            {asset.topics.length === 0 ? (
              "—"
            ) : (
              // Slugs, not titles, and deliberately: every other row in this
              // panel is an identifier, and the chips above already carry the
              // readable name. A reader here is checking what to type.
              <span className="font-mono text-[12px]">{asset.topics.join(", ")}</span>
            )}
          </Fact>
        </dl>
      </Panel>

      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="border-b border-[var(--border)] pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Also filed under {asset.topics.length === 1 ? "this topic" : "these topics"}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
            {related.map((row: AssetWithTopics) => (
              <AssetCard
                key={row.id}
                asset={row}
                topic={row.topics[0] === undefined ? undefined : (titles[row.topics[0]] ?? row.topics[0])}
                href={assetHref(row.id)}
                thumbnailSrc={thumbnailFor(row, access)}
                thumbnailStatusHref={thumbnailStatusFor(row, access)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/library"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors duration-150 hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <span aria-hidden>←</span> Library
    </Link>
  );
}

/**
 * This deployment serves files, and this one did not come back.
 *
 * A different fact from the three `FileAccess` states, which are all about the
 * deployment: those say nothing can be served, this says everything else can
 * and this one file could not. `readAssetText` deliberately collapses the
 * reasons — gone from disk, unreadable, an extension the route refuses, larger
 * than the preview cap — because the reader's next move is the same for all of
 * them, so the panel lists them rather than guessing between them. The raw link
 * stays, since it is the one way to find out which it was.
 */
function UnreadableFile({ path, href }: { path: string | null; href: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--foreground)]">
        {path === null ? "This row names no file." : "This file could not be read."}
      </h2>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-[var(--muted-strong)]">
        {path === null ? (
          <>
            The catalog holds it with neither a path nor a URL, which no indexer
            should produce. Everything below is what the row does say.
          </>
        ) : (
          <>
            The row is real and this deployment does serve asset files, so this
            is about the file itself: it may have moved since the catalog last
            indexed it, be larger than the page reads in one go, or be a kind of
            file this page does not show. Re-indexing corrects a path that
            changed.
          </>
        )}
      </p>
      {path && (
        <p className="mt-2 break-all font-mono text-[12px] text-[var(--muted)]">{path}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {path && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md text-[12px] font-medium text-[var(--accent-strong)] transition-colors duration-150 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Try the raw file
          </a>
        )}
        <code className="rounded-md border border-[var(--border)] bg-[var(--sidebar-bg)] px-2 py-1 font-mono text-[11px] text-[var(--muted-strong)]">
          npm run catalog -- index
        </code>
      </div>
    </div>
  );
}

/** A row with a URL and no file. There is nothing to play, so there is a link. */
function LinkPanel({ url }: { url: string | null }) {
  if (url === null) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-5">
        <p className="text-sm text-[var(--muted-strong)]">
          This link row carries no URL, which should not happen: the course
          indexer writes one for every resource it reads. Re-index to correct it.
        </p>
      </div>
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
    <Panel title="On the web">
      <div className="space-y-2 p-4">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--nav-active-bg)] px-3 py-1.5 text-sm font-medium text-[var(--accent-strong)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Open {host}
          <span aria-hidden>↗</span>
        </a>
        <p className="break-all font-mono text-[12px] text-[var(--muted)]">{url}</p>
      </div>
    </Panel>
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
