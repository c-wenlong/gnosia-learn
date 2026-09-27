import type { Metadata } from "next";

import { BriefForm } from "@/components/studio/BriefForm";
import { DiagramInspector, type JobRow } from "@/components/studio/DiagramInspector";
import { DiagramRow, DiagramTile } from "@/components/studio/DiagramTile";
import { JobPanel } from "@/components/studio/JobPanel";
import { JobStrip } from "@/components/studio/JobStrip";
import { ShotView } from "@/components/studio/ShotView";
import { BlockedCard, EmptyDirectory, type DoctorLine } from "@/components/studio/StudioBlocked";
import {
  ButtonLink,
  Notice,
  Spacer,
  StudioStrip,
  VerbNotice,
} from "@/components/studio/StudioChrome";
import {
  DisplayMenu,
  SearchField,
  SortMenu,
  TopicChips,
} from "@/components/studio/StudioControls";
import { getTopics, topicDomainMap, topicOptionsOf, topicTitleMap } from "@/data/topics";
import { openShot, requireStudio, studioApi } from "@/lib/studio";
import {
  filterDiagrams,
  groupDiagrams,
  parseView,
  readOutcome,
  sortDiagrams,
  studioHref,
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
      <div data-layout="full" className="flex min-h-0 flex-1 flex-col">
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
      <div data-layout="full" className="flex min-h-0 flex-1 flex-col">
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

  const [listed, jobList, topics] = await Promise.all([
    studioApi<DiagramListing>("/api/diagrams", { timeoutMs: 120_000 }),
    studioApi<{ jobs: JobRow[] }>("/api/jobs?limit=200"),
    getTopics(),
  ]);
  const topicTitles = topicTitleMap(topics);
  const topicDomains = topicDomainMap(topics);
  if (!listed.ok) {
    return (
      <div data-layout="full" className="flex min-h-0 flex-1 flex-col">
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

  return (
    <div data-layout="full" className="flex min-h-0 flex-1 flex-col">
      <StudioStrip>
        <SearchField view={view} />
        <TopicChips chips={chips} view={view} />
        <Spacer />
        <DisplayMenu view={view} />
        <SortMenu view={view} />
        <ButtonLink href={studioHref(view, { panel: !view.panel })}>
          {view.panel ? "Hide panel" : "Show panel"}
        </ButtonLink>
        {/* The one filled button on this screen, which is what the design
            says it is: everything else here is navigation. */}
        <ButtonLink href={studioHref(view, { brief: "", job: null, panel: true })} filled>
          New diagram
        </ButtonLink>
      </StudioStrip>

      <JobStrip path={path} stream={view.stream} />

      {outcome !== null && <VerbNotice report={outcome} clearHref={path} />}

      {/* U5 and U3: both mean everything still works, so both are banners. */}
      {health.data.stale && (
        <Notice>
          The tldrawkc page bundle is older than its source. Everything still runs; rebuild with{" "}
          <span className="font-mono">(cd tools/tldrawkc &amp;&amp; npm run build)</span> when
          convenient.
        </Notice>
      )}
      {!health.data.postgres && (
        <Notice>
          Not connected to the catalog: browsing and drawing still work, and anything that indexes
          will report <span className="font-mono">indexed: false</span>.
        </Notice>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {view.shot !== null && view.job !== null ? (
            /* A thumbnail was clicked. The grid is behind it and one Close
               brings it back, because a picture of a diagram is worth the whole
               width and 320px of panel is not enough to look at one. */
            <ShotView
              jobId={view.job}
              which={view.shot}
              path={path}
              title={allJobs.find((job) => job.jobId === view.job)?.target ?? view.job}
              comparison={shown?.comparison ?? null}
              mode={shown?.brief?.mode}
            />
          ) : listing.diagrams.length === 0 && listing.errors.length === 0 ? (
            <EmptyDirectory dir={listing.dir} />
          ) : visible.length === 0 ? (
            <div className="p-8 text-sm text-[var(--muted)]">
              No diagram matches this filter.{" "}
              <a className="underline underline-offset-2" href="/studio">
                Clear it
              </a>
              .
            </div>
          ) : (
            <div className="space-y-6 p-4">
              {groups.map((group) => (
                <section key={group.key}>
                  {group.label !== "" && (
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {group.label} · {group.items.length}
                    </h2>
                  )}
                  {view.layout === "grid" ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                      {group.items.map((diagram) => (
                        <DiagramTile
                          key={diagram.name}
                          diagram={diagram}
                          selected={diagram.name === view.selected}
                          selectHref={studioHref(view, { selected: diagram.name })}
                          showConcepts={view.chips}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
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
              ))}
            </div>
          )}
        </div>

        {/* Below 1280px the panel is off by default and the strip's toggle
            brings it back; below 1024px it is not rendered inline at all. */}
        {/* The right panel has three contents and the URL says which: the
            brief form, one job, or the inspector. All three are the same 320px
            column, because a form that replaced the screen would hide the thing
            the brief is about. */}
        {view.panel && (
          <aside className="hidden w-80 shrink-0 border-l border-[var(--border)] lg:block">
            {view.brief !== null ? (
              <BriefForm path={path} topics={topicOptionsOf(topics)} from={view.brief} suggested={undefined} />
            ) : view.job !== null ? (
              <JobPanel jobId={view.job} path={path} />
            ) : (
              <DiagramInspector listing={listing} diagram={selected} jobs={jobs} path={path} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
