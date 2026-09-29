import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { ContentError, COURSES_DIR, courseFileName, parseCourse, type Course } from "@self-learn/content";
import {
  asset,
  collection,
  collectionItem,
  concept,
  curriculumItem,
  LOCAL_LEARNER_ID,
  type RevisionEntityType,
  tag,
  topic,
} from "@self-learn/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { ASSET_PREFIX } from "../index/source";
import { CoverImageError, creditOf, keyParts, readCoverImage, storedCredit } from "./cover-image";
import { renderType } from "./export";
import { PositionGapError, placePositions } from "./positions";
import { latestRevisions, lockEntity } from "./revisions";
import { COMPLETENESS_RULES, triggerStates } from "./rules";
import {
  ContentWriteError,
  deleteContent,
  writeContents,
  type WriteContentInput,
  type WriteContentResult,
} from "./write";
import { assertInStep, type ExportedType, writeThrough } from "./write-through";
import { CLI_OWNER } from "./scope";

/**
 * `catalog course import <file.yaml>` and `catalog course export <id>`: one
 * course through the write seam (docs/CONTENT-MIGRATION.md, Track B).
 *
 * **Import** reads one course file with the same parser the web app and the
 * indexer use (`parseCourse` in `@self-learn/content`, every rule that is a
 * fact about the file), then checks what the file points at against rows
 * rather than against other files: the module topics, the tags and the
 * concepts must exist, each item's concepts must be filed under its module's
 * topic, and no id may already belong to another course. Then it writes the
 * difference as one composite write: every module, item and curated link the
 * file lists, each a revision only if its snapshot moved.
 *
 * **Nothing the file stops listing is deleted** (D12). A module or item the
 * course held and the file no longer lists is archived and reported by id;
 * its learner's tick and recap stay, since `progress` and `recap` are RESTRICT
 * on the item, and the Settings export still carries them. A file that lists
 * an archived one again restores it. Only a curated link that no module
 * points at any more is deleted, with a `delete` revision: it carries no
 * learner data, and the courses indexer prunes it the same way.
 *
 * **The rows it writes are the rows the courses indexer writes** for the same
 * file, column for column, so importing an unchanged file appends no revision
 * and a later `catalog import` of the same tree appends none either.
 *
 * **The file is kept in step** (D17, the shared `write-through.ts`): in the
 * same transaction the course file, and `topics.yaml` when a module's topic
 * changed, are rewritten in the tree the type was imported from, and the
 * write is refused while either holds an edit the database has not imported,
 * the file being imported aside.
 *
 * **The cover is not changed by an import.** A cover is an image, and the
 * course file only names it (`cover:`, with its credit); `catalog course
 * cover` is the one writer of it. The import carries the course's cover
 * over, and refuses a file whose `cover:` says anything else: a cover the
 * course does not have, a different credit or image type, no `cover:` for a
 * course that has one, or an image beside the file whose bytes are not the
 * stored ones. So a file written before the cover was set cannot silently
 * take it away, and an edited credit is not silently ignored.
 *
 * **Export** writes one course's file as the database would export it: the
 * file a person edits and imports back.
 */

export class CourseWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseWriteError";
  }
}

/** Serialises course imports, for the checks that read every live course. */
const COURSE_IDENTITY_LOCK = "catalog:course-identity";

/** A person ran the command, unless a caller says otherwise. */
const PERSON = LOCAL_LEARNER_ID;

type Row = Record<string, unknown>;
type CollectionRow = typeof collection.$inferSelect;
type ItemRow = typeof curriculumItem.$inferSelect;

/** Thrown inside the transaction to roll a dry run back with its result. */
class DryRun<T> extends Error {
  constructor(readonly result: T) {
    super("dry run");
  }
}

export interface EntityChange {
  type: RevisionEntityType;
  id: string;
  /** What the revision records, or null when the entity was already as the file says. */
  op: string | null;
  /** The revision appended or the unchanged latest; null on a dry run, which appends nothing. */
  revisionId: number | null;
}

export interface CourseImportResult {
  course: string;
  file: string;
  dryRun: boolean;
  /** Every entity the file names, and what happened to each. */
  changes: EntityChange[];
  /** Modules and items the course held that the file no longer lists, archived by this import. */
  archived: { modules: string[]; items: string[] };
  /** Archived modules and items the file lists again. */
  restored: { modules: string[]; items: string[] };
  /** Curated links no module points at any more, deleted. */
  deletedLinks: string[];
  /** Revisions appended, 0 for an unchanged file. */
  revisions: number;
  /** The course's newest revision after the import, which a stamped file now carries; null on a dry run. */
  base: number | null;
  writeThrough: WriteThroughSummary;
}

export interface WriteThroughSummary {
  /** Files rewritten, repo-relative, with the root they were written under. */
  written: { type: string; path: string; root: string }[];
  /** Files removed because the rows no longer produce them. */
  removed: { type: string; path: string; root: string }[];
  /** Types whose export hash was recorded on `content_source`. */
  recorded: string[];
  /** Files saved on disk during the write, so left alone; the database's version is at `incoming`. */
  conflicts: { type: string; path: string; incoming: string | null; root: string }[];
}

const NOTHING_WRITTEN: WriteThroughSummary = { written: [], removed: [], recorded: [], conflicts: [] };

