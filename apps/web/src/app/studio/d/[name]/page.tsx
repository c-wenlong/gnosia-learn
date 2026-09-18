import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { exportSvg, inspectDiagram, restartMirror, verifySvg } from "@/app/studio/actions";
import { BriefForm } from "@/components/studio/BriefForm";
import { DiagramInspector, type JobRow } from "@/components/studio/DiagramInspector";
import { JobPanel } from "@/components/studio/JobPanel";
import { JobStrip } from "@/components/studio/JobStrip";
import { MirrorKeepAlive } from "@/components/studio/MirrorKeepAlive";
import { ShotView } from "@/components/studio/ShotView";
import { BlockedCard, type DoctorLine } from "@/components/studio/StudioBlocked";
import {
  Button,
  ButtonLink,
  Chip,
  Notice,
  Spacer,
  StudioStrip,
  VerbNotice,
} from "@/components/studio/StudioChrome";
import { topicOptions } from "@/data/topics";
import { requireStudio, studioApi } from "@/lib/studio";
import {
  canvasHref,
  displayTitle,
  freshness,
  panelHref,
  parsePanel,
  readOutcome,
  type Diagram,
  type DiagramListing,
  type RawParams,
} from "@/lib/studio-view";

/**
 * `/studio/d/<name>`: one document on a live tldraw canvas.
 *
 * The canvas is an iframe over `canvas serve`, which is a different origin from
 * this page — a different port is a different origin — so D13 applies in full:
 * the studio reads nothing out of the frame and writes nothing into it.
 * `window.__tldrawkcMirror` is unreachable, a `fetch` of that port's
 * `/api/health` is blocked before it leaves the browser, and the mirror page
 * has no `postMessage` listener, so there is no channel in either direction and
 * adding one would be a change to the submodule.
 *
 * What is on this screen is therefore exactly what the *runner* can know: the
 * file it was asked to serve, the port and URL `serve --json` printed, whether
 * that port answers when the runner polls it server-side, and the two files'
 * modified times. Saving, unsaved edits, a failed save and a reload over
 * unsaved work are all things the mirror says in its own overlay (U10), and the
 * studio does not restate any of them.
 *
 * The freshness pill is the one thing the mirror cannot say, because it is not
 * about the document at all: it is whether the committed SVG beside it is
 * older. That is a fact about disk, computed on the server from two `stat`
 * calls, and clicking the pill runs `export --svg` over the same path.
 *
 * Note the strip also carries no chrome *inside* the frame. tldraw takes all
 * four corners and both bottom edges, and the mirror page has already claimed
 * top-right for its status overlay and top-centre for its reload banner, so
 * there is no free zone left (D12).
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)} · Studio`, robots: { index: false, follow: false } };
}

interface Mirror {
  file: string;
  url: string;
  port: number;
  healthy: boolean | null;
  /** Optional on the wire: a runner one version behind does not send it. */
  idleMs?: number;
  note: string;
}

interface Health {
  tldrawkc: boolean;
  postgres: boolean;
  stale: boolean;
  checks: DoctorLine[];
}

