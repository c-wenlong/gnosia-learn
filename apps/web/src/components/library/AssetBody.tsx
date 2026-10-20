import type { ReactNode } from "react";

import { DiagramView } from "@/components/DiagramView";
import type { AssetBodyData } from "@/components/library/asset-body-data";
import { embedAssetId } from "@/components/library/asset-body-data";
import { ExpandablePanel } from "@/components/library/ExpandablePanel";
import { LibraryVideo } from "@/components/library/LibraryVideo";
import { Notice } from "@/components/ui/Notice";
import { NoteProse } from "@/components/NoteProse";
import { formatTimecode } from "@/components/media";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { TabItem } from "@/components/ui/Tabs";
import { TextLink } from "@/components/ui/TextLink";
import { WidgetFailure } from "@/components/WidgetFailure";
import { assetKindLabel } from "@/components/asset-meta";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { assetFileHref, assetHref, assetStatusHref } from "@/lib/library";
import { ownValue } from "@/lib/own-key";
import type { Playback } from "@/lib/playback";
import { parseChapters, parseTranscript } from "@/lib/transcript";

/** What a servable video's player needs beyond the body's data: its playback, its star, and the page's slots. */
export interface AssetBodyVideo {
  /** The title under the player: the page's renameable heading, or nothing in the previewer, whose header names it. */
  heading: ReactNode;
  /** What the store held when this was rendered, or null for a first visit. */
  playback: Playback | null;
  /** The day `playback.watchedAt` falls on in the app's zone, or null. */
  watchedDay: string | null;
  favorite: boolean;
  /** More pill actions after Favorite, Ask and Download (the page's Add to note). */
  actions?: ReactNode;
  /** The page's tabs after the transcript: Explains, Related, Files, Details. The previewer has none. */
  tabs?: TabItem[];
}

/**
 * One asset drawn as the thing it is, without the page around it: the body
 * the asset page (`/library/[id]`) shows under its back link, and the
 * Library's previewer shows under its header (L6 of
 * docs/proposals/library-by-type-and-day.md). Both render this one component
 * from one `loadAssetBody`, so the panel and the page cannot drift apart.
 *
 * **Four shapes, and none of them is a broken version of another.** A video
 * gets `LibraryVideo`, with its chapters on the scrub bar and its transcript
 * beneath it. A diagram gets the drawing, on a light mat (`DiagramView`). A
 * text asset (a note, a session log, a caption track, a chapter list) gets
 * its own words, read on the server. A link gets the link, because a row
 * with a URL and no file has nothing else to give and a player over it would
 * be a lie. Anything the server already knows cannot be shown gets the
 * failure panel in the asset's place.
 *
 * `variant` is the one difference. On the page a note's words sit in a card
 * of a fixed height that scrolls, with an icon to open them at length
 * (`ExpandablePanel`), so the tabs under it stay in reach; in the previewer
 * the panel is that reading view already, so the words are set as a
 * document column with nothing around them.
 */
