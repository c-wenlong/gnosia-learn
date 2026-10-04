import type { Metadata } from "next";

import type { JobRow } from "@/components/studio/DiagramInspector";
import { PanelHost } from "@/components/studio/PanelHost";
import { HomeComposer } from "@/components/studio/HomeComposer";
import { ExtendStart } from "@/components/studio/ExtendStart";
import { JobStrip } from "@/components/studio/JobStrip";
import { RenewLists } from "@/components/studio/RenewLists";
import { StudioDialog } from "@/components/studio/StudioDialog";
import { ShotView } from "@/components/studio/ShotView";
import { BlockedCard, type DoctorLine } from "@/components/studio/StudioBlocked";
import { Notice, StudioStrip, VerbNotice } from "@/components/studio/StudioChrome";
import { StudioGrid, StudioToolbar, WhileOutcome } from "@/components/studio/StudioBrowse";
import { topicDomainMap, topicOptionsOf, topicTitleMap } from "@/data/topics";
import { openShot, requireStudio, studioApi } from "@/lib/studio";
import { capFrom, suggestions } from "@/lib/studio-chat";
import { listPath } from "@/lib/studio-draft-list";
import { diagramAvailability, videoAvailability, type DraftSummary } from "@/lib/studio-drafts";
import { readVideos } from "@/lib/studio-video";
import { vocabularyBanner, vocabularyTopics, type VocabularyState } from "@/lib/studio-vocabulary";
import {
  CLOSED,
  displayTitle,
  panelHref,
  panelSignature,
  parseView,
  readOutcome,
  shotTitle,
  studioHref,
  titleOf,
  topicChips,
  type DiagramListing,
  type RawParams,
} from "@/lib/studio-view";

/**
 * `/studio`: a composer to start a conversation, and the corpus under it.
 *
 * The home view (docs/STUDIO-CHAT-FIRST.md, "Home and the full-screen
 * conversation"): a heading and the composer in the middle, then the
 * diagrams and videos, with the conversations down the app's sidebar beside
 * it (`PanelHost` tells it which one is open). Sending opens the conversation full screen.
 *
 * Reads the directory through the runner, never the `asset` table. That is the
 * whole reason this screen is not a second view of `/library`: the diagram
 * indexer refuses a `.tldr` with no topic *by name*, so such a file has no
 * asset row and would be invisible in a table-backed list — and it is the one
 * file a person most needs to see, because nothing else in the repo will
 * mention it until somebody fixes it.
 *
 * Every read here is a server-side call to `127.0.0.1:7250`, which is layering
 * rule 1: the UI never spawns a process and never touches a file.
 */

