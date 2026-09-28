import { createHash } from "node:crypto";

import {
  concept,
  LOCAL_LEARNER_ID,
  type NewAsset,
  type NewAssetConcept,
  type NewAssetTopic,
  session,
  sessionLogEntry,
} from "@self-learn/schema";
import { asc, eq, inArray, max, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { extractWikilinks, parseFrontmatter, readText } from "../index/frontmatter";
import { latestRevisions, lockEntity } from "./revisions";
import { writeContent } from "./write";
import { CLI_OWNER } from "./scope";

/**
 * Session logs as rows (Track C, D20 of docs/CONTENT-MIGRATION.md).
 *
 * Every write to a log has always been an append (`appendSession`), so a log
 * is stored as what was appended: one `session_log_entry` per append, in
 * order, each holding the exact text that went onto the end of the file, and
 * the log is their concatenation. The first entry is what `learn session
 * start` wrote, frontmatter and heading included, so the file a log renders is
 * byte for byte the file it was. The frontmatter is not rebuilt from the
 * `session` row: the three logs of 2026-09-28 say `date:` a millisecond away
 * from `session.started_at`, and one opens with a note of its own instead of
 * the standard line under the heading.
 *
 * The table is append-only by trigger, so nothing here updates or deletes an
 * entry. An import of a log that grew appends the new tail as one entry; an
 * import of a log that was edited above its end is refused, since no append
 * can say what changed. A correction belongs in the note it touched.
 *
 * Each log is also a `session:` asset, the row `/library` and `catalog show`
 * find it by, with the concepts its wikilinks and goal name. The indexer
 * derives that row from the file and a writer derives it from the entries, by
 * the same function, `logAsset`.
 */

export const LOGS_DIR = "learn/sessions";

/** Where a log's file is, as `asset.path` and the export name it (D11). */
export const logPath = (id: string) => `${LOGS_DIR}/${id}.md`;

/** The id of the log's asset, `session:learn/sessions/<id>.md`. */
export const logAssetId = (id: string) => `session:${logPath(id)}`;

export class LogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogError";
  }
}

