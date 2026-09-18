import Link from "next/link";

import { exportSvg, inspectDiagram, verifySvg } from "@/app/studio/actions";
import { Button, ButtonLink, Chip, MetaRow, Mono, PanelHeading } from "@/components/studio/StudioChrome";
import {
  canvasHref,
  displayTitle,
  formatBytes,
  freshness,
  panelHref,
  relativeTime,
  thumbnailHref,
  type Diagram,
  type DiagramListing,
} from "@/lib/studio-view";

/**
 * The right panel: 320px, its own scroll, and the properties of one thing.
 *
 * Figma's rule, which the research table adopted whole: the left is structure
 * and navigation, the right is the properties of whatever is selected. With
 * nothing selected it is the directory's own facts, which is also the only
 * place a `.tldr` that will not parse is ever visible (U6) — such a file has no
 * card, because there is nothing to draw.
 */

export function DiagramInspector({
  listing,
  diagram,
  jobs,
  path,
}: {
  listing: DiagramListing;
  diagram: Diagram | null;
  jobs: JobRow[];
  path: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--surface-raised)] p-3">
      {diagram === null ? (
        <DirectoryFacts listing={listing} />
      ) : (
        <SelectedDiagram diagram={diagram} jobs={jobs} path={path} />
      )}
    </div>
  );
}

function DirectoryFacts({ listing }: { listing: DiagramListing }) {
  const { total, withTopic, unreadable } = listing.counts;
  return (
    <>
      <PanelHeading>Directory</PanelHeading>
      <p className="mb-3 font-mono text-xs break-all text-[var(--muted-strong)]">{listing.dir}</p>
      <p className="text-xs text-[var(--muted-strong)]">
        {total} diagram{total === 1 ? "" : "s"}, {withTopic} with a topic
        {unreadable > 0 ? `, ${unreadable} unreadable` : ""}
      </p>

      {listing.errors.length > 0 && (
        <div className="mt-5">
          <PanelHeading>Errors</PanelHeading>
          <p className="mb-2 text-xs text-[var(--muted)]">
            These files are in the directory and not in the grid: nothing can draw a document that
            will not parse.
          </p>
          <ul className="space-y-2">
            {listing.errors.map((problem) => (
              <li
                key={problem.path}
                className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] p-2"
              >
                <p className="font-mono text-xs break-all text-[var(--danger)]">{problem.path}</p>
                <p className="mt-1 text-xs text-[var(--danger)]">{problem.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-xs text-[var(--muted)]">
        Select a card to see its metadata, its SVG and the jobs that touched it.
      </p>
    </>
  );
}

function SelectedDiagram({
  diagram,
  jobs,
  path,
}: {
  diagram: Diagram;
  jobs: JobRow[];
  path: string;
}) {
  const pill = freshness(diagram.svgState);
  return (
    <>
      <div className="mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[#f7f6f3]">
        {diagram.svg.exists ? (
          /* Same as the grid tile: the runner streams a file from outside the
             app's tree, and an SVG is not a format the optimiser would resize. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailHref(diagram.name)}
            alt={displayTitle(diagram)}
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <span className="text-xs text-[var(--muted)]">not exported</span>
        )}
      </div>

      <h2 className="text-sm font-medium">{displayTitle(diagram)}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {diagram.topic === null ? (
          <Chip tone="warn">No topic</Chip>
        ) : (
          <Chip tone="accent">{diagram.topic}</Chip>
        )}
        <Chip tone={pill.tone === "ok" ? "ok" : "warn"} title={pill.title}>
          {pill.label}
        </Chip>
      </div>

      {diagram.topic === null && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          The indexer refuses a document with no topic by name, so this one is in no catalog. Set
          one with{" "}
          <Mono>npm run --silent canvas -- meta set {diagram.tldr.path} --topic &lt;slug&gt;</Mono>,
          then export the SVG again: the export is what stamps the topic onto it.
        </p>
      )}

      <div className="mt-4">
        <PanelHeading>Details</PanelHeading>
        <MetaRow label="Concepts">
          {diagram.concepts.length === 0 ? (
            <span className="text-[var(--muted)]">none recorded</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {diagram.concepts.map((slug) => (
                <Chip key={slug}>{slug}</Chip>
              ))}
            </span>
          )}
        </MetaRow>
        <MetaRow label="Document">
          <Mono>{diagram.tldr.path}</Mono>
        </MetaRow>
        <MetaRow label="Shapes">{diagram.shapes}</MetaRow>
        <MetaRow label="Created">
          {diagram.created === null ? "not recorded" : diagram.created.slice(0, 10)}
        </MetaRow>
        <MetaRow label="Modified">
          {relativeTime(diagram.tldr.modified)}
          {diagram.tldr.modified !== null && (
            <span className="block text-[var(--muted)]">{diagram.tldr.modified}</span>
          )}
        </MetaRow>
        <MetaRow label="Source note">
          {diagram.source === null ? (
            <span className="text-[var(--muted)]">none</span>
          ) : (
            <Mono>{diagram.source}</Mono>
          )}
        </MetaRow>
        <MetaRow label="SVG">
          {diagram.svg.exists ? (
            <>
              <Mono>{diagram.svg.path}</Mono>
              <span className="block text-[var(--muted)]">
                {formatBytes(diagram.svg.bytes)} · {relativeTime(diagram.svg.modified)}
                {diagram.svgState === "stale" ? " · older than the document" : ""}
              </span>
            </>
          ) : (
            <span className="text-[var(--warn)]">never exported</span>
          )}
        </MetaRow>
      </div>

      <div className="mt-4">
        <PanelHeading>Verbs</PanelHeading>
        <div className="flex flex-wrap gap-1.5">
          <ButtonLink href={canvasHref(diagram.name)} filled>
            Open canvas
          </ButtonLink>
          <VerbForm action={exportSvg} name={diagram.name} path={path} label="Export SVG" />
          <VerbForm action={verifySvg} name={diagram.name} path={path} label="Verify" />
          <VerbForm action={inspectDiagram} name={diagram.name} path={path} label="Inspect" />
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Each one runs in the studio runner and launches its own Chromium, so it takes a few
          seconds. The result is the file on disk: this panel redraws from it.
        </p>
      </div>

      <div className="mt-5">
        <PanelHeading>Jobs</PanelHeading>
        {jobs.length === 0 ? (
          <>
            <p className="text-xs text-[var(--muted)]">no jobs for this diagram</p>
            <div className="mt-2">
              <ButtonLink href={panelHref(path, { brief: "", job: null })}>New job</ButtonLink>
            </div>
          </>
        ) : (
          <ul className="space-y-1">
            {jobs.map((job) => (
              <li key={job.jobId}>
                {/* Each row opens that job in this panel: the history is a way
                    back into a job, not a list of dates. */}
                <Link
                  href={panelHref(path, { job: job.jobId, brief: null })}
                  scroll={false}
                  className="flex h-8 items-center gap-2 rounded-md px-1 text-xs hover:bg-[var(--surface-hover)]"
                >
                  <span className="w-20 shrink-0 text-[var(--muted)]">
                    {job.requested.slice(0, 10)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{job.title ?? job.jobId}</span>
                  <Chip tone={job.state === "failed" ? "danger" : "muted"}>{job.state}</Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export interface JobRow {
  jobId: string;
  state: string;
  title: string | null;
  target: string;
  requested: string;
}

function VerbForm({
  action,
  name,
  path,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
  path: string;
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="path" value={path} />
      <Button type="submit">{label}</Button>
    </form>
  );
}