export function summarise(exported: readonly ExportedType[]): WriteThroughSummary {
  return {
    written: exported.flatMap((e) => e.written.map((file) => ({ type: e.type, path: file, root: e.root }))),
    removed: exported.flatMap((e) => e.removed.map((file) => ({ type: e.type, path: file, root: e.root }))),
    recorded: exported.filter((e) => e.recorded).map((e) => e.type),
    conflicts: exported.flatMap((e) => e.conflicts.map((c) => ({ type: e.type, ...c, root: e.root }))),
  };
}

/** What the database holds now for the course and every id the file names. */
interface Existing {
  course: CollectionRow | undefined;
  /** Every module of the course, archived ones included. */
  modules: CollectionRow[];
  /** Every item under those modules, archived ones included. */
  items: ItemRow[];
  /** Module topic rows and curated link rows of those modules. */
  memberships: (typeof collectionItem.$inferSelect)[];
  /** Entities with at least one revision, by `type id`. */
}

async function readExisting(db: CatalogDatabase, courseId: string): Promise<Existing> {
  const [course] = await db.select().from(collection).where(eq(collection.id, courseId));
  const modules = await db
    .select()
    .from(collection)
    .where(and(eq(collection.parentId, courseId), eq(collection.kind, "module")));
  const moduleIds = modules.map((m) => m.id);
  const items =
    moduleIds.length === 0
      ? []
      : await db.select().from(curriculumItem).where(inArray(curriculumItem.collectionId, moduleIds));
  const memberships =
    moduleIds.length === 0
      ? []
      : await db.select().from(collectionItem).where(inArray(collectionItem.collectionId, moduleIds));
  return { course, modules, items, memberships };
}

/** `type id` for every entity among `keys` that has a revision. */
async function withRevisions(db: CatalogDatabase, keys: readonly (readonly [RevisionEntityType, string])[]) {
  const out = new Set<string>();
  const types = new Set(keys.map(([type]) => type));
  for (const type of types) {
    const ids = keys.filter(([t]) => t === type).map(([, id]) => id);
    const latest = await latestRevisions(db, type, ids);
    for (const id of latest.keys()) out.add(`${type} ${id}`);
  }
  return out;
}

/**
 * Every reference the file makes, checked against rows. Collected, not thrown
 * one at a time, so a file with five problems is fixed in one pass.
 */
