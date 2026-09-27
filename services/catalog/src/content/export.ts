import { readFile } from "node:fs/promises";
import path from "node:path";

import { COURSES_DIR, TAGS_FILE, TOPICS_FILE } from "@self-learn/content";
import { sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { ASSET_PREFIX } from "../index/source";
import { type ExportFile, type ExportType, sha256 } from "./layout";
import { readNoteRows } from "./note-rows";
import { renderNote } from "./notes";
import { logPath, readLogs } from "./session-logs";
import { blockScalar, flowList, flowMapping, pad } from "./yaml-out";

/**
 * The database rendered back into the files it was imported from
 * (docs/CONTENT-MIGRATION.md 0.5): the other half of the round trip that makes
 * the migration reversible until the cut-over.
 *
 * `renderType` builds one type's files in memory from rows. `catalog export`
 * writes them to a directory; `catalog parity` compares them with a directory
 * without writing anything, so the two can never disagree about what the
 * database holds.
 *
 * **Where a row does not hold the data yet, the file it points at is copied.**
 * Concept notes and session logs are rendered from their rows (Track C); a
 * diagram's document arrives with Track D. Until then the rows hold a path and the
 * sha256 of the bytes that were imported, so the export copies the file from
 * the root the import read (`index_run.metadata.root`) and refuses when its
 * bytes no longer hash to what the row recorded. A copy the database cannot
 * vouch for would make parity compare a file with itself.
 */

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

/**
 * The comments at the top of `content/topics.yaml`. Comments are not data, so
 * no row holds them; they are the export format's own, written here once.
 */
export const TOPICS_HEADER = [
  "# Shared topic vocabulary for the self-learn catalog.",
  "# One entry per topic. slug is permanent; everything else can change.",
  "# maps.manimkc entries are manimkc/topics/<path> with the topics/ prefix dropped.",
  "# maps.courses entries are course *module* ids (e.g. cp4284-m3), not topic-level -tN ids.",
  "# maps.concepts entries are learn/concepts/<domain>/<file>.md ids (the frontmatter `id`).",
];

/** The comments at the top of `content/tags.yaml`. */
export const TAGS_HEADER = [
  "# Cross-course themes. `id` is what a course file's `tags:` names, so it is a",
  "# permanent key: renaming one silently unlinks every course that used it, and",
  "# related-course links are computed from shared tags.",
  "# Order is the order the home page renders the theme chips in.",
];

/** The divider the vocabulary puts above each domain's first topic. */
export const domainDivider = (domain: string) => `  # ---------------- ${domain} ----------------`;

type Row = Record<string, unknown>;

async function rows<T extends Row>(db: CatalogDatabase, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute<T>(query)).rows as T[];
}

/** Group rows by one key, keeping their order. */
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list === undefined) out.set(k, [item]);
    else list.push(item);
  }
  return out;
}

const text = (lines: readonly string[]) => Buffer.from(`${lines.join("\n")}\n`, "utf8");

export async function renderType(db: CatalogDatabase, type: ExportType): Promise<ExportFile[]> {
  switch (type) {
    case "topics":
      return [await renderTopics(db)];
    case "tags":
      return [await renderTags(db)];
    case "courses":
      return renderCourses(db);
    case "concepts":
      return renderConcepts(db);
    case "sessions":
      return renderSessions(db);
    case "diagrams":
      return copyImported(db, type);
  }
}

/**
 * `content/topics.yaml`: every live topic in position order, a divider
 * wherever the domain changes, and each topic's lists read from the rows that
 * hold them now: `relations:` from `topic_relation`, `maps.manimkc` from
 * `manimkc_topic`, `maps.concepts` from `concept.topic_slug`, `maps.courses`
 * from each live module's topic row.
 */
