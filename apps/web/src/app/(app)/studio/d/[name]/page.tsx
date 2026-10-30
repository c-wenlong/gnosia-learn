import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { commitDiagram, exportSvg, inspectDiagram, restartMirror, verifySvg } from "@/app/(app)/studio/actions";
import { DiagramInspector, type JobRow } from "@/components/studio/DiagramInspector";
import { ExtendLink } from "@/components/studio/ExtendLink";
import { JobPanel } from "@/components/studio/JobPanel";
import { JobStrip } from "@/components/studio/JobStrip";
import { MirrorKeepAlive } from "@/components/studio/MirrorKeepAlive";
import { FADE_IN } from "@/components/studio/motion";
import { ShotView } from "@/components/studio/ShotView";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { buttonClasses, cx, menuRowClasses } from "@/components/ui/classes";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { BlockedCard, type DoctorLine } from "@/components/studio/StudioBlocked";
import { StripMenu } from "@/components/studio/StudioControls";
import { BackToStudio, StudioStrip, VerbNotice } from "@/components/studio/StudioChrome";
import { VerbSubmit } from "@/components/studio/VerbSubmit";
import { openShot, requireStudio, studioApi } from "@/lib/studio";
import { videoAvailability } from "@/lib/studio-health";
import { vocabularyBanner, type VocabularyState } from "@/lib/studio-vocabulary";
import { appTimeZone } from "@gnosia/tutor/server/time-zone";
import { canvasHref, extendHref, parsePanel, readOutcome, type RawParams } from "@/lib/studio-url";
import { dayAndTime, displayTitle, freshness, type Diagram, type DiagramListing } from "@/lib/studio-grid";

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
 * diagram's checkout it was asked to serve, the port and URL `serve --json`
 * printed, whether that port answers when the runner polls it server-side,
 * and what the catalog says about the diagram. The canvas saves to the
 * checkout, and Commit is how that reaches the database (Track D of
 * docs/CONTENT-MIGRATION.md). Saving, unsaved edits, a failed save and a reload over
 * unsaved work are all things the mirror says in its own overlay (U10), and the
 * studio does not restate any of them.
 *
 * The freshness pill is the one thing the mirror cannot say, because it is not
 * about the document at all: it is whether the stored SVG was exported from
 * this version of it, from the two hashes the database keeps. Clicking the
 * pill runs `export --svg` over the checkout and, when the canvas holds no
 * uncommitted edits, stores the SVG.
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
  // Gated like the page, and decoded the same forgiving way: a malformed
  // escape is the page's 404, not a 500 from the title.
  requireStudio();
  const { name } = await params;
  return { title: `${safeDecode(name)} · Studio`, robots: { index: false, follow: false } };
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
  /** Where the topic list stands (D13). Optional: an older runner does not send it. */
  vocabulary?: VocabularyState;
  /** The video doctor's block, read with `videoAvailability`. Absent from a runner before videos. */
  video?: unknown;
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
  // has the same right panel, so it reads the same panel parameters.
  const panel = parsePanel(query);

  // A page's `params` are not URL-decoded, unlike a route handler's. The two
  // sides of the same URL disagree and nothing in the type says which you have,
  // so this decodes explicitly rather than using the segment as a key.
  const { name: raw } = await params;
  const name = safeDecode(raw);
  const path = canvasHref(name);

  // Health, the listing and the jobs all start now, as on the grid, so a load
  // costs the slowest of them rather than their sum. The listing and the jobs
  // answer from the runner's memory most of the time; a blocked screen aborts
  // them all the same.
  const moot = new AbortController();
  const { signal } = moot;
  const healthCall = studioApi<Health>("/api/health", { timeoutMs: 150_000 });
  const listCall = studioApi<DiagramListing>("/api/diagrams", { timeoutMs: 120_000, signal });
  const jobsCall = studioApi<{ jobs: JobRow[] }>("/api/jobs?limit=200", { signal });
  // Left unawaited on a blocked screen: a rejection there must not surface as
  // an unhandled one. The awaits below still throw it where it is used.
  listCall.catch(() => undefined);
  jobsCall.catch(() => undefined);

  const health = await healthCall;
  if (!health.ok) {
    moot.abort();
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
    moot.abort();
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

  const listed = await listCall;
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

  const [jobList, one] = await Promise.all([
    jobsCall,
    // After the mirror start, which brought the checkout up to date: whether
    // the canvas now holds edits nobody committed.
    studioApi<Diagram>(`/api/diagrams/${encodeURIComponent(name)}`),
  ]);
  const zone = appTimeZone();
  const staleVocabulary = vocabularyBanner(health.data.vocabulary, (iso) => dayAndTime(iso, undefined, zone) || iso);
  const checkout = one.ok ? (one.data.checkout ?? null) : null;
  // Only on the render that shows a picture: `GET /api/jobs` carries neither
  // the brief nor the comparison, and the full-width view needs both to say why
  // the other side is not there rather than linking to a 404.
  const shown = panel.shot !== null && panel.job !== null ? await openShot(panel.job) : null;
  const jobs = (jobList.ok ? jobList.data.jobs : []).filter(
    (job) => job.target === diagram.tldr.path,
  );

  return (
    <Shell>
      <Strip diagram={diagram} path={path} uncommitted={checkout?.dirty === true} videos={videoAvailability(health.data.video).ok} />
      <JobStrip path={path} stream={panel.stream} />
      {outcome !== null && <VerbNotice report={outcome} clearHref={path} />}
      {staleVocabulary !== null && <Banner tone={staleVocabulary.tone}>{staleVocabulary.text}</Banner>}
      {health.data.stale && (
        <Banner>
          The tldrawkc page bundle is older than its source, so this canvas is the previous build.
          Everything still runs.
        </Banner>
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
              comparison={shown?.comparison ?? null}
              mode={shown?.brief?.mode}
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
        {panel.job !== null ? (
          // Beside the canvas from 1024px; under that, a sheet over its foot,
          // so a job the strip links to (`?job=`) opens on a phone too.
          <aside
            aria-label="Job"
            className="fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-y-auto border-t border-border bg-surface pb-[env(safe-area-inset-bottom,0px)] shadow-lg lg:static lg:z-auto lg:block lg:max-h-none lg:w-80 lg:shrink-0 lg:overflow-visible lg:border-t-0 lg:border-l lg:bg-transparent lg:pb-0 lg:shadow-none"
          >
            <div className="flex justify-end px-3 pt-2 lg:hidden">
              <Button href={path} variant="secondary" size="xs" scroll={false}>
                Close
              </Button>
            </div>
            <JobPanel jobId={panel.job} path={path} />
          </aside>
        ) : (
          <aside className="hidden w-80 shrink-0 border-l border-border lg:block">
            <DiagramInspector listing={listed.data} diagram={diagram} jobs={jobs} path={path} />
          </aside>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // Fades in over the loading frame it replaces: opacity only.
    <div data-layout="full" className={cx("flex min-h-0 flex-1 flex-col", FADE_IN)}>
      {children}
    </div>
  );
}

/**
 * The canvas's strip: the way back, what this diagram is, and its verbs.
 *
 * It holds more than a phone's width, so it fits itself to its own width (a
 * container query, as the home toolbar does), and every control stays on
 * screen at 390px:
 * - from 80rem, one row with every verb in it, as it always was;
 * - under that, Export SVG, Verify, Inspect and Make a video go into a More
 *   menu (the studio's `StripMenu`, a kit `Popover`), since the row ran off
 *   the right edge at 1280px with the sidebar open;
 * - under 48rem, two rows: the diagram on the first, Commit, More and Extend
 *   on the second, with the reason field taking the room that is left.
 */
function Strip({ diagram, path, uncommitted, videos }: { diagram: Diagram; path: string; uncommitted: boolean; videos: boolean }) {
  const pill = freshness(diagram.svgState);
  const verbs: Array<{ action: (formData: FormData) => Promise<void>; verb: string; label: string; pending: string }> = [
    { action: exportSvg, verb: "export", label: "Export SVG", pending: "Exporting" },
    { action: verifySvg, verb: "verify", label: "Verify", pending: "Verifying" },
    { action: inspectDiagram, verb: "inspect", label: "Inspect", pending: "Inspecting" },
  ];
  return (
    <StudioStrip>
      <div className="@container min-w-0 flex-1">
        <div className="flex flex-col gap-1.5 py-1.5 @[48rem]:flex-row @[48rem]:items-center @[48rem]:gap-2 @[48rem]:py-0">
          <div className="flex min-w-0 items-center gap-2 @[48rem]:flex-1">
            <BackToStudio />
            <span className="min-w-0 truncate text-sm font-medium">{displayTitle(diagram)}</span>
            {diagram.topic === null ? <Badge tone="warn">No topic</Badge> : <Badge>{diagram.topic}</Badge>}
            {/* The pill is a button, not a badge: its whole job when it says stale is
                to be the thing that fixes it. Stale or missing, it is the warn face;
                current, a quiet one with the ok dot. */}
            <form action={exportSvg} className="shrink-0">
              <input type="hidden" name="name" value={diagram.name} />
              <input type="hidden" name="path" value={path} />
              <VerbSubmit verb="export" pending="Exporting" variant={pill.tone === "ok" ? "secondary" : "warn"} title={`${pill.title} Click to export it again.`}>
                {pill.tone === "ok" && <span aria-hidden className="size-2 rounded-full bg-ok" />}
                {pill.label}
              </VerbSubmit>
            </form>
            {uncommitted && <Badge tone="warn">Uncommitted edits</Badge>}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {/* The canvas saves to a checkout; this is how its edits reach the
                database, with a reason, the way a commit message used to. */}
            <form action={commitDiagram} className="flex min-w-0 flex-1 items-center gap-1.5 @[48rem]:flex-none">
              <input type="hidden" name="name" value={diagram.name} />
              <input type="hidden" name="path" value={path} />
              <Input
                size="compact"
                type="text"
                name="reason"
                required
                placeholder="Why this change"
                aria-label="Why this change"
                className="w-full min-w-0 @[48rem]:w-44"
              />
              <VerbSubmit verb="commit" pending="Committing" className="shrink-0">
                Commit
              </VerbSubmit>
            </form>
            {/* Inline where the row has room; `contents`, so each form is a
                flex item of the row as before. */}
            <div className="hidden @[80rem]:contents">
              {verbs.map((verb) => (
                <VerbForm key={verb.label} action={verb.action} name={diagram.name} path={path} label={verb.label} verb={verb.verb} pending={verb.pending} />
              ))}
              {/* The same conversation, with the Video chip waiting in its composer
                  (D86). Left out when the video doctor fails: the strip has no room
                  for the reason, and the diagram's panel on the grid says it. */}
              {videos && (
                <ExtendLink
                  href={extendHref(diagram.name, { video: true })}
                  label="Make a video"
                  className={buttonClasses({ variant: "secondary", size: "xs" })}
                />
              )}
            </div>
            <div className="contents @[80rem]:hidden">
              <StripMenu label="More" name="More actions">
                {verbs.map((verb) => (
                  <VerbForm key={verb.label} action={verb.action} name={diagram.name} path={path} label={verb.label} verb={verb.verb} pending={verb.pending} row />
                ))}
                {videos && (
                  <ExtendLink href={extendHref(diagram.name, { video: true })} label="Make a video" className={menuRowClasses()} />
                )}
              </StripMenu>
            </div>
            {/* A change is asked for in a conversation on the grid, which opens on
                this diagram with its thumbnail pinned (docs/STUDIO-CHAT-FIRST.md,
                "Extend from a tile"). */}
            <ExtendLink href={extendHref(diagram.name)} className={buttonClasses({ size: "xs", className: "shrink-0" })} />
          </div>
        </div>
      </div>
    </StudioStrip>
  );
}

/** One verb: a server action's form, as a strip button or, with `row`, a row of the More menu. */
function VerbForm({
  action,
  name,
  path,
  label,
  verb,
  pending,
  row = false,
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
  path: string;
  label: string;
  /** The action's name, shared by every button that runs it (`VerbSubmit`). */
  verb: string;
  /** What its button says while the action runs (`VerbSubmit`). */
  pending: string;
  row?: boolean;
}) {
  return (
    <form action={action} className={row ? undefined : "shrink-0"}>
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="path" value={path} />
      <VerbSubmit verb={verb} pending={pending} row={row}>
        {label}
      </VerbSubmit>
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
      <Notice
        dense
        level={1}
        title={headline}
        className="w-full max-w-[520px]"
        actions={
          <>
            <form action={restartMirror}>
              <input type="hidden" name="file" value={file} />
              <input type="hidden" name="path" value={path} />
              <Button type="submit" size="xs">
                Restart canvas
              </Button>
            </form>
            <Button href="/studio" variant="secondary" size="xs" scroll={false}>
              Back to the grid
            </Button>
          </>
        }
      >
        {detail}
      </Notice>
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
