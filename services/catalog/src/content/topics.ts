import { realpath as fsRealpath } from "node:fs/promises";

import type { TopicEntry, TopicRelation } from "@self-learn/content";
import {
  type AuthorKind,
  concept,
  contentRevision,
  contentSource,
  JOB_ACTIVE_STATES,
  manimkcTopic,
  type RevisionEntityType,
  topic,
  TOPIC_RELATION_KINDS,
  topicRelation,
  type TopicRelationKind,
} from "@self-learn/schema";
import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { ASSET_PREFIX } from "../index/source";
import { diagramPaths } from "./diagram-document";
import { type ExportType, sha256 } from "./layout";
import { POSITION_STEP } from "./positions";
import { andOwnedBy, type Owners, CLI_OWNER, cliScope } from "./scope";
import {
  type LatestRevision,
  latestRevisions,
  lockTypes,
  markSeam,
  type PendingRevision,
  reserveRevisionIds,
  revisionRow,
} from "./revisions";
import { canonicalJson, readSnapshots, type SnapshotRead } from "./snapshot";
import { assertInStep, type ExportedType, importRoot, writeThrough } from "./write-through";
import { writeContent, writeContents, type WriteContentInput, type WriteContentResult } from "./write";

/**
 * The topic writer: `catalog topic add|edit|rename|relate|archive|restore`
 * and the reads the planner needs (docs/CONTENT-MIGRATION.md, Track A, D14,
 * D16, edge cases 2 and 17).
 *
 * Every write goes through the seam (`writeContent`/`writeContents`) with an
 * author and a reason, and through `writeThrough`, so `content/topics.yaml`
 * is rewritten from the rows in the same transaction (D17). That is what makes
 * these verbs safe before topics flip as well as after: the file the importer
 * reads next is the file the rows would export, so the next `catalog import` is
 * a no-op for topics rather than a revert.
 *
 * What the database already refuses (a duplicate slug, a relation to a topic
 * that does not exist, a self-edge, a `related` edge stored the wrong way
 * round) is also checked here first, so the refusal names the topic rather
 * than a constraint.
 */

export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The trigram similarity above which `topic add` names an existing topic as a
 * near match (D14, edge case 17). 0.45 is the plan's guess; see the tests for
 * what it catches and misses on the real vocabulary.
 */
export const NEAR_MATCH_THRESHOLD = 0.45;

/** How many near matches a check reports at most. */
const NEAR_MATCHES_SHOWN = 5;

export type TopicErrorCode =
  | "invalid"
  | "exists"
  | "missing"
  | "archived"
  | "duplicate"
  | "in-use"
  | "not-owned"
  | "cycle"
  | "no-room"
  | "diagrams-on-files"
  | "jobs-open"
  | "foreign-owner";

export class TopicError extends Error {
  constructor(
    readonly code: TopicErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TopicError";
  }
}

/** Who is writing, and why. The reason becomes the revision's reason. */
export interface By {
  author: string;
  authorKind: AuthorKind;
  reason: string;
  jobId?: string;
  sessionId?: string;
}

type TopicRow = typeof topic.$inferSelect;
type RelationRow = typeof topicRelation.$inferSelect;

/** A revision a verb appended, for its `--json`. */
export interface WrittenRevision {
  type: RevisionEntityType;
  id: string;
  revisionId: number;
  op: string | null;
  changed: boolean;
}

export interface NearMatch {
  slug: string;
  title: string;
  /** pg_trgm `similarity`, 0 to 1. */
  score: number;
  /** Which of the existing topic's names matched: its title, an alias, or its slug read as words. */
  field: "title" | "alias" | "slug";
  value: string;
  /** Which of the proposed names it matched. */
  against: string;
}

/** A relation as a writer states it: from this topic, of this kind, to that one. */
export interface RelationInput {
  kind: TopicRelationKind;
  to: string;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function text(value: string | undefined, field: string): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") throw new TopicError("invalid", `${field} is required and cannot be empty`);
  return trimmed;
}

function slugOf(value: string | undefined, field: string): string {
  const slug = text(value, field);
  if (!KEBAB.test(slug)) {
    throw new TopicError("invalid", `${field} "${slug}" is not kebab-case (lowercase words joined by single hyphens)`);
  }
  return slug;
}

/** Trimmed, none empty, none twice: what `stringList` in the reader would hand back. */
function aliasList(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const alias = raw.trim();
    if (alias === "") throw new TopicError("invalid", "an alias cannot be empty");
    if (out.includes(alias)) throw new TopicError("invalid", `alias "${alias}" is given twice`);
    out.push(alias);
  }
  return out;
}

