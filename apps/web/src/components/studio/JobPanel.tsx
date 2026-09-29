"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ComparisonPanel } from "@/components/studio/ComparisonPanel";
import { Elapsed, IndeterminateBar } from "@/components/studio/JobStrip";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { Button, Chip, Mono, PanelHeading } from "@/components/studio/StudioChrome";
import {
  failureFooter,
  failureReport,
  formatDuration,
  isActive,
  narration,
  phaseRows,
  stepLabel,
  type Brief,
  type FailureAction,
  type FailureReport,
  type Job,
  type PhaseRow,
  type StudioEvent,
} from "@/lib/studio-jobs";
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

export function JobPanel({
  jobId,
  path,
  embedded = false,
  inConversation = false,
}: {
  jobId: string;
  path: string;
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
  const { jobs, watching, events, connection, post, refresh } = useStudioJobs();
  const router = useRouter();
  const cached = jobs.find((entry) => entry.jobId === jobId) ?? null;
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  /**
   * The job, when it is older than the fifty this tab keeps.
   *
   * The inspector's history lists two hundred and the provider caches fifty, so
   * clicking the fifty-first row said "no such job" about a job the runner
   * would have answered for. `GET /api/jobs/{id}` is that answer, and a panel
   * opened on a link from anywhere else lands in the same place.
   */
  const [fetched, setFetched] = useState<{ id: string; job: Job | null } | null>(null);
  const job = cached ?? (fetched?.id === jobId ? fetched.job : null);
  const looking = cached === null && fetched?.id !== jobId;

  useEffect(() => {
    if (cached !== null) return;
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/studio/api/jobs/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        });
        const body = response.ok ? ((await response.json()) as Job) : null;
        if (alive) setFetched({ id: jobId, job: body });
      } catch {
        if (alive) setFetched({ id: jobId, job: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [jobId, cached]);

  /** Cancel, Resume: one POST, and whatever the runner said about it. */
  const act = async (verb: string, body?: unknown): Promise<void> => {
    setBusy(true);
    const result = await post(`/studio/api/jobs/${encodeURIComponent(jobId)}/${verb}`, body);
    setBusy(false);
    const note = typeof result.data.note === "string" ? result.data.note : null;
    const error = typeof result.data.error === "string" ? result.data.error : null;
    setSaid({ ok: result.ok, text: note ?? error ?? `${verb} returned ${result.status}` });
    // Resume queues a *new* job that continues this one's session, so the
    // panel follows it. Staying on the parent would leave a person watching
    // the record of the job that died while the one they just started ran
    // behind it.
    const next = typeof result.data.jobId === "string" ? result.data.jobId : null;
    if (result.ok && next !== null && next !== jobId) {
      router.push(panelHref(path, { job: next }), { scroll: false });
      router.refresh();
    }
  };

  const shell = embedded
    ? "flex flex-col px-5 py-4"
    : "flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--surface-raised)] p-3";

  if (job === null) {
    return (
      <div className={shell}>
        <PanelHeading>Job</PanelHeading>
        <p className="text-xs text-[var(--muted)]">
          {looking ? (
            <>
              Looking up <Mono>{jobId}</Mono>…
            </>
          ) : (
            <>
              The runner does not have a job <Mono>{jobId}</Mono>. It may have been pruned, or this
              link may be from another machine&apos;s studio.
            </>
          )}
        </p>
        <div className="mt-3">
          <Link href={panelHref(path, { job: null })} scroll={false} className="text-xs underline underline-offset-2">
            Back to the diagram
          </Link>
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
        <Link
          href={panelHref(path, { job: null })}
          scroll={false}
          className="shrink-0 text-xs text-[var(--muted)] underline underline-offset-2"
        >
          Close
        </Link>
      </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip tone={failed ? "danger" : job.state === "awaiting_review" ? "ok" : "accent"}>{job.state}</Chip>
        <Chip>{job.topic}</Chip>
        {isActive(job.state) && job.state !== "awaiting_review" && (
          <>
            <Chip>{stepLabel(job)}</Chip>
            <Elapsed job={job} />
          </>
        )}
        {job.costUsd !== null && (
          // A cancelled, timed-out or interrupted job now carries a figure
          // where it used to carry nothing — and that figure is the runner's
          // accumulation from the stream, which runs low. The tilde and the
          // tooltip are the whole of saying so; a bare number would read as
          // the bill.
          <Chip
            title={
              job.costSource === "stream"
                ? "an estimate: this job was stopped before the agent reported a final cost, so the runner accumulated it from the session's usage events. It runs low."
                : "what this job cost, as the agent reported it"
            }
          >
            {job.costSource === "stream" ? "~" : ""}${job.costUsd.toFixed(3)}
          </Chip>
        )}
        {job.turns !== null && <Chip>{job.turns} turns</Chip>}
      </div>

      {report !== null && <FailureMessage job={job} report={report} />}

      {/* The comparison replaces nothing: it goes above the phase list, which
          is still how a person checks what the job actually did on its way
          here. `accepted` and `discarded` keep it too — after an accept it is
          the record of what was compared, and the `git add` line lives in it. */}
      {reviewing && <ComparisonPanel job={job} path={path} />}
      {job.state === "discarded" && (
        <div className="mb-3 rounded-md border border-[var(--border)] bg-[var(--chip-bg)] p-2 text-xs text-[var(--muted-strong)]">
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
        {job.state === "running" && (
          <Button
            type="button"
            disabled={busy || job.cancelRequestedAt !== null}
            onClick={() => void act("cancel")}
          >
            {job.cancelRequestedAt === null ? "Cancel" : "Stopping"}
          </Button>
        )}
        {job.state === "queued" && (
          <Button type="button" disabled={busy} onClick={() => void act("cancel")}>
            Cancel
          </Button>
        )}
        {report?.actions.includes("resume") === true && (
          <Button type="button" filled disabled={busy} onClick={() => void act("resume")}>
            Resume
          </Button>
        )}
        {report?.actions.includes("retry") === true && (
          <RetryButton
            job={job}
            disabled={busy}
            onDone={(text, ok) => setSaid({ ok, text })}
            onQueued={(next) => {
              router.push(panelHref(path, { job: next }), { scroll: false });
              router.refresh();
            }}
          />
        )}
        {report?.actions.includes("talk") === true &&
          !inConversation &&
          (typeof job.draftId === "string" ? (
            <Link
              href={conversationHref(path, job.draftId)}
              scroll={false}
              className="inline-flex h-8 shrink-0 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium hover:bg-[var(--surface-hover)]"
            >
              Tell the planner what to change
            </Link>
          ) : (
            <TalkItThrough job={job} path={path} failure={report} onFailed={(text) => setSaid({ ok: false, text })} />
          ))}
        {report?.actions.includes("doctor") === true && (
          <Button type="button" disabled={busy} onClick={() => void refresh()} title="The studio checks doctor on every render of this screen">
            Recheck
          </Button>
        )}
      </div>

      {said !== null && (
        <p className={`mt-2 text-xs ${said.ok ? "text-[var(--ok-text)]" : "text-[var(--danger)]"}`}>{said.text}</p>
      )}

      <div className="mt-4">
        <PanelHeading>Facts</PanelHeading>
        <p className="text-xs text-[var(--muted-strong)]">{job.note}</p>
        <p className="mt-2 font-mono text-xs break-all text-[var(--muted)]">{job.candidate}</p>
        {connection === "polling" && isActive(job.state) && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            The event stream is not connected, so this panel is being driven by{" "}
            <Mono>GET /api/jobs</Mono>, which is the record either way.
          </p>
        )}
      </div>
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
            className={`flex h-8 items-center gap-2 text-xs ${
              row.status === "pending"
                ? "opacity-40"
                : row.status === "done"
                  ? "text-[var(--muted)]"
                  : row.status === "failed"
                    ? "text-[var(--danger)]"
                    : "font-medium"
            }`}
          >
            <span aria-hidden className="w-4 shrink-0 text-center">
              {row.status === "done" ? "✓" : row.status === "failed" ? "✕" : row.status === "current" ? "•" : "·"}
            </span>
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {row.status === "current" && live && <IndeterminateBar />}
            <span className="shrink-0 tabular-nums text-[var(--muted)]">
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
        <p className="text-xs text-[var(--muted)]">
          {job.state === "queued"
            ? "Nothing yet: no runner has picked this up."
            : isActive(job.state)
              ? "Nothing yet. The checks run after the agent stops drawing."
              : "No checks ran on this job."}
        </p>
      ) : (
        <ul className="space-y-1">
          {lines.map((line) => (
            <li key={`${line.at}-${line.note}`} className="text-xs text-[var(--muted-strong)]">
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
function JobLog({
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

  useEffect(() => {
    if (box.current !== null) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setChoice({ job: jobId, open: !open })}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
      >
        <span>Raw log</span>
        <span>{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <>
          <pre
            ref={box}
            className="mt-2 h-60 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 font-mono text-xs whitespace-pre-wrap break-all text-[var(--muted-strong)]"
          >
            {lines.length === 0 ? "nothing on disk yet" : lines.join("\n")}
          </pre>
          <p className="mt-1 text-xs text-[var(--muted)]">
            the last {lines.length} of {total} lines
          </p>
        </>
      )}
    </div>
  );
}

/** How many lines of the tail the panel holds. A window, never the whole file. */
const WINDOW = 200;

function FailureMessage({ job, report }: { job: Job; report: ReturnType<typeof failureReport> }) {
  return (
    <div className="mb-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] p-2 text-xs">
      <p className="font-medium text-[var(--danger)]">
        {report.code !== null && <span className="font-mono">exit {report.code}: </span>}
        {report.headline}
      </p>
      {report.detail !== null && report.detail !== "" && (
        <p className="mt-1 break-words text-[var(--danger)] opacity-90">{report.detail}</p>
      )}
      <p className="mt-2 text-[var(--muted-strong)]">{failureFooter(job)}</p>
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
  onDone,
  onQueued,
}: {
  job: Job;
  disabled: boolean;
  onDone: (text: string, ok: boolean) => void;
  /** The new job a retry queued, so the panel can follow it. */
  onQueued: (jobId: string) => void;
}) {
  const { post } = useStudioJobs();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      disabled={disabled || busy}
      onClick={() => {
        void (async () => {
          setBusy(true);
          try {
            const detail = await fetch(`/studio/api/jobs/${encodeURIComponent(job.jobId)}`, {
              cache: "no-store",
            });
            const body = (await detail.json()) as { brief?: Record<string, unknown> };
            if (body.brief === undefined) {
              onDone("the runner did not return this job's brief, so there is nothing to retry", false);
              return;
            }
            const brief = { ...body.brief };
            // Dropped on purpose: keeping it would resolve straight back to
            // the job that just failed, which is what an idempotency key is
            // for and exactly wrong for a retry.
            delete brief.idempotencyKey;
            const result = await post("/studio/api/jobs", brief);
            const note = typeof result.data.note === "string" ? result.data.note : null;
            const error = typeof result.data.error === "string" ? result.data.error : null;
            onDone(note ?? error ?? `the runner answered ${result.status}`, result.ok);
            const next = typeof result.data.jobId === "string" ? result.data.jobId : null;
            if (result.ok && next !== null) onQueued(next);
          } catch (error) {
            onDone((error as Error).message, false);
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
  onFailed,
}: {
  job: Job;
  path: string;
  failure: FailureReport;
  onFailed: (text: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      disabled={busy}
      onClick={() => {
        void (async () => {
          setBusy(true);
          try {
            const detail = await fetch(`/studio/api/jobs/${encodeURIComponent(job.jobId)}`, { cache: "no-store" });
            const body = (await detail.json().catch(() => ({}))) as { brief?: Brief };
            if (!detail.ok || body.brief === undefined) {
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
              router.push(extendFromHref(path, target, { talk: true }), { scroll: false });
              return;
            }
            const made = await createDraft({ idempotencyKey: idempotencyKey(`talk:${job.jobId}`) });
            if (!made.ok) {
              onFailed(`a conversation could not start: ${made.refusal.error}`);
              return;
            }
            leaveOpener(sessionStore(), made.data.draftId, { send: null, compose: words, source: null });
            router.push(conversationHref(path, made.data.draftId), { scroll: false });
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

export type { FailureAction };
