import { readFile } from "node:fs/promises";

import {
  COST_SOURCES,
  DRAFT_ERROR_KINDS,
  DRAFT_KINDS,
  DRAFT_STATES,
  draft as draftTable,
  job as jobTable,
  type Draft,
  type NewDraft,
} from "@self-learn/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { CLI_OWNER } from "../content/scope";
import { withDatabase, type CatalogDatabase, inTransaction } from "../db";

/**
 * `catalog draft`: the studio's planner conversations (docs/STUDIO-CHAT-FIRST.md,
 * D32), as rows.
 *
 * Four verbs: `upsert` writes one draft from a JSON file, `show` reads one,
 * `ls` lists them, as `catalog job` does, and `delete` is the pruner's (D40). The runner is the only writer, and
 * it writes `drafts/<id>/draft.json` first (rule 7 of the studio): this row is
 * the query surface and a mirror of that file, so `upsert` takes the whole
 * record rather than a transition.
 *
 * **No state machine here, deliberately.** `catalog job` guards every
 * transition with a conditional update because two runners could race for one
 * job. A draft has one writer, and its row can fall behind the disk record
 * whenever Postgres was down for a turn; refusing `open -> drawing` because
 * the `briefed` in between never reached the database would make the mirror
 * fail exactly when it most needs to catch up. `DRAFT_TRANSITIONS` is enforced
 * by the runner, which holds the record.
 *
 * **Every verb takes `--owner`, and another owner's draft is "no draft".** A
 * draft is one owner's, never the commons', so the filter is an equality, as
 * it is for a job. An upsert of an id another owner holds is refused without
 * naming them, since ids are global (D23 of docs/CONTENT-MIGRATION.md).
 */

export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftError";
  }
}

/** A draft id: one path segment, since it names the draft's workspace. A UUID passes. */
const DRAFT_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/** Where a draft's transcript is, relative to the runner's `STUDIO_HOME`. The only value accepted. */
export function transcriptFor(id: string): string {
  return `drafts/${id}/transcript.ndjson`;
}

/* -------------------------------------------------------------------------- */
/* The JSON shapes                                                            */
/* -------------------------------------------------------------------------- */

export interface DraftSummary {
  id: string;
  kind: string;
  state: string;
  source: string | null;
  title: string | null;
  /** The owner's name for the conversation, shown before `title`; null for none. */
  name: string | null;
  plannerSessionId: string;
  transcriptPath: string;
  turns: number;
  costUsd: number | null;
  costSource: string | null;
  errorKind: string | null;
  error: string | null;
  briefAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** The draft's newest job, which is what the API reports as its `jobId` (D35). */
  jobId: string | null;
}

export interface DraftUpsertResult {
  ok: true;
  command: "draft upsert";
  created: boolean;
  draft: DraftSummary;
}

export interface DraftShowResult {
  ok: true;
  command: "draft show";
  draft: DraftSummary;
  brief: unknown;
  pendingTopic: unknown;
  /** Every job this draft started, newest first. */
  jobs: string[];
}

export interface DraftListResult {
  ok: true;
  command: "draft ls";
  total: number;
  drafts: DraftSummary[];
}

export interface DraftDeleteResult {
  ok: true;
  command: "draft delete";
  id: string;
  deleted: boolean;
  /**
   * `deleted`: the row is gone. `has-jobs`: a job row names it, any owner's,
   * and it stays (D40). `other-owner`: the row is another owner's, and stays.
   * `no-draft`: there is no row at all, so no job row can name it either
   * (`job.draft_id` is a foreign key).
   */
  outcome: "deleted" | "no-draft" | "has-jobs" | "other-owner";
  /** How many job rows name the draft, any owner's. */
  jobs: number;
}

export type DraftResult = DraftUpsertResult | DraftShowResult | DraftListResult | DraftDeleteResult;

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

function summarise(row: Draft, jobId: string | null): DraftSummary {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    source: row.source,
    title: row.title,
    name: row.name,
    plannerSessionId: row.plannerSessionId,
    transcriptPath: row.transcriptPath,
    turns: row.turns,
    costUsd: row.costUsd,
    costSource: row.costSource,
    errorKind: row.errorKind,
    error: row.error,
    briefAt: iso(row.briefAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    jobId,
  };
}

/* -------------------------------------------------------------------------- */
/* The record upsert reads                                                    */
/* -------------------------------------------------------------------------- */

