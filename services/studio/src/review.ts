import { rm, stat } from "node:fs/promises";

import { canvas, EXIT, explainExit, type VerifyReport } from "./canvas";
import { diagramPut, diagramShow, jobAccept, jobDiscard } from "./catalog";
import { ensureCheckout } from "./diagrams";
import { absolute, CANDIDATES_DIR, workDir } from "./paths";
import { run } from "./proc";
import type { JobRecord, JobStore } from "./store";

/**
 * Accept and discard: the only writes outside the candidates directory, and the
 * only ones a person asked for.
 *
 * **A diagram lives in the database** (Track D of docs/CONTENT-MIGRATION.md),
 * so Accept is one `catalog diagram put --job`: the document as the diagram
 * row, the SVG into the blob store, the two asset rows and the job's
 * provenance, in one transaction the catalog owns. No file under `learn/`
 * changes, and there is nothing for a person to commit to git.
 *
 * **Everything that can fail happens before anything lands.** The export and
 * the verify run against the candidate first, and the put is the last thing
 * that can refuse. A refusal before it changes nothing, so Accept, Discard and
 * a follow-up job are all still available. The put itself is all or nothing:
 * an SVG upload that dies leaves a pending blob row and no diagram change.
 *
 * **The base check replaces the file hash.** The job records the diagram's
 * revision when it was enqueued, and the put carries it as its base, so a
 * commit from the canvas that landed while the job ran refuses the Accept
 * rather than being written over (S4, edge case 18). With the database down
 * nothing can land, and the candidate waits for it (edge case 1).
 */

export interface AcceptResult {
  ok: boolean;
  /** The logical names that landed in the database (`learn/assets/<slug>.tldr` and `.svg`). */
  written: string[];
  /** False when the job row did not record the accept yet; Reindex finishes it. */
  indexed: boolean;
  /** The diagram's revision the accept wrote, when it landed. */
  revision?: number;
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

  // S4: a commit that landed while the job ran. Asked now so a job that is
  // already stale costs no Chromium, and again with nothing left to await
  // before the put, which carries the same base and is the answer that holds.
  const early = await targetMoved(record);
  if (early.refusal !== null) return early.refusal;

  /* 1. The export the gate may not have got to. This is the exit-4 case. */
  if (record.gate?.svg === null || record.gate?.exportFailed === true) {
    const exported = await canvas(["export", record.candidatePath, "--svg", record.candidateSvgPath]);
    if (exported.code !== EXIT.ok) {
      return {
        ok: false,
        written: [],
        indexed: false,
        note: `the SVG still will not export (${explainExit(exported.code)}), so nothing landed`,
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
          `so nothing landed`,
        error: "verify-failed",
      };
    }
  }

  /* 3. The canvas on this diagram goes before it is refreshed to what lands.
   *
   *    A6: `serve` holds the document as its tab last loaded it and Cmd+S
   *    writes the whole thing back. It writes to the checkout now, not to
   *    anything the put reads, but the checkout is refreshed to the accepted
   *    revision below, and a save landing after that would put the old
   *    drawing back on the canvas as an uncommitted edit. Closed here rather
   *    than at the top, because a refusal above must not disconnect an
   *    editor; and a writer that will not die is still a refusal. */
  const closed = (await hooks.closeMirror?.()) ?? { found: false, gone: true };
  const mirrorClosed = closed.found;
  if (!closed.gone) {
    return {
      ok: false,
      written: [],
      indexed: false,
      mirrorClosed,
      note:
        `the canvas open on ${record.targetPath} would not shut down, so nothing landed: its ` +
        `next save would write over the checkout this accept refreshes. Close the tab, check for ` +
        `a stuck process, and press Accept again.`,
      error: "mirror-stuck",
    };
  }

  const late = await targetMoved(record);
  if (late.refusal !== null) return { ...late.refusal, mirrorClosed };

  /* 4. The put: the one write, all of it in one transaction the catalog owns,
   *    after the SVG is confirmed in the blob store. Its base is the revision
   *    the job started from, so the catalog refuses it if the answer above
   *    went stale in the moments since; a retry after a put that landed and
   *    was never recorded finds its own write and changes nothing. */
  const written = [record.targetPath, ...(hasSvg ? [record.targetSvgPath] : [])];
  const put = await diagramPut({
    slug: record.slug,
    tldr: candidate,
    svg: hasSvg ? absolute(record.candidateSvgPath) : null,
    jobId: record.id,
    base: late.alreadyLanded ? late.latest : record.targetRevisionBefore,
    reason: acceptReason(record),
  });
  if (!put.ok) {
    const refusal = (put.json ?? {}) as { code?: unknown };
    return {
      ok: false,
      written: [],
      indexed: false,
      mirrorClosed,
      note: put.offline
        ? `the catalog is unreachable, and a diagram lives in the database, so nothing landed. ` +
          `The candidate stays in ${CANDIDATES_DIR}/; press Accept again once Postgres answers.`
        : refusal.code === "stale-base"
          ? `${record.targetPath} was committed while this job ran, so accepting would write over ` +
            `a change nobody reviewed. Discard this and run the brief again over the current diagram.`
          : `the catalog refused the diagram, so nothing landed: ${put.error ?? "no reason given"}`,
      error: put.offline ? "catalog-offline" : refusal.code === "stale-base" ? "target-moved" : "put-refused",
    };
  }
  const landedJson = (put.json ?? {}) as { revision?: unknown; files?: unknown };
  const revision = landedJson.revision;
  // Until `catalog flip diagrams` the files still own diagrams, and the put
  // wrote them through (D17 of the migration plan); after it, none.
  const files = Array.isArray(landedJson.files) ? landedJson.files.filter((f): f is string => typeof f === "string") : [];