export function AssetBody({
  data,
  title,
  notes,
  variant,
  video,
}: {
  data: AssetBodyData;
  /** The asset's display title: the player's and the diagram's name. */
  title: string;
  /** The wikilink index (`loadAssetDetail`'s `notes`), slug to note id. */
  notes: Readonly<Record<string, string>>;
  variant: "page" | "preview";
  /** Required to draw a servable video; without it a video draws nothing here. */
  video?: AssetBodyVideo;
}) {
  const { asset, fileHref, statusHref, failureSource, fileProblem, servable, sidecars, text } = data;
  const unavailable =
    fileProblem === null ? null : <Unavailable kind={asset.kind} code={fileProblem} sourceRepo={failureSource} />;

  if (asset.kind === "video") {
    if (!servable || video === undefined) return unavailable;
    return (
      <LibraryVideo
        // Its playback state is this asset's: a new asset starts over.
        key={asset.id}
        assetId={asset.id}
        src={fileHref}
        statusHref={statusHref}
        poster={data.poster}
        title={title}
        sourceRepo={failureSource}
        chapters={sidecars?.state === "read" ? sidecars.chapters : undefined}
        transcript={sidecars?.state === "read" ? sidecars.cues : undefined}
        saved={video.playback}
        heading={video.heading}
        watchedDay={video.watchedDay}
        favorite={video.favorite}
        downloadHref={data.downloadHref}
        pdfHref={data.pdfHref}
        actions={video.actions}
        notes={
          <>
            {sidecars?.state === "none" && <Aside>No transcript or chapter sidecar is indexed beside this render.</Aside>}
            {sidecars?.state === "unreadable" && (
              <Aside>
                The sidecars beside this render are indexed but could not be read back as a transcript, so the
                chapters and the transcript are not shown. The video itself is unaffected.
              </Aside>
            )}
            {sidecars?.state === "read" && sidecars.dropped > 0 && (
              <Aside>
                {sidecars.dropped} {sidecars.dropped === 1 ? "entry" : "entries"} in the transcript had no usable
                timecode or text and were left out.
              </Aside>
            )}
          </>
        }
        tabs={video.tabs}
      />
    );
  }

  if (asset.kind === "diagram_svg") {
    return servable ? <DiagramView src={fileHref} statusHref={statusHref} title={title} heading={false} /> : unavailable;
  }

  if (asset.kind === "pdf") return servable ? <PdfView src={fileHref} title={title} /> : unavailable;

  if (asset.kind === "link") return <LinkPanel url={asset.url} />;

  if (text === null) {
    // The file resolves and still did not come back as text: larger than the
    // preview cap, not UTF-8, or gone in the moment since it was checked.
    // Without this branch the body and the raw-file link would vanish without
    // a word.
    return unavailable ?? <UnreadableFile path={asset.path} href={fileHref} />;
  }
  if (asset.kind === "transcript") return <TranscriptSidecar text={text} href={fileHref} variant={variant} />;
  if (asset.kind === "chapters") return <ChapterSidecar text={text} href={fileHref} variant={variant} />;

  const words = asset.path?.endsWith(".md") ? (
    <NoteProse
      source={text}
      // A wikilink carries a slug and a note's id carries its domain folder
      // too, so the index built alongside the row is what closes that gap. An
      // unresolved slug stays readable text.
      resolveNote={(slug) => {
        const noteId = ownValue(notes, slug);
        return noteId === undefined ? undefined : assetHref(noteId);
      }}
      // Checked on the server: a known problem renders the failure panel,
      // anything else is an `<img>` with somewhere to ask why if it fails
      // anyway.
      resolveEmbed={(embed) => {
        const embedAsset = embedAssetId(embed);
        const problem = data.embedProblems.get(embedAsset) ?? null;
        if (problem !== null) return { problem };
        return { src: assetFileHref(embedAsset), statusHref: assetStatusHref(embedAsset) };
      }}
    />
  ) : (
    <RawText text={text} />
  );
  return (
    <TextPanel title={asset.path?.split("/").pop() ?? assetKindLabel(asset.kind)} href={fileHref} variant={variant}>
      {words}
    </TextPanel>
  );
}

