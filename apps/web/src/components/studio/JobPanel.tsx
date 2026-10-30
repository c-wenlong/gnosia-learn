"use client";

import { useEffect, useId, useRef, useState } from "react";

import { PanelLink } from "@/components/studio/PanelLink";
import { Collapse } from "@/components/ui/Collapse";
import { useFollowFoot } from "@/components/ui/use-follow-foot";
import { ComparisonPanel } from "@/components/studio/ComparisonPanel";
import { CancelJobButton, Elapsed, IndeterminateBar } from "@/components/studio/job-bits";
import { JobCost } from "@/components/studio/JobCost";
import { useJobVerb } from "@/components/studio/use-job-verb";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { VideoJobPanel } from "@/components/studio/video/VideoJobPanel";
import { getJob } from "@/lib/studio-job-read";
import type { JobLookup } from "@/lib/studio-video";
import { Mono, PanelHeading } from "@/components/studio/StudioChrome";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { buttonClasses, cx } from "@/components/ui/classes";
import {
  failureFooter,
  failureReport,
  formatDuration,
  isActive,
  narration,
  phaseRows,
  stepLabel,
  type Brief,
  type FailureReport,
  type Job,
  type PhaseRow,
  type StudioEvent,
} from "@/lib/studio-jobs";
import { jobStateLabel, progressWord } from "@/lib/studio-job-state";
import { createDraft, idempotencyKey } from "@/lib/studio-drafts";
import { leaveOpener, leavePrefill, sessionStore, talkItThroughText, talkTarget } from "@/lib/studio-extend";
import { conversationHref, extendFromHref, panelHref } from "@/lib/studio-view";

/**
 * The right panel while a job is happening, and after it stops.
 *
 * Four parts, in the design's order: the phase list, the narration, the log as
 * a disclosure, and Cancel. A failed job keeps the same list with the failed
 * phase marked, opens the log, and puts a message at the top keyed on the
 * runner's own failure codes rather than on the text of an error (U11).
 *
 * A finished job hands the top of the panel to `ComparisonPanel`, which is the
 * review: two pictures, the counts, the lints, the verify checks, Accept and
 * Discard. That is the one place in the studio where a committed file changes,
 * and it is still the same panel — the phase list and the log stay under it,
 * because "what did it do to get here" is the other half of deciding.
 */