  /* 5. The disk record, before the job row: rule 7. The diagram has landed, so
   *    a crash from here on must leave a record that says so; Reindex then
   *    finishes the job row. */
  await store.update(record.id, {
    state: "accepted",
    reviewedAt: new Date().toISOString(),
    written,
    files,
    indexed: false,
  });

  // The candidates have landed; the directory is scratch, and a later job for
  // the same slug must not find these and take them for its own.
  await rm(candidate, { force: true });
  await rm(absolute(record.candidateSvgPath), { force: true });
  // The canvas opens the accepted drawing next time, unless the checkout
  // holds edits nobody committed, which are left exactly where they are.
  const checkout = await ensureCheckout(record.slug);

  /* 6. The job row. */
  const indexed = await jobAccept(record.id);
  const landed =
    `${record.targetPath} landed in the database` +
    (typeof revision === "number" ? ` as revision ${revision}` : "") +
    (hasSvg ? ", with its SVG in the blob store" : "") +
    (files.length === 0
      ? `. Nothing under learn/ changed, so there is nothing to commit.`
      : `. The files still own diagrams until the flip, so ${files.join(" and ")} were written ` +
        `too; commit them yourself: git add ${files.join(" ")}`) +
    (checkout.note.includes("never committed") ? ` ${checkout.note}.` : "");
  if (!indexed.ok) {
    await store.noteCatalogError(record.id, indexed.error ?? "accept could not be recorded");
    return {
      ok: true,
      written,
      indexed: false,
      mirrorClosed,
      ...(typeof revision === "number" ? { revision } : {}),
      note:
        `${landed} The job row did not record the accept: ${indexed.error}. ` +
        `POST /api/jobs/${record.id}/reindex finishes it.`,
    };
  }

  await store.update(record.id, { indexed: true });
  return {
    ok: true,
    written,
    indexed: true,
    mirrorClosed,
    ...(typeof revision === "number" ? { revision } : {}),
    note: landed,
  };
}

/** The revision's reason: what the commit message used to say. */
function acceptReason(record: JobRecord): string {
  const brief = record.brief as { title?: unknown; mode?: unknown };
  const title = typeof brief.title === "string" && brief.title.trim() !== "" ? `: ${brief.title.trim()}` : "";
  return `Accepted studio job ${record.id} (${record.brief.mode ?? "new"})${title}`.slice(0, 500);
}

interface Moved {
  /** The refusal to return, or null when the diagram is where the job left it. */
  refusal: AcceptResult | null;
  /** The diagram's latest revision is this job's own earlier put, which is a retry. */
  alreadyLanded: boolean;
  latest: number | null;
}

/**
 * Has the diagram moved since the job started? Asked of the catalog, since
 * the diagram is its rows: the latest revision against the one recorded at
 * enqueue. A latest revision written by this same job is an earlier accept
 * that landed and was never recorded, not a move.
 */
async function targetMoved(record: JobRecord): Promise<Moved> {
  const shown = await diagramShow(record.slug, workDir());
  if (!shown.ok) {
    return {
      refusal: {
        ok: false,
        written: [],
        indexed: false,
        note: shown.offline
          ? `the catalog is unreachable, and a diagram lives in the database, so nothing can land ` +
            `yet. The candidate stays in ${CANDIDATES_DIR}/; press Accept again once Postgres answers.`
          : `the catalog could not say where ${record.targetPath} stands: ${shown.error ?? "no reason given"}`,
        error: shown.offline ? "catalog-offline" : "catalog-failed",
      },
      alreadyLanded: false,
      latest: null,
    };
  }
  const diagram = (shown.json as { diagram?: { revision: number | null; revisionJob: string | null } | null })
    .diagram;
  const latest = diagram?.revision ?? null;
  if (diagram?.revisionJob === record.id) return { refusal: null, alreadyLanded: true, latest };
  // A job recorded before diagrams moved into the database has no base to
  // compare, and its put writes over whatever is latest.
  if (record.targetRevisionBefore === undefined || latest === record.targetRevisionBefore) {
    return { refusal: null, alreadyLanded: false, latest };
  }
  return {
    refusal: {
      ok: false,
      written: [],
      indexed: false,
      note:
        `${record.targetPath} has changed since this job started (revision ` +
        `${record.targetRevisionBefore ?? "none"} then, ${latest ?? "none"} now), so accepting would ` +
        `write over a change nobody reviewed. Compare the two and re-run the job against the current diagram.`,
      error: "target-moved",
    },
    alreadyLanded: false,
    latest,
  };
}

/**
 * Finish an accept whose diagram landed and whose job row did not record it.
 *
 * This is the Reindex the accept note and U3 both name. The put is the
 * landing, and it is done; what is left is `job accept`, which moves the job
 * row to `accepted` once it finds the `asset_job` rows the put wrote. `accepted`
 * is terminal on disk, so a second `POST accept` is refused, and without this
 * the job row would stay `awaiting_review` until somebody opened psql.
 * Re-running it is a retry, not a second transition.
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
        `an accept whose diagram landed and whose job row did not record it.`,
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
      note: `job ${record.id} is accepted but names nothing it landed, so there is nothing to record`,
      error: "nothing-written",
    };
  }

  const indexed = await jobAccept(record.id);
  if (!indexed.ok) {
    await store.noteCatalogError(record.id, indexed.error ?? "reindex could not be recorded");
    return {
      ok: false,
      written: record.written,
      indexed: false,
      note: `the catalog still will not record it: ${indexed.error}. The diagram is in the database either way.`,
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

/** Discard: both candidates go and the lease is released. Nothing in the database changed. */
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
    note: `the candidate is deleted. The diagram in the database never changed, so there is nothing to undo.`,
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