export const metadata: Metadata = {
  title: "Studio",
  // Local-only, and 404 in production anyway (D11). Saying so costs one line.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface Health {
  ok: boolean;
  tldrawkc: boolean;
  postgres: boolean;
  stale: boolean;
  checks: DoctorLine[];
  note: string;
  /** Where the topic list stands (D13). Optional: an older runner does not send it. */
  vocabulary?: VocabularyState;
  /** The rolling day's spend against `STUDIO_DAILY_USD`, which Draw and Send are disabled on. */
  dailyCap?: unknown;
  /** The video doctor (docs/STUDIO-VIDEOS.md, "API"): whether Video can be tagged and made. */
  video?: unknown;
  /** Whether a diagram job can be queued at all (#206). */
  diagramAgent?: unknown;
}

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  requireStudio();

  const params = await searchParams;
  const view = parseView(params);
  const path = studioHref(view);
  // What the last verb did, if the person reached this page through one.
  const outcome = readOutcome(params);

  // Health and the five reads the grid is drawn from all start now, so a load
  // costs the slowest of them and not health plus the slowest. Health has
  // answered from its cached checks since #218 (milliseconds), but each of the
  // five still runs a catalog subprocess in the runner, which is 1 to 2 s
  // under load.
  //
  // The topics come from the runner, not from the app's own content read: that
  // read is database-only and throws with Postgres down, and U3 says this
  // screen still browses and draws then. The runner answers from its D13 copy,
  // and with no copy at all the chips fall back to slugs and the banner below
  // says why.
  const healthCall = studioApi<Health>("/api/health", { timeoutMs: 150_000 });
  // One signal for the five: a blocked screen aborts them, so the runner is not
  // left running catalog subprocesses for answers nobody will read.
  const moot = new AbortController();
  const { signal } = moot;
  const reads = Promise.all([
    studioApi<DiagramListing>("/api/diagrams", { timeoutMs: 120_000, signal }),
    studioApi<{ jobs: JobRow[] }>("/api/jobs?limit=200", { signal }),
    studioApi<unknown>("/api/vocabulary", { timeoutMs: 120_000, signal }),
    // The conversations to pick up again. A runner that cannot list them
    // costs the section, never the page.
    studioApi<{ drafts: DraftSummary[] }>(listPath(), { signal }),
    // The owner's studio videos (docs/STUDIO-VIDEOS.md, "API"). A runner
    // without the route, or one that cannot read the catalog, costs the
    // video tiles and nothing else.
    studioApi<unknown>("/api/videos", { timeoutMs: 60_000, signal }),
  ]);
  // The blocked screens below leave `reads` unawaited (and abort them), so a
  // rejection there (`studioApi` returns failures rather than throwing, but
  // `currentOwner()` can) must not surface as an unhandled one. The `await` further down still
  // throws it on the path that uses the answers.
  reads.catch(() => undefined);

  // Decided from health alone, as before: a wall on a failing doctor does not
  // wait for the five reads, which can take as long as their timeouts when the
  // very thing that is wrong is what they run on.
  const health = await healthCall;
  if (!health.ok) {
    moot.abort();
    return (
      <div data-layout="full" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <BlockedCard
          title={health.headline}
          lead={health.detail}
          commands={
            health.reason === "down" ? ["npm run studio", "# from the repository root"] : []
          }
          retryHref={path}
        />
      </div>
    );
  }

  // U4: a doctor failure replaces the screen. A grid that half works — no
  // thumbnails, every verb 503 — is worse than a page that says what is wrong.
  if (!health.data.tldrawkc) {
    moot.abort();
    return (
      <div data-layout="full" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <BlockedCard
          title="tldrawkc cannot run on this machine"
          lead="Every verb the studio drives launches this tool, so nothing here would work. doctor says:"
          lines={health.data.checks}
          commands={[
            "git submodule update --init tools/tldrawkc",
            "(cd tools/tldrawkc && npm ci && npm run build)",
          ]}
          retryHref={path}
        />
      </div>
    );
  }

  const [listed, jobList, vocabulary, draftList, videoList] = await reads;
  const drafts = draftList.ok && Array.isArray(draftList.data.drafts) ? draftList.data.drafts : null;
  const topics = vocabulary.ok ? vocabularyTopics(vocabulary.data) : [];
  const staleVocabulary = vocabularyBanner(health.data.vocabulary);
  const topicTitles = topicTitleMap(topics);
  const topicDomains = topicDomainMap(topics);
  if (!listed.ok) {
    return (
      <div data-layout="full" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <BlockedCard title={listed.headline} lead={listed.detail} retryHref={path} />
      </div>
    );
  }

  const listing = listed.data;
  // A list the runner served from memory while it reads a newer one: the page
  // asks again once that has landed (`RenewLists`).
  const renewing = [listed.data, vocabulary.ok ? vocabulary.data : null, videoList.ok ? videoList.data : null].some(renewingList);
  const allVideos = videoList.ok ? readVideos(videoList.data) : [];
  // Chips count both kinds, so a topic with only videos can be picked too.
  const chips = topicChips([...listing.diagrams, ...allVideos], topicTitles, topicDomains);
  const allJobs = jobList.ok ? jobList.data.jobs : [];
  // What a tile's history and a job's title need, and no more: the rows are
  // sent to the browser, which draws those panels (`PanelHost`).
  const jobRows: JobRow[] = allJobs.map(({ jobId, state, title, target, requested }) => ({ jobId, state, title, target, requested }));
  // Only when a picture is open, and only then: `GET /api/jobs/{id}` is the one
  // route carrying the brief and the comparison, and the full-width view needs
  // both to say why the other side is not there rather than linking to a 404.
  const shown = view.shot !== null && view.job !== null ? await openShot(view.job) : null;
  const videoState = videoAvailability(health.data.video);
  // A job's picture, full width, in place of the home view (the strip stays).
  const shot = view.shot !== null && view.job !== null ? { jobId: view.job, which: view.shot } : null;
  const diagramState = diagramAvailability(health.data.diagramAgent);

  const topicOptions = topicOptionsOf(topics);
  const cap = capFrom(health.data.dailyCap);
  const chatSuggestions = suggestions(
    listing.diagrams.map((diagram) => diagram.topic),
    topicTitles,
  );
  // Close drops every parameter the panel reads, and keeps the filters.
  const closeHref = panelHref(path, CLOSED);
  const titles = Object.fromEntries(listing.diagrams.map((diagram) => [diagram.name, displayTitle(diagram)]));
  // A video's title by slug, for a Change conversation's header. Its own map:
  // a diagram and a video can share a slug.
  const videoTitles = Object.fromEntries(allVideos.map((video) => [video.slug, video.title ?? video.slug]));
  const dialog = view.shot !== null ? null : panelFor();

  function panelFor() {
    // The settings, a conversation, a job, a tile and a video's preview are
    // `PanelHost`'s, which opens and closes them in the browser without
    // coming back here.
    if (view.settings || view.draft !== null || view.job !== null) return null;
    if (view.extend !== null) {
      const title = titleOf(titles, view.extend) ?? view.extend;
      return (
        <StudioDialog key="conversation" closeHref={closeHref} label={`Extending ${title}`} tall>
          {/* Keyed by name: Extend on another diagram is another press, with its own post. */}
          <ExtendStart key={view.extend} name={view.extend} title={title} path={path} listed={titleOf(titles, view.extend) !== null} talk={view.talk} video={videoState} />
        </StudioDialog>
      );
    }
    return null;
  }

  return (
    <div data-layout="full" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PanelHost
        panel={dialog}
        panelKey={panelSignature(params)}
        topics={topicOptions}
        titles={titles}
        videoTitles={videoTitles}
        suggestions={chatSuggestions}
        cap={cap}
        video={videoState}
        diagramAgent={diagramState}
        diagrams={listing.diagrams}
        videos={allVideos}
        jobs={jobRows}
        drafts={drafts}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* The composer is the home view's; a picture takes its place. */}
          {/* The home view's first screen is the composer's: the assets panel
              under it shows only its head and the top of the first row, as
              Lovable's does, so the grid is there without competing. */}
          {shot === null && (
            <section
              aria-labelledby="studio-home"
              className="relative flex min-h-[calc(100dvh-12rem)] flex-col justify-center px-4 py-12 md:min-h-[calc(100dvh-9rem)]"
            >
              {/* A soft wash of the accent behind the heading, in tokens, so every theme has its own. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_45%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent)]"
              />
              <div className="relative mx-auto flex w-full max-w-3xl -translate-y-4 flex-col items-center gap-7">
                <h1 id="studio-home" className="text-center font-display text-[30px] font-semibold leading-tight text-text md:text-[40px]">
                  What shall we make?
                </h1>
                <HomeComposer path={path} video={videoState} />
              </div>
            </section>
          )}

          <div className={shot === null ? "relative mx-2 min-h-full rounded-t-3xl border border-b-0 border-hair bg-surface md:mx-4" : undefined}>
            <StudioStrip surface={shot === null}>
              <StudioToolbar chips={chips} />
            </StudioStrip>

            <JobStrip path={path} stream={view.stream} />
            {renewing && <RenewLists />}

            {/* Said once: a view change in the browser drops the outcome from the URL. */}
            {outcome !== null && view.selected === null && (
              <WhileOutcome>
                <VerbNotice report={outcome} clearHref={path} />
              </WhileOutcome>
            )}

            {/* U5 and U3: both mean everything still works, so both are banners. */}
            {/* D13: the topic list is the saved copy, or there is none. */}
            {staleVocabulary !== null && <Notice tone={staleVocabulary.tone}>{staleVocabulary.text}</Notice>}
            {health.data.stale && (
              <Notice>
                The tldrawkc page bundle is older than its source. Everything still runs; rebuild with{" "}
                <span className="font-mono">(cd tools/tldrawkc &amp;&amp; npm run build)</span> when
                convenient.
              </Notice>
            )}
            {!health.data.postgres && (
              <Notice>
                Not connected to the catalog: browsing and drawing still work, and Accept waits for it,
                since a diagram lands in the database.
                {listing.stale === true && listing.readAt !== undefined && (
                  <> This list is the copy read at {new Date(listing.readAt).toLocaleString()}.</>
                )}
              </Notice>
            )}
            {/* U6: a document that will not parse has no tile, so this is the only
                place it is visible. It used to be the empty inspector's content. */}
            {listing.errors.length > 0 && (
              <Notice tone="danger">
                <details>
                  <summary className="cursor-pointer">
                    {listing.errors.length} diagram{listing.errors.length === 1 ? "" : "s"} could not be read and{" "}
                    {listing.errors.length === 1 ? "is" : "are"} not in the grid.
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {listing.errors.map((problem) => (
                      <li key={problem.path}>
                        <span className="font-mono">{problem.path}</span>: {problem.message}
                      </li>
                    ))}
                  </ul>
                </details>
              </Notice>
            )}

            {shot !== null ? (
              /* A thumbnail was clicked. The panel closes behind it and one Close
                 brings it back, because a picture of a diagram is worth the whole
                 width. */
              <ShotView
                jobId={shot.jobId}
                which={shot.which}
                path={path}
                title={shotTitle(allJobs, shot.jobId)}
                comparison={shown?.comparison ?? null}
                mode={shown?.brief?.mode}
              />
            ) : (
              <div className="space-y-6 p-4">
                <StudioGrid
                  diagrams={listing.diagrams}
                  videos={allVideos}
                  titles={Object.fromEntries(topicTitles)}
                  domains={Object.fromEntries(topicDomains)}
                  dir={listing.dir}
                  unreadable={listing.errors.length}
                  path={path}
                />
              </div>
            )}
          </div>
        </div>
      </PanelHost>
    </div>
  );
}

/** Whether a runner list answer says a newer read of it is running (`cache.renewing`). */
function renewingList(answer: unknown): boolean {
  if (typeof answer !== "object" || answer === null) return false;
  const cache = (answer as { cache?: unknown }).cache;
  return typeof cache === "object" && cache !== null && (cache as { renewing?: unknown }).renewing === true;
}