async function renderTopics(db: CatalogDatabase): Promise<ExportFile> {
  const topics = await rows<{ slug: string; title: string; domain: string; summary: string | null; aliases: unknown }>(
    db,
    sql`select slug, title, domain, summary, aliases from topic
        where archived_at is null order by position, slug`,
  );
  if (topics.length === 0) {
    throw new ExportError(`${TOPICS_FILE}: the database holds no topics. Import them first.`);
  }
  const relations = groupBy(
    await rows<{ from_slug: string; to_slug: string; kind: string }>(
      db,
      sql`select from_slug, to_slug, kind from topic_relation order by from_slug, position, kind, to_slug`,
    ),
    (r) => r.from_slug,
  );
  const manimkc = groupBy(
    await rows<{ topic_slug: string; path: string }>(
      db,
      sql`select topic_slug, path from manimkc_topic order by topic_slug, position, path`,
    ),
    (r) => r.topic_slug,
  );
  const concepts = groupBy(
    await rows<{ topic_slug: string; slug: string }>(
      db,
      sql`select topic_slug, slug from concept
          where topic_slug is not null and archived_at is null
          order by topic_slug, topic_position, slug`,
    ),
    (r) => r.topic_slug,
  );
  const modules = groupBy(
    await rows<{ topic_slug: string; collection_id: string }>(
      db,
      sql`select m.topic_slug, m.collection_id from collection_item m
          join collection c on c.id = m.collection_id
          where m.topic_slug is not null and c.kind = 'module' and c.archived_at is null
          order by m.topic_slug, m.topic_position, m.collection_id`,
    ),
    (r) => r.topic_slug,
  );

  const lines = [...TOPICS_HEADER, "", "topics:"];
  let domain: string | null = null;
  for (const [index, topic] of topics.entries()) {
    if (topic.domain !== domain) {
      if (index > 0) lines.push("");
      lines.push(domainDivider(topic.domain));
      domain = topic.domain;
    } else {
      lines.push("");
    }
    lines.push(`${pad(2)}- slug: ${blockScalar(topic.slug)}`);
    lines.push(`${pad(4)}title: ${blockScalar(topic.title)}`);
    lines.push(`${pad(4)}domain: ${blockScalar(topic.domain)}`);
    if (topic.summary !== null) lines.push(`${pad(4)}summary: ${blockScalar(topic.summary)}`);
    lines.push(`${pad(4)}aliases: ${flowList(stringArray(topic.aliases))}`);
    const own = relations.get(topic.slug) ?? [];
    if (own.length > 0) {
      lines.push(`${pad(4)}relations:`);
      for (const relation of own) {
        lines.push(`${pad(6)}- ${flowMapping([["kind", relation.kind], ["to", relation.to_slug]])}`);
      }
    }
    lines.push(`${pad(4)}maps:`);
    lines.push(`${pad(6)}manimkc: ${flowList((manimkc.get(topic.slug) ?? []).map((r) => r.path))}`);
    lines.push(`${pad(6)}courses: ${flowList((modules.get(topic.slug) ?? []).map((r) => r.collection_id))}`);
    lines.push(`${pad(6)}concepts: ${flowList((concepts.get(topic.slug) ?? []).map((r) => r.slug))}`);
  }
  return { path: TOPICS_FILE, bytes: text(lines) };
}

async function renderTags(db: CatalogDatabase): Promise<ExportFile> {
  const tags = await rows<{ id: string; label: string; description: string | null }>(
    db,
    sql`select id, label, description from tag order by position, id`,
  );
  if (tags.length === 0) {
    throw new ExportError(`${TAGS_FILE}: the database holds no tags. Import them first.`);
  }
  const lines = [...TAGS_HEADER, "", "tags:"];
  for (const [index, tag] of tags.entries()) {
    if (index > 0) lines.push("");
    lines.push(`${pad(2)}- id: ${blockScalar(tag.id)}`);
    lines.push(`${pad(4)}label: ${blockScalar(tag.label)}`);
    if (tag.description !== null) lines.push(`${pad(4)}description: ${blockScalar(tag.description)}`);
  }
  return { path: TAGS_FILE, bytes: text(lines) };
}

interface CourseMetadata {
  code?: unknown;
  credits?: unknown;
  prereq?: unknown;
  track?: unknown;
  notes?: unknown;
  inferred?: unknown;
  capstone?: unknown;
}

/**
 * One `content/courses/<code>.yaml` per live course, in the key order the
 * files are written in. Archived modules and items are left out: the course
 * file no longer lists them, which is why they were archived (D12).
 */