/** A quiet note under the asset: 12px, tertiary. */
function Aside({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-text3">{children}</p>;
}

/*
 * 80ch, not the full column. Text set to the width of a wide column is
 * unreadable however good the rest of the page is. Markdown is written at
 * about 80 columns, so the source wraps where its author wrapped it.
 */
function RawText({ text }: { text: string }) {
  return (
    <pre className="max-w-[80ch] overflow-x-auto font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-text2">
      {text}
    </pre>
  );
}

/** "Raw file", the ghost link at the right of a text card's title. */
function RawLink({ href, children = "Raw file" }: { href: string; children?: ReactNode }) {
  return (
    <TextLink href={href} external size="sm">
      {children}
    </TextLink>
  );
}

/**
 * A file's own words. On the page: a card titled with its filename and a Raw
 * file link, a fixed height that scrolls, so a long note does not push the
 * tabs under it off the page, and an icon in its corner that opens the words
 * as a popup to read at length (`ExpandablePanel`). In the previewer: the
 * words alone, since the panel is that popup already.
 */
function TextPanel({
  title,
  href,
  variant,
  children,
}: {
  title: string;
  href: string;
  variant: "page" | "preview";
  children: ReactNode;
}) {
  if (variant === "preview") return <div className="min-w-0">{children}</div>;
  return (
    <ExpandablePanel title={title} label={title} action={<RawLink href={href} />}>
      {children}
    </ExpandablePanel>
  );
}

/**
 * The asset itself could not be shown, for a reason the server already knows.
 *
 * The shared Widget placeholder failure panel, rendered on the server with no
 * probe: the switch being off, the manimkc index being missing or stale, and
 * a file that is already gone are all decided before render, so the body
 * never sends a player or an `<img>` that is certain to fail. A video's panel
 * takes the player's footprint, as the hi-fi's 400px placeholder does.
 */
function Unavailable({ kind, code, sourceRepo }: { kind: string; code: RouteProblemCode; sourceRepo: string }) {
  const subject = kind === "video" ? "This video" : kind === "diagram_svg" ? "This diagram" : "This file";
  return (
    <WidgetFailure
      headline={`${subject} cannot be shown here.`}
      code={code}
      sourceRepo={sourceRepo}
      className={kind === "video" ? "min-h-64 w-full sm:min-h-[400px]" : "min-h-48"}
    />
  );
}

/** A timecoded list: a standalone transcript or chapter sidecar, read on its own. */
function CueList({
  title,
  entries,
  href,
  variant,
}: {
  title: string;
  entries: { start: number; text: string }[];
  href: string;
  variant: "page" | "preview";
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
      {/* On the page the list scrolls in its card; in the previewer the panel scrolls. */}
      <ol className={variant === "page" ? "-mx-2 max-h-[36rem] overflow-y-auto" : "-mx-2"}>
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
      command={path === null ? "npm run catalog -- import" : "npm run catalog -- blob audit"}
      className="border-dashed"
    >
      {path === null ? (
        <p>
          The catalog holds it with neither a path nor a URL, which no indexer should produce. The catalog row is
          what the row does say.
        </p>
      ) : (
        <>
          <p>
            The row is real and its bytes are stored, so this is about the file itself: the store may have lost it
            since the page checked, it may be larger than the page reads in one go, or it may be a kind of file this
            page does not show. A blob audit finds a lost object.
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

/**
 * A stored PDF opened as an asset of its own. The file route already answers
 * `application/pdf` inline, so an `<object>` lets the browser's own viewer
 * draw it inside the card — the same bytes the video's PDF button opens in a
 * tab. A browser with no inline viewer (a phone's, mostly) gets the fallback
 * inside the object instead: the link everyone would take anyway.
 */
function PdfView({ src, title }: { src: string; title: string }) {
  return (
    <Card
      title={title}
      action={
        <RawLink href={src}>Open in a tab</RawLink>
      }
    >
      <object
        data={src}
        type="application/pdf"
        aria-label={title}
        className="block h-[80vh] w-full rounded-lg bg-white"
      >
        <p className="p-4 text-[14px] text-text2">
          This browser does not show PDFs inline.{" "}
          <TextLink href={src} external>
            Open it in a tab instead.
          </TextLink>
        </p>
      </object>
    </Card>
  );
}

/** A row with a URL and no file. There is nothing to play, so there is a link. */
function LinkPanel({ url }: { url: string | null }) {
  if (url === null) {
    return (
      <Notice title="This link has no URL" command="npm run catalog -- import" className="border-dashed">
        This link row carries no URL, which should not happen: the course indexer writes one for every resource it
        reads. Re-index to correct it.
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
function TranscriptSidecar({ text, href, variant }: { text: string; href: string; variant: "page" | "preview" }) {
  const parsed = parseTranscript(text);
  if (parsed === null || parsed.cues.length === 0) {
    return (
      <TextPanel title="Transcript" href={href} variant={variant}>
        <RawText text={text} />
      </TextPanel>
    );
  }
  return <CueList title="Transcript" entries={parsed.cues} href={href} variant={variant} />;
}

/** A chapter list opened on its own. */
function ChapterSidecar({ text, href, variant }: { text: string; href: string; variant: "page" | "preview" }) {
  const parsed = parseChapters(text);
  if (parsed === null || parsed.length === 0) {
    return (
      <TextPanel title="Chapters" href={href} variant={variant}>
        <RawText text={text} />
      </TextPanel>
    );
  }
  return (
    <CueList
      title="Chapters"
      entries={parsed.map((chapter) => ({ start: chapter.start, text: chapter.title }))}
      href={href}
      variant={variant}
    />
  );
}
