import { createHash } from "node:crypto";
import { readFile, rename, rm, stat } from "node:fs/promises";

import { canvas, EXIT, explainExit, type VerifyReport } from "./canvas";
import { jobAccept, jobDiscard } from "./catalog";
import { absolute, CANDIDATES_DIR } from "./paths";
import { run } from "./proc";
import type { JobRecord, JobStore } from "./store";

/**
 * Accept and discard: the only writes outside the candidates directory, and the
 * only ones a person asked for.
 *
 * **Everything that can fail happens before anything lands.** That ordering is
 * the whole design of this file. The alternative — rename first, export onto
 * the committed path — leaves the target replaced and the candidate gone when
 * the export fails, with the job still `awaiting_review`: a retry cannot repeat
 * a rename that already happened, and Discard cannot delete a candidate that
 * has moved. So the export and the verify run against the candidate, and only
 * then do the two renames.
 *
 * Two failure windows are left and both are recoverable by construction. A
 * failure in the export or the verify changes nothing under `learn/assets/`, so
 * Accept, Discard and a follow-up job are all still available. A failure
 * between the two renames lands a new `.tldr` beside the old `.svg`, which is
 * the SVG-stale state the UI already models: one click on Export SVG fixes it.
 */

export interface AcceptResult {
  ok: boolean;
  /** Repo-relative paths now in `learn/assets/`. */
  written: string[];
  /** False when Postgres was unreachable. The files are the output; this is derived. */
  indexed: boolean;
  note: string;
  error?: string;
  /** True when a mirror on the target was closed on the way past. */
  mirrorClosed?: boolean;
}

export interface AcceptHooks {
  /**
   * Close any human canvas on the target, and say whether it is actually gone.
   * Called once, immediately before the last hash check and the renames, and
   * only on an accept that is going to happen.
   *
   * A capability rather than an import: `review.ts` owns the ordering and knows
   * *when* the writer has to go, and `Mirrors` is the API layer's object. A
   * refusal must not disconnect an editor — a stale tab pressing Accept on a
   * job somebody already discarded would otherwise close the canvas its owner
   * is drawing on and then answer 409.
   *
   * `gone: false` is a refusal and not a warning: see step 3.
   */
  closeMirror?: () => Promise<{ found: boolean; gone: boolean }>;
}

