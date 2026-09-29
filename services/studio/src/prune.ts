import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { draftDelete, type CatalogResult } from "./catalog";
import type { DraftRecord, Drafts } from "./drafts";
import { jobJsonPath, studioHome } from "./paths";
import type { JobStore } from "./store";

/**
 * Pruning the drafts (D40 of docs/STUDIO-CHAT-FIRST.md).
 *
 * A draft untouched for seven days goes, row and workspace, only when no job
 * carries its id in either place a job lives: no `job` row in Postgres and no
 * `job.json` under `$STUDIO_HOME/jobs/`. The draft's state plays no part: a
 * failed drawing puts its draft back at `briefed`, and that conversation is
 * the one record of why the job looks as it does. So a draft with a job lives
 * as long as the job, which is for ever.
 *
 * **The disk is asked first, then Postgres, and Postgres decides last.** A job
 * enqueued while Postgres was down has a workspace and no row (U3), so the
 * row check alone would prune its conversation. The row's own delete carries
 * the row check (`catalog draft delete`, one transaction), because
 * `job.draft_id` is `ON DELETE SET NULL`: a delete that raced a job would cut
 * it loose rather than fail.
 *
 * **With Postgres down nothing is pruned.** No job row can be ruled out, so
 * the pass stops at the first delete that cannot reach the catalog and says
 * so; a draft is never pruned on the disk's word alone. Any other failure of
 * the delete stops the pass too, since it leaves the same question open.
 *
 * The runner prunes at start and then once a day. Seven days is
 * `STUDIO_DRAFT_TTL_MS`, and the interval `STUDIO_PRUNE_EVERY_MS`.
 */

function milliseconds(name: string, fallback: number, min: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

/** How long a draft may sit untouched before it may be pruned. */
export const DRAFT_TTL_MS = milliseconds("STUDIO_DRAFT_TTL_MS", 7 * 24 * 60 * 60 * 1000, 1_000);

/** How often the runner prunes after the pass at start. */
export const PRUNE_EVERY_MS = milliseconds("STUDIO_PRUNE_EVERY_MS", 24 * 60 * 60 * 1000, 60_000);

export interface PruneReport {
  at: string;
  /** Drafts last touched before this instant were considered. */
  cutoff: string;
  /** Why the pass stopped before judging every candidate, or null. */
  skipped: string | null;
  pruned: string[];
  kept: { draftId: string; reason: string }[];
}

export interface PruneOptions {
  ttlMs?: number;
  now?: () => number;
  /** The row's delete; `catalog draft delete` unless a test says otherwise. */
  deleteRow?: (id: string) => Promise<CatalogResult>;
}

/** A `job.json` under `$STUDIO_HOME/jobs/` naming the draft, or null. One that mentions it and will not parse counts. */
export async function jobFileNaming(draftId: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(path.join(studioHome(), "jobs"));
  } catch {
    return null;
  }
  for (const entry of entries) {
    const body = await readFile(jobJsonPath(entry), "utf8").catch(() => null);
    if (body === null || !body.includes(draftId)) continue;
    try {
      if ((JSON.parse(body) as { draftId?: unknown }).draftId === draftId) return entry;
    } catch {
      // Half a record that mentions the draft: keep the draft rather than guess.
      return entry;
    }
  }
  return null;
}

/** Why the disk says a draft must stay: a job it recorded, a job in memory, or a `job.json` naming it. */
async function jobOnDisk(record: DraftRecord, store: JobStore): Promise<string | null> {
  if (record.jobIds.length > 0) return `it started job ${record.jobIds.at(-1)!}`;
  const held = store.list().find((job) => job.draftId === record.id);
  if (held !== undefined) return `job ${held.id} names it`;
  const file = await jobFileNaming(record.id);
  return file === null ? null : `jobs/${file}/job.json names it`;
}

/** One pass over the drafts untouched for `ttlMs`. */
export async function pruneDrafts(drafts: Drafts, store: JobStore, options: PruneOptions = {}): Promise<PruneReport> {
  const now = (options.now ?? Date.now)();
  const cutoff = now - (options.ttlMs ?? DRAFT_TTL_MS);
  const deleteRow = options.deleteRow ?? draftDelete;
  const report: PruneReport = {
    at: new Date(now).toISOString(),
    cutoff: new Date(cutoff).toISOString(),
    skipped: null,
    pruned: [],
    kept: [],
  };
  for (const candidate of drafts.untouchedSince(cutoff)) {
    let stop: string | null = null;
    const gone = await drafts.prune(candidate.id, cutoff, async (record) => {
      // Asked with the draft held, so a job queued since the list was read counts.
      const onDisk = await jobOnDisk(record, store);
      if (onDisk !== null) {
        report.kept.push({ draftId: record.id, reason: onDisk });
        return false;
      }
      const result = await deleteRow(record.id).catch(
        (error: unknown): CatalogResult => ({ ok: false, json: null, error: (error as Error).message, offline: true }),
      );
      if (!result.ok) {
        stop = result.offline
          ? `Postgres cannot be reached, so no job row naming a draft can be ruled out; nothing was pruned (${result.error ?? "no reason"})`
          : `catalog draft delete failed, so pruning stopped: ${result.error ?? "no reason"}`;
        return false;
      }
      if ((result.json as { outcome?: unknown } | null)?.outcome === "has-jobs") {
        report.kept.push({ draftId: record.id, reason: "a job row names it" });
        return false;
      }
      // `deleted`, or `no-draft`: a row that never landed, which no job row
      // can name either, since `job.draft_id` is a foreign key.
      return true;
    });
    if (stop !== null) {
      report.skipped = stop;
      break;
    }
    if (gone) report.pruned.push(candidate.id);
  }
  return report;
}

/** One line for the runner's log, or null when there was nothing to say. */
export function pruneLine(report: PruneReport): string | null {
  if (report.skipped !== null) {
    return `drafts not pruned: ${report.skipped}${report.pruned.length > 0 ? ` (${report.pruned.length} pruned before it stopped)` : ""}`;
  }
  if (report.pruned.length === 0 && report.kept.length === 0) return null;
  return (
    `pruned ${report.pruned.length} draft${report.pruned.length === 1 ? "" : "s"} untouched since ${report.cutoff}` +
    (report.kept.length > 0 ? `; kept ${report.kept.length} that a job names` : "")
  );
}

/**
 * The runner's pruner: a pass now and one every `PRUNE_EVERY_MS`, never two
 * at once, and a `drain` that waits for the one running.
 */
export class DraftPruner {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<PruneReport> | null = null;
  private stopped = false;

  constructor(
    private readonly drafts: Drafts,
    private readonly store: JobStore,
    private readonly log: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
    private readonly options: PruneOptions = {},
  ) {}

  run(): Promise<PruneReport> | null {
    if (this.stopped) return null;
    this.running ??= pruneDrafts(this.drafts, this.store, this.options)
      .then((report) => {
        const line = pruneLine(report);
        if (line !== null) this.log(line);
        return report;
      })
      .catch((error: unknown) => {
        this.log(`drafts not pruned: ${(error as Error).message}`);
        throw error;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  start(everyMs: number = PRUNE_EVERY_MS): void {
    void this.run()?.catch(() => undefined);
    this.timer = setInterval(() => void this.run()?.catch(() => undefined), everyMs);
    this.timer.unref();
  }

  async drain(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }
}