async function checkReferences(db: CatalogDatabase, course: Course, file: string): Promise<void> {
  const problems: string[] = [];
  const moduleIds = course.modules.map((m) => m.id);
  const itemIds = course.modules.flatMap((m) => m.topics.map((t) => t.id));
  const linkIds = course.modules.flatMap((m) => m.resources.map((r) => `${ASSET_PREFIX.courses}${r.id}`));

  // The course itself: its id, slug, order and code are unique among live courses.
  const [self] = await db.select().from(collection).where(eq(collection.id, course.id));
  if (self !== undefined && self.kind !== "course") {
    problems.push(`"${course.id}" is a ${self.kind}, not a course: ids are shared by every collection`);
  }
  const courses = await db
    .select()
    .from(collection)
    .where(and(eq(collection.kind, "course"), isNull(collection.archivedAt)));
  for (const other of courses) {
    if (other.id === course.id) continue;
    if (other.slug === course.slug) problems.push(`slug "${course.slug}" is already course "${other.id}"'s`);
    if (other.position === course.order) {
      problems.push(
        `order ${course.order} is already course "${other.id}"'s. Course order is the catalog and ` +
          `sidebar order, so it has to be unambiguous`,
      );
    }
    const code = (other.metadata as { code?: unknown }).code;
    if (typeof code === "string" && code.toLowerCase() === course.code.toLowerCase()) {
      problems.push(
        `code "${course.code}" is already course "${other.id}"'s, and a course is exported to ` +
          `${COURSES_DIR}/${courseFileName(course.code)}`,
      );
    }
  }

  // Ids the file claims that another course already holds. Ids are permanent
  // keys for learner progress, so they are global, not per course.
  const claimed = await db
    .select({ id: collection.id, kind: collection.kind, parentId: collection.parentId })
    .from(collection)
    .where(inArray(collection.id, moduleIds));
  for (const row of claimed) {
    if (row.kind !== "module" || row.parentId !== course.id) {
      problems.push(
        `module id "${row.id}" is already ${row.kind === "module" ? `a module of "${row.parentId}"` : `a ${row.kind}`}`,
      );
    }
  }
  if (itemIds.length > 0) {
    const owners = await db
      .select({ id: curriculumItem.id, course: collection.parentId })
      .from(curriculumItem)
      .innerJoin(collection, eq(collection.id, curriculumItem.collectionId))
      .where(inArray(curriculumItem.id, itemIds));
    for (const row of owners) {
      if (row.course !== course.id) problems.push(`item id "${row.id}" already belongs to course "${row.course}"`);
    }
  }
  if (linkIds.length > 0) {
    const holders = await db
      .select({ id: collectionItem.assetId, course: collection.parentId })
      .from(collectionItem)
      .innerJoin(collection, eq(collection.id, collectionItem.collectionId))
      .where(inArray(collectionItem.assetId, linkIds));
    for (const row of holders) {
      if (row.course !== course.id) {
        problems.push(
          `resource id "${String(row.id).slice(ASSET_PREFIX.courses.length)}" already belongs to course "${row.course}"`,
        );
      }
    }
  }

  // What the file points at: live topics, tags, and live concepts filed under
  // the module's topic (the rule the database arms as a trigger, checked here
  // always so the error names the file and the row).
  const topicSlugs = [...new Set(course.modules.map((m) => m.topic))];
  const liveTopics = new Set(
    (
      await db
        .select({ slug: topic.slug })
        .from(topic)
        .where(and(inArray(topic.slug, topicSlugs), isNull(topic.archivedAt)))
    ).map((row) => row.slug),
  );
  for (const mod of course.modules) {
    if (!liveTopics.has(mod.topic)) problems.push(`module "${mod.id}" names topic "${mod.topic}", which is not a live topic`);
  }
  if (course.tags.length > 0) {
    const known = new Set(
      (await db.select({ id: tag.id }).from(tag).where(inArray(tag.id, course.tags))).map((row) => row.id),
    );
    for (const id of course.tags) if (!known.has(id)) problems.push(`tag "${id}" is not a tag`);
  }
  const slugs = [...new Set(course.modules.flatMap((m) => m.topics.flatMap((t) => t.concepts)))];
  const concepts = new Map(
    slugs.length === 0
      ? []
      : (
          await db
            .select({ slug: concept.slug, topic: concept.topicSlug, archivedAt: concept.archivedAt })
            .from(concept)
            .where(inArray(concept.slug, slugs))
        ).map((row) => [row.slug, row] as const),
  );
  for (const mod of course.modules) {
    for (const item of mod.topics) {
      for (const slug of item.concepts) {
        const found = concepts.get(slug);
        if (found === undefined || found.archivedAt !== null) {
          problems.push(`item "${item.id}" lists concept "${slug}", which is not a live concept note`);
        } else if (found.topic !== mod.topic) {
          problems.push(
            `item "${item.id}" lists concept "${slug}", which is filed under topic ` +
              `"${found.topic ?? "(none)"}", not its module's topic "${mod.topic}"`,
          );
        }
      }
    }
  }

  // A completeness rule already armed would refuse at commit with a bare
  // trigger message; saying it here names every row at once.
  const rule = COMPLETENESS_RULES.find((r) => r.name === "item-has-concept");
  if (rule !== undefined) {
    const states = await triggerStates(db, rule.triggers.map(([, name]) => name));
    if (rule.triggers.every(([, name]) => states.get(name) === true)) {
      for (const mod of course.modules) {
        for (const item of mod.topics) {
          if (item.concepts.length === 0) {
            problems.push(`item "${item.id}" names no concept, and the rule "${rule.name}" is armed`);
          }
        }
      }
    }
  }

  if (problems.length > 0) {
    throw new CourseWriteError(
      `${file}: ${problems.length} problem(s) against the catalog; nothing was written\n  - ${problems.join("\n  - ")}`,
    );
  }
}

/**
 * Refuse a file whose `cover:` is not the cover the course has (see the
 * module comment): the image type and the credit must match what the row
 * holds, and an image beside the file under the name it gives must hold the
 * stored bytes. An absent image is fine: `course export` writes the file
 * alone, and the cover stays where it is.
 */
async function checkCover(row: CollectionRow | undefined, course: Course, file: string): Promise<void> {
  const key = row?.kind === "course" ? row.coverBlobKey : null;
  const named = course.cover;
  const how =
    `A cover is set with \`catalog course cover ${course.id} --file <image> --photographer P --source URL ` +
    `--licence L --reason R\`, and removed with \`catalog course cover ${course.id} --clear --reason R\`.`;
  if (named === undefined && key === null) return;
  if (named === undefined) {
    throw new CourseWriteError(
      `${file} has no cover:, and course "${course.id}" has a cover (${key}). course import does not remove ` +
        `a cover; export the course again (it writes the cover: block) and reapply the edit. ${how} ` +
        `Nothing was written.`,
    );
  }
  if (key === null) {
    throw new CourseWriteError(
      `${file} names cover ${named.file}, and course "${course.id}" has none. course import does not store ` +
        `images. ${how} Nothing was written.`,
    );
  }
  const { sha256: stored, ext } = keyParts(key);
  const credit = storedCredit(row?.metadata);
  const differs: string[] = [];
  if (!named.file.endsWith(`.${ext}`)) differs.push(`the image is a .${ext}, not ${named.file}`);
  for (const field of ["photographer", "source", "licence"] as const) {
    if (credit?.[field] !== named[field]) differs.push(`${field} is ${JSON.stringify(credit?.[field] ?? null)}`);
  }
  if (differs.length === 0) {
    const beside = path.join(path.dirname(file), named.file);
    if ((await stat(beside).catch(() => null)) === null) return;
    let image;
    try {
      image = await readCoverImage(beside);
    } catch (error) {
      if (!(error instanceof CoverImageError)) throw error;
      throw new CourseWriteError(`${error.message}. Nothing was written.`);
    }
    if (image.sha256 === stored) return;
    differs.push(`${beside} is not the stored image`);
  }
  throw new CourseWriteError(
    `${file}: its cover: is not course "${course.id}"'s cover in the catalog (${differs.join("; ")}). ` +
      `course import does not change a cover. ${how} Nothing was written.`,
  );
}

