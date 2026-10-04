"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FadeImg } from "@/components/studio/motion-parts";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { Mono, PanelHeading } from "@/components/studio/StudioChrome";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { cx, FOCUS } from "@/components/ui/classes";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  catalogErrorLine,
  countRows,
  emptyLintLine,
  gitAddLine,
  lintLine,
  missingShotReason,
  shotSrc,
  type Comparison,
  type LintRef,
} from "@/lib/studio-compare";
import { finishedHeadline, type Job } from "@/lib/studio-jobs";
import { panelHref } from "@/lib/studio-view";

/**
 * The comparison, and the only two buttons in the studio that change a
 * committed file.
 *
 * The design's finished-job screen, in its order: two thumbnails, the counts,
 * the Fixed and New lint lists, the four verify checks, then Accept filled and
 * Discard, which asks before it acts as a video's Discard does (the kit's
 * `InlineConfirm`). Nothing under `learn/assets/` has changed while this is on
 * screen — the job wrote a candidate (D2) — which is what makes both buttons
 * safe to look at for as long as somebody wants.
 *
 * **Every number here was computed by the runner.** The two `inspect --json`
 * runs behind the counts and the lint lists happened at job start and after the
 * agent stopped; this reads `job.comparison` and formats it. A panel that
 * recomputed would be a second Chromium launch per render for an answer already
 * on the record, and it would be the UI running a verb, which layering rule 1
 * forbids.
 *
 * **Accept's hash check belongs to the runner too.** The route re-reads the
 * target's sha256 immediately before the rename and refuses when it moved (S4).
 * This never reads the file: it calls the route and shows the answer, and when
 * the answer is a refusal it offers to re-run the comparison rather than a
 * retry, because a retry that got through would overwrite the edit the refusal
 * is about.
 */

type Which = "before" | "after";

export function ComparisonPanel({ job, path }: { job: Job; path: string }) {
  const { post, refresh } = useStudioJobs();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string; recompare?: boolean } | null>(null);
  // Discard asks first, as a video's does: the candidate goes for good.
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const comparison: Comparison = job.comparison ?? {
    before: null,
    after: null,
    fixed: [],
    added: [],
    beforeHash: null,
    refreshedAt: null,
  };
  const accepted = job.state === "accepted";
  const reviewable = job.state === "awaiting_review";

  const act = async (verb: string): Promise<void> => {
    setBusy(verb);
    const result = await post(`/studio/api/jobs/${encodeURIComponent(job.jobId)}/${verb}`);
    setBusy(null);
    setConfirmDiscard(false);
    const note = typeof result.data.note === "string" ? result.data.note : null;
    const error = typeof result.data.error === "string" ? result.data.error : null;
    const detail = (result.data.detail ?? {}) as { recompare?: boolean };
    setSaid({
      ok: result.ok,
      text: note ?? error ?? `${verb} returned ${result.status}`,
      recompare: detail.recompare === true,
    });
    await refresh();
    // The canvas this accept closed (A6) is reopened by the server render, and
    // an accepted job's panel is a different screen from the one that was here.
    router.refresh();
  };

  return (
    <>
      {accepted && <Accepted job={job} busy={busy !== null} onReindex={() => void act("reindex")} />}

      {reviewable && (
        <div className="mb-3 rounded-md border border-ok/40 bg-surface2 p-2 text-xs text-text2">
          <p className="font-medium text-ok-text">{finishedHeadline(job)}</p>
          <p className="mt-1">Nothing in the catalog has changed yet. Accept stores this drawing as the diagram.</p>
        </div>
      )}

      <div className="mt-1">
        <PanelHeading>Before and after</PanelHeading>
        <div className="grid grid-cols-2 gap-2">
          <Thumbnail which="before" job={job} comparison={comparison} path={path} />
          <Thumbnail which="after" job={job} comparison={comparison} path={path} />
        </div>
        {comparison.refreshedAt !== null && (
          <p className="mt-1.5 text-xs text-warn-text">
            The before side was re-read after this job ran, so it shows the file as it is on disk
            now and not the one the job started against.
          </p>
        )}
        {job.gate?.exportFailed === true && (
          <p className="mt-1.5 text-xs text-warn-text">
            The document was saved, the export failed. Accept re-exports, so this is still a job
            worth accepting.
          </p>
        )}
      </div>

      <Counts comparison={comparison} />
      <Lints which="fixed" refs={comparison.fixed} comparison={comparison} />
      <Lints which="added" refs={comparison.added} comparison={comparison} />
      <Verify job={job} />

      {reviewable && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Button size="xs" disabled={busy !== null} onClick={() => void act("accept")}>
            {busy === "accept" ? "Accepting…" : "Accept"}
          </Button>
          <InlineConfirm
            label="Discard"
            question="The candidate is deleted; the diagram stays as it was."
            confirmLabel="Discard it"
            busyLabel={busy === "discard" ? "Discarding…" : undefined}
            onConfirm={() => void act("discard")}
            busy={busy !== null}
            open={confirmDiscard}
            onOpenChange={setConfirmDiscard}
            buttonSize="sm"
          />
        </div>
      )}

      {said !== null && (
        <div
          className={`mt-2 rounded-md border p-2 text-xs ${
            said.ok
              ? "border-ok/40 bg-surface2 text-text2"
              : "border-danger/45 bg-danger/8 text-danger"
          }`}
        >
          <p className="break-words">{said.text}</p>
          {said.recompare === true && (
            <div className="mt-2">
              <Button variant="secondary" size="xs" disabled={busy !== null} onClick={() => void act("compare")}>
                {busy === "compare" ? "Reading the file…" : "Compare with the file as it is now"}
              </Button>
              <p className="mt-1.5 text-text2">
                This re-reads the committed file and redraws the comparison. It does not make
                Accept possible: the candidate was drawn against a version that is no longer
                there, so the way forward is Discard and a new job over the current file.
              </p>
            </div>
          )}
        </div>
      )}

      {reviewable && (
        <p className="mt-3 text-xs text-text2">
          Neither button is undoable inside the studio. Accept stores the drawing as a new
          revision of the diagram, which <Mono>catalog history</Mono> keeps, and Discard deletes
          the candidate, which leaves nothing to undo.
        </p>
      )}
    </>
  );
}