export function JobPanel(props: Omit<Parameters<typeof DiagramJobPanel>[0], "initial">) {
  const { jobs } = useStudioJobs();
  // A video job has its own view (docs/STUDIO-VIDEOS.md, "The job view"):
  // its steps are the manimkc-video skill's, and its review is a player. The
  // kind is read from the provider's row. A job the provider does not list
  // (older than its fifty, or not polled yet) is read once here, and neither
  // view is drawn until that read says which it is; the answer is handed to
  // the view, so it does not ask again.
  //
  // Only a 404 is "no such job". A read that failed (the runner down, a 5xx)
  // says nothing about the job: the panel says so, retries when the window
  // regains focus and on a press, and never hands the view a verdict it
  // would then keep.
  const row = jobs.find((entry) => entry.jobId === props.jobId);
  const [probed, setProbed] = useState<{ id: string; attempt: number; lookup: JobLookup } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (row !== undefined) return;
    let alive = true;
    void getJob(props.jobId).then((lookup) => {
      if (alive) setProbed({ id: props.jobId, attempt, lookup });
    });
    return () => {
      alive = false;
    };
  }, [row, props.jobId, attempt]);
  const answer = probed?.id === props.jobId ? probed : null;
  const failed = row === undefined && answer?.lookup.kind === "failed";
  useEffect(() => {
    if (!failed) return;
    const again = (): void => setAttempt((held) => held + 1);
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [failed]);
  if (row === undefined && (answer === null || (answer.lookup.kind === "failed" && answer.attempt !== attempt))) {
    return (
      <div className={props.embedded ? "px-5 py-4" : "p-3"}>
        <p role="status" className="text-xs text-text2">
          Looking up <Mono>{props.jobId}</Mono>…
        </p>
      </div>
    );
  }
  if (row === undefined && answer !== null && answer.lookup.kind === "failed") {
    return (
      <div className={props.embedded ? "px-5 py-4" : "p-3"}>
        <p role="alert" className="text-xs text-text2">
          Could not look up <Mono>{props.jobId}</Mono>: {answer.lookup.reason}. It is asked again when this window
          regains focus.
        </p>
        <div className="mt-3">
          <Button variant="secondary" size="xs" onClick={() => setAttempt((held) => held + 1)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  const found = answer !== null && answer.lookup.kind === "found" ? answer.lookup.body : null;
  const kind = row?.kind ?? found?.kind ?? null;
  if (kind === "video") {
    return (
      <VideoJobPanel
        jobId={props.jobId}
        path={props.path}
        inConversation={props.inConversation}
        initial={row === undefined ? found : undefined}
      />
    );
  }
  // Here the read answered: the job (a diagram's), or a 404, which is `null`.
  return (
    <DiagramJobPanel key={props.jobId} {...props} initial={row === undefined ? ((found as Job | null) ?? null) : undefined} />
  );
}

function DiagramJobPanel({
  jobId,
  path,
  embedded = false,
  inConversation = false,
  initial,
}: {
  jobId: string;
  path: string;
  /**
   * The job as `JobPanel` already read it, when the provider did not list it:
   * null for a job the runner does not have. Undefined when the provider
   * lists it, which `JobPanel` waits for or reads before drawing this.
   */
  initial?: Job | null;
  /**
   * Shown under the conversation's own "From your conversation" bar, which
   * already leads back to it: the failure panel does not offer it twice.
   */
  inConversation?: boolean;
  /**
   * Inside the studio's panel, which carries the title and Close in its own
   * header and is 720px wide rather than 320px: the same parts, more room.
   */
  embedded?: boolean;
}) {
  const { jobs, watching, events, connection } = useStudioJobs();
  const verbs = useJobVerb(path);
  const busy = verbs.busy !== null;
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  // The provider's row, or, for a job older than the fifty it keeps, the read
  // `JobPanel` made (null for a job the runner does not have). The inspector's
  // history lists two hundred, so the fifty-first row is a real job.
  const job = jobs.find((entry) => entry.jobId === jobId) ?? initial ?? null;

  /** Resume queues a *new* job that continues this one's session, and the panel follows it. */
  const resume = async (): Promise<void> => {
    const result = await verbs.run(jobId, "resume", { follow: true });
    setSaid({ ok: result.ok, text: result.text });
  };

  const shell = embedded
    ? "flex flex-col px-5 py-4"
    : "flex h-full min-h-0 flex-col overflow-y-auto bg-surface-raised p-3";

  if (job === null) {
    return (
      <div className={shell}>
        <PanelHeading>Job</PanelHeading>
        <p className="text-xs text-text2">
          The runner does not have a job <Mono>{jobId}</Mono>. It may have been pruned, or this
          link may be from another machine&apos;s studio.
        </p>
        <div className="mt-3">
          <PanelLink href={panelHref(path, { job: null })} scroll={false} className="text-xs underline underline-offset-2">
            Back to the diagram
          </PanelLink>
        </div>
      </div>
    );
  }

  // The events in the provider follow the *active* job. A panel opened on some
  // other job — an older failure, say — has the record and no stream, which is
  // exactly the case rule 8 exists for: everything below reads the record first.
  const own: StudioEvent[] = watching === job.jobId ? events : [];
  const rows = phaseRows(job, own);
  const failed = job.state === "failed" || job.state === "cancelled" || job.state === "interrupted";
  const report = failed ? failureReport(job) : null;
  // The three states the comparison is about: one that can still be reviewed,
  // and one that was. A discarded job has nothing left to show two pictures of,
  // because the candidate is deleted.
  const reviewing = job.state === "awaiting_review" || job.state === "accepted";

  return (
    <div className={shell}>
      {!embedded && (
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <PanelHeading>Job</PanelHeading>
          <h2 className="truncate text-sm font-medium">{job.title ?? job.jobId.slice(0, 8)}</h2>
        </div>
        <PanelLink
          href={panelHref(path, { job: null })}
          scroll={false}
          className="shrink-0 text-xs text-text2 underline underline-offset-2"
        >
          Close
        </PanelLink>
      </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={failed ? "danger" : job.state === "awaiting_review" ? "ok" : "accent"}>{jobStateLabel(job.state)}</Badge>
        <Badge>{job.topic}</Badge>
        {isActive(job.state) && job.state !== "awaiting_review" && (
          <>
            <Badge>{stepLabel(job)}</Badge>
            <Elapsed job={job} />
          </>
        )}
        {job.costUsd !== null && (
          <Badge>
            <JobCost usd={job.costUsd} source={job.costSource} />
          </Badge>
        )}
        {job.turns !== null && <Badge>{job.turns} turns</Badge>}
      </div>

      {report !== null && <FailureMessage job={job} report={report} />}

      {/* The comparison replaces nothing: it goes above the phase list, which
          is still how a person checks what the job actually did on its way
          here. `accepted` keeps it too: after an accept it is the record of
          what was compared. */}
      {reviewing && <ComparisonPanel job={job} path={path} />}
      {job.state === "discarded" && (
        <div className="mb-3 rounded-md border border-border bg-surface2 p-2 text-xs text-text2">
          <p className="font-medium">The candidate is gone.</p>
          <p className="mt-1">
            The diagram in the catalog never changed, so there is nothing to undo.
          </p>
        </div>
      )}

      <PhaseList rows={rows} live={job.state === "running"} />

      <Narration events={own} job={job} />

      <JobLog jobId={job.jobId} openByDefault={failed} live={isActive(job.state) && job.state !== "awaiting_review"} />

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(job.state === "running" || job.state === "queued") && (
          <CancelJobButton job={job} path={path} onDone={(result) => setSaid({ ok: result.ok, text: result.text })} />
        )}
        {report?.actions.includes("resume") === true && (
          <Button size="xs" disabled={busy} onClick={() => void resume()}>
            Resume
          </Button>
        )}
        {report?.actions.includes("retry") === true && (
          <RetryButton job={job} disabled={busy} send={verbs.send} onDone={(text, ok) => setSaid({ ok, text })} />
        )}
        {report?.actions.includes("talk") === true &&
          !inConversation &&
          (typeof job.draftId === "string" ? (
            <PanelLink
              href={conversationHref(path, job.draftId)}
              scroll={false}
              className={buttonClasses({ variant: "secondary", size: "xs" })}
            >
              Tell the planner what to change
            </PanelLink>
          ) : (
            <TalkItThrough job={job} path={path} failure={report} go={verbs.go} onFailed={(text) => setSaid({ ok: false, text })} />
          ))}
        {report?.actions.includes("doctor") === true && (
          <Button variant="secondary" size="xs" disabled={busy} onClick={() => void verbs.refresh()} title="The studio checks doctor on every render of this screen">
            Recheck
          </Button>
        )}
      </div>

      {said !== null && (
        <p className={cx("mt-2 text-xs", said.ok ? "text-ok-text" : "text-danger")}>{said.text}</p>
      )}

      {/* The runner's `note` and the candidate's path were printed here as
          "Facts": the note restates the chips and, once accepted, lists the
          names the diagram was stored under, and neither path is anything a
          person acts on. The raw log above keeps every path for whoever needs one. */}
      {connection === "polling" && isActive(job.state) && (
        <p className="mt-4 text-xs text-text2">
          The event stream is not connected, so this panel is being driven by{" "}
          <Mono>GET /api/jobs</Mono>, which is the record either way.
        </p>
      )}
    </div>
  );
}

/**
 * The seven phases, all of them, from the first second.
 *
 * Each row is the design's 32px: a glyph, the name, and a duration once it is
 * finished. The current row pulses and nothing else moves; done rows go muted
 * and unreached rows to 40 percent. No row shows a percentage.
 */
function PhaseList({ rows, live }: { rows: PhaseRow[]; live: boolean }) {
  return (
    <div className="mt-1">
      <PanelHeading>Phases</PanelHeading>
      <ol className="space-y-0">
        {rows.map((row) => (
          <li
            key={row.key}
            className={cx(
              "flex h-8 items-center gap-2 text-xs",
              row.status === "pending"
                ? "opacity-40"
                : row.status === "done"
                  ? "text-text2"
                  : row.status === "failed"
                    ? "text-danger"
                    : "font-medium",
            )}
          >
            <span aria-hidden className="w-4 shrink-0 text-center">
              {row.status === "done" ? "✓" : row.status === "failed" ? "✕" : row.status === "current" ? "•" : "·"}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="sr-only">{progressWord(row.status)}</span>
              {row.label}
            </span>
            {row.status === "current" && live && <IndeterminateBar />}
            <span className="shrink-0 tabular-nums text-text2">
              {row.status === "pending" ? "" : formatDuration(row.durationMs)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * One line per finished check, and what to say when there are none yet.
 *
 * Every line here came from the runner's own `--json` (D24): `drew 44 shapes`
 * is `inspect --json` and `exported 213 kB` is the file. None of it is the
 * agent's account of its own work, which is richer and can be wrong.
 */
function Narration({ events, job }: { events: StudioEvent[]; job: Job }) {
  const lines = narration(events);
  return (
    <div className="mt-4">
      <PanelHeading>What the checks found</PanelHeading>
      {lines.length === 0 ? (
        <p className="text-xs text-text2">
          {job.state === "queued"
            ? "Nothing yet: no runner has picked this up."
            : isActive(job.state)
              ? "Nothing yet. The checks run after the agent stops drawing."
              : "No checks ran on this job."}
        </p>
      ) : (
        <ul className="space-y-1">
          {lines.map((line) => (
            <li key={`${line.at}-${line.note}`} className="text-xs text-text2">
              {line.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The raw log: collapsed, windowed, and opened by itself only on a failure.
 *
 * A9's bound, on the browser's side of it. `session.ndjson` is uncapped on disk
 * and is never sent whole to a page, so this asks for the total first and then
 * for the tail — two small requests rather than one that could be tens of
 * megabytes of agent transcript.
 */
export function JobLog({
  jobId,
  openByDefault,
  live,
}: {
  jobId: string;
  openByDefault: boolean;
  /** Whether there is any more log to come. A finished job is read once. */
  live: boolean;
}) {
  /**
   * Open is the default until somebody says otherwise about *this* job.
   *
   * Stored as the choice plus the job it was made about, rather than as a
   * boolean an effect resets when the default changes: an effect that assigns
   * state is a cascading render, and the question "has anyone overridden this?"
   * is one a render can answer.
   */
  const [choice, setChoice] = useState<{ job: string; open: boolean } | null>(null);
  const open = choice !== null && choice.job === jobId ? choice.open : openByDefault;
  const [lines, setLines] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const box = useRef<HTMLPreElement | null>(null);
  const region = useId();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const head = await fetch(`/studio/api/jobs/${encodeURIComponent(jobId)}/log?from=0&limit=1`, {
          cache: "no-store",
        });
        if (!head.ok) return;
        const counted = (await head.json()) as { total?: number };
        const size = counted.total ?? 0;
        const from = Math.max(0, size - WINDOW);
        const window = await fetch(
          `/studio/api/jobs/${encodeURIComponent(jobId)}/log?from=${from}&limit=${WINDOW}`,
          { cache: "no-store" },
        );
        if (!window.ok) return;
        const body = (await window.json()) as { lines?: string[] };
        if (!alive) return;
        setTotal(size);
        setLines(body.lines ?? []);
      } catch {
        // Same reasoning as the poll: a log window that could not be fetched is
        // not news, and the screen already says whether the runner is there.
      }
    };
    void load();
    // A job that has stopped has a log that has stopped, so it is read once.
    // Polling one for as long as a panel is open was two requests every four
    // seconds about a file nothing is writing to.
    if (!live) {
      return () => {
        alive = false;
      };
    }
    const timer = setInterval(() => void load(), 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [jobId, open, live]);

  // Each read follows the log's foot, unless the reader has scrolled up to
  // read something: a poll every four seconds must not pull them back down.
  useFollowFoot(box, lines, { onlyNearFoot: true });

  return (
    <div className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={region}
        onClick={() => setChoice({ job: jobId, open: !open })}
        className="flex w-full items-center justify-between text-xs font-semibold text-text2"
      >
        <span>Raw log</span>
        <span>{open ? "Hide" : "Show"}</span>
      </button>
      {/* Folds open and shut; what was read stays while it is shut. */}
      <Collapse open={open} id={region}>
          <pre
            ref={box}
            className="mt-2 h-60 overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-xs whitespace-pre-wrap break-all text-text2"
          >
            {lines.length === 0 ? "nothing on disk yet" : lines.join("\n")}
          </pre>
          <p className="mt-1 text-xs text-text2">
            the last {lines.length} of {total} lines
          </p>
      </Collapse>
    </div>
  );
}

/** How many lines of the tail the panel holds. A window, never the whole file. */
const WINDOW = 200;

function FailureMessage({ job, report }: { job: Job; report: ReturnType<typeof failureReport> }) {
  return (
    <div className="mb-3 rounded-md border border-danger/45 bg-danger/8 p-2 text-xs">
      <p className="font-medium text-danger">
        {report.code !== null && <span className="font-mono">exit {report.code}: </span>}
        {report.headline}
      </p>
      {report.detail !== null && report.detail !== "" && (
        <p className="mt-1 break-words text-danger opacity-90">{report.detail}</p>
      )}
      <p className="mt-2 text-text2">{failureFooter(job)}</p>
    </div>
  );
}

/**
 * Retry: the same brief, posted again as a new job.
 *
 * It fetches the brief rather than holding one, because the list rows do not
 * carry it — `GET /api/jobs/{id}` is the only route that does. The
 * idempotency key is dropped on purpose: keeping it would resolve straight back
 * to the job that just failed, which is what that key is for.
 */
function RetryButton({
  job,
  disabled,
  send,
  onDone,
}: {
  job: Job;
  disabled: boolean;
  /** The panel's `useJobVerb` send, which follows the job a retry queued. */
  send: ReturnType<typeof useJobVerb>["send"];
  onDone: (text: string, ok: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="xs"
      disabled={disabled || busy}
      onClick={() => {
        void (async () => {
          setBusy(true);
          try {
            const lookup = await getJob(job.jobId);
            if (lookup.kind === "failed") {
              onDone(`could not read this job's brief: ${lookup.reason}`, false);
              return;
            }
            const held = lookup.kind === "found" ? lookup.body.brief : undefined;
            if (held === null || typeof held !== "object") {
              onDone("the runner did not return this job's brief, so there is nothing to retry", false);
              return;
            }
            const brief = { ...(held as Record<string, unknown>) };
            // Dropped on purpose: keeping it would resolve straight back to
            // the job that just failed, which is what an idempotency key is
            // for and exactly wrong for a retry.
            delete brief.idempotencyKey;
            const result = await send("/studio/api/jobs", { body: brief, label: "retry", follow: { from: null } });
            onDone(result.text, result.ok);
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      Retry
    </Button>
  );
}

/**
 * A failed job with no conversation of its own (the brief form started it,
 * before the form was removed) gets one, opened on the diagram when the job
 * extended one: its composer prefilled, not sent, with what the old brief was
 * for and what went wrong.
 * The person edits that before a turn is paid for. This replaced Edit brief,
 * which was that job's only way to change what gets drawn.
 */
function TalkItThrough({
  job,
  path,
  failure,
  go,
  onFailed,
}: {
  job: Job;
  path: string;
  failure: FailureReport;
  /** The panel's way to another panel: through the host, a router push when it does not draw it. */
  go: (href: string) => void;
  onFailed: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="xs"
      disabled={busy}
      onClick={() => {
        void (async () => {
          setBusy(true);
          try {
            const lookup = await getJob(job.jobId);
            const body = (lookup.kind === "found" ? lookup.body : {}) as { brief?: Brief };
            if (body.brief === undefined) {
              onFailed("the runner did not return this job's brief, so there is nothing to talk through");
              return;
            }
            // The headline, not the detail: the detail is often a path or a
            // stack line, which makes a prefill nobody wants to edit. The
            // planner has no use for it either; the person can paste it.
            const words = talkItThroughText(body.brief, failure.headline);
            const target = talkTarget(body.brief);
            if (target !== null) {
              // An extend job: the conversation opens on that diagram through
              // the Extend panel, so the planner gets its EXTENDING block and
              // the create's refusals (a diagram since deleted, a failed
              // inspect) are handled where every Extend handles them.
              leavePrefill(sessionStore(), target, words);
              // `talk` in the URL is what stops the opener: storage may be
              // unavailable, and then the prefill is lost but no turn is paid.
              go(extendFromHref(path, target, { talk: true }));
              return;
            }
            const made = await createDraft({ idempotencyKey: idempotencyKey(`talk:${job.jobId}`) });
            if (!made.ok) {
              onFailed(`a conversation could not start: ${made.refusal.error}`);
              return;
            }
            leaveOpener(sessionStore(), made.data.draftId, { send: null, compose: words, source: null });
            go(conversationHref(path, made.data.draftId));
          } catch (error) {
            onFailed((error as Error).message);
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      {busy ? "Opening a conversation…" : "Talk it through"}
    </Button>
  );
}