async function sha256(file: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * One review action per job at a time, and the record re-read inside the lock.
 *
 * Every verdict here is a read-then-act over the filesystem with two awaited
 * subprocesses in the middle, so a second request arriving during the first
 * passes a guard that was true when it was checked and false by the time it
 * acts. Two accepts both saw `awaiting_review` and the loser's rename failed
 * with `ENOENT`; an accept racing a discard could delete the candidate the
 * other one was about to land, or write `discarded` over files that are already
 * in `learn/assets/`.
 *
 * A promise chain rather than a lock library: the queue is per job, the
 * critical sections are short, and a rejected action must not wedge the next
 * one, which is what the `catch` is for. It is in-process only, which is the
 * right scope — the files are what two processes would fight over, and the
 * catalog's own conditional update is what refuses the loser there.
 */
const inFlight = new Map<string, Promise<unknown>>();

function withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
  const previous = inFlight.get(jobId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  inFlight.set(
    jobId,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Land the candidate.
 *
 * The record is re-read inside the lock: the caller fetched it before the queue
 * was joined, and whatever ran in front may have moved it.
 */
export function accept(
  store: JobStore,
  record: JobRecord,
  hooks: AcceptHooks = {},
): Promise<AcceptResult> {
  return withJobLock(record.id, () => acceptLocked(store, store.get(record.id) ?? record, hooks));
}

async function acceptLocked(
  store: JobStore,
  record: JobRecord,
  hooks: AcceptHooks,
): Promise<AcceptResult> {
  if (record.state !== "awaiting_review") {
    return {
      ok: false,
      written: [],
      indexed: false,
      note: `job ${record.id} is ${record.state}, and only a job awaiting review can be accepted`,
      error: "wrong-state",
    };
  }

  const candidate = absolute(record.candidatePath);
  if ((await stat(candidate).catch(() => null)) === null) {
    return {
      ok: false,
      written: [],
      indexed: false,
      note: `the candidate ${record.candidatePath} is gone, so there is nothing to land`,
      error: "no-candidate",
    };
  }

  // S4: a human edit that landed while the job ran. The three hashes make the
  // loss visible, and this is the only moment the question can still be asked —
  // after the rename, the file cannot answer it.
  const moved = await targetMoved(record);
  if (moved !== null) return moved;

  /* 1. The export the gate may not have got to. This is the exit-4 case. */
  if (record.gate?.svg === null || record.gate?.exportFailed === true) {
    const exported = await canvas(["export", record.candidatePath, "--svg", record.candidateSvgPath]);
    if (exported.code !== EXIT.ok) {
      return {
        ok: false,
        written: [],
        indexed: false,
        note: `the SVG still will not export (${explainExit(exported.code)}), so nothing was moved`,
        error: "export-failed",
      };
    }
  }

  /* 2. The tool's own rule: the loop does not end at export. */
  const hasSvg = (await stat(absolute(record.candidateSvgPath)).catch(() => null)) !== null;
  if (hasSvg) {
    const verified = await canvas(["verify", record.candidateSvgPath, "--json"]);
    if (verified.code !== EXIT.ok) {
      const report = (verified.json ?? {}) as VerifyReport;
      const failed = (report.checks ?? []).filter((check) => !check.ok);
      return {
        ok: false,
        written: [],
        indexed: false,
        note:
          `the exported SVG did not verify (${failed.map((c) => c.rule).join(", ") || explainExit(verified.code)}), ` +
          `so nothing was moved`,
        error: "verify-failed",
      };
    }
  }

  /* 3. The writer goes, and then the question is asked for the last time.
   *
   *    A6: `serve` holds the document as its tab last loaded it, and Cmd+S in
   *    that tab PUTs the whole thing back — so a human save landing after the
   *    rename would silently revert the accepted diagram. The mirror is closed
   *    here rather than at the top of the route, because everything above this
   *    line can still refuse and a refusal must not disconnect an editor: a
   *    stale tab pressing Accept on a job somebody already discarded would
   *    otherwise close the canvas its owner is drawing on and then answer 409.
   *    Caught in review on this PR.
   *
   *    The hash comes after the close and not before it, which is the order
   *    that makes both of them mean something: the close stops any further
   *    save, and the check then catches one that had already landed. The export
   *    and the verify above are each a Chromium launch, so the answer from the
   *    top of this function can be minutes old by now — and the window that
   *    leaves open is the exact one S4 is about. */
  const closed = (await hooks.closeMirror?.()) ?? { found: false, gone: true };
  const mirrorClosed = closed.found;

  /*    And a writer that will not die is a refusal, not a warning. `stopChild`
   *    only answers `gone: false` after a `SIGTERM`, a grace window, a `SIGKILL`
   *    and a second one, so this is a machine in trouble — but renaming anyway
   *    would make the whole of that waiting decorative in the one case it
   *    exists for. Nothing has moved at this point, so Discard, a retry and a
   *    follow-up job are all still available, which is why refusing costs a
   *    person a click and not their work. */
  if (!closed.gone) {
    return {
      ok: false,
      written: [],
      indexed: false,
      mirrorClosed,
      note:
        `the canvas open on ${record.targetPath} would not shut down, so nothing was moved: ` +
        `renaming behind a writer that is still running is the save-after-rename loss this ` +
        `close exists to prevent. Close the tab, check for a stuck process, and press Accept again.`,
      error: "mirror-stuck",
    };
  }

  const movedLate = await targetMoved(record);
  if (movedLate !== null) return { ...movedLate, mirrorClosed };

  /* 4. The renames. Atomic, because the candidates directory is a sibling of
   *    the target and not the OS temp directory: each file is either the old
   *    one or the new one, never a half-written mix of both. */
  const written: string[] = [];
  await rename(candidate, absolute(record.targetPath));
  written.push(record.targetPath);
  if (hasSvg) {
    await rename(absolute(record.candidateSvgPath), absolute(record.targetSvgPath));
    written.push(record.targetSvgPath);
  }

  /* 5. The disk record, before the database row: rule 7, and the reason it is
   *    not simply tidiness. The files have moved by now, so a crash between
   *    here and the catalog call would otherwise leave a record saying the job
   *    is still awaiting review of a candidate that is no longer there, and a
   *    retry could neither accept nor discard it. */
  await store.update(record.id, {
    state: "accepted",
    reviewedAt: new Date().toISOString(),
    written,
    indexed: false,
  });

  /* 6. The only step that needs Postgres, and therefore the last one. */
  const indexed = await jobAccept(record.id, written);
  if (!indexed.ok) {
    await store.noteCatalogError(record.id, indexed.error ?? "accept could not be recorded");
    return {
      ok: true,
      written,
      indexed: false,
      mirrorClosed,
      note:
        `${written.join(" and ")} landed in learn/assets/, and the catalog did not record it: ` +
        `${indexed.error}. The files are the output and the index is derived, so this is ` +
        `finished by POST /api/jobs/${record.id}/reindex once the database is back. Commit them ` +
        `yourself: git add ${written.join(" ")}`,
    };
  }

  await store.update(record.id, { indexed: true });
  return {
    ok: true,
    written,
    indexed: true,
    mirrorClosed,
    note:
      `${written.join(" and ")} landed in learn/assets/ and the catalog recorded ${written.length} ` +
      `output${written.length === 1 ? "" : "s"}. Committing is still yours: git add ${written.join(" ")}`,
  };
}

/**
 * Has the committed file changed since the job started? The refusal, or null.
 *
 * Asked twice by `accept`, which is the point of it being a function: once
 * early, so a job that was already stale costs no Chromium, and once with
 * nothing left to await before the rename, which is the answer that actually
 * protects the file.
 */
async function targetMoved(record: JobRecord): Promise<AcceptResult | null> {
  const now = await sha256(absolute(record.targetPath));
  if (now === null || now === record.targetHashBefore) return null;
  return {
    ok: false,
    written: [],
    indexed: false,
    note:
      `${record.targetPath} has changed since this job started, so accepting would overwrite ` +
      `an edit nobody reviewed. Compare the two and re-run the job against the current file.`,
    error: "target-moved",
  };
}

/**
 * Re-run the catalog half of an accept whose files already landed.
 *
 * This is the Reindex the accept note and U3 both name, and without it the one
 * failure accept is designed to survive was the one it could not recover from:
 * the files are in `learn/assets/`, the disk record says `accepted`, and a
 * second `POST accept` is refused because `accepted` is terminal. The catalog's
 * own row is still `awaiting_review` in that case — `job accept` is what moves
 * it — so re-running the same call is a retry and not a second transition.
 *
 * Idempotent on the catalog side too: `assert-output` upserts, and a retried
 * accept whose asserts already went through is the case `runAccept` counts
 * `asset_job` rows for rather than requiring `--path`.
 */
export function reindex(store: JobStore, record: JobRecord): Promise<AcceptResult> {
  return withJobLock(record.id, () => reindexLocked(store, store.get(record.id) ?? record));
}

async function reindexLocked(store: JobStore, record: JobRecord): Promise<AcceptResult> {
  if (record.state !== "accepted") {
    return {
      ok: false,
      written: record.written,
      indexed: record.indexed,
      note:
        `job ${record.id} is ${record.state}, and there is nothing to reindex: reindex finishes ` +
        `an accept whose files landed and whose catalog call did not.`,
      error: "wrong-state",
    };
  }
  if (record.indexed) {
    return {
      ok: true,
      written: record.written,
      indexed: true,
      note: `job ${record.id} is already recorded in the catalog; nothing to do`,
    };
  }
  if (record.written.length === 0) {
    return {
      ok: false,
      written: [],
      indexed: false,
      note: `job ${record.id} is accepted but names no file it landed, so there is nothing to record`,
      error: "nothing-written",
    };
  }

  const indexed = await jobAccept(record.id, record.written);
  if (!indexed.ok) {
    await store.noteCatalogError(record.id, indexed.error ?? "reindex could not be recorded");
    return {
      ok: false,
      written: record.written,
      indexed: false,
      note: `the catalog still will not record it: ${indexed.error}. The files are in learn/assets/ either way.`,
      error: "catalog-failed",
    };
  }
  await store.update(record.id, { indexed: true });
  return {
    ok: true,
    written: record.written,
    indexed: true,
    note: `the catalog now records ${record.written.join(" and ")} as this job's output`,
  };
}

/** Discard: both candidates go, the lease is released, and git is the undo. */
export function discard(store: JobStore, record: JobRecord): Promise<AcceptResult> {
  return withJobLock(record.id, () => discardLocked(store, store.get(record.id) ?? record));
}

async function discardLocked(store: JobStore, record: JobRecord): Promise<AcceptResult> {
  if (record.state !== "awaiting_review" && record.state !== "interrupted") {
    return {
      ok: false,
      written: [],
      indexed: false,
      note: `job ${record.id} is ${record.state}, and there is nothing to discard`,
      error: "wrong-state",
    };
  }
  await rm(absolute(record.candidatePath), { force: true });
  await rm(absolute(record.candidateSvgPath), { force: true });
  await store.update(record.id, { state: "discarded", reviewedAt: new Date().toISOString() });
  const recorded = await jobDiscard(record.id);
  if (!recorded.ok) await store.noteCatalogError(record.id, recorded.error ?? "discard not recorded");
  return {
    ok: true,
    written: [],
    indexed: recorded.ok,
    note: `the candidate is deleted. Nothing under learn/assets/ ever changed, so there is nothing to undo.`,
  };
}

/**
 * The A4 backstop: what is dirty in the working tree, ignoring the candidates
 * directory the job is allowed to write.
 *
 * Read-only `git status --porcelain` and nothing else. D6 removed the runner's
 * mutating git access on purpose, and this is not that access coming back: a
 * status writes nothing, and the reason the runner refuses rather than reverts
 * is that a revert can destroy a concurrent human edit. So it names the files
 * and fails the job, even on a zero exit, and a person decides.
 *
 * The runner takes one of these before the agent starts and one after it exits,
 * and reports the difference. The design says "anything else dirty fails the
 * job", which read literally fails every job on a laptop with unrelated work in
 * progress — and the file list it would print would be someone's own edits.
 * What the check is actually for is a file *this job* made dirty, and a
 * before-and-after is how that question is asked.
 */
export async function dirtyFiles(): Promise<string[]> {
  const status = await run("git", ["status", "--porcelain"], { timeoutMs: 30_000 }).catch(() => null);
  if (status === null || status.code !== 0) return [];
  return status.stdout
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter((file) => file !== "")
    // A renamed path is reported as `old -> new`; the new name is the one that
    // says where something landed.
    .map((file) => (file.includes(" -> ") ? (file.split(" -> ")[1] ?? file) : file))
    .map((file) => file.replaceAll('"', ""))
    .filter((file) => !file.startsWith(CANDIDATES_DIR));
}