/** The composite write that makes the database hold `course`, and what it archives and deletes. */
interface Plan {
  inputs: WriteContentInput[];
  /** The latest revision of every entity the plan touches, by `type id`, read when it was made. */
  base: Map<string, number>;
  archived: { modules: string[]; items: string[] };
  restored: { modules: string[]; items: string[] };
  /** Link assets no module will point at after the write. */
  orphans: string[];
  /** Every entity the plan writes or deletes, for the locks. */
  touched: [RevisionEntityType, string][];
}

async function plan(
  db: CatalogDatabase,
  course: Course,
  existing: Existing,
  by: { author: string; reason: string },
): Promise<Plan> {
  const now = new Date();
  const listedModules = new Set(course.modules.map((m) => m.id));
  const listedItems = new Set(course.modules.flatMap((m) => m.topics.map((t) => t.id)));
  const listedLinks = new Set(course.modules.flatMap((m) => m.resources.map((r) => `${ASSET_PREFIX.courses}${r.id}`)));
  const moduleRows = new Map(existing.modules.map((m) => [m.id, m]));
  const itemRows = new Map(existing.items.map((i) => [i.id, i]));

  const archive = {
    modules: existing.modules.filter((m) => m.archivedAt === null && !listedModules.has(m.id)),
    items: existing.items.filter((i) => i.archivedAt === null && !listedItems.has(i.id)),
  };
  const restored = {
    modules: course.modules.filter((m) => isArchived(moduleRows.get(m.id))).map((m) => m.id),
    items: course.modules
      .flatMap((m) => m.topics)
      .filter((t) => isArchived(itemRows.get(t.id)))
      .map((t) => t.id),
  };

  // Link assets the course's modules point at now, minus the ones the file
  // keeps, and minus any a module of another course (or an archived module
  // of this one, whose links stay) still points at.
  const currentLinks = new Set(
    existing.memberships
      .filter((m) => m.assetId !== null && listedModules.has(m.collectionId))
      .map((m) => m.assetId as string),
  );
  const candidates = [...currentLinks].filter((id) => !listedLinks.has(id));
  const stillHeld =
    candidates.length === 0
      ? new Set<string>()
      : new Set(
          (
            await db
              .select({ id: collectionItem.assetId })
              .from(collectionItem)
              .where(
                and(
                  inArray(collectionItem.assetId, candidates),
                  sql`${collectionItem.collectionId} <> all(${sql.param([...listedModules])}::text[])`,
                ),
              )
          ).map((row) => row.id as string),
        );
  // Only the importer's own links become orphans (phase 4). A link another
  // owner holds that a module of this course pointed at loses that pointer,
  // which is the module's (D24), and is left where it is: it is not this
  // course's to delete.
  const mine =
    candidates.length === 0
      ? new Set<string>()
      : new Set(
          (
            await db
              .select({ id: asset.id })
              .from(asset)
              .where(and(inArray(asset.id, candidates), eq(asset.ownerId, CLI_OWNER)))
          ).map((row) => row.id),
        );
  const orphans = candidates.filter((id) => !stillHeld.has(id) && mine.has(id)).sort();

  // Sparse positions (D22), placed the way the courses indexer places them,
  // so a later `catalog import` of the same tree keeps every number.
  const revised = await withRevisions(
    db,
    existing.items.map((i) => ["curriculum_item", i.id] as [RevisionEntityType, string]),
  );

  const itemPositions = new Map<string, number>();
  for (const mod of course.modules) {
    const stored = new Map(
      existing.items
        .filter((i) => i.collectionId === mod.id && revised.has(`curriculum_item ${i.id}`))
        .map((i) => [i.id, i.position] as const),
    );
    const placed = placeOrRefuse(
      mod.topics.map((t) => t.id),
      stored,
      `the items of module "${mod.id}"`,
      `renumber items --module ${mod.id}`,
    );
    for (const [id, at] of placed) itemPositions.set(id, at);
  }

  const topicPositions = await placeModuleTopics(db, course, existing);

  const inputs: WriteContentInput[] = [];
  const base = await bases(db, course, existing, orphans);

  const common = { author: by.author, authorKind: "person" as const, reason: by.reason };

  // Archives first: a module the file lists may take the slug of one it no
  // longer lists, and the live-slug index must not see both.
  for (const mod of archive.modules) {
    inputs.push({
      owner: CLI_OWNER,
      type: "collection",
      id: mod.id,
      next: { row: { ...mod, archivedAt: now } },
      base: base.get(`collection ${mod.id}`) ?? null,
      ...common,
    });
  }
  for (const item of archive.items) {
    inputs.push({
      owner: CLI_OWNER,
      type: "curriculum_item",
      id: item.id,
      next: { row: { ...item, archivedAt: now } },
      base: base.get(`curriculum_item ${item.id}`) ?? null,
      ...common,
    });
  }

  // The course, its links assets, its modules, their items: parents first.
  inputs.push({
    owner: CLI_OWNER,
    type: "collection",
    id: course.id,
    next: {
      row: owned(existing.course, {
        id: course.id,
        kind: "course",
        slug: course.slug,
        title: course.title,
        parentId: null,
        position: course.order,
        // The same metadata the courses indexer writes. `tags` stays in it
        // until every reader takes tags from `collection_tag`.
        metadata: {
          code: course.code,
          credits: course.credits,
          prereq: course.prereq ?? null,
          track: course.track ?? null,
          notes: course.notes ?? null,
          inferred: course.inferred,
          tags: course.tags,
          capstone: course.capstone,
          // The cover the course has, carried over: `checkCover` has refused
          // any file whose `cover:` differs from it, before this runs.
          ...(existing.course?.coverBlobKey != null && course.cover !== undefined
            ? { coverCredit: creditOf(course.cover) }
            : {}),
        },
        coverBlobKey: course.cover === undefined ? null : (existing.course?.coverBlobKey ?? null),
        archivedAt: null,
      }),
      links: {
        collection_tag: course.tags.map((tagId, i) => ({ tagId, position: i + 1 })),
        collection_item: [],
      },
    },
    base: base.get(`collection ${course.id}`) ?? null,
    ...common,
  });

  const linkRows = await linkAssetRows(db, [...listedLinks]);
  for (const mod of course.modules) {
    for (const resource of mod.resources) {
      const id = `${ASSET_PREFIX.courses}${resource.id}`;
      inputs.push({
        owner: CLI_OWNER,
        type: "asset",
        id,
        next: {
          row: owned(linkRows.get(id), {
            id,
            kind: "link",
            path: null,
            url: resource.url,
            contentHash: null,
            bytes: null,
            title: resource.title,
            sourceRepo: "self-learn",
            resourceType: resource.type,
          }),
          links: { asset_topic: [{ topicSlug: mod.topic }], asset_concept: [], asset_derivation: [] },
        },
        base: base.get(`asset ${id}`) ?? null,
        ...common,
      });
    }
  }

  for (const mod of course.modules) {
    inputs.push({
      owner: CLI_OWNER,
      type: "collection",
      id: mod.id,
      next: {
        row: owned(moduleRows.get(mod.id), {
          id: mod.id,
          kind: "module",
          slug: mod.slug,
          title: mod.title,
          parentId: course.id,
          position: mod.order,
          metadata: {},
          archivedAt: null,
        }),
        links: {
          collection_item: [
            {
              position: 0,
              topicSlug: mod.topic,
              conceptSlug: null,
              assetId: null,
              topicPosition: topicPositions.get(mod.id) ?? 0,
            },
            ...mod.resources.map((resource, i) => ({
              position: i + 1,
              topicSlug: null,
              conceptSlug: null,
              assetId: `${ASSET_PREFIX.courses}${resource.id}`,
              topicPosition: 0,
            })),
          ],
          collection_tag: [],
        },
      },
      base: base.get(`collection ${mod.id}`) ?? null,
      ...common,
    });
  }

  for (const mod of course.modules) {
    for (const item of mod.topics) {
      inputs.push({
        owner: CLI_OWNER,
        type: "curriculum_item",
        id: item.id,
        next: {
          row: owned(itemRows.get(item.id), {
            id: item.id,
            collectionId: mod.id,
            position: itemPositions.get(item.id) ?? 0,
            title: item.title,
            subtopics: item.subtopics,
            archivedAt: null,
          }),
          links: {
            curriculum_item_topic: [{ topicSlug: mod.topic }],
            concept_curriculum_item: item.concepts.map((conceptSlug, i) => ({ conceptSlug, position: i + 1 })),
          },
        },
        base: base.get(`curriculum_item ${item.id}`) ?? null,
        ...common,
      });
    }
  }

  const touched: [RevisionEntityType, string][] = [
    ...inputs.map((input) => [input.type, input.id] as [RevisionEntityType, string]),
    ...orphans.map((id) => ["asset", id] as [RevisionEntityType, string]),
  ];
  return {
    inputs,
    base,
    archived: { modules: archive.modules.map((m) => m.id).sort(), items: archive.items.map((i) => i.id).sort() },
    restored,
    orphans,
    touched,
  };
}