async function renderCourses(db: CatalogDatabase): Promise<ExportFile[]> {
  const courses = await rows<{ id: string; slug: string; title: string; position: number; metadata: CourseMetadata }>(
    db,
    sql`select id, slug, title, position, metadata from collection
        where kind = 'course' and archived_at is null order by position, id`,
  );
  const tags = groupBy(
    await rows<{ collection_id: string; tag_id: string }>(
      db,
      sql`select collection_id, tag_id from collection_tag order by collection_id, position, tag_id`,
    ),
    (r) => r.collection_id,
  );
  const modules = groupBy(
    await rows<{ id: string; parent_id: string; slug: string; title: string; position: number; topic: string | null }>(
      db,
      sql`select c.id, c.parent_id, c.slug, c.title, c.position,
                 (select m.topic_slug from collection_item m
                  where m.collection_id = c.id and m.topic_slug is not null
                  order by m.position limit 1) as topic
          from collection c
          where c.kind = 'module' and c.archived_at is null
          order by c.parent_id, c.position, c.id`,
    ),
    (r) => r.parent_id,
  );
  const items = groupBy(
    await rows<{ id: string; collection_id: string; title: string; subtopics: unknown }>(
      db,
      sql`select id, collection_id, title, subtopics from curriculum_item
          where archived_at is null order by collection_id, position, id`,
    ),
    (r) => r.collection_id,
  );
  const concepts = groupBy(
    await rows<{ curriculum_item_id: string; concept_slug: string }>(
      db,
      sql`select curriculum_item_id, concept_slug from concept_curriculum_item
          order by curriculum_item_id, position, concept_slug`,
    ),
    (r) => r.curriculum_item_id,
  );
  const resources = groupBy(
    await rows<{ collection_id: string; id: string; title: string | null; url: string | null; resource_type: string | null }>(
      db,
      sql`select m.collection_id, a.id, a.title, a.url, a.resource_type
          from collection_item m join asset a on a.id = m.asset_id
          where a.kind = 'link' and starts_with(a.id, ${ASSET_PREFIX.courses})
          order by m.collection_id, m.position, a.id`,
    ),
    (r) => r.collection_id,
  );

  const problems: string[] = [];
  const files: ExportFile[] = [];
  for (const course of courses) {
    const meta = course.metadata;
    const code = typeof meta.code === "string" ? meta.code : null;
    if (code === null) {
      problems.push(`course "${course.id}" has no metadata.code, so it has no file name`);
      continue;
    }
    if (typeof meta.credits !== "number" || typeof meta.inferred !== "boolean") {
      problems.push(`course "${course.id}" has no numeric metadata.credits or boolean metadata.inferred`);
      continue;
    }
    const lines = [
      `id: ${blockScalar(course.id)}`,
      `slug: ${blockScalar(course.slug)}`,
      `code: ${blockScalar(code)}`,
      `title: ${blockScalar(course.title)}`,
      `credits: ${String(meta.credits)}`,
      `order: ${course.position}`,
    ];
    for (const key of ["prereq", "track", "notes"] as const) {
      const value = meta[key];
      if (typeof value === "string") lines.push(`${key}: ${blockScalar(value)}`);
    }
    lines.push(`inferred: ${String(meta.inferred)}`);
    lines.push(`tags: ${flowList((tags.get(course.id) ?? []).map((r) => r.tag_id))}`);
    lines.push("modules:");
    for (const mod of modules.get(course.id) ?? []) {
      lines.push(`${pad(2)}- id: ${blockScalar(mod.id)}`);
      lines.push(`${pad(4)}slug: ${blockScalar(mod.slug)}`);
      lines.push(`${pad(4)}title: ${blockScalar(mod.title)}`);
      lines.push(`${pad(4)}order: ${mod.position}`);
      if (mod.topic === null) problems.push(`module "${mod.id}" has no topic row`);
      else lines.push(`${pad(4)}topic: ${blockScalar(mod.topic)}`);
      lines.push(`${pad(4)}topics:`);
      for (const item of items.get(mod.id) ?? []) {
        lines.push(`${pad(6)}- id: ${blockScalar(item.id)}`);
        lines.push(`${pad(8)}title: ${blockScalar(item.title)}`);
        const itemConcepts = (concepts.get(item.id) ?? []).map((r) => r.concept_slug);
        if (itemConcepts.length > 0) {
          lines.push(`${pad(8)}concepts:`);
          for (const slug of itemConcepts) lines.push(`${pad(10)}- ${blockScalar(slug)}`);
        }
        const subtopics = stringArray(item.subtopics);
        if (subtopics.length === 0) {
          lines.push(`${pad(8)}subtopics: []`);
        } else {
          lines.push(`${pad(8)}subtopics:`);
          for (const subtopic of subtopics) lines.push(`${pad(10)}- ${blockScalar(subtopic)}`);
        }
      }
      const links = resources.get(mod.id) ?? [];
      if (links.length === 0) {
        lines.push(`${pad(4)}resources: []`);
      } else {
        lines.push(`${pad(4)}resources:`);
        for (const link of links) {
          if (link.resource_type === null) {
            problems.push(`link "${link.id}" has no resource_type; re-import the course so the column is filled`);
          }
          lines.push(`${pad(6)}- id: ${blockScalar(link.id.slice(ASSET_PREFIX.courses.length))}`);
          lines.push(`${pad(8)}title: ${blockScalar(link.title ?? "")}`);
          lines.push(`${pad(8)}url: ${blockScalar(link.url ?? "")}`);
          lines.push(`${pad(8)}type: ${blockScalar(link.resource_type ?? "")}`);
        }
      }
    }
    if (typeof meta.capstone === "string") lines.push(`capstone: ${blockScalar(meta.capstone)}`);
    files.push({ path: `${COURSES_DIR}/${code.toLowerCase()}.yaml`, bytes: text(lines) });
  }
  if (problems.length > 0) {
    throw new ExportError(`${COURSES_DIR}: the rows cannot be written back as course files\n  - ${problems.join("\n  - ")}`);
  }
  return files;
}