/** The file `draft upsert --file` reads: the runner's `draft.json`, or the fields of it the row keeps. */
export interface DraftDocument {
  id?: unknown;
  state?: unknown;
  kind?: unknown;
  source?: unknown;
  title?: unknown;
  name?: unknown;
  plannerSessionId?: unknown;
  transcriptPath?: unknown;
  brief?: unknown;
  briefAt?: unknown;
  pendingTopic?: unknown;
  turns?: unknown;
  costUsd?: unknown;
  costSource?: unknown;
  errorKind?: unknown;
  error?: unknown;
  createdAt?: unknown;
  /**
   * When the runner last moved the record. Kept on the row when given, so a
   * rename (which leaves it alone) does not move the conversation up a list,
   * and a mirror that catches up after Postgres was down does not either.
   * Absent means now.
   */
  updatedAt?: unknown;
}

export async function readDraftFile(file: string): Promise<DraftDocument> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new DraftError(`could not read the draft at ${file}: ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new DraftError(`${file} is not JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DraftError(`${file} must hold a JSON object`);
  }
  return parsed as DraftDocument;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new DraftError(`the draft needs a non-empty "${field}"`);
  return value.trim();
}

function optionalText(value: unknown, field: string, limit = 2_000): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new DraftError(`"${field}" must be a string or null`);
  return value.slice(0, limit);
}

/** The longest name kept, as the runner's `cleanName` cuts it. */
export const DRAFT_NAME_LIMIT = 200;

/**
 * A name as the row keeps it: one line, trimmed, at most `DRAFT_NAME_LIMIT`
 * characters; null when nothing is left, so a blank name is no name.
 */
function optionalName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new DraftError(`"name" must be a string or null`);
  const line = value.replace(/\s+/g, " ").trim().slice(0, DRAFT_NAME_LIMIT).trim();
  return line === "" ? null : line;
}

function optionalObject(value: unknown, field: string): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new DraftError(`"${field}" must be a JSON object or null`);
  return value as Record<string, unknown>;
}

function optionalInstant(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  const at = typeof value === "string" ? new Date(value) : null;
  if (at === null || !Number.isFinite(at.getTime())) throw new DraftError(`"${field}" must be an ISO instant or null`);
  return at;
}

function oneOf(value: unknown, field: string, allowed: readonly string[], fallback?: string): string {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  const raw = requiredText(value, field);
  if (!allowed.includes(raw)) throw new DraftError(`unknown ${field} "${raw}". Known: ${allowed.join(", ")}.`);
  return raw;
}

/**
 * The row a document describes, checked field by field so a refusal names the
 * field rather than a constraint.
 */
export function draftRow(document: DraftDocument): NewDraft {
  const id = requiredText(document.id, "id");
  if (!DRAFT_ID.test(id)) {
    throw new DraftError(`"id" ${JSON.stringify(id)} is not a draft id: letters, digits and dashes, up to 64.`);
  }
  const transcriptPath = requiredText(document.transcriptPath, "transcriptPath");
  if (transcriptPath !== transcriptFor(id)) {
    throw new DraftError(
      `"${transcriptPath}" is not this draft's transcript. Draft ${id} keeps ${transcriptFor(id)}, ` +
        `relative to the runner's STUDIO_HOME, and nowhere else.`,
    );
  }
  const turns = document.turns ?? 0;
  if (typeof turns !== "number" || !Number.isInteger(turns) || turns < 0) {
    throw new DraftError(`"turns" must be a whole number, not ${JSON.stringify(document.turns)}`);
  }
  const costUsd = document.costUsd ?? null;
  if (costUsd !== null && (typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd < 0)) {
    throw new DraftError(`"costUsd" must be a non-negative number or null`);
  }
  const costSource =
    document.costSource === undefined || document.costSource === null
      ? null
      : oneOf(document.costSource, "costSource", COST_SOURCES);
  if (costSource !== null && costUsd === null) {
    throw new DraftError(`"costSource" says where a figure came from, so it needs "costUsd" beside it`);
  }
  const errorKind =
    document.errorKind === undefined || document.errorKind === null
      ? null
      : oneOf(document.errorKind, "errorKind", DRAFT_ERROR_KINDS);
  const brief = optionalObject(document.brief, "brief");
  const pendingTopic = optionalObject(document.pendingTopic, "pendingTopic");
  if (pendingTopic !== null && brief === null) {
    throw new DraftError(`"pendingTopic" belongs to a brief that names it, and this draft has none`);
  }
  const createdAt = optionalInstant(document.createdAt, "createdAt");
  const updatedAt = optionalInstant(document.updatedAt, "updatedAt");
  return {
    id,
    state: oneOf(document.state, "state", DRAFT_STATES, "open"),
    kind: oneOf(document.kind, "kind", DRAFT_KINDS, "diagram"),
    source: optionalText(document.source, "source", 200),
    title: optionalText(document.title, "title", 200),
    name: optionalName(document.name),
    plannerSessionId: requiredText(document.plannerSessionId, "plannerSessionId"),
    transcriptPath,
    brief,
    briefAt: optionalInstant(document.briefAt, "briefAt"),
    pendingTopic,
    turns,
    costUsd,
    costSource,
    errorKind,
    error: optionalText(document.error, "error", 1_000),
    ...(createdAt === null ? {} : { createdAt }),
    ...(updatedAt === null ? {} : { updatedAt }),
  };
}