function isArchived(row: { archivedAt: Date | null } | undefined): boolean {
  return row !== undefined && row.archivedAt !== null;
}

/** `placePositions`, with its gap refusal turned into the sentence `catalog import` uses. */
function placeOrRefuse(
  order: readonly string[],
  stored: ReadonlyMap<string, number>,
  list: string,
  renumber: string,
): Map<string, number> {
  try {
    return placePositions(order, stored);
  } catch (error) {
    if (!(error instanceof PositionGapError)) throw error;
    throw new CourseWriteError(
      `${list}: ${error.message}. The rows around them keep their numbers so their revisions do ` +
        `not change, and that leaves no whole number free. Run \`npm run catalog -- ${renumber} ` +
        `--reason "<why>"\`, then import again.`,
    );
  }
}

/** A new row keeps the owner an existing one has; a new entity takes the column's default. */
function owned(existing: { ownerId: string } | undefined, row: Row): Row {
  return existing === undefined ? row : { ...row, ownerId: existing.ownerId };
}

async function linkAssetRows(db: CatalogDatabase, ids: string[]): Promise<Map<string, { ownerId: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: asset.id, ownerId: asset.ownerId }).from(asset).where(inArray(asset.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Each module's place in its topic's `maps.courses` (D22). A module that
 * keeps its topic keeps its number; a new module, or one that moved topic,
 * goes after the live modules already under that topic, which is where the
 * vocabulary export will list it.
 */
async function placeModuleTopics(
  db: CatalogDatabase,
  course: Course,
  existing: Existing,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const byTopic = new Map<string, string[]>();
  for (const mod of course.modules) {
    const list = byTopic.get(mod.topic);
    if (list === undefined) byTopic.set(mod.topic, [mod.id]);
    else list.push(mod.id);
  }
  const listed = new Set(course.modules.map((m) => m.id));
  for (const [slug, mine] of byTopic) {
    const current = await db
      .select({ id: collectionItem.collectionId, at: collectionItem.topicPosition })
      .from(collectionItem)
      .innerJoin(collection, eq(collection.id, collectionItem.collectionId))
      .where(
        and(eq(collectionItem.topicSlug, slug), eq(collection.kind, "module"), isNull(collection.archivedAt)),
      )
      .orderBy(collectionItem.topicPosition, collectionItem.collectionId);
    // The list as the export renders it now, without this course's modules
    // the file drops, then this course's modules that are new to the topic.
    const kept = current.filter((row) => !existing.modules.some((m) => m.id === row.id) || listed.has(row.id));
    const order = [...kept.map((row) => row.id), ...mine.filter((id) => !kept.some((row) => row.id === id))];
    const revisedHere = await withRevisions(
      db,
      kept.map((row) => ["collection", row.id] as [RevisionEntityType, string]),
    );
    const stored = new Map(
      kept.filter((row) => revisedHere.has(`collection ${row.id}`)).map((row) => [row.id, row.at] as const),
    );
    const placed = placeOrRefuse(order, stored, `maps.courses of topic "${slug}"`, `renumber modules --topic ${slug}`);
    for (const id of mine) out.set(id, placed.get(id) ?? 0);
  }
  return out;
}

/** The latest revision of every entity the plan may write or delete, by `type id`. */
async function bases(
  db: CatalogDatabase,
  course: Course,
  existing: Existing,
  orphans: string[],
): Promise<Map<string, number>> {
  const keys: [RevisionEntityType, string][] = [
    ["collection", course.id],
    ...course.modules.map((m) => ["collection", m.id] as [RevisionEntityType, string]),
    ...existing.modules.map((m) => ["collection", m.id] as [RevisionEntityType, string]),
    ...course.modules.flatMap((m) => m.topics.map((t) => ["curriculum_item", t.id] as [RevisionEntityType, string])),
    ...existing.items.map((i) => ["curriculum_item", i.id] as [RevisionEntityType, string]),
    ...course.modules.flatMap((m) =>
      m.resources.map((r) => ["asset", `${ASSET_PREFIX.courses}${r.id}`] as [RevisionEntityType, string]),
    ),
    ...orphans.map((id) => ["asset", id] as [RevisionEntityType, string]),
  ];
  const out = new Map<string, number>();
  for (const type of new Set(keys.map(([t]) => t))) {
    const latest = await latestRevisions(
      db,
      type,
      keys.filter(([t]) => t === type).map(([, id]) => id),
    );
    for (const [id, revision] of latest) out.set(`${type} ${id}`, revision.id);
  }
  return out;
}

/*
 * The base a course file was exported at (edge case 16, for course files).
 *
 * `course export` writes, as its first line, the newest revision among every
 * entity the course is made of: the course, its modules and items (archived
 * ones included) and the curated links its modules point at. Revision ids
 * only grow, so a file stamped N is stale exactly when one of those entities
 * has a revision above N, or when an entity the file names does (a link
 * deleted since has its `delete` revision there). `course import` refuses a
 * stale file unless `--force-base`, because importing it would undo whatever
 * moved: an item archived since would come back, a concept linked since would
 * be unlinked. A file with no stamp (the tree's own file, which the
 * write-through keeps in step, or one written by hand) is not checked.
 */

/** The first line of an exported course file, before the number. */
export const BASE_STAMP = "# base-revision:";
const STAMP_LINE = /^# base-revision: (\d+|none)\b[^\n]*\n/;

/** `yaml` with the stamp line in front. */
export function stampCourse(yaml: string, base: number | null): string {
  return (
    `${BASE_STAMP} ${base ?? "none"} (catalog course export; course import refuses this file once the ` +
    `course has moved past it, unless --force-base)\n${yaml}`
  );
}

/** The stamp a file carries: a revision, null for "none", undefined when it has no stamp. */
export function readStamp(text: string): number | null | undefined {
  const match = STAMP_LINE.exec(text);
  if (match === null) return undefined;
  return match[1] === "none" ? null : Number(match[1]);
}

/** Every entity a course is made of, as `revisions.ts` keys them, plus whatever `extra` names. */
function courseKeys(existing: Existing, courseId: string, extra: readonly [RevisionEntityType, string][] = []) {
  return [
    ["collection", courseId] as [RevisionEntityType, string],
    ...existing.modules.map((m) => ["collection", m.id] as [RevisionEntityType, string]),
    ...existing.items.map((i) => ["curriculum_item", i.id] as [RevisionEntityType, string]),
    ...existing.memberships
      .filter((m) => m.assetId !== null)
      .map((m) => ["asset", m.assetId as string] as [RevisionEntityType, string]),
    ...extra,
  ];
}

/** The newest revision among `keys`, and every entity whose latest revision is above `after`. */
async function newestRevision(
  db: CatalogDatabase,
  keys: readonly (readonly [RevisionEntityType, string])[],
  after: number | null = null,
): Promise<{ newest: number | null; moved: string[] }> {
  let newest: number | null = null;
  const moved: string[] = [];
  for (const type of new Set(keys.map(([t]) => t))) {
    const latest = await latestRevisions(db, type, keys.filter(([t]) => t === type).map(([, id]) => id));
    for (const [id, revision] of latest) {
      if (newest === null || revision.id > newest) newest = revision.id;
      if (after === null || revision.id > after) moved.push(`${type} ${id} (revision ${revision.id})`);
    }
  }
  return { newest, moved: moved.sort() };
}

/** Take every lock the plan needs, before any write, in the one global order (`revisions.ts`). */
async function lockAll(db: CatalogDatabase, keys: readonly (readonly [RevisionEntityType, string])[]): Promise<void> {
  const unique = [...new Map(keys.map(([type, id]) => [`${type} ${id}`, [type, id] as const])).values()];
  unique.sort(([ta, ia], [tb, ib]) => (ta !== tb ? (ta < tb ? -1 : 1) : ia < ib ? -1 : ia > ib ? 1 : 0));
  for (const [type, id] of unique) await lockEntity(db, type, id);
}

/**
 * Delete the curated links an import leaves pointing nowhere, through the
 * seam (`deleteContent`), each with a `delete` revision holding its last
 * state. The caller holds their locks. The seam refuses a link another owner
 * holds; `plan` never names one, since only the importer's own links become
 * orphans.
 */
async function deleteAssets(
  db: CatalogDatabase,
  ids: readonly string[],
  expected: ReadonlyMap<string, number>,
  by: { author: string; reason: string },
): Promise<EntityChange[]> {
  const changes: EntityChange[] = [];
  for (const id of ids) {
    let deleted: { revisionId: number } | null;
    try {
      deleted = await deleteContent(db, {
        type: "asset",
        id,
        owner: CLI_OWNER,
        base: expected.get(`asset ${id}`) ?? null,
        author: by.author,
        authorKind: "person",
        reason: by.reason,
      });
    } catch (error) {
      if (error instanceof ContentWriteError && error.code === "stale-base") {
        throw new CourseWriteError(`asset "${id}" changed while this import ran. Run it again; nothing was written.`);
      }
      throw error;
    }
    if (deleted !== null) changes.push({ type: "asset", id, op: "delete", revisionId: deleted.revisionId });
  }
  return changes;
}

export interface CourseImportOptions {
  /** The course file to read. */
  file: string;
  reason: string;
  author?: string;
  /** Do everything but commit, and write no file. */
  dryRun?: boolean;
  /** Import a file whose base-revision stamp is behind the course, undoing what moved since. */
  forceBase?: boolean;
}

export async function importCourse(db: CatalogDatabase, options: CourseImportOptions): Promise<CourseImportResult> {
  if (options.reason.trim() === "") {
    throw new CourseWriteError(
      "course import needs a --reason: it is what the commit message used to say, and every revision carries it",
    );
  }
  let text: string;
  try {
    text = await readFile(options.file, "utf8");
  } catch (error) {
    throw new CourseWriteError(`${options.file}: cannot be read (${(error as NodeJS.ErrnoException).code ?? (error as Error).message})`);
  }
  let course: Course;
  try {
    course = parseCourse(text, options.file);
  } catch (error) {
    if (error instanceof ContentError) throw new CourseWriteError(error.message);
    throw error;
  }
  const by = { author: options.author ?? PERSON, reason: options.reason.trim() };
  const dryRun = options.dryRun === true;
  const stamp = readStamp(text);

  const run = async (tx: CatalogDatabase) => {
    // One course import at a time: the order, code and slug checks below
    // read the other live courses, and two imports of different courses
    // lock different rows, so without this both could pass against the old
    // rows and commit the same order or code. Only this command takes the
    // lock, always right after the write-through's export locks and before
    // any revision lock, so it cannot take part in a lock cycle.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${COURSE_IDENTITY_LOCK}, 0))`);
    await checkReferences(tx, course, options.file);

    // Two passes: the first finds every entity the write can touch (the
    // course's current rows included, which only the database knows), the
    // locks are taken on all of them in the global order, and the second
    // plans again under the locks. A row that joined the course in between
    // is one this write did not lock, and it stops rather than guessing.
    const first = await plan(tx, course, await readExisting(tx, course.id), by);
    await lockAll(tx, first.touched);
    const existing = await readExisting(tx, course.id);
    // Under the course's lock, so a `course cover` write cannot land between
    // this check and the write that carries the cover over.
    await checkCover(existing.course, course, options.file);
    const planned = await plan(tx, course, existing, by);
    const locked = new Set(first.touched.map(([type, id]) => `${type} ${id}`));
    const unlocked = planned.touched.filter(([type, id]) => !locked.has(`${type} ${id}`));
    if (unlocked.length > 0) {
      throw new CourseWriteError(
        `course "${course.id}" changed while this import ran (${unlocked.map(([t, id]) => `${t} ${id}`).join(", ")}). ` +
          `Run it again; nothing was written.`,
      );
    }

    // Under the locks, so nothing can move between this check and the write.
    if (stamp !== undefined && options.forceBase !== true) {
      const { moved } = await newestRevision(tx, courseKeys(existing, course.id, planned.touched), stamp);
      if (moved.length > 0) {
        throw new CourseWriteError(
          `${options.file} was exported at ${stamp === null ? "no revision" : `revision ${stamp}`}, and course ` +
            `"${course.id}" has moved on since: ${moved.slice(0, 10).join(", ")}` +
            `${moved.length > 10 ? `, and ${moved.length - 10} more` : ""}. Importing it would undo that. ` +
            `Export it again (\`catalog course export ${course.id} --out <file>\`) and reapply the edit, or pass ` +
            `--force-base to import this file as it stands; nothing was written.`,
        );
      }
    }

    const results: WriteContentResult[] = await writeContents(tx, planned.inputs);
    const deleted = await deleteAssets(tx, planned.orphans, planned.base, by);
    const { newest } = await newestRevision(tx, courseKeys(await readExisting(tx, course.id), course.id, planned.touched));

    const changes: EntityChange[] = [
      ...results.map((r) => ({ type: r.type, id: r.id, op: r.op, revisionId: r.revisionId })),
      ...deleted,
    ].map((change) => (dryRun ? { ...change, revisionId: null } : change));
    return {
      course: course.id,
      file: options.file,
      dryRun,
      changes,
      archived: planned.archived,
      restored: planned.restored,
      deletedLinks: deleted.map((d) => d.id),
      revisions: changes.filter((c) => c.op !== null).length,
      base: dryRun ? null : newest,
    };
  };

  // The course's file, and topics.yaml for a module that moved topic, are
  // kept in step by the shared write-through (D17): refused up front unless
  // they are what the database would export, the file being imported aside,
  // and rewritten from the rows in the same transaction.
  const through = { exempt: [options.file] };
  if (dryRun) {
    try {
      await db.transaction(async (tx) => {
        await assertInStep(tx, WRITES_THROUGH, through);
        throw new DryRun({ ...(await run(tx)), writeThrough: NOTHING_WRITTEN });
      });
    } catch (error) {
      if (error instanceof DryRun) return error.result as CourseImportResult;
      throw error;
    }
    throw new Error("a dry run returned without rolling back");
  }
  const { value, exported } = await writeThrough(db, WRITES_THROUGH, run, through);
  // A stamped file now matches the rows up to this import's revisions, so its
  // stamp moves on with them, as a checkout's sidecar does after a commit:
  // editing the same file and importing it again is not a stale import. Only
  // while the file still reads as it was read; an edit made meanwhile keeps
  // the old stamp, and the next import says so.
  if (stamp !== undefined && value.base !== null && value.revisions > 0) {
    const now = await readFile(options.file, "utf8").catch(() => null);
    if (now === text) {
      await writeFile(options.file, stampCourse(text.replace(STAMP_LINE, ""), value.base), "utf8");
    }
  }
  return { ...value, writeThrough: summarise(exported) };
}

/** The types a course write can change the export of: its file, and `maps.courses` in the vocabulary. */
const WRITES_THROUGH = ["courses", "topics"] as const;

export interface CourseExportResult {
  course: string;
  /** Where the file lives in the tree, repo-relative. */
  path: string;
  /** The file as the tree holds it, with no stamp. */
  yaml: string;
  /** The course's newest revision in the snapshot `yaml` was rendered from; `stampCourse` puts it in the file. */
  base: number | null;
}

/**
 * One course as the database would export it. The whole courses type is
 * rendered, so a course that cannot be written back refuses here exactly as
 * `catalog export` would.
 */
export async function exportCourse(db: CatalogDatabase, id: string): Promise<CourseExportResult> {
  // One snapshot for the file and its base, or a write landing between the
  // render and the revision read would stamp old text with a new base.
  return db.transaction((tx) => exportCourseIn(tx, id), { isolationLevel: "repeatable read", accessMode: "read only" });
}

async function exportCourseIn(db: CatalogDatabase, id: string): Promise<CourseExportResult> {
  const [row] = await db.select().from(collection).where(eq(collection.id, id));
  if (row === undefined || row.kind !== "course") {
    const hint = row === undefined ? "" : ` ("${id}" is a ${row.kind}; export its course, "${row.parentId ?? ""}")`;
    throw new CourseWriteError(`no course "${id}" in the catalog${hint}`);
  }
  if (row.archivedAt !== null) {
    throw new CourseWriteError(`course "${id}" is archived, and an archived course has no file`);
  }
  const code = (row.metadata as { code?: unknown }).code;
  if (typeof code !== "string") throw new CourseWriteError(`course "${id}" has no metadata.code, so it has no file name`);
  const file = `${COURSES_DIR}/${courseFileName(code)}`;
  const rendered = (await renderType(db, "courses")).find((f) => f.path === file);
  if (rendered === undefined) throw new CourseWriteError(`course "${id}" rendered no ${file}`);
  const { newest } = await newestRevision(db, courseKeys(await readExisting(db, id), id));
  return { course: id, path: file, yaml: rendered.bytes.toString("utf8"), base: newest };
}