/** Serialises writers of one log: two appends cannot take the same `seq`. */
async function lockLog(db: CatalogDatabase, id: string): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`session_log:${id}`}, 0))`);
}

/** The highest `seq` a log has, 0 when it has none. */
async function lastSeq(db: CatalogDatabase, id: string): Promise<number> {
  const [row] = await db
    .select({ last: max(sessionLogEntry.seq) })
    .from(sessionLogEntry)
    .where(eq(sessionLogEntry.sessionId, id));
  return row?.last ?? 0;
}

/** One log's entries, in order. Empty when it has none. */
export async function readEntries(db: CatalogDatabase, id: string): Promise<string[]> {
  const rows = await db
    .select({ markdown: sessionLogEntry.markdown })
    .from(sessionLogEntry)
    .where(eq(sessionLogEntry.sessionId, id))
    .orderBy(asc(sessionLogEntry.seq));
  return rows.map((row) => row.markdown);
}

/** A log as its file would read, or null when it has no entries. */
export async function readLog(db: CatalogDatabase, id: string): Promise<string | null> {
  const entries = await readEntries(db, id);
  return entries.length === 0 ? null : entries.join("");
}

/** Every log with at least one entry, by id, each concatenated. Sorted by id. */
export async function readLogs(db: CatalogDatabase): Promise<{ id: string; markdown: string }[]> {
  const { rows } = await db.execute<{ id: string; markdown: string }>(sql`
    select session_id as id, string_agg(markdown, '' order by seq) as markdown
    from ${sessionLogEntry} group by session_id order by session_id collate "C"
  `);
  return rows;
}

/** The ids of every log with an entry, sorted as file names sort. */
export async function listLogIds(db: CatalogDatabase): Promise<string[]> {
  const rows = await db.selectDistinct({ id: sessionLogEntry.sessionId }).from(sessionLogEntry);
  return rows.map((row) => row.id).sort();
}

export interface LogAsset {
  asset: NewAsset;
  assetConcepts: NewAssetConcept[];
  assetTopics: NewAssetTopic[];
  /** Concept mentions that resolved, and wikilinks that named no concept. */
  covered: number;
  unmatched: number;
}

/**
 * The `session:` asset a log is, and what it covers: the concepts its body
 * links as `[[wikilinks]]` plus its frontmatter `goal`, those that are
 * concepts, and their topics. A wikilink naming no concept is not an error;
 * sessions link to each other and to notes never written.
 */
export function logAsset(
  where: string,
  text: string,
  concepts: ReadonlySet<string>,
  topicOf: (slug: string) => string | undefined,
): LogAsset {
  const { data, body } = parseFrontmatter(text);
  const id = `session:${where}`;
  const bytes = Buffer.from(text, "utf8");
  const named = new Set(extractWikilinks(body));
  const goal = readText(data, "goal");
  if (goal !== null) named.add(goal);

  const assetConcepts: NewAssetConcept[] = [];
  const topics = new Set<string>();
  let covered = 0;
  let unmatched = 0;
  for (const target of named) {
    if (!concepts.has(target)) {
      unmatched += 1;
      continue;
    }
    assetConcepts.push({ assetId: id, conceptSlug: target });
    covered += 1;
    const topicSlug = topicOf(target);
    if (topicSlug !== undefined) topics.add(topicSlug);
  }
  return {
    asset: {
      id,
      kind: "session",
      path: where,
      url: null,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      title: readText(data, "title") ?? where.replace(/^.*\//, "").replace(/\.md$/, ""),
      sourceRepo: "self-learn",
    },
    assetConcepts,
    assetTopics: [...topics].map((topicSlug) => ({ assetId: id, topicSlug })),
    covered,
    unmatched,
  };
}

/** What `learn session start|log|close` and `observe --session` record about who wrote it. */
export interface LogWriter {
  author?: string;
  reason: string;
}

/**
 * Append `markdown` to a log, exactly as given, as its next entry, and bring
 * its asset up to date. Returns the entry's `seq`.
 *
 * The session row is created if the log names one nothing has started, as
 * `ensureSession` does for every other first reference to a session id.
 * The asset's locks are taken before the log's, the order an import takes
 * them in (every content lock first, then each log's), so the two cannot
 * deadlock.
 */
export async function appendLog(
  db: CatalogDatabase,
  id: string,
  markdown: string,
  writer: LogWriter,
  options: { ifEmpty?: boolean } = {},
): Promise<{ seq: number; path: string; appended: boolean }> {
  if (markdown === "") throw new LogError(`nothing to append to the log of session "${id}"`);
  return db.transaction(async (tx) => {
    const assetId = logAssetId(id);
    await lockEntity(tx, "asset", assetId);
    await lockLog(tx, id);
    const [existing] = await tx.select({ kind: session.kind }).from(session).where(eq(session.id, id)).limit(1);
    if (existing === undefined) {
      await tx
        .insert(session)
        .values({ id, kind: "tutor", learnerId: LOCAL_LEARNER_ID, state: "running" })
        .onConflictDoNothing();
    } else if (existing.kind !== "tutor") {
      throw new LogError(`session "${id}" is a ${existing.kind} session, and only a tutor session keeps a log`);
    }
    const last = await lastSeq(tx, id);
    // A header goes only onto an empty log, decided under the log's lock so
    // two `session start`s at once cannot both see it empty.
    if (options.ifEmpty === true && last > 0) return { seq: last, path: logPath(id), appended: false };
    const seq = last + 1;
    await tx.insert(sessionLogEntry).values({ sessionId: id, seq, markdown });
    await writeLogAsset(tx, id, { ...writer, sessionId: id });
    return { seq, path: logPath(id), appended: true };
  });
}

/** Rewrite a log's asset from its entries, through the seam. */
async function writeLogAsset(
  db: CatalogDatabase,
  id: string,
  writer: LogWriter & { sessionId?: string },
): Promise<void> {
  const text = (await readEntries(db, id)).join("");
  const rows = await db.select({ slug: concept.slug, topic: concept.topicSlug }).from(concept);
  const topics = new Map(rows.map((row) => [row.slug, row.topic ?? undefined]));
  const found = logAsset(logPath(id), text, new Set(topics.keys()), (slug) => topics.get(slug));
  const assetId = found.asset.id;
  const latest = (await latestRevisions(db, "asset", [assetId])).get(assetId);
  await writeContent(db, {
    owner: CLI_OWNER,
    type: "asset",
    id: assetId,
    next: {
      row: { ...found.asset },
      links: {
        asset_concept: found.assetConcepts.map(({ conceptSlug }) => ({ conceptSlug })),
        asset_topic: found.assetTopics.map(({ topicSlug }) => ({ topicSlug })),
      },
    },
    base: latest?.id ?? null,
    author: writer.author ?? LOCAL_LEARNER_ID,
    authorKind: "person",
    reason: writer.reason,
    sessionId: writer.sessionId,
  });
}

/** A log as `catalog import` read it from a file. */
export interface ImportedLog {
  id: string;
  /** Repo-relative, for a refusal. */
  path: string;
  markdown: string;
  title: string | null;
  goal: string | null;
  date: Date | null;
}

/**
 * Bring the entries in line with the files an import read, inside its
 * transaction (which already holds the asset type's lock).
 *
 * A log whose file equals its entries is left alone. One that grew gets the
 * new tail as one entry. One with no entries gets the whole file as its first,
 * and a session row if it has none, marked `interrupted` like the ones
 * migration 0006 backfilled, since a file is no evidence of how it ended.
 * Refused, all at once and by file: a log edited above its last entry, and a
 * log whose file is gone while its entries are not, since neither can be
 * written as an append.
 */
export async function importLogs(
  db: CatalogDatabase,
  logs: readonly ImportedLog[],
): Promise<{ appended: number; sessions: number; problems: string[] }> {
  const problems: string[] = [];
  let appended = 0;
  let sessions = 0;
  const reading = new Set(logs.map((log) => log.id));
  for (const id of await listLogIds(db)) {
    if (reading.has(id)) continue;
    problems.push(
      `${logPath(id)}: is gone, but its log is in the database, whose entries are append-only (D20). ` +
        `Put it back with \`catalog export --only sessions --out <dir>\` and copying it in.`,
    );
  }
  const ids = [...reading].sort();
  const known = new Map(
    (ids.length === 0
      ? []
      : await db.select({ id: session.id, kind: session.kind }).from(session).where(inArray(session.id, ids))
    ).map((row) => [row.id, row.kind]),
  );
  for (const log of [...logs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    await lockLog(db, log.id);
    const kind = known.get(log.id);
    if (kind !== undefined && kind !== "tutor") {
      problems.push(`${log.path}: session "${log.id}" is a ${kind} session, and only a tutor session keeps a log`);
      continue;
    }
    const current = (await readEntries(db, log.id)).join("");
    if (current === log.markdown) continue;
    if (!log.markdown.startsWith(current)) {
      problems.push(
        `${log.path}: was edited above the end of what was imported, and a log's entries are ` +
          `append-only (D20). Put the earlier text back, and add a correction at the end or in the note it touched.`,
      );
      continue;
    }
    if (kind === undefined) {
      await db
        .insert(session)
        .values({
          id: log.id,
          kind: "tutor",
          learnerId: LOCAL_LEARNER_ID,
          state: "interrupted",
          title: log.title,
          goal: log.goal,
          startedAt: log.date ?? new Date(),
          metadata: { imported: "sessions" },
        })
        .onConflictDoNothing();
      sessions += 1;
    }
    await db
      .insert(sessionLogEntry)
      .values({ sessionId: log.id, seq: (await lastSeq(db, log.id)) + 1, markdown: log.markdown.slice(current.length) });
    appended += 1;
  }
  return { appended, sessions, problems };
}
