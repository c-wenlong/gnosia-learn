import type { Metadata } from "next";

import { DiagramPanelBody, type JobRow } from "@/components/studio/DiagramInspector";
import { DiagramRow, DiagramTile } from "@/components/studio/DiagramTile";
import { DraftPanel } from "@/components/studio/DraftPanel";
import { ExtendStart } from "@/components/studio/ExtendStart";
import { JobPanel } from "@/components/studio/JobPanel";
import { JobStrip } from "@/components/studio/JobStrip";
import { PlusCard } from "@/components/studio/PlusCard";
import { DialogHeader, StudioDialog } from "@/components/studio/StudioDialog";
import { ShotView } from "@/components/studio/ShotView";
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
import { capFrom, suggestions } from "@/lib/studio-chat";
import { vocabularyBanner, vocabularyTopics, type VocabularyState } from "@/lib/studio-vocabulary";
import {
  filterDiagrams,
  displayTitle,
  groupDiagrams,
  panelHref,
  parseView,
  readOutcome,
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

  const health = await studioApi<Health>("/api/health", { timeoutMs: 150_000 });
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

  // The topics come from the runner, not from the app's own content read: that
  // read is database-only and throws with Postgres down, and U3 says this
  // screen still browses and draws then. The runner answers from its D13 copy,
  // and with no copy at all the chips fall back to slugs and the banner below
  // says why.
  const [listed, jobList, vocabulary] = await Promise.all([
    studioApi<DiagramListing>("/api/diagrams", { timeoutMs: 120_000 }),
    studioApi<{ jobs: JobRow[] }>("/api/jobs?limit=200"),
    studioApi<unknown>("/api/vocabulary", { timeoutMs: 120_000 }),
  ]);
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
  const chips = topicChips(listing.diagrams, topicTitles, topicDomains);
  const visible = sortDiagrams(filterDiagrams(listing.diagrams, view), view);
  const groups = groupDiagrams(visible, view, topicTitles, topicDomains);
  const selected = listing.diagrams.find((entry) => entry.name === view.selected) ?? null;
  const allJobs = jobList.ok ? jobList.data.jobs : [];
  const jobs = allJobs.filter((job) => selected !== null && job.target === selected.tldr.path);
  // Only when a picture is open, and only then: `GET /api/jobs/{id}` is the one
  // route carrying the brief and the comparison, and the full-width view needs
  // both to say why the other side is not there rather than linking to a 404.
  const shown = view.shot !== null && view.job !== null ? await openShot(view.job) : null;

  const topicOptions = topicOptionsOf(topics);
  const cap = capFrom(health.data.dailyCap);
  const chatSuggestions = suggestions(
    listing.diagrams.map((diagram) => diagram.topic),
    topicTitles,
  );
  // Close drops every parameter the panel reads, and keeps the filters.
  const closeHref = panelHref(path, { draft: null, job: null, extend: null, selected: null, shot: null });
  const titles = Object.fromEntries(listing.diagrams.map((diagram) => [diagram.name, displayTitle(diagram)]));
  // Extend patches this view, so the filters are there when the panel closes.
  const extendFrom = (name: string) => panelHref(path, { extend: name, selected: null, job: null, draft: null });
  const dialog = view.shot !== null ? null : panelFor();

  function panelFor() {
    if (view.draft !== null) {
      return (
        // One key for a conversation and the Extend press before it, so the
        // dialog stays open while one becomes the other rather than closing
        // and opening again. The panel inside is keyed by draft.
        <StudioDialog key="conversation" closeHref={closeHref} label="Diagram conversation" tall>
          <DraftPanel
            key={view.draft}
            draftId={view.draft}
            jobId={view.job}
            path={path}
            topics={topicOptions}
            titles={titles}
            suggestions={chatSuggestions}
            cap={cap}
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
          <ExtendStart key={view.extend} name={view.extend} title={title} path={path} listed={titleOf(titles, view.extend) !== null} />
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
            title={allJobs.find((job) => job.jobId === view.job)?.target ?? view.job}
            comparison={shown?.comparison ?? null}
            mode={shown?.brief?.mode}
          />
        ) : (
          <div className="space-y-6 p-4">
            {/* The plus card is the first tile under any filter, and on an
                empty directory it is the whole grid: one way in (D31). */}
            {(visible.length === 0 || groups.length === 0) &&
              (view.layout === "grid" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                  <PlusCard path={path} />
                </div>
              ) : (
                <PlusCard path={path} layout="list" />
              ))}
            {listing.diagrams.length === 0 && listing.errors.length === 0 ? (
              <EmptyDirectory dir={listing.dir} />
            ) : visible.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No diagram matches this filter.{" "}
                <a className="underline underline-offset-2" href="/studio">
                  Clear it
                </a>
                .
              </p>
            ) : (
              groups.map((group, at) => (
                <section key={group.key}>
                  {group.label !== "" && (
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {group.label} · {group.items.length}
                    </h2>
                  )}
                  {view.layout === "grid" ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                      {at === 0 && <PlusCard path={path} />}
                      {group.items.map((diagram) => (
                        <DiagramTile
                          key={diagram.name}
                          diagram={diagram}
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
                      {group.items.map((diagram) => (
                        <DiagramRow
                          key={diagram.name}
                          diagram={diagram}
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