/**
 * What the panel says once the diagram has landed.
 *
 * What landed (the diagram's logical names, stored in the database since
 * Track D of docs/CONTENT-MIGRATION.md). Whether the job row recorded it,
 * which is a banner with Reindex when it did not. And a `git add` line only
 * for the files the put also wrote into the tree while the files still owned
 * diagrams; after the flip there are none and nothing to commit.
 */
function Accepted({
  job,
  busy,
  onReindex,
}: {
  job: Job;
  busy: boolean;
  onReindex: () => void;
}) {
  const line = gitAddLine(job.files ?? []);
  const lastCatalogError = catalogErrorLine(job.catalogErrors);
  return (
    <div className="mb-3 space-y-2">
      <div className="rounded-md border border-ok/40 bg-surface2 p-2 text-xs">
        <p className="font-medium text-ok-text">
          Landed in the catalog
        </p>
        {/* The names it was stored under (`job.written`) are the catalog's, not
            a person's: the drawing is the diagram's newest revision, and says so. */}
        <p className="mt-1 text-text2">The drawing is now the diagram&apos;s newest revision.</p>
      </div>

      {!job.indexed && (
        <Callout
          title={<Mono>indexed: false</Mono>}
          actions={
            <Button variant="secondary" size="xs" disabled={busy} onClick={onReindex}>
              {busy ? "Reindexing…" : "Reindex"}
            </Button>
          }
        >
          <p>
            The diagram is stored; the job row did not record the accept. Reindex finishes it,
            and changes nothing about the diagram.
          </p>
          {lastCatalogError !== null && (
            <p className="mt-1 font-mono text-xs break-words" title={(job.catalogErrors ?? []).at(-1)}>
              {lastCatalogError}
            </p>
          )}
        </Callout>
      )}

      {line !== null && (
        <div className="rounded-md border border-border bg-surface p-2 text-xs">
          <p className="text-text2">
            The files still own diagrams until the flip, so the accept wrote these too.
            Committing them is yours: the studio never runs <Mono>git add</Mono>.
          </p>
          {/* Wrapped, not scrolled. Two repo-relative paths do not fit a 320px
              column, and a line that runs off the edge is one a person copies
              half of — which is the one mistake this box exists to prevent. */}
          <pre className="mt-1.5 rounded-md bg-surface2 p-2 font-mono text-xs break-all whitespace-pre-wrap text-text">
            {line}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * One 4:3 tile, contained and never cropped (D22), linking to the full-width view.
 *
 * A picture that is not there is said in words rather than left as an empty
 * box: a `new` job has no before because there was no diagram to photograph,
 * which is normal, and a screenshot that failed on a job that did have one is
 * worth saying out loud. Those are different sentences.
 */
function Thumbnail({
  which,
  job,
  comparison,
  path,
}: {
  which: Which;
  job: Job;
  comparison: Comparison;
  path: string;
}) {
  const side = which === "before" ? comparison.before : comparison.after;
  const has = side?.shot === true;
  const label = which === "before" ? "Before" : "After";
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 flex items-center gap-1 text-xs text-text2">
        <span>{label}</span>
        {which === "before" && comparison.before === null && <Badge>none</Badge>}
      </figcaption>
      {has ? (
        <Link
          href={panelHref(path, { shot: which })}
          scroll={false}
          title={`Open the ${label.toLowerCase()} picture full width`}
          className={cx("block aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-surface transition-colors duration-100 hover:border-accent motion-reduce:transition-none", FOCUS)}
        >
          <FadeImg
            src={shotSrc(job.jobId, which)}
            alt={`${label}: ${job.title ?? "the diagram"}`}
            className="h-full w-full object-contain"
          />
        </Link>
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-border bg-surface2 p-2 text-center text-xs text-text2">
          {missingShotReason(which, comparison, job.brief?.mode)}
        </div>
      )}
    </figure>
  );
}

/** Shapes, bindings, SVG bytes: before, after, and the signed delta. */
function Counts({ comparison }: { comparison: Comparison }) {
  const rows = countRows(comparison);
  return (
    <div className="mt-4">
      <PanelHeading>Counts</PanelHeading>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-text2">
            <th className="w-1/3 py-1 text-left font-normal"> </th>
            <th className="py-1 text-right font-normal">before</th>
            <th className="py-1 text-right font-normal">after</th>
            <th className="py-1 text-right font-normal">change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border">
              <th scope="row" className="py-1.5 text-left font-normal text-text2">
                {row.label}
              </th>
              <td className="py-1.5 text-right text-text2">{row.before}</td>
              <td className="py-1.5 text-right text-text">{row.after}</td>
              <td
                className={`py-1.5 text-right ${
                  row.direction === "flat" ? "text-text2" : "text-text"
                }`}
              >
                {row.delta ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Fixed and New, each row naming the rule and the shape it points at.
 *
 * The two lists come from the runner's diff of the two lint sets, keyed on rule
 * and shape id. A lint that moved from one shape to another appears in both,
 * which is the honest reading: it was fixed where it was and it is new where it
 * is now.
 */
function Lints({
  which,
  refs,
  comparison,
}: {
  which: "fixed" | "added";
  refs: LintRef[];
  comparison: Comparison;
}) {
  return (
    <div className="mt-4">
      <PanelHeading>{which === "fixed" ? "Fixed" : "New"}</PanelHeading>
      {refs.length === 0 ? (
        <p className="text-xs text-text2">{emptyLintLine(which, comparison)}</p>
      ) : (
        <ul className="space-y-1">
          {refs.map((ref) => (
            <li key={`${ref.rule}-${ref.shape ?? ""}`} className="text-xs">
              <span
                className={
                  which === "fixed"
                    ? "text-ok-text"
                    : ref.severity === "warn"
                      ? "text-text2"
                      : "text-warn-text"
                }
              >
                <Mono>{lintLine(ref)}</Mono>
              </span>
              {ref.message !== "" && (
                <span className="block text-text2">{ref.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The four checks `verify` makes, each a pass or a fail with its detail line. */
function Verify({ job }: { job: Job }) {
  const checks = job.gate?.verify ?? [];
  return (
    <div className="mt-4">
      <PanelHeading>Verify</PanelHeading>
      {checks.length === 0 ? (
        <p className="text-xs text-text2">
          {job.gate?.exportFailed === true
            ? "There is no SVG to verify: the export failed. Accept runs both again."
            : "No verify result was recorded for this job."}
        </p>
      ) : (
        <ul className="space-y-1">
          {checks.map((check) => (
            <li key={check.rule} className="flex items-start gap-2 text-xs">
              <span
                aria-hidden
                className={`w-3 shrink-0 ${check.ok ? "text-ok-text" : "text-danger"}`}
              >
                {check.ok ? "✓" : "✕"}
              </span>
              <span className="min-w-0 flex-1">
                <Mono>{check.rule}</Mono>
                {check.detail !== "" && (
                  <span className="block text-text2">{check.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