/**
 * `learn/concepts/<domain>/<slug>.md` for every live concept, rendered from
 * its row (`renderNote`): the columns as frontmatter, `concept.body` after
 * it, `requires:` and `assumes:` from `concept_prerequisite` in their stored
 * order. A row with no body was imported before Track C filled the column,
 * and is refused rather than written as an empty note.
 */
async function renderConcepts(db: CatalogDatabase): Promise<ExportFile[]> {
  const notes = await readNoteRows(db);
  const empty = notes.filter((note) => note.body === null).map((note) => note.path);
  if (empty.length > 0) {
    throw new ExportError(
      `concepts: ${empty.length} note(s) have no body in the database, because they were imported ` +
        `before the body was stored. Re-run \`catalog index\` (or \`catalog import <dir>\`).\n  - ${empty.join("\n  - ")}`,
    );
  }
  return notes.map((note) => ({ path: note.path, bytes: Buffer.from(renderNote({ ...note, body: note.body ?? "" }), "utf8") }));
}

/** `learn/sessions/<id>.md` for every session with a log: its entries, concatenated. */
async function renderSessions(db: CatalogDatabase): Promise<ExportFile[]> {
  return (await readLogs(db)).map((log) => ({ path: logPath(log.id), bytes: Buffer.from(log.markdown, "utf8") }));
}

/** The asset rows whose files a copy-through type exports. The index source of the same name read them. */
const COPIED = {
  diagrams: sql`select path, content_hash from asset
                where kind in ('diagram_source', 'diagram_svg') and starts_with(id, ${ASSET_PREFIX.diagrams})
                order by path`,
} as const;

/**
 * Concepts, sessions and diagrams, copied from the root their import read.
 * Every file whose bytes no longer hash to the row's `content_hash` is listed,
 * and nothing is written: the database can only vouch for what it read.
 */
async function copyImported(db: CatalogDatabase, type: "diagrams"): Promise<ExportFile[]> {
  const assets = await rows<{ path: string | null; content_hash: string | null }>(db, COPIED[type]);
  if (assets.length === 0) return [];
  const [run] = await rows<{ root: string | null; finished_at: Date }>(
    db,
    sql`select metadata ->> 'root' as root, finished_at from index_run where source = ${type}`,
  );
  const root = run?.root ?? null;
  if (root === null) {
    throw new ExportError(
      `${type}: the database has rows but does not record which directory they were imported ` +
        `from (index_run.metadata.root, written since 0.5). Re-run \`catalog index\` or \`catalog import <dir>\`.`,
    );
  }
  const problems: string[] = [];
  const files: ExportFile[] = [];
  for (const asset of assets) {
    if (asset.path === null || asset.content_hash === null) {
      problems.push(`an asset row has no path or no hash`);
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(root, asset.path));
    } catch (error) {
      problems.push(`${asset.path}: cannot be read under ${root} (${(error as NodeJS.ErrnoException).code ?? (error as Error).message})`);
      continue;
    }
    if (sha256(bytes) !== asset.content_hash) {
      problems.push(`${asset.path}: changed under ${root} since it was imported`);
      continue;
    }
    files.push({ path: asset.path, bytes });
  }
  if (problems.length > 0) {
    throw new ExportError(
      `${type}: until its track moves the text into the database, the export copies each file ` +
        `from where it was imported and checks it against the row's hash, and ${problems.length} ` +
        `cannot be vouched for. Re-import, or put the files back.\n  - ${problems.join("\n  - ")}`,
    );
  }
  return files;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
