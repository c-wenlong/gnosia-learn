import type { Metadata } from "next";

import { DiagramPanelBody, type JobRow } from "@/components/studio/DiagramInspector";
import { DiagramRow, DiagramTile } from "@/components/studio/DiagramTile";
import { DraftPanel } from "@/components/studio/DraftPanel";
import { DraftsList } from "@/components/studio/DraftsList";
import { ExtendStart } from "@/components/studio/ExtendStart";
import { JobPanel } from "@/components/studio/JobPanel";
import { NewDiagramJobs } from "@/components/studio/GridJob";
import { NewVideoJobs, VideoRow, VideoTile } from "@/components/studio/video/VideoGridJob";
import { JobStrip } from "@/components/studio/JobStrip";
import { PlusCard } from "@/components/studio/PlusCard";
import { DialogHeader, StudioDialog } from "@/components/studio/StudioDialog";
import { ShotView } from "@/components/studio/ShotView";
import { SettingsLink, StudioSettings } from "@/components/studio/StudioSettings";
import { BlockedCard, EmptyDirectory, type DoctorLine } from "@/components/studio/StudioBlocked";
import { Notice, Spacer, StudioStrip, VerbNotice } from "@/components/studio/StudioChrome";
import {
  DisplayMenu,
  SearchField,
  SortMenu,
  TopicChips,
} from "@/components/studio/StudioControls";
import { topicDomainMap, topicOptionsOf, topicTitleMap } from "@/data/topics";
import { openShot, requireStudio, studioApi } from "@/lib/studio";
import {
  AGENT_ROWS,
  agentDefaults,
  effortOptions,
  modelOptions,
  rowPriced,
  rowWarning,
  runnerSettings,
  storedAgent,
} from "@/lib/studio-agent-settings";
import { readStudioAgents } from "@/lib/studio-agents";
import { capFrom, suggestions } from "@/lib/studio-chat";
import { listPath } from "@/lib/studio-draft-list";
import { diagramAvailability, videoAvailability, type DraftSummary } from "@/lib/studio-drafts";
import { filterVideos, gridSections, readVideos, sortVideos } from "@/lib/studio-video";
import { vocabularyBanner, vocabularyTopics, type VocabularyState } from "@/lib/studio-vocabulary";
import {
  filterDiagrams,
  displayTitle,
  groupDiagrams,
  panelHref,
  parseView,
  readOutcome,
  shotTitle,
  sortDiagrams,
  studioHref,
  titleOf,
  topicChips,
  type DiagramListing,
  type RawParams,
} from "@/lib/studio-view";