function summaryOf(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** `kind:slug`, as `--relate` takes it. */
export function parseRelate(value: string): RelationInput {
  const at = value.indexOf(":");
  const kind = at === -1 ? "" : value.slice(0, at).trim();
  const to = at === -1 ? "" : value.slice(at + 1).trim();
  if (!(TOPIC_RELATION_KINDS as readonly string[]).includes(kind) || to === "") {
    throw new TopicError(
      "invalid",
      `--relate "${value}" is not kind:slug with kind one of ${TOPIC_RELATION_KINDS.join(", ")}`,
    );
  }
  return { kind: kind as TopicRelationKind, to };
}

export function relationKind(value: string | undefined): TopicRelationKind {
  if (value === undefined || !(TOPIC_RELATION_KINDS as readonly string[]).includes(value)) {
    throw new TopicError("invalid", `the relation kind must be one of ${TOPIC_RELATION_KINDS.join(", ")}`);
  }
  return value as TopicRelationKind;
}

/**
 * Where an edge is stored: under `from`, except a `related` edge, which is
 * symmetric and stored once, under the smaller slug (the order `topic_relation`
 * checks and the reader enforces).
 */
function storedAs(from: string, kind: TopicRelationKind, to: string): { owner: string; other: string } {
  if (kind === "related" && to < from) return { owner: to, other: from };
  return { owner: from, other: to };
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

async function rowOf(db: CatalogDatabase, slug: string): Promise<TopicRow | undefined> {
  const [row] = await db.select().from(topic).where(eq(topic.slug, slug));
  return row;
}

function missingTopic(slug: string, role: string): TopicError {
  return new TopicError(
    "missing",
    `no ${role} "${slug}" in the catalog. Find the slug with ` +
      `\`npm run --silent catalog -- search <term> --json\`, or list them with ` +
      `\`npm run --silent catalog -- topic ls --json\`.`,
  );
}

async function liveRow(db: CatalogDatabase, slug: string, role = "topic"): Promise<TopicRow> {
  const row = await rowOf(db, slug);
  if (row === undefined) throw missingTopic(slug, role);
  if (row.archivedAt !== null) {
    throw new TopicError("archived", `${role} "${slug}" is archived. Restore it first: \`catalog topic restore ${slug}\`.`);
  }
  return row;
}

/**
 * `liveRow`, for a topic the CLI's owner is about to link to: one another
 * owner holds, not the commons, is refused with the sentence a missing one
 * gets (phase 4). A relation, a concept's topic or a module's topic naming it
 * would be a link its own reader could not follow.
 */
async function readableRow(db: CatalogDatabase, slug: string, role = "topic"): Promise<TopicRow> {
  const row = await liveRow(db, slug, role);
  if (!cliScope().readable.includes(row.ownerId)) throw missingTopic(slug, role);
  return row;
}

/**
 * Refuse a write to a topic another owner holds, before anything moves. The
 * seam refuses the topic's own row the same way (`foreign-owner`); this is for
 * the verbs that write around it, a rename above all, whose cascade and
 * revisions would otherwise run as the CLI's owner over someone else's topic.
 */
function assertOwnTopic(row: TopicRow, verb: string): void {
  if (row.ownerId === CLI_OWNER) return;
  throw new TopicError(
    "foreign-owner",
    `topic "${row.slug}" belongs to ${row.ownerId}, and this ${verb} is for ${CLI_OWNER}. Ids are shared across ` +
      `owners (D23 of docs/CONTENT-MIGRATION.md), so it would change their topic; nothing was written.`,
  );
}

async function relationsOf(db: CatalogDatabase, owner: string): Promise<RelationRow[]> {
  return db
    .select()
    .from(topicRelation)
    .where(eq(topicRelation.fromSlug, owner))
    .orderBy(asc(topicRelation.position), asc(topicRelation.kind), asc(topicRelation.toSlug));
}

/**
 * An owned relation list as the seam replaces it: dense positions, and no
 * `owner_id`. A relation belongs to the topic it is stored under (D24), and
 * the seam stamps the write's owner on every row it puts back, so a row a
 * mixed state left under another owner's name is repaired by the next write
 * of its topic rather than refusing it.
 */
function relationLinks(rows: readonly Pick<RelationRow, "toSlug" | "kind">[]): Record<string, unknown>[] {
  return rows.map((row, i) => ({ toSlug: row.toSlug, kind: row.kind, position: i + 1 }));
}

async function latestId(db: CatalogDatabase, type: RevisionEntityType, id: string): Promise<number | null> {
  return (await latestRevisions(db, type, [id])).get(id)?.id ?? null;
}

/**
 * The live vocabulary as `TopicEntry[]`, in authored order, with `relations`
 * and `maps` rebuilt from the rows that hold them: the same value
 * `fileSource(root).topics()` returns for the file `catalog export` would
 * write, list for list. `topic ls` and the database reader both use it.
 *
 * `owners` scopes it (phase 4): a topic, a relation, a manimkc mapping, a
 * filed concept or a module another owner holds is left out, and so is a
 * relation whose far end is a topic the reader cannot see, since the entry
 * would otherwise name a slug the vocabulary does not list. Omitted, every
 * owner is read, which is what the export and `topic ls` want.
 */
export async function readTopicEntries(db: CatalogDatabase, owners?: Owners): Promise<TopicEntry[]> {
  const rows = <T>(query: ReturnType<typeof sql>) => db.execute(query).then((r) => r.rows as T[]);
  const topics = await rows<{ slug: string; title: string; domain: string; summary: string | null; aliases: unknown }>(
    sql`select slug, title, domain, summary, aliases from topic
        where archived_at is null${andOwnedBy(sql`owner_id`, owners)} order by position, slug`,
  );
  const group = <R extends Record<string, unknown>>(list: R[], key: keyof R) => {
    const out = new Map<string, R[]>();
    for (const item of list) {
      const k = String(item[key]);
      const bucket = out.get(k);
      if (bucket === undefined) out.set(k, [item]);
      else bucket.push(item);
    }
    return out;
  };
  // The same queries, in the same order, as `renderTopics` in export.ts, so a
  // reader and the export can never list one topic's maps differently.
  const relations = group(
    await rows<{ from_slug: string; to_slug: string; kind: string }>(
      sql`select r.from_slug, r.to_slug, r.kind from topic_relation r
          where true${andOwnedBy(sql`r.owner_id`, owners)}${
            owners === undefined
              ? sql``
              : sql` and exists (select 1 from topic t where t.slug = r.to_slug${andOwnedBy(sql`t.owner_id`, owners)})`
          }
          order by r.from_slug, r.position, r.kind, r.to_slug`,
    ),
    "from_slug",
  );
  const manimkc = group(
    await rows<{ topic_slug: string; path: string }>(
      sql`select topic_slug, path from manimkc_topic
          where true${andOwnedBy(sql`owner_id`, owners)} order by topic_slug, position, path`,
    ),
    "topic_slug",
  );
  const concepts = group(
    await rows<{ topic_slug: string; slug: string }>(
      sql`select topic_slug, slug from concept
          where topic_slug is not null and archived_at is null${andOwnedBy(sql`owner_id`, owners)}
          order by topic_slug, topic_position, slug`,
    ),
    "topic_slug",
  );
  const modules = group(
    await rows<{ topic_slug: string; collection_id: string }>(
      sql`select m.topic_slug, m.collection_id from collection_item m
          join collection c on c.id = m.collection_id
          where m.topic_slug is not null and c.kind = 'module' and c.archived_at is null${andOwnedBy(sql`c.owner_id`, owners)}
          order by m.topic_slug, m.topic_position, m.collection_id`,
    ),
    "topic_slug",
  );
  return topics.map((row) => ({
    slug: row.slug,
    title: row.title,
    domain: row.domain,
    summary: row.summary === null || row.summary.trim() === "" ? null : row.summary,
    aliases: Array.isArray(row.aliases) ? row.aliases.filter((a): a is string => typeof a === "string") : [],
    relations: (relations.get(row.slug) ?? []).map(
      (r): TopicRelation => ({ kind: r.kind as TopicRelation["kind"], to: r.to_slug }),
    ),
    maps: {
      manimkc: (manimkc.get(row.slug) ?? []).map((r) => r.path),
      courses: (modules.get(row.slug) ?? []).map((r) => r.collection_id),
      concepts: (concepts.get(row.slug) ?? []).map((r) => r.slug),
    },
  }));
}

/** One topic as the planner reads it (STUDIO-CHAT-FIRST phase 1): the entry and the edges into it. */
export interface TopicListing extends TopicEntry {
  /** Edges other topics hold that point here: `{kind, from}`. A `related` edge shows on both ends. */
  incoming: { kind: TopicRelationKind; from: string }[];
}

export interface TopicList {
  topics: TopicListing[];
  domains: { domain: string; topics: number }[];
  counts: { topics: number; domains: number; aliases: number; relations: number };
}

/** `catalog topic ls [--domain]`: every live topic with what the planner needs to place a new one. */
export async function listTopics(db: CatalogDatabase, options: { domain?: string } = {}): Promise<TopicList> {
  const entries = await readTopicEntries(db);
  const incoming = new Map<string, TopicListing["incoming"]>();
  for (const entry of entries) {
    for (const relation of entry.relations) {
      const into = incoming.get(relation.to) ?? [];
      into.push({ kind: relation.kind, from: entry.slug });
      incoming.set(relation.to, into);
    }
  }
  const all = entries.map((entry) => ({ ...entry, incoming: incoming.get(entry.slug) ?? [] }));
  const topics = options.domain === undefined ? all : all.filter((t) => t.domain === options.domain);
  const domains = new Map<string, number>();
  for (const t of topics) domains.set(t.domain, (domains.get(t.domain) ?? 0) + 1);
  return {
    topics,
    domains: [...domains].map(([domain, count]) => ({ domain, topics: count })),
    counts: {
      topics: topics.length,
      domains: domains.size,
      aliases: topics.reduce((a, t) => a + t.aliases.length, 0),
      relations: topics.reduce((a, t) => a + t.relations.length, 0),
    },
  };
}

/**
 * Existing live topics whose title, an alias, or slug read as words is
 * trigram-similar to any of `candidates` at or above `threshold`, best first,
 * one line per topic (its best match). `exclude` leaves one topic out, for an
 * edit comparing a topic with the rest.
 */
export async function nearMatches(
  db: CatalogDatabase,
  candidates: readonly string[],
  options: { exclude?: string; threshold?: number } = {},
): Promise<NearMatch[]> {
  const wanted = [...new Set(candidates.map((c) => c.trim()).filter((c) => c !== ""))];
  if (wanted.length === 0) return [];
  const threshold = options.threshold ?? NEAR_MATCH_THRESHOLD;
  const { rows } = await db.execute<{
    slug: string;
    title: string;
    field: NearMatch["field"];
    value: string;
    against: string;
    score: number;
  }>(sql`
    select distinct on (t.slug) t.slug, t.title, m.field, m.value, c.against,
           similarity(m.value, c.against)::float8 as score
    from topic t
    cross join lateral (
      select 'title' as field, t.title as value
      union all select 'slug', replace(t.slug, '-', ' ')
      union all select 'alias', a from jsonb_array_elements_text(t.aliases) as a
    ) m
    cross join unnest(${sql.param(wanted)}::text[]) as c(against)
    where t.archived_at is null and t.slug <> ${options.exclude ?? ""}
      and similarity(m.value, c.against) >= ${threshold}
    order by t.slug, score desc, m.field, m.value
  `);
  return rows
    .map((row) => ({ ...row, score: Math.round(Number(row.score) * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score || (a.slug < b.slug ? -1 : 1))
    .slice(0, NEAR_MATCHES_SHOWN);
}

/* ------------------------------------------------------------------ *
 * Positions
 * ------------------------------------------------------------------ */

/** A position strictly between two neighbours, either of which may be absent (D22). */
function between(low: number | null, high: number | null, slug: string, after: string | null, before: string | null): number {
  if (low === null && high === null) return POSITION_STEP;
  if (high === null) return (low as number) + POSITION_STEP;
  if (low === null) return high - POSITION_STEP;
  if (high - low < 2) {
    throw new TopicError(
      "no-room",
      `no position is free for "${slug}" between "${after}" and "${before}" in the vocabulary's order. ` +
        `Spread the list out with \`catalog renumber topics --reason "..."\`, then run this again.`,
    );
  }
  return low + Math.floor((high - low) / 2);
}

/**
 * Where a topic goes in `topics.yaml`'s order: after the last live topic of
 * its domain, since the file is written in domain groups, or at the end when
 * the domain is new.
 */
async function placeInDomain(
  db: CatalogDatabase,
  slug: string,
  domain: string,
): Promise<{ position: number; newDomain: boolean }> {
  const rows = (
    await db
      .select({ slug: topic.slug, domain: topic.domain, position: topic.position })
      .from(topic)
      .where(isNull(topic.archivedAt))
      .orderBy(asc(topic.position), asc(topic.slug))
  ).filter((row) => row.slug !== slug);
  let last = -1;
  rows.forEach((row, i) => {
    if (row.domain === domain) last = i;
  });
  const at = last === -1 ? rows.length : last + 1;
  const low = rows[at - 1];
  const high = rows[at];
  return {
    position: between(low?.position ?? null, high?.position ?? null, slug, low?.slug ?? null, high?.slug ?? null),
    newDomain: last === -1,
  };
}

/* ------------------------------------------------------------------ *
 * Checks shared by the writers
 * ------------------------------------------------------------------ */

/** Refuse a title another live topic already has, ignoring case and spacing. */
async function assertTitleFree(db: CatalogDatabase, title: string, except?: string): Promise<void> {
  const { rows } = await db.execute<{ slug: string }>(sql`
    select slug from topic
    where archived_at is null and slug <> ${except ?? ""}
      and lower(regexp_replace(trim(title), '[[:space:]]+', ' ', 'g')) = ${title.trim().replace(/\s+/g, " ").toLowerCase()}
    limit 1
  `);
  const clash = rows[0];
  if (clash !== undefined) {
    throw new TopicError("duplicate", `topic "${clash.slug}" already has the title "${title}". Use it, or pick a title that says how this one differs.`);
  }
}

/**
 * Refuse an edge that would close a loop: `broader` and `precedes` are
 * orders, and a topic that is its own ancestor or its own prerequisite is a
 * vocabulary no reader can lay out. `related` is symmetric and has no loops.
 */
async function assertNoCycle(db: CatalogDatabase, from: string, kind: TopicRelationKind, to: string, pending: readonly RelationInput[] = []): Promise<void> {
  if (kind === "related") return;
  const { rows } = await db.execute<{ from_slug: string; to_slug: string }>(
    sql`select from_slug, to_slug from topic_relation where kind = ${kind}`,
  );
  const next = new Map<string, string[]>();
  const add = (a: string, b: string) => next.set(a, [...(next.get(a) ?? []), b]);
  for (const row of rows) add(row.from_slug, row.to_slug);
  for (const edge of pending) if (edge.kind === kind) add(from, edge.to);
  // Is `from` reachable from `to`? Then from -> to closes a loop.
  const seen = new Set<string>();
  const queue = [to];
  while (queue.length > 0) {
    const at = queue.shift() as string;
    if (at === from) {
      throw new TopicError(
        "cycle",
        `"${from}" ${kind} "${to}" would close a loop: "${to}" already leads back to "${from}" through ${kind} edges.`,
      );
    }
    if (seen.has(at)) continue;
    seen.add(at);
    queue.push(...(next.get(at) ?? []));
  }
}

async function owned(db: CatalogDatabase): Promise<boolean> {
  const [row] = await db.select({ source: contentSource.source }).from(contentSource).where(eq(contentSource.type, "topics"));
  return row?.source === "db";
}

function written(results: readonly WriteContentResult[]): WrittenRevision[] {
  return results.map((r) => ({ type: r.type, id: r.id, revisionId: r.revisionId, op: r.op, changed: r.changed }));
}

/* ------------------------------------------------------------------ *
 * add
 * ------------------------------------------------------------------ */

export interface AddTopicInput {
  slug: string;
  title: string;
  domain: string;
  summary?: string | null;
  aliases?: readonly string[];
  relations?: readonly RelationInput[];
}

export interface AddTopicResult {
  dryRun: boolean;
  /** The entry as the vocabulary will hold it. `maps` are empty: nothing is filed under a new topic yet. */
  entry: TopicEntry;
  position: number;
  /** True when no live topic has this domain yet, so the topic opens a new group. */
  newDomain: boolean;
  /** Existing topics that look like this one (edge case 17). A warning; the add still goes ahead. */
  nearMatches: NearMatch[];
  threshold: number;
  revisions: WrittenRevision[];
  exported: ExportedType[];
}

interface AddPlan {
  entry: TopicEntry;
  position: number;
  newDomain: boolean;
  inputs: WriteContentInput[];
}

/**
 * What an add can be refused for without reading the database: the shapes of
 * the slug, domain, title, aliases and relations. The CLI runs it before it
 * connects, so a malformed invocation is exit 2 whatever state the database
 * is in; the writer runs it again, since it is the writer's rule.
 */
export function checkAddInput(input: AddTopicInput): {
  slug: string;
  title: string;
  domain: string;
  summary: string | null;
  aliases: string[];
  relations: RelationInput[];
} {
  const slug = slugOf(input.slug, "--slug");
  const relations: RelationInput[] = [];
  const seen = new Set<string>();
  for (const relation of input.relations ?? []) {
    const kind = relationKind(relation.kind);
    const to = slugOf(relation.to, "a relation's topic");
    if (to === slug) throw new TopicError("invalid", `"${slug}" cannot relate to itself`);
    const key = `${kind} ${to}`;
    if (seen.has(key)) throw new TopicError("invalid", `--relate ${kind}:${to} is given twice`);
    seen.add(key);
    relations.push({ kind, to });
  }
  return {
    slug,
    title: text(input.title, "--title"),
    domain: slugOf(input.domain, "--domain"),
    summary: summaryOf(input.summary),
    aliases: aliasList(input.aliases ?? []),
    relations,
  };
}

/** The same, for an edit: the slug's shape and the shape of every field given. */
export function checkEditInput(input: EditTopicInput): void {
  slugOf(input.slug, "the topic");
  if (input.title !== undefined) text(input.title, "--title");
  if (input.domain !== undefined) slugOf(input.domain, "--domain");
  if (input.aliases !== undefined) aliasList(input.aliases);
  aliasList(input.addAliases ?? []);
  aliasList(input.dropAliases ?? []);
}

/** The same, for a verb that names topics by slug: rename, relate, archive, restore. */
export function checkSlugs(...slugs: [string | undefined, string][]): void {
  for (const [value, field] of slugs) slugOf(value, field);
}

async function planAdd(db: CatalogDatabase, input: AddTopicInput, by: By): Promise<AddPlan> {
  const { slug, title, domain, summary, aliases, relations } = checkAddInput(input);

  const existing = await rowOf(db, slug);
  if (existing !== undefined) {
    throw new TopicError(
      "exists",
      existing.archivedAt === null
        ? `topic "${slug}" already exists ("${existing.title}"). Edit it with \`catalog topic edit ${slug}\`.`
        : `topic "${slug}" exists and is archived. Restore it with \`catalog topic restore ${slug}\`.`,
    );
  }
  await assertTitleFree(db, title);

  const own: RelationInput[] = [];
  const others = new Map<string, RelationInput[]>();
  for (const { kind, to } of relations) {
    await readableRow(db, to, "related topic");
    await assertNoCycle(db, slug, kind, to, own);
    const { owner, other } = storedAs(slug, kind, to);
    if (owner === slug) own.push({ kind, to: other });
    else others.set(owner, [...(others.get(owner) ?? []), { kind, to: slug }]);
  }

  const { position, newDomain } = await placeInDomain(db, slug, domain);
  const inputs: WriteContentInput[] = [
    {
      owner: CLI_OWNER,
      type: "topic",
      id: slug,
      op: "create",
      next: {
        row: { slug, title, domain, summary, aliases, position },
        links: { topic_relation: own.map((r, i) => ({ toSlug: r.to, kind: r.kind, position: i + 1 })) },
      },
      // A slug a rename left behind keeps its history; a new topic under it continues the line.
      base: await latestId(db, "topic", slug),
      ...by,
    },
  ];
  for (const [owner, added] of others) {
    const row = await liveRow(db, owner);
    const current = await relationsOf(db, owner);
    inputs.push({
      owner: CLI_OWNER,
      type: "topic",
      id: owner,
      next: {
        row,
        links: {
          topic_relation: relationLinks([
            ...current,
            ...added.map((r) => ({ toSlug: r.to, kind: r.kind })),
          ]),
        },
      },
      base: await latestId(db, "topic", owner),
      ...by,
    });
  }

  return {
    entry: {
      slug,
      title,
      domain,
      summary,
      aliases,
      relations: own.map((r) => ({ kind: r.kind, to: r.to })),
      maps: { manimkc: [], courses: [], concepts: [] },
    },
    position,
    newDomain,
    inputs,
  };
}

/**
 * `catalog topic add`. With `dryRun` it validates, places and looks for near
 * matches, and checks the files are in step, writing nothing: what the
 * studio's runner calls to put a proposed topic on the confirm card (D16).
 */
export async function addTopic(
  db: CatalogDatabase,
  input: AddTopicInput,
  by: By,
  options: { dryRun?: boolean } = {},
): Promise<AddTopicResult> {
  const candidates = [input.title, ...(input.aliases ?? []), input.slug.replaceAll("-", " ")];
  if (options.dryRun === true) {
    const plan = await planAdd(db, input, by);
    await assertInStep(db, ["topics"]);
    return {
      dryRun: true,
      entry: plan.entry,
      position: plan.position,
      newDomain: plan.newDomain,
      nearMatches: await nearMatches(db, candidates),
      threshold: NEAR_MATCH_THRESHOLD,
      revisions: [],
      exported: [],
    };
  }
  const done = await writeThrough(db, ["topics"], async (tx) => {
    const plan = await planAdd(tx, input, by);
    // Before the write, or the new topic would match itself.
    const near = await nearMatches(tx, candidates);
    const results = await writeContents(tx, plan.inputs);
    return { plan, near, results };
  });
  const { plan, near, results } = done.value;
  return {
    dryRun: false,
    entry: plan.entry,
    position: plan.position,
    newDomain: plan.newDomain,
    nearMatches: near,
    threshold: NEAR_MATCH_THRESHOLD,
    revisions: written(results),
    exported: done.exported,
  };
}

/* ------------------------------------------------------------------ *
 * edit
 * ------------------------------------------------------------------ */

export interface EditTopicInput {
  slug: string;
  title?: string;
  /** An empty string clears it. */
  summary?: string;
  domain?: string;
  /** Replaces the whole list. */
  aliases?: readonly string[];
  addAliases?: readonly string[];
  dropAliases?: readonly string[];
}

export interface TopicWriteResult {
  slug: string;
  changed: boolean;
  revisions: WrittenRevision[];
  exported: ExportedType[];
  /** Existing topics a new title or alias resembles. */
  nearMatches: NearMatch[];
}

/** `catalog topic edit`: title, summary, aliases and domain. Never the slug; that is `rename`. */
export async function editTopic(db: CatalogDatabase, input: EditTopicInput, by: By): Promise<TopicWriteResult> {
  const slug = slugOf(input.slug, "the topic");
  const done = await writeThrough(db, ["topics"], async (tx) => {
    const row = await liveRow(tx, slug);
    const next: TopicRow = { ...row };
    const candidates: string[] = [];
    if (input.title !== undefined) {
      next.title = text(input.title, "--title");
      if (next.title !== row.title) {
        await assertTitleFree(tx, next.title, slug);
        candidates.push(next.title);
      }
    }
    if (input.summary !== undefined) next.summary = summaryOf(input.summary);
    let aliases = Array.isArray(row.aliases) ? (row.aliases as string[]) : [];
    if (input.aliases !== undefined) aliases = aliasList(input.aliases);
    for (const alias of aliasList(input.addAliases ?? [])) {
      if (aliases.includes(alias)) throw new TopicError("invalid", `"${slug}" already has the alias "${alias}"`);
      aliases = [...aliases, alias];
      candidates.push(alias);
    }
    for (const alias of aliasList(input.dropAliases ?? [])) {
      if (!aliases.includes(alias)) throw new TopicError("invalid", `"${slug}" has no alias "${alias}"`);
      aliases = aliases.filter((a) => a !== alias);
    }
    next.aliases = aliases;
    if (input.domain !== undefined) {
      next.domain = slugOf(input.domain, "--domain");
      if (next.domain !== row.domain) next.position = (await placeInDomain(tx, slug, next.domain)).position;
    }
    const near = await nearMatches(tx, candidates, { exclude: slug });
    const result = await writeContent(tx, {
      owner: CLI_OWNER,
      type: "topic",
      id: slug,
      next: { row: next },
      base: await latestId(tx, "topic", slug),
      ...by,
    });
    return { result, near };
  });
  return {
    slug,
    changed: done.value.result.changed,
    revisions: written([done.value.result]).filter((r) => r.changed),
    exported: done.exported,
    nearMatches: done.value.near,
  };
}

/* ------------------------------------------------------------------ *
 * relate
 * ------------------------------------------------------------------ */

export interface RelateInput {
  from: string;
  kind: TopicRelationKind;
  to: string;
  /** Remove the edge instead of adding it. */
  remove?: boolean;
}

export interface RelateResult extends TopicWriteResult {
  /** The edge as stored: a `related` edge sits under the smaller slug. */
  stored: { from: string; kind: TopicRelationKind; to: string };
}

/** `catalog topic relate <from> <kind> <to> [--remove]`: one typed edge, added or removed. */
export async function relateTopic(db: CatalogDatabase, input: RelateInput, by: By): Promise<RelateResult> {
  const from = slugOf(input.from, "the topic");
  const to = slugOf(input.to, "the other topic");
  const kind = relationKind(input.kind);
  if (from === to) throw new TopicError("invalid", `"${from}" cannot relate to itself`);
  const { owner, other } = storedAs(from, kind, to);
  const done = await writeThrough(db, ["topics"], async (tx) => {
    await readableRow(tx, from);
    await readableRow(tx, to, "other topic");
    const row = await liveRow(tx, owner);
    const current = await relationsOf(tx, owner);
    const has = current.some((r) => r.kind === kind && r.toSlug === other);
    let list: Pick<RelationRow, "toSlug" | "kind">[];
    if (input.remove === true) {
      if (!has) throw new TopicError("missing", `there is no "${from}" ${kind} "${to}" edge to remove`);
      list = current.filter((r) => !(r.kind === kind && r.toSlug === other));
    } else {
      if (has) throw new TopicError("exists", `"${from}" ${kind} "${to}" is already recorded`);
      await assertNoCycle(tx, from, kind, to);
      list = [...current, { toSlug: other, kind }];
    }
    return writeContent(tx, {
      owner: CLI_OWNER,
      type: "topic",
      id: owner,
      next: { row, links: { topic_relation: relationLinks(list) } },
      base: await latestId(tx, "topic", owner),
      ...by,
    });
  });
  return {
    slug: owner,
    changed: done.value.changed,
    revisions: written([done.value]),
    exported: done.exported,
    nearMatches: [],
    stored: { from: owner, kind, to: other },
  };
}

/* ------------------------------------------------------------------ *
 * map (maps.manimkc)
 * ------------------------------------------------------------------ */

/**
 * One manimkc topic folder as `maps.manimkc` names it: manimkc's own
 * `topics/<domain>/<subdomain>/<topic>` with `topics/` dropped, so
 * slash-separated segments, none empty, `.` or `..`.
 */
const MANIMKC_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function checkManimkcPaths(values: readonly string[]): string[] {
  if (values.length === 0) throw new TopicError("invalid", "topic map needs at least one --manimkc <path>");
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\/+$/, "");
    if (value.startsWith("topics/")) {
      throw new TopicError(
        "invalid",
        `--manimkc ${raw}: maps.manimkc names the folder with manimkc's "topics/" dropped, so "${value.slice("topics/".length)}"`,
      );
    }
    const segments = value.split("/");
    if (value === "" || segments.some((segment) => !MANIMKC_SEGMENT.test(segment) || segment === "..")) {
      throw new TopicError(
        "invalid",
        `--manimkc ${raw}: not a manimkc topic folder. It is the path under manimkc's topics/, ` +
          `such as networking/tailscale/ssh-tunnels.`,
      );
    }
    if (out.includes(value)) throw new TopicError("invalid", `--manimkc ${value} is given twice`);
    out.push(value);
  }
  return out;
}

export interface MapInput {
  slug: string;
  /** Folders to map to the topic, or to unmap with `remove`. */
  manimkc: readonly string[];
  remove?: boolean;
}

export interface MapResult extends TopicWriteResult {
  /** The topic's `maps.manimkc` after the write, in order. */
  manimkc: string[];
}

/**
 * `catalog topic map <slug> --manimkc <path>... [--remove]`: which manimkc
 * folders a topic's videos come from (`maps.manimkc`), the one part of a
 * topic's entry no other verb writes. Once topics are flipped a hand edit of
 * that list is refused as an edited export, and the manimkc indexer refuses
 * a folder no topic maps, so without this the first new rendered topic would
 * block every `catalog import`.
 *
 * A folder belongs to one topic (`manimkc_topic.path` is the key), so mapping
 * one another topic holds is refused, naming that topic: moving it is two
 * decisions, and each gets its own reason. New folders go at the end of the
 * list, and the file is rewritten from the rows (D17), which is what the
 * manimkc indexer reads.
 */
export async function mapTopic(db: CatalogDatabase, input: MapInput, by: By): Promise<MapResult> {
  const slug = slugOf(input.slug, "the topic");
  const paths = checkManimkcPaths(input.manimkc);
  const done = await writeThrough(db, ["topics"], async (tx) => {
    const row = await liveRow(tx, slug);
    const current = await tx
      .select({ path: manimkcTopic.path, topicSlug: manimkcTopic.topicSlug, ownerId: manimkcTopic.ownerId })
      .from(manimkcTopic)
      .where(inArray(manimkcTopic.path, [...paths]));
    const mine = await tx
      .select({ path: manimkcTopic.path })
      .from(manimkcTopic)
      .where(eq(manimkcTopic.topicSlug, slug))
      .orderBy(asc(manimkcTopic.position), asc(manimkcTopic.path));
    let list: { path: string }[];
    if (input.remove === true) {
      const missing = paths.filter((p) => !mine.some((m) => m.path === p));
      if (missing.length > 0) {
        throw new TopicError("missing", `"${slug}" does not map ${missing.join(", ")}, so there is nothing to remove`);
      }
      list = mine.filter((m) => !paths.includes(m.path));
    } else {
      const already = paths.filter((p) => mine.some((m) => m.path === p));
      if (already.length > 0) throw new TopicError("exists", `"${slug}" already maps ${already.join(", ")}`);
      const elsewhere = current.filter((c) => c.topicSlug !== slug);
      if (elsewhere.length > 0) {
        throw new TopicError(
          "exists",
          elsewhere
            .map(
              (c) =>
                `${c.path} is already mapped to "${c.topicSlug}"; a folder belongs to one topic, so remove it ` +
                `there first (\`catalog topic map ${c.topicSlug} --manimkc ${c.path} --remove --reason ...\`)`,
            )
            .join("\n"),
        );
      }
      list = [...mine, ...paths.map((p) => ({ path: p }))];
    }
    const result = await writeContent(tx, {
      owner: CLI_OWNER,
      type: "topic",
      id: slug,
      next: {
        row,
        // No owner_id: a mapping belongs to its topic (D24), and the seam stamps it.
        links: { manimkc_topic: list.map((m, i) => ({ path: m.path, position: i + 1 })) },
      },
      base: await latestId(tx, "topic", slug),
      ...by,
    });
    return { result, list: list.map((m) => m.path) };
  });
  return {
    slug,
    changed: done.value.result.changed,
    revisions: written([done.value.result]),
    exported: done.exported,
    nearMatches: [],
    manimkc: done.value.list,
  };
}

/* ------------------------------------------------------------------ *
 * archive and restore
 * ------------------------------------------------------------------ */

/** What still points at a topic, each with a few ids, for the refusal to archive it. */
async function usesOf(db: CatalogDatabase, slug: string): Promise<string[]> {
  const probes: [string, ReturnType<typeof sql>][] = [
    ["live concepts filed under it", sql`select slug as id from concept where topic_slug = ${slug} and archived_at is null order by slug`],
    [
      "live modules mapped to it",
      sql`select m.collection_id as id from collection_item m join collection c on c.id = m.collection_id
          where m.topic_slug = ${slug} and c.kind = 'module' and c.archived_at is null order by 1`,
    ],
    ["manimkc paths mapped to it", sql`select path as id from manimkc_topic where topic_slug = ${slug} order by path`],
    [
      "relations to or from it",
      sql`select from_slug || ' ' || kind || ' ' || to_slug as id from topic_relation
          where from_slug = ${slug} or to_slug = ${slug} order by 1`,
    ],
    [
      "live curriculum items linked to it",
      sql`select l.curriculum_item_id as id from curriculum_item_topic l
          join curriculum_item i on i.id = l.curriculum_item_id
          where l.topic_slug = ${slug} and i.archived_at is null order by 1`,
    ],
    ["assets filed under it", sql`select asset_id as id from asset_topic where topic_slug = ${slug} order by asset_id`],
    ["diagrams filed under it", sql`select slug as id from diagram where topic_slug = ${slug} and archived_at is null order by slug`],
    [
      "open studio jobs for it",
      sql`select id from job where topic_slug = ${slug} and state in (${sql.join(JOB_ACTIVE_STATES.map((s) => sql`${s}`), sql`, `)}) order by id`,
    ],
  ];
  const out: string[] = [];
  for (const [label, query] of probes) {
    const ids = (await db.execute<{ id: string }>(query)).rows.map((r) => r.id);
    if (ids.length > 0) out.push(`${ids.length} ${label}: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ", ..." : ""}`);
  }
  return out;
}

/**
 * `catalog topic archive`: hide a topic nothing uses any more. Refused while
 * anything points at it, since a hidden topic with a concept under it is a
 * concept filed under nothing a reader can see; and refused while topics are
 * still read from `content/topics.yaml`, where an archived topic has no way to
 * be written: the export leaves it out, and the next import would delete it.
 */
export async function archiveTopic(db: CatalogDatabase, slugInput: string, by: By): Promise<TopicWriteResult> {
  const slug = slugOf(slugInput, "the topic");
  if (!(await owned(db))) {
    throw new TopicError(
      "not-owned",
      `topics are still read from content/topics.yaml, which has no way to say archived: the export would ` +
        `leave "${slug}" out and the next import would delete it. Flip topics first (\`catalog flip topics\`), ` +
        `or remove the entry from the file and run \`catalog import\`.`,
    );
  }
  const done = await writeThrough(db, ["topics"], async (tx) => {
    const row = await liveRow(tx, slug);
    const uses = await usesOf(tx, slug);
    if (uses.length > 0) {
      throw new TopicError(
        "in-use",
        `"${slug}" is still in use, so archiving it would hide what is filed under it. Move or remove these first:\n  - ${uses.join("\n  - ")}`,
      );
    }
    return writeContent(tx, {
      owner: CLI_OWNER,
      type: "topic",
      id: slug,
      next: { row: { ...row, archivedAt: new Date() } },
      base: await latestId(tx, "topic", slug),
      ...by,
    });
  });
  return { slug, changed: done.value.changed, revisions: written([done.value]), exported: done.exported, nearMatches: [] };
}

/** `catalog topic restore`: an archived topic back into the vocabulary, where it was. */
export async function restoreTopic(db: CatalogDatabase, slugInput: string, by: By): Promise<TopicWriteResult> {
  const slug = slugOf(slugInput, "the topic");
  const done = await writeThrough(db, ["topics"], async (tx) => {
    const row = await rowOf(tx, slug);
    if (row === undefined) throw new TopicError("missing", `no topic "${slug}" in the catalog`);
    if (row.archivedAt === null) throw new TopicError("invalid", `topic "${slug}" is not archived`);
    await assertTitleFree(tx, row.title, slug);
    return writeContent(tx, {
      owner: CLI_OWNER,
      type: "topic",
      id: slug,
      next: { row: { ...row, archivedAt: null } },
      base: await latestId(tx, "topic", slug),
      ...by,
    });
  });
  return { slug, changed: done.value.changed, revisions: written([done.value]), exported: done.exported, nearMatches: [] };
}

/* ------------------------------------------------------------------ *
 * rename (edge case 2)
 * ------------------------------------------------------------------ */

export interface RenameInput {
  from: string;
  to: string;
  /**
   * Go ahead although `.tldr` files still stamp the old slug, while diagrams
   * are read from files: the files are listed, and the next import refuses
   * them until each is restamped.
   */
  restampDiagramsLater?: boolean;
}

export interface RenameResult {
  from: string;
  to: string;
  revisions: WrittenRevision[];
  exported: ExportedType[];
  /** Open studio jobs whose brief named the old slug and now names the new one. */
  jobs: string[];
  /** Diagram files that still stamp the old slug, to restamp by hand (diagrams on files only). */
  restamp: string[];
  /**
   * The SVG of every diagram filed under the topic. `export --svg` stamps the
   * topic into the SVG, and a rename rewrites only the document's stamp, so
   * each of these still names the old slug until it is exported again.
   */
  staleSvgs: string[];
}

/** Thrown inside a rename's transaction when the export types it locked turn out not to cover what it writes. */
class RenameNeedsCourses extends Error {}

/** The entity types a rename can touch, which it locks like an import does. */
const RENAME_LOCKS: readonly RevisionEntityType[] = ["asset", "collection", "concept", "curriculum_item", "diagram", "topic"];

/** Every entity whose snapshot names `slug`, by type. Topics are keyed by their slug before the rename. */
async function namedBy(db: CatalogDatabase, slug: string): Promise<Map<RevisionEntityType, string[]>> {
  const ids = async (query: ReturnType<typeof sql>) =>
    [...new Set((await db.execute<{ id: string }>(query)).rows.map((r) => r.id))].sort();
  return new Map<RevisionEntityType, string[]>([
    [
      "topic",
      await ids(sql`
        select ${slug}::text as id
        union select from_slug from topic_relation where to_slug = ${slug}
        union select to_slug from topic_relation where from_slug = ${slug} and kind = 'related'`),
    ],
    ["concept", await ids(sql`select slug as id from concept where topic_slug = ${slug}`)],
    ["collection", await ids(sql`select collection_id as id from collection_item where topic_slug = ${slug}`)],
    ["curriculum_item", await ids(sql`select curriculum_item_id as id from curriculum_item_topic where topic_slug = ${slug}`)],
    ["asset", await ids(sql`select asset_id as id from asset_topic where topic_slug = ${slug}`)],
    ["diagram", await ids(sql`select slug as id from diagram where topic_slug = ${slug}`)],
  ]);
}

/**
 * The `.tldr` document with every `document` record's `meta.tldrawkc.topic`
 * that says `from` saying `to`. Returns null when nothing changed.
 */
export function restampDocument(document: unknown, from: string, to: string): unknown {
  if (typeof document !== "object" || document === null) return null;
  const records = (document as { records?: unknown }).records;
  if (!Array.isArray(records)) return null;
  let changed = false;
  const next = records.map((record: unknown) => {
    if (typeof record !== "object" || record === null) return record;
    const row = record as { typeName?: unknown; meta?: unknown };
    if (row.typeName !== "document" || typeof row.meta !== "object" || row.meta === null) return record;
    const meta = row.meta as Record<string, unknown>;
    const stamp = meta["tldrawkc"];
    if (typeof stamp !== "object" || stamp === null || (stamp as { topic?: unknown }).topic !== from) return record;
    changed = true;
    return { ...row, meta: { ...meta, tldrawkc: { ...(stamp as object), topic: to } } };
  });
  return changed ? { ...(document as object), records: next } : null;
}

/**
 * `catalog topic rename --from --to` (edge case 2), in one transaction: the
 * slug changes and every foreign key follows by `ON UPDATE CASCADE`; the
 * `related` edges are taken out and put back the right way round, since the
 * order check would refuse the cascade; each diagram's stamp and each open
 * job's brief are rewritten; the old slug joins the aliases so search still
 * finds it; and every entity whose snapshot changed gets one `rename`
 * revision. The topic's own revision is under its new slug, with
 * `previous_id` pointing at the last revision under the old one, so the line
 * of history is unbroken. Older revisions keep the old slug, which is what
 * happened.
 */
export async function renameTopic(db: CatalogDatabase, input: RenameInput, by: By): Promise<RenameResult> {
  const from = slugOf(input.from, "--from");
  const to = slugOf(input.to, "--to");
  if (from === to) throw new TopicError("invalid", "--from and --to are the same slug");

  // The course files name each module's topic, so they are rewritten too
  // when a module is mapped here. The write-through takes its export locks
  // before anything else, so the answer is guessed first and checked again
  // under the rename's own locks, which hold every writer of `collection_item`
  // off; a guess that turns out short is run again with courses included.
  const { rows: modules } = await db.execute(sql`select 1 from collection_item where topic_slug = ${from} limit 1`);
  let withCourses = modules.length > 0;
  for (;;) {
    try {
      const types = withCourses ? (["topics", "courses"] as const) : (["topics"] as const);
      return await renameUnder(db, types, from, to, input, by);
    } catch (error) {
      if (!(error instanceof RenameNeedsCourses) || withCourses) throw error;
      withCourses = true;
    }
  }
}

async function renameUnder(
  db: CatalogDatabase,
  types: readonly ExportType[],
  from: string,
  to: string,
  input: RenameInput,
  by: By,
): Promise<RenameResult> {
  const done = await writeThrough(db, types, async (tx) => {
    await lockTypes(tx, RENAME_LOCKS);
    if (!types.includes("courses")) {
      const { rows: mapped } = await tx.execute(sql`select 1 from collection_item where topic_slug = ${from} limit 1`);
      if (mapped.length > 0) throw new RenameNeedsCourses();
    }
    const row = await liveRow(tx, from);
    assertOwnTopic(row, "rename");
    const clash = await rowOf(tx, to);
    if (clash !== undefined) {
      throw new TopicError("exists", `topic "${to}" already exists${clash.archivedAt === null ? "" : " (archived)"}; a slug names one topic`);
    }

    // While diagrams are files, a `.tldr` stamps its topic in the file, which
    // only tldrawkc rewrites; the rows would move and the file would not.
    const [diagramsOwned] = await tx.select({ source: contentSource.source }).from(contentSource).where(eq(contentSource.type, "diagrams"));
    const restamp =
      diagramsOwned?.source === "db"
        ? []
        : (
            await tx.execute<{ path: string }>(sql`
              select a.path from asset a join asset_topic t on t.asset_id = a.id
              where a.kind = 'diagram_source' and t.topic_slug = ${from} and a.path is not null order by a.path`)
          ).rows.map((r) => r.path);
    if (restamp.length > 0 && input.restampDiagramsLater !== true) {
      throw new TopicError(
        "diagrams-on-files",
        `${restamp.length} diagram file(s) stamp "${from}" in their tldrawkc metadata, and diagrams are read from ` +
          `files, where only tldrawkc rewrites a stamp: ${restamp.join(", ")}. Pass --restamp-diagrams-later to ` +
          `rename anyway, then run \`npm run --silent canvas -- meta set <file> --topic ${to}\` and re-export each ` +
          `SVG before the next \`catalog import\`, which refuses them until then.`,
      );
    }

    // A studio job drawing under the old slug, or holding a candidate drawn
    // under it, would come back stamped with a slug that no longer exists,
    // and Accept refuses that. Its brief can be rewritten, but not what the
    // agent already read or the candidate it wrote, so the rename waits for
    // those to be accepted or discarded. Locked, so a queued job cannot be
    // claimed between this check and the brief rewrite below.
    const { rows: open } = await tx.execute<{ id: string; state: string }>(sql`
      select id, state from job
      where state in (${sql.join(JOB_ACTIVE_STATES.map((s) => sql`${s}`), sql`, `)})
        and (topic_slug = ${from} or brief ->> 'topic' = ${from})
      order by id for update`);
    const busy = open.filter((job) => job.state !== "queued");
    if (busy.length > 0) {
      throw new TopicError(
        "jobs-open",
        `${busy.length} studio job(s) are drawing or awaiting review under "${from}": ` +
          `${busy.map((job) => `${job.id} (${job.state})`).join(", ")}. A candidate drawn under the old slug ` +
          `could not be accepted after the rename. Accept or discard each (\`catalog job accept|discard <id>\`), ` +
          `then rename.`,
      );
    }

    // Every SVG under the topic, before the cascade moves `topic_slug`.
    const staleSvgs =
      diagramsOwned?.source === "db"
        ? (
            await tx.execute<{ slug: string }>(
              sql`select slug from diagram where topic_slug = ${from} and svg_blob_key is not null order by slug`,
            )
          ).rows.map((r) => diagramPaths(r.slug).svg)
        : (
            await tx.execute<{ path: string }>(sql`
              select a.path from asset a join asset_topic t on t.asset_id = a.id
              where a.kind = 'diagram_svg' and t.topic_slug = ${from} and a.path is not null order by a.path`)
          ).rows.map((r) => r.path);

    const affected = await namedBy(tx, from);
    const renamed = (type: RevisionEntityType, id: string) => (type === "topic" && id === from ? to : id);
    const before = new Map<RevisionEntityType, Map<string, LatestRevision>>();
    for (const [type, ids] of affected) before.set(type, await latestRevisions(tx, type, ids));
    const underNewSlug = (await latestRevisions(tx, "topic", [to])).get(to);

    await markSeam(tx, `rename:${from}:${to}`);

    // 1. The related edges touching the topic, out before the cascade: which
    //    end is smaller can change, and the order check would refuse it.
    const related = await tx
      .select()
      .from(topicRelation)
      .where(and(eq(topicRelation.kind, "related"), sql`(${topicRelation.fromSlug} = ${from} or ${topicRelation.toSlug} = ${from})`));
    await tx
      .delete(topicRelation)
      .where(and(eq(topicRelation.kind, "related"), sql`(${topicRelation.fromSlug} = ${from} or ${topicRelation.toSlug} = ${from})`));

    // 2. The slug, and every foreign key after it. The old slug becomes an alias.
    const aliases = Array.isArray(row.aliases) ? (row.aliases as string[]) : [];
    await tx
      .update(topic)
      .set({ slug: to, aliases: aliases.includes(from) ? aliases : [...aliases, from], updatedAt: sql`now()` })
      .where(eq(topic.slug, from));

    // 3. The related edges back, under whichever end is now smaller. An edge
    //    whose owner did not change keeps its place; one that moved goes to
    //    the end of its new owner's list.
    for (const edge of related) {
      const a = edge.fromSlug === from ? to : edge.fromSlug;
      const b = edge.toSlug === from ? to : edge.toSlug;
      const [owner, other] = a < b ? [a, b] : [b, a];
      const sameOwner = owner === (edge.fromSlug === from ? to : edge.fromSlug);
      const { rows: last } = await tx.execute<{ at: number | null }>(
        sql`select max(position) as at from topic_relation where from_slug = ${owner}`,
      );
      // The edge belongs to the topic it is now stored under (D24), whoever
      // that topic's owner is.
      const { rows: holder } = await tx.execute<{ owner_id: string }>(
        sql`select owner_id from topic where slug = ${owner}`,
      );
      await tx.insert(topicRelation).values({
        fromSlug: owner,
        toSlug: other,
        kind: "related",
        position: sameOwner ? edge.position : Number(last[0]?.at ?? 0) + 1,
        ownerId: holder[0]?.owner_id ?? edge.ownerId,
      });
    }

    // 4. Each diagram's stamp. `topic_slug` followed by cascade already.
    const diagrams = await tx.execute<{ slug: string; document: unknown }>(
      sql`select slug, document from diagram where topic_slug = ${to}`,
    );
    for (const diagram of diagrams.rows) {
      const document = restampDocument(diagram.document, from, to);
      if (document === null) continue;
      const bytes = canonicalJson(document);
      await tx.execute(sql`
        update diagram set document = ${JSON.stringify(document)}::jsonb,
          document_hash = ${sha256(bytes)}, updated_at = now()
        where slug = ${diagram.slug}`);
      // The `.tldr` asset's hash is the document's by definition (Track D,
      // `content/diagram-document.ts`), so it moves with the stamp.
      await tx.execute(sql`
        update asset set content_hash = ${sha256(bytes)}, bytes = ${Buffer.byteLength(bytes, "utf8")}, updated_at = now()
        where id = ${`${ASSET_PREFIX.diagrams}${diagramPaths(diagram.slug).tldr}`}`);
    }

    // 5. Open jobs' briefs. `job.topic_slug` followed by cascade; the brief is
    //    jsonb, and a finished job's brief is history, so only open ones move.
    const jobs = await tx.execute<{ id: string }>(sql`
      update job set brief = jsonb_set(brief, '{topic}', to_jsonb(${to}::text)), updated_at = now()
      where state in (${sql.join(JOB_ACTIVE_STATES.map((s) => sql`${s}`), sql`, `)}) and brief ->> 'topic' = ${from}
      returning id`);

    // 6. One rename revision per entity whose snapshot changed.
    const pending: PendingRevision[] = [];
    for (const [type, ids] of affected) {
      const after = await readSnapshots(tx, type, ids.map((id) => renamed(type, id)));
      for (const id of ids) {
        const read: SnapshotRead | undefined = after.get(renamed(type, id));
        if (read === undefined) continue;
        const latest = before.get(type)?.get(id);
        if (latest !== undefined && !latest.deleted && latest.hash === read.hash) continue;
        pending.push({
          id: 0,
          type,
          entityId: renamed(type, id),
          read,
          latest,
          op: "rename",
          ...by,
          reason: by.reason.trim(),
        });
      }
    }
    const reserved = await reserveRevisionIds(tx, pending.length);
    const rows = pending.map((p, i) => {
      const revision = revisionRow({ ...p, id: reserved[i] as number });
      if (p.type === "topic" && p.entityId === to) {
        // Under its new slug: the next seq there, and the line back to the old one.
        revision.seq = (underNewSlug?.seq ?? 0) + 1;
        revision.previousId = p.latest?.id ?? null;
      }
      return revision;
    });
    for (let i = 0; i < rows.length; i += 200) await tx.insert(contentRevision).values(rows.slice(i, i + 200));
    return {
      revisions: rows.map((r) => ({
        type: r.entityType as RevisionEntityType,
        id: r.entityId,
        revisionId: r.id as number,
        op: "rename",
        changed: true,
      })),
      jobs: jobs.rows.map((r) => r.id),
      restamp,
      staleSvgs,
    };
  });
  return { from, to, ...done.value, exported: done.exported };
}

/* ------------------------------------------------------------------ *
 * A concept's topic (learn concept add --topic)
 * ------------------------------------------------------------------ */

/**
 * Can `concept` be filed under `topic`, and is it already? Everything that
 * could refuse the write, asked before the caller writes anything of its own:
 * `learn concept add --topic` writes a note file first, and a note left on
 * disk because the topic was misspelled is a note in no topic, the state the
 * flag exists to prevent.
 *
 * `root`, when given, is the knowledge base the caller writes notes into; the
 * vocabulary file this rewrites is under the root topics were last imported
 * from, and the two must be the same tree.
 */
export async function checkConceptTopic(
  db: CatalogDatabase,
  input: { concept: string; topic: string; root?: string },
): Promise<{ already: boolean }> {
  await readableRow(db, input.topic);
  const [row] = await db.select({ topicSlug: concept.topicSlug }).from(concept).where(eq(concept.slug, input.concept));
  if (row?.topicSlug !== undefined && row.topicSlug !== null && row.topicSlug !== input.topic) {
    throw new TopicError(
      "exists",
      `concept "${input.concept}" is already mapped to topic "${row.topicSlug}". Each concept belongs to exactly ` +
        `one topic; move it with \`learn concept add --topic ${input.topic} --force\` only once it has left "${row.topicSlug}".`,
    );
  }
  if (input.root !== undefined) {
    const imported = await importRoot(db, "topics");
    if (imported !== null && (await realpath(imported)) !== (await realpath(input.root))) {
      throw new TopicError(
        "invalid",
        `topics were last imported from ${imported}, not from this knowledge base (${input.root}), so the ` +
          `vocabulary file this would rewrite is not this tree's. Import this tree first (\`catalog import\`).`,
      );
    }
  }
  await assertInStep(db, ["topics"]);
  return { already: row?.topicSlug === input.topic };
}

async function realpath(target: string): Promise<string> {
  try {
    return await fsRealpath(target);
  } catch {
    return target;
  }
}

export interface FileConceptInput {
  concept: string;
  topic: string;
  /**
   * The concept row's own columns, as the note gives them, for a concept the
   * catalog has no row for yet. A row that exists keeps its columns and gains
   * the topic.
   */
  row: {
    title: string;
    summary: string | null;
    path: string;
    /**
     * The note's `requires:` and `assumes:`, in order. Written with a new row,
     * so the concepts index that follows finds the concept as the note says
     * and adds no second revision; a target with no row yet is left to that
     * index, which reads every note and can resolve it.
     */
    prerequisites?: readonly { slug: string; kind: "requires" | "assumes" }[];
    /**
     * The rest of the note as its row holds it since Track C (the folder, the
     * body, `tags`, `sources`, `created`), for a new row, so the concepts
     * index that follows finds nothing to change here either.
     */
    note?: { domain: string | null; body: string; tags: string[]; sources: string[]; authoredAt: Date | null };
  };
}

/**
 * `concept_prerequisite` rows as the concepts indexer writes them: one per
 * target and kind, never the concept itself, positions counted per list.
 * Only targets that already have a row, since the link is a foreign key.
 */
async function prerequisiteLinks(
  db: CatalogDatabase,
  slug: string,
  wanted: readonly { slug: string; kind: "requires" | "assumes" }[],
): Promise<Record<string, unknown>[]> {
  const targets = [...new Set(wanted.map((w) => w.slug))];
  if (targets.length === 0) return [];
  // Only concepts the CLI's owner may read (phase 4): a prerequisite naming
  // another owner's concept is dropped like one the catalog lacks.
  const known = new Set(
    (
      await db
        .select({ slug: concept.slug })
        .from(concept)
        .where(and(inArray(concept.slug, targets), inArray(concept.ownerId, [...cliScope().readable])))
    ).map((r) => r.slug),
  );
  const seen = new Set<string>();
  const next = new Map<string, number>();
  const out: Record<string, unknown>[] = [];
  for (const { slug: target, kind } of wanted) {
    const key = `${target} ${kind}`;
    if (target === slug || seen.has(key) || !known.has(target)) continue;
    seen.add(key);
    const position = (next.get(kind) ?? 0) + 1;
    next.set(kind, position);
    out.push({ prerequisiteSlug: target, kind, position });
  }
  return out;
}

export interface FileConceptResult {
  /** False when the concept was already under this topic. */
  changed: boolean;
  revision: WrittenRevision | null;
  exported: ExportedType[];
}

/**
 * File one concept under one topic: `concept.topic_slug` through the seam,
 * and `content/topics.yaml` rewritten from the rows (D17), whose
 * `maps.concepts` is that column read back. It replaces the text splice
 * `learn concept add --topic` did on the file; the invariant the splice
 * checked after writing (one concept, one topic) is the column itself.
 *
 * The concept goes to the end of the topic's `maps.concepts`, one
 * `POSITION_STEP` past the last live concept there (D22), and a concept
 * already under the topic is left where it is.
 */
export async function fileConceptUnderTopic(
  db: CatalogDatabase,
  input: FileConceptInput,
  by: By,
): Promise<FileConceptResult> {
  const slug = slugOf(input.concept, "the concept");
  const done = await writeThrough(db, ["topics"], async (tx) => {
    const { already } = await checkConceptTopic(tx, { concept: slug, topic: input.topic });
    if (already) return null;
    const [last] = await tx
      .select({ at: max(concept.topicPosition) })
      .from(concept)
      .where(and(eq(concept.topicSlug, input.topic), isNull(concept.archivedAt)));
    const topicPosition = (last?.at ?? 0) + POSITION_STEP;
    const [existing] = await tx.select().from(concept).where(eq(concept.slug, slug));
    const row =
      existing === undefined
        ? {
            slug,
            title: input.row.title,
            summary: input.row.summary,
            path: input.row.path,
            topicSlug: input.topic,
            topicPosition,
            ...(input.row.note ?? {}),
          }
        : { ...existing, topicSlug: input.topic, topicPosition };
    return writeContent(tx, {
      owner: CLI_OWNER,
      type: "concept",
      id: slug,
      next:
        existing === undefined
          ? { row, links: { concept_prerequisite: await prerequisiteLinks(tx, slug, input.row.prerequisites ?? []) } }
          : { row },
      base: await latestId(tx, "concept", slug),
      ...by,
    });
  });
  const result = done.value;
  return {
    changed: result?.changed ?? false,
    revision: result === null ? null : written([result])[0] ?? null,
    exported: done.exported,
  };
}

/**
 * `catalog doctor --fix`: every topic whose relations or manimkc mappings
 * carry an `owner_id` other than the topic's own (the mixed state D24 rules
 * out) is written again through the seam as its owner, with the links it
 * already has, so the seam restamps them. One revision per topic, and the
 * vocabulary file rewritten from the rows while topics are still on files.
 * Nothing is added or removed; a relation to a topic its owner cannot read is
 * carried over as it is (`doctor` reports it).
 */
export async function restampLinkOwners(db: CatalogDatabase, slugs: readonly string[], by: By): Promise<WrittenRevision[]> {
  const revisions: WrittenRevision[] = [];
  for (const slug of [...new Set(slugs)].sort()) {
    const done = await writeThrough(db, ["topics"], async (tx) => {
      const row = await rowOf(tx, slug);
      if (row === undefined) return null;
      const relations = await relationsOf(tx, slug);
      const maps = await tx
        .select({ path: manimkcTopic.path })
        .from(manimkcTopic)
        .where(eq(manimkcTopic.topicSlug, slug))
        .orderBy(asc(manimkcTopic.position), asc(manimkcTopic.path));
      return writeContent(tx, {
        owner: row.ownerId,
        type: "topic",
        id: slug,
        next: {
          row,
          links: {
            topic_relation: relationLinks(relations),
            manimkc_topic: maps.map((m, i) => ({ path: m.path, position: i + 1 })),
          },
        },
        base: await latestId(tx, "topic", slug),
        ...by,
      });
    });
    if (done.value !== null) revisions.push(...written([done.value]));
  }
  return revisions;
}