/* -------------------------------------------------------------------------- */
/* The verbs                                                                  */
/* -------------------------------------------------------------------------- */

/** The newest job each draft started, for the API's `jobId`. */
async function newestJobs(db: CatalogDatabase, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: jobTable.id, draftId: jobTable.draftId })
    .from(jobTable)
    .where(inArray(jobTable.draftId, ids))
    .orderBy(desc(jobTable.requestedAt));
  const newest = new Map<string, string>();
  for (const row of rows) {
    if (row.draftId !== null && !newest.has(row.draftId)) newest.set(row.draftId, row.id);
  }
  return newest;
}

export async function runDraftUpsert(document: DraftDocument, owner: string = CLI_OWNER): Promise<DraftUpsertResult> {
  const row = draftRow(document);
  return withDatabase(async ({ db }) => {
    // `draft` arrived in 0014, after 0010 gave every table `owner_id`, so
    // unlike `job` there is no unowned database to allow for.
    const [before] = await db.select({ ownerId: draftTable.ownerId }).from(draftTable).where(eq(draftTable.id, row.id)).limit(1);
    if (before !== undefined && before.ownerId !== owner) throw taken(row.id);
    // Everything but the key and the creation instant, which an update keeps.
    const changes: Partial<NewDraft> = { ...row };
    delete changes.id;
    delete changes.createdAt;
    delete changes.updatedAt;
    const [written] = await db
      .insert(draftTable)
      .values({ ...row, ownerId: owner })
      .onConflictDoUpdate({
        target: draftTable.id,
        set: { ...changes, updatedAt: row.updatedAt ?? sql`cast(unixepoch('subsec') * 1000 as integer)` },
        // The lock as well as the message: a row another owner took between
        // the read above and this write is left alone, and the empty return
        // is the refusal.
        setWhere: eq(draftTable.ownerId, owner),
      })
      .returning();
    if (written === undefined) throw taken(row.id);
    const jobs = await newestJobs(db, [written.id]);
    return {
      ok: true as const,
      command: "draft upsert" as const,
      created: before === undefined,
      draft: summarise(written, jobs.get(written.id) ?? null),
    };
  });
}

function taken(id: string): DraftError {
  return new DraftError(`draft id "${id}" is already taken by another draft. Mint a new one.`);
}

function noDraft(id: string): DraftError {
  return new DraftError(`no draft "${id}". \`catalog draft ls\` lists them.`);
}

export async function runDraftShow(id: string, owner: string = CLI_OWNER): Promise<DraftShowResult> {
  return withDatabase(async ({ db }) => {
    const [row] = await db
      .select()
      .from(draftTable)
      .where(and(eq(draftTable.id, id), eq(draftTable.ownerId, owner)))
      .limit(1);
    if (row === undefined) throw noDraft(id);
    const jobs = await db
      .select({ id: jobTable.id })
      .from(jobTable)
      .where(and(eq(jobTable.draftId, id), eq(jobTable.ownerId, owner)))
      .orderBy(desc(jobTable.requestedAt));
    return {
      ok: true as const,
      command: "draft show" as const,
      draft: summarise(row, jobs[0]?.id ?? null),
      brief: row.brief,
      pendingTopic: row.pendingTopic,
      jobs: jobs.map((job) => job.id),
    };
  });
}

/**
 * `catalog draft delete --id ID`: the pruner's half in Postgres (D40 of
 * docs/STUDIO-CHAT-FIRST.md). The row goes only when no `job` row names it,
 * whoever's job it is.
 *
 * The check and the delete share a transaction that locks the draft row
 * first. `job.draft_id` is `ON DELETE SET NULL`, so a delete that raced a job
 * insert would quietly cut that job loose from its conversation: the insert's
 * foreign-key check holds a share lock on the row, `FOR UPDATE` waits for it,
 * and the count after the wait is a fresh statement that sees the job.
 *
 * A row that is not there at all is `no-draft` rather than a refusal: the
 * runner's workspace is what it prunes, and a draft whose mirror never landed
 * has nothing here to delete. Another owner's row is `other-owner`, never
 * `no-draft`, so a pruner never takes it for a draft with no row and removes
 * a workspace that row still names. A job naming the draft is `has-jobs`
 * whoever's row it is.
 */