export default async function CanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<RawParams>;
}) {
  requireStudio();

  const query = await searchParams;
  const outcome = readOutcome(query);
  // The canvas route has no view — no filters, no sort, no selection — but it
  // has the same right panel, so it reads the same three parameters.
  const panel = parsePanel(query);

  // A page's `params` are not URL-decoded, unlike a route handler's. The two
  // sides of the same URL disagree and nothing in the type says which you have,
  // so this decodes explicitly rather than using the segment as a key.
  const { name: raw } = await params;
  const name = safeDecode(raw);
  const path = canvasHref(name);

  const health = await studioApi<Health>("/api/health", { timeoutMs: 150_000 });
  if (!health.ok) {
    return (
      <Shell>
        <BlockedCard
          title={health.headline}
          lead={health.detail}
          commands={health.reason === "down" ? ["npm run studio"] : []}
          retryHref={path}
        />
      </Shell>
    );
  }
  if (!health.data.tldrawkc) {
    return (
      <Shell>
        <BlockedCard
          title="tldrawkc cannot run on this machine"
          lead="serve is a tldrawkc command, so there is no canvas to open. doctor says:"
          lines={health.data.checks}
          commands={[
            "git submodule update --init tools/tldrawkc",
            "(cd tools/tldrawkc && npm ci && npm run build)",
          ]}
          retryHref={path}
        />
      </Shell>
    );
  }

  const listed = await studioApi<DiagramListing>("/api/diagrams", { timeoutMs: 120_000 });
  if (!listed.ok) {
    return (
      <Shell>
        <BlockedCard title={listed.headline} lead={listed.detail} retryHref={path} />
      </Shell>
    );
  }
  const diagram = listed.data.diagrams.find((entry) => entry.name === name) ?? null;
  if (diagram === null) {
    const broken = listed.data.errors.find((problem) => problem.name === name);
    if (broken === undefined) notFound();
    // U6, on the one screen that names a single file: a document that will not
    // parse cannot be served, and saying which line failed is the only help
    // there is.
    return (
      <Shell>
        <BlockedCard
          title={`${name} will not parse`}
          lead={`${broken.path} is in the directory and is not a readable tldraw document, so there is nothing to mirror.`}
          lines={[{ name: "parse", status: "fail", detail: broken.message }]}
          retryHref={path}
        />
      </Shell>
    );
  }

  const mirror = await studioApi<Mirror>("/api/mirrors", {
    method: "POST",
    body: JSON.stringify({ file: diagram.tldr.path }),
    timeoutMs: 60_000,
  });

  const jobList = await studioApi<{ jobs: JobRow[] }>("/api/jobs?limit=200");
  const jobs = (jobList.ok ? jobList.data.jobs : []).filter(
    (job) => job.target === diagram.tldr.path,
  );

  return (
    <Shell>
      <Strip diagram={diagram} path={path} />
      <JobStrip path={path} stream={panel.stream} />
      {outcome !== null && <VerbNotice report={outcome} clearHref={path} />}
      {health.data.stale && (
        <Notice>
          The tldrawkc page bundle is older than its source, so this canvas is the previous build.
          Everything still runs.
        </Notice>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {panel.shot !== null && panel.job !== null ? (
            /* The canvas keeps running behind this: `POST /api/mirrors` has
               already been made above and the idle timer is pushed back by the
               keep-alive on the next render, so closing the picture comes back
               to the same document rather than to a cold start. */
            <ShotView
              jobId={panel.job}
              which={panel.shot}
              path={path}
              title={diagram.tldr.path}
            />
          ) : mirror.ok && mirror.data.healthy !== false ? (
            <>
              {/* Editing happens between the browser and the serve port, which
                  this service never sees, so without a heartbeat the idle sweep
                  would close a canvas somebody is still drawing on. */}
              <MirrorKeepAlive file={diagram.tldr.path} idleMs={mirror.data.idleMs} />
              <iframe
                src={mirror.data.url}
                title={`${displayTitle(diagram)} on a live canvas`}
                className="h-full w-full border-0"
              />
            </>
          ) : (
            <MirrorProblem
              file={diagram.tldr.path}
              path={path}
              headline={mirror.ok ? "The canvas server is not answering." : mirror.headline}
              detail={
                mirror.ok
                  ? `serve is on port ${mirror.data.port} and its own health check failed. ` +
                    `The studio cannot see inside the frame (D13), so this is everything it knows.`
                  : mirror.detail
              }
            />
          )}
        </div>
        <aside className="hidden w-80 shrink-0 border-l border-[var(--border)] lg:block">
          {panel.brief !== null ? (
            <BriefForm
              path={path}
              topics={topicOptions}
              from={panel.brief}
              // This screen names one document, so a new job started from it is
              // about that document until somebody says otherwise: the slug is
              // taken and the mode is `extend`, which is the only mode the
              // runner would accept against a file that already exists.
              suggested={{ slug: diagram.name, title: diagram.title, topic: diagram.topic }}
            />
          ) : panel.job !== null ? (
            <JobPanel jobId={panel.job} path={path} />
          ) : (
            <DiagramInspector listing={listed.data} diagram={diagram} jobs={jobs} path={path} />
          )}
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div data-layout="full" className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}

function Strip({ diagram, path }: { diagram: Diagram; path: string }) {
  const pill = freshness(diagram.svgState);
  return (
    <StudioStrip>
      <Link
        href="/studio"
        className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-xs hover:bg-[var(--surface-hover)]"
        aria-label="Back to the studio"
      >
        ← Studio
      </Link>
      <span className="min-w-0 truncate text-sm font-medium">{displayTitle(diagram)}</span>
      {diagram.topic === null ? (
        <Chip tone="warn">No topic</Chip>
      ) : (
        <Chip>{diagram.topic}</Chip>
      )}
      {/* The pill is a button, not a badge: its whole job when it says stale is
          to be the thing that fixes it. */}
      <form action={exportSvg} className="shrink-0">
        <input type="hidden" name="name" value={diagram.name} />
        <input type="hidden" name="path" value={path} />
        <button
          type="submit"
          title={`${pill.title} Click to export it again.`}
          className={`inline-flex h-7 items-center rounded-md border px-2 text-xs transition-colors ${
            pill.tone === "ok"
              ? "border-[var(--ok)]/40 bg-[var(--chip-bg)] text-[var(--ok)]"
              : "border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn)]"
          }`}
        >
          {pill.label}
        </button>
      </form>
      <Spacer />
      <VerbForm action={exportSvg} name={diagram.name} path={path} label="Export SVG" />
      <VerbForm action={verifySvg} name={diagram.name} path={path} label="Verify" />
      <VerbForm action={inspectDiagram} name={diagram.name} path={path} label="Inspect" />
      <ButtonLink href={panelHref(path, { brief: "", job: null })} filled>
        New job
      </ButtonLink>
    </StudioStrip>
  );
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
    <form action={action} className="shrink-0">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="path" value={path} />
      <Button type="submit">{label}</Button>
    </form>
  );
}

function MirrorProblem({
  file,
  path,
  headline,
  detail,
}: {
  file: string;
  path: string;
  headline: string;
  detail: string;
}) {
  return (
    <div className="flex h-full items-start justify-center p-8">
      <div className="w-full max-w-[520px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h1 className="text-sm font-medium">{headline}</h1>
        <p className="mt-2 text-sm text-[var(--muted-strong)]">{detail}</p>
        <div className="mt-4 flex gap-2">
          <form action={restartMirror}>
            <input type="hidden" name="file" value={file} />
            <input type="hidden" name="path" value={path} />
            <Button type="submit" filled>
              Restart canvas
            </Button>
          </form>
          <ButtonLink href="/studio">Back to the grid</ButtonLink>
        </div>
      </div>
    </div>
  );
}

/**
 * A hand-typed `%` in a URL should be a 404 rather than a 500.
 *
 * `decodeURIComponent` throws a `URIError` on a malformed escape, which is the
 * same swallow `decodeAssetId` in `lib/library.ts` does for the same reason.
 */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