/**
 * `/studio`: the corpus.
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
  /** The model and effort a job started now would get, per kind (D53). */
  agent?: unknown;
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
  const reads = Promise.all([
    studioApi<DiagramListing>("/api/diagrams", { timeoutMs: 120_000 }),
    studioApi<{ jobs: JobRow[] }>("/api/jobs?limit=200"),
    studioApi<unknown>("/api/vocabulary", { timeoutMs: 120_000 }),
    // The conversations to pick up again. A runner that cannot list them
    // costs the section, never the page.
    studioApi<{ drafts: DraftSummary[] }>(listPath()),
    // The owner's studio videos (docs/STUDIO-VIDEOS.md, "API"). A runner
    // without the route, or one that cannot read the catalog, costs the
    // video tiles and nothing else.
    studioApi<unknown>("/api/videos", { timeoutMs: 60_000 }),
  ]);
  // The blocked screens below leave `reads` unawaited, so a rejection there
  // (`studioApi` returns failures rather than throwing, but `currentOwner()`
  // can) must not surface as an unhandled one. The `await` further down still
  // throws it on the path that uses the answers.
  reads.catch(() => undefined);

  // Decided from health alone, as before: a wall on a failing doctor does not
  // wait for the five reads, which can take as long as their timeouts when the
  // very thing that is wrong is what they run on.
  const health = await healthCall;
  if (!health.ok) {
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
  const allVideos = videoList.ok ? readVideos(videoList.data) : [];
  // Chips count both kinds, so a topic with only videos can be picked too.
  const chips = topicChips([...listing.diagrams, ...allVideos], topicTitles, topicDomains);
  const visible = sortDiagrams(filterDiagrams(listing.diagrams, view), view);
  const groups = groupDiagrams(visible, view, topicTitles, topicDomains);
  const videoSlugs = allVideos.map((video) => video.slug);
  const shownVideos = sortVideos(filterVideos(allVideos, view), view);
  const sections = gridSections(groups, shownVideos, view.group, topicTitles, topicDomains).filter(
    (section) => section.diagrams.length + section.videos.length > 0,
  );
  const selected = listing.diagrams.find((entry) => entry.name === view.selected) ?? null;
  const allJobs = jobList.ok ? jobList.data.jobs : [];
  const jobs = allJobs.filter((job) => selected !== null && job.target === selected.tldr.path);
  // Only when a picture is open, and only then: `GET /api/jobs/{id}` is the one
  // route carrying the brief and the comparison, and the full-width view needs
  // both to say why the other side is not there rather than linking to a 404.
  const shown = view.shot !== null && view.job !== null ? await openShot(view.job) : null;
  // The settings panel's two rows, read only when it is open.
  const [agents, runnerAgents] = view.settings
    ? await Promise.all([readStudioAgents(), studioApi<unknown>("/api/settings/agent")])
    : [null, null];
  // The runner's menu (the models it can price) and its defaults when it
  // answers (#207), else health's defaults and the built-in list.
  const agentRows = runnerAgents?.ok ? runnerAgents.data : null;
  const fromRunner = runnerSettings(agentRows);
  const defaults = fromRunner.defaults ?? agentDefaults(health.data.agent);
  const videoState = videoAvailability(health.data.video);
  const diagramState = diagramAvailability(health.data.diagramAgent);

  // Every diagram's path, filtered or not: a job drawing onto one of these is
  // an extend and goes on its tile; any other target is a new diagram's card.
  const targets = listing.diagrams.map((diagram) => diagram.tldr.path);
  const topicOptions = topicOptionsOf(topics);
  const cap = capFrom(health.data.dailyCap);
  const chatSuggestions = suggestions(
    listing.diagrams.map((diagram) => diagram.topic),
    topicTitles,
  );
  // Close drops every parameter the panel reads, and keeps the filters.
  const closeHref = panelHref(path, { draft: null, job: null, extend: null, selected: null, shot: null, settings: false });
  const titles = Object.fromEntries(listing.diagrams.map((diagram) => [diagram.name, displayTitle(diagram)]));
  // A video's title by slug, for a Change conversation's header. Its own map:
  // a diagram and a video can share a slug.
  const videoTitles = Object.fromEntries(allVideos.map((video) => [video.slug, video.title ?? video.slug]));
  // Extend patches this view, so the filters are there when the panel closes.
  const extendFrom = (name: string) => panelHref(path, { extend: name, selected: null, job: null, draft: null });
  const dialog = view.shot !== null ? null : panelFor();

  function panelFor() {
    if (view.settings && agents !== null) {
      return (
        <StudioDialog key="settings" closeHref={closeHref} label="Settings" compact>
          <DialogHeader title="Settings" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <StudioSettings
              reachable={agents.reachable}
              rows={AGENT_ROWS.map((row) => ({
                ...row,
                value: agents.values[row.kind],
                fallback: storedAgent(row.kind, null),
                models: modelOptions(agents.values[row.kind].model, defaults, fromRunner.models ?? undefined, rowPriced(agentRows, row.kind)),
                efforts: effortOptions(defaults),
                warning: rowWarning(agentRows, row.kind),
              }))}
            />
          </div>
        </StudioDialog>
      );
    }
    if (view.draft !== null) {
      return (
        // One key for a conversation and the Extend press before it, so the
        // dialog stays open while one becomes the other rather than closing
        // and opening again. The panel inside is keyed by draft.
        <StudioDialog key="conversation" closeHref={closeHref} label="Conversation" tall>
          <DraftPanel
            key={view.draft}
            draftId={view.draft}
            jobId={view.job}
            path={path}
            topics={topicOptions}
            titles={titles}
            videoTitles={videoTitles}
            suggestions={chatSuggestions}
            cap={cap}
            video={videoState}
            diagramAgent={diagramState}
          />
        </StudioDialog>
      );
    }
    if (view.job !== null) {
      const title = allJobs.find((job) => job.jobId === view.job)?.title ?? "Job";
      return (
        <StudioDialog key="job" closeHref={closeHref} label={title}>
          <DialogHeader title={title} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <JobPanel jobId={view.job} path={path} embedded />
          </div>
        </StudioDialog>
      );
    }
    if (view.extend !== null) {
      const title = titleOf(titles, view.extend) ?? view.extend;
      return (
        <StudioDialog key="conversation" closeHref={closeHref} label={`Extending ${title}`} tall>
          {/* Keyed by name: Extend on another diagram is another press, with its own post. */}
          <ExtendStart key={view.extend} name={view.extend} title={title} path={path} listed={titleOf(titles, view.extend) !== null} talk={view.talk} />
        </StudioDialog>
      );
    }
    if (view.selected !== null) {
      const title = selected === null ? view.selected : displayTitle(selected);
      return (
        <StudioDialog key={`sel:${view.selected}`} closeHref={closeHref} label={title}>
          <DialogHeader title={title} />
          {/* A verb run from this panel redirects back to it, so what it did is
              said here, where the person is looking, and not behind the dimmed
              grid. */}
          {outcome !== null && <VerbNotice report={outcome} clearHref={path} />}
          {selected === null ? (
            <p className="p-5 text-[14px] text-text2">
              There is no diagram named <span className="font-mono">{view.selected}</span> in this studio.
            </p>
          ) : (
            <DiagramPanelBody diagram={selected} jobs={jobs} path={path} extendHref={extendFrom(selected.name)} />
          )}
        </StudioDialog>
      );
    }
    return null;
  }

  return (
    <div data-layout="full" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <StudioStrip>
        <SearchField view={view} />
        <TopicChips chips={chips} view={view} />
        <Spacer />
        <DisplayMenu view={view} />
        <SortMenu view={view} />
        <SettingsLink href={studioHref(view, { settings: true, draft: null, job: null, extend: null, selected: null, shot: null })} />
      </StudioStrip>

      <JobStrip path={path} stream={view.stream} />

      {outcome !== null && view.selected === null && <VerbNotice report={outcome} clearHref={path} />}

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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view.shot !== null && view.job !== null ? (
          /* A thumbnail was clicked. The panel closes behind it and one Close
             brings it back, because a picture of a diagram is worth the whole
             width. */
          <ShotView
            jobId={view.job}
            which={view.shot}
            path={path}
            title={shotTitle(allJobs, view.job)}
            comparison={shown?.comparison ?? null}
            mode={shown?.brief?.mode}
          />
        ) : (
          <div className="space-y-6 p-4">
            <DraftsList
              initial={drafts}
              path={path}
              titles={titles}
            />
            {/* The plus card is the first tile under any filter, and on an
                empty directory it is the whole grid: one way in (D31). */}
            {sections.length === 0 &&
              (view.layout === "grid" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                  <PlusCard path={path} />
                  <NewDiagramJobs targets={targets} path={path} layout="grid" />
                  <NewVideoJobs slugs={videoSlugs} path={path} layout="grid" />
                </div>
              ) : (
                <div className="space-y-0.5">
                  <PlusCard path={path} layout="list" />
                  <NewDiagramJobs targets={targets} path={path} layout="list" />
                  <NewVideoJobs slugs={videoSlugs} path={path} layout="list" />
                </div>
              ))}
            {sections.length === 0 ? (
              listing.diagrams.length === 0 && listing.errors.length === 0 && allVideos.length === 0 ? (
                <EmptyDirectory dir={listing.dir} />
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  {allVideos.length === 0 ? "No diagram matches this filter." : "No diagram or video matches this filter."}{" "}
                  <a className="underline underline-offset-2" href="/studio">
                    Clear it
                  </a>
                  .
                </p>
              )
            ) : (
              // Diagrams and studio videos share the groups, in one order:
              // a topic with only videos sits among the rest, not above them.
              sections.map((section, at) => (
                <section key={section.key}>
                  {section.label !== "" && (
                    <h2 className="mb-2 text-xs font-semibold text-[var(--muted-strong)]">
                      {section.label} · {section.diagrams.length + section.videos.length}
                    </h2>
                  )}
                  {view.layout === "grid" ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                      {at === 0 && <PlusCard path={path} />}
                      {/* A new diagram or video being made sits beside the way in. */}
                      {at === 0 && <NewDiagramJobs targets={targets} path={path} layout="grid" />}
                      {at === 0 && <NewVideoJobs slugs={videoSlugs} path={path} layout="grid" />}
                      {section.videos.map((video) => (
                        <VideoTile key={video.slug} video={video} path={path} />
                      ))}
                      {section.diagrams.map((diagram) => (
                        <DiagramTile
                          key={diagram.name}
                          diagram={diagram}
                          path={path}
                          selected={diagram.name === view.selected}
                          selectHref={studioHref(view, { selected: diagram.name })}
                          extendHref={extendFrom(diagram.name)}
                          showConcepts={view.chips}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {at === 0 && <PlusCard path={path} layout="list" />}
                      {at === 0 && <NewDiagramJobs targets={targets} path={path} layout="list" />}
                      {at === 0 && <NewVideoJobs slugs={videoSlugs} path={path} layout="list" />}
                      {section.videos.map((video) => (
                        <VideoRow key={video.slug} video={video} path={path} />
                      ))}
                      {section.diagrams.map((diagram) => (
                        <DiagramRow
                          key={diagram.name}
                          diagram={diagram}
                          path={path}
                          selected={diagram.name === view.selected}
                          selectHref={studioHref(view, { selected: diagram.name })}
                          showConcepts={view.chips}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))
            )}
          </div>
        )}
      </div>

      {dialog}
    </div>
  );
}