export async function runDraftDelete(id: string, owner: string = CLI_OWNER): Promise<DraftDeleteResult> {
  if (!DRAFT_ID.test(id)) {
    throw new DraftError(`${JSON.stringify(id)} is not a draft id: letters, digits and dashes, up to 64.`);
  }
  return withDatabase(({ db }) =>
    inTransaction(db, async (tx) => {
      const [row] = await tx
        .select({ ownerId: draftTable.ownerId })
        .from(draftTable)
        .where(eq(draftTable.id, id));
      const [counted] = await tx
        .select({ total: sql<number>`count(*)` })
        .from(jobTable)
        .where(eq(jobTable.draftId, id));
      const jobs = counted?.total ?? 0;
      const result = (outcome: DraftDeleteResult["outcome"]): DraftDeleteResult => ({
        ok: true as const,
        command: "draft delete" as const,
        id,
        deleted: outcome === "deleted",
        outcome,
        jobs,
      });
      if (jobs > 0) return result("has-jobs");
      if (row === undefined) return result("no-draft");
      if (row.ownerId !== owner) return result("other-owner");
      await tx.delete(draftTable).where(and(eq(draftTable.id, id), eq(draftTable.ownerId, owner)));
      return result("deleted");
    }),
  );
}

export const DRAFT_LIST_LIMIT = 20;
export const DRAFT_LIST_LIMIT_MAX = 100;

export interface DraftListOptions {
  state?: string;
  limit?: number;
  owner?: string;
}

export async function runDraftList(options: DraftListOptions = {}): Promise<DraftListResult> {
  if (options.state !== undefined && !(DRAFT_STATES as readonly string[]).includes(options.state)) {
    throw new DraftError(`unknown draft state "${options.state}". Known: ${DRAFT_STATES.join(", ")}.`);
  }
  const limit = Math.min(Math.max(options.limit ?? DRAFT_LIST_LIMIT, 1), DRAFT_LIST_LIMIT_MAX);
  const owner = options.owner ?? CLI_OWNER;
  return withDatabase(async ({ db }) => {
    const where = and(
      eq(draftTable.ownerId, owner),
      options.state === undefined ? undefined : eq(draftTable.state, options.state),
    );
    const [counted] = await db.select({ total: sql<number>`count(*)` }).from(draftTable).where(where);
    const rows = await db.select().from(draftTable).where(where).orderBy(desc(draftTable.updatedAt)).limit(limit);
    const jobs = await newestJobs(db, rows.map((row) => row.id));
    return {
      ok: true as const,
      command: "draft ls" as const,
      total: counted?.total ?? 0,
      drafts: rows.map((row) => summarise(row, jobs.get(row.id) ?? null)),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Human output                                                               */
/* -------------------------------------------------------------------------- */

function line(draft: DraftSummary): string {
  return `${draft.state.padEnd(10)} ${String(draft.turns).padStart(3)} turns  ${(draft.name ?? draft.title ?? "(no brief yet)").padEnd(40)} ${draft.id}`;
}

export function formatDraft(result: DraftResult): string {
  switch (result.command) {
    case "draft upsert":
      return `${result.created ? "recorded" : "updated"} ${result.draft.id} (${result.draft.state})`;
    case "draft show": {
      const d = result.draft;
      return [
        d.id,
        `  kind      ${d.kind}`,
        `  state     ${d.state}`,
        `  title     ${d.title ?? "(no brief yet)"}`,
        ...(d.name === null ? [] : [`  name      ${d.name}`]),
        `  source    ${d.source ?? "(new diagram)"}`,
        `  turns     ${d.turns}`,
        `  cost      ${d.costUsd === null ? "(none)" : `$${d.costUsd.toFixed(4)} (${d.costSource ?? "?"})`}`,
        `  session   ${d.plannerSessionId}`,
        `  jobs      ${result.jobs.length === 0 ? "(none)" : result.jobs.join(", ")}`,
        ...(d.error === null ? [] : [`  error     ${d.errorKind ?? "?"}: ${d.error}`]),
      ].join("\n");
    }
    case "draft delete":
      return result.outcome === "deleted"
        ? `deleted ${result.id}`
        : result.outcome === "has-jobs"
          ? `kept ${result.id}: ${result.jobs} job${result.jobs === 1 ? "" : "s"} name it`
          : result.outcome === "other-owner"
            ? `kept ${result.id}: another owner's draft`
            : `no draft ${result.id}`;
    case "draft ls":
      if (result.drafts.length === 0) return "no drafts";
      return `${result.drafts.map(line).join("\n")}\n\n${result.drafts.length} of ${result.total}`;
  }
}
