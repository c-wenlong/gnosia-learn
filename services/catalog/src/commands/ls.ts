import {
  asset,
  ASSET_KINDS,
  assetTopic,
  collection,
  collectionItem,
  concept,
  curriculumItem,
  curriculumItemTopic,
  topic,
} from "@self-learn/schema";
import { and, asc, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { withDatabase } from "../db";
import { bytewise } from "../sql-order";

/**
 * `catalog ls` — what exists, one layer at a time.
 *
 * The layering rule from the plan: an agent reads `status`, then `ls`, then
 * `show`, and no layer ever returns a whole tree. `ls` returns titles and
 * counts. It never returns a summary, a body or a path — those are `show`'s
 * job, one entity at a time, and mixing them here is how a "cheap" listing
 * turns into thousands of tokens.
 *
 *   catalog ls                    domains and courses, with counts
 *   catalog ls algorithms         the topics in one domain
 *   catalog ls cs4263             one course's modules and curriculum items
 *   catalog ls algorithms --kind video
 *                                 the same topics, counting only videos
 */

export type LsResult = LsOverview | LsDomain | LsCollection;

export interface LsOverview {
  kind: "overview";
  domains: { domain: string; topics: number }[];
  collections: { id: string; kind: string; title: string; children: number }[];
}

export interface LsTopicRow {
  slug: string;
  title: string;
  concepts: number;
  assets: number;
  curriculumItems: number;
}

export interface LsDomain {
  kind: "domain";
  domain: string;
  assetKinds: string[] | null;
  topics: LsTopicRow[];
}

export interface LsCollection {
  kind: "collection";
  id: string;
  collectionKind: string;
  title: string;
  topicSlug: string | null;
  /**
   * The collection named is archived: its course file no longer lists it
   * (D12). Still answered, since its id is how a person finds the learner
   * rows kept under it, and said so, since it is on no page.
   */
  archived: boolean;
  children: {
    id: string;
    kind: string;
    title: string;
    topicSlug: string | null;
    curriculumItems: { id: string; title: string; subtopics: number }[];
    /**
     * How many collections hang below this child. `ls` shows one level, so a
     * grandchild is reported as a count with an id to run `ls` on rather than
     * being silently absent. Zero for every collection today: courses contain
     * modules and modules contain curriculum items, which are not collections.
     */
    children: number;
  }[];
  /** Items authored directly on this collection, when it is itself a module. */
  curriculumItems: { id: string; title: string; subtopics: number }[];
}

export interface LsOptions {
  /** Restrict the asset counts to these kinds. */
  kinds?: readonly string[];
}

export class UnknownTarget extends Error {
  constructor(target: string) {
    super(
      `"${target}" is neither a domain nor a collection id. ` +
        `Run \`catalog ls\` with no argument to see both.`,
    );
    this.name = "UnknownTarget";
  }
}

export function parseKinds(raw: string): string[] {
  const kinds = raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k !== "");
  const unknown = kinds.filter((k) => !(ASSET_KINDS as readonly string[]).includes(k));
  if (unknown.length > 0) {
    throw new Error(`unknown asset kind(s): ${unknown.join(", ")}. Known: ${ASSET_KINDS.join(", ")}`);
  }
  return kinds;
}

export async function runLs(target: string | undefined, options: LsOptions = {}): Promise<LsResult> {
  return withDatabase(async ({ db }) => {
    if (target === undefined) {
      // Live rows only, throughout: an archived topic, course, module or item
      // is kept for the learner rows under it (D12) and is on no page, so a
      // count that included it would describe a catalog nobody can browse.
      const domains = await db
        .select({ domain: topic.domain, topics: count() })
        .from(topic)
        .where(isNull(topic.archivedAt))
        .groupBy(topic.domain)
        .orderBy(asc(bytewise(topic.domain)));

      // Top-level collections only. A course's modules are its children and
      // belong under `ls <course>`, not on the front page of the catalog.
      const roots = await db
        .select({ id: collection.id, kind: collection.kind, title: collection.title })
        .from(collection)
        .where(and(isNull(collection.parentId), isNull(collection.archivedAt)))
        .orderBy(asc(bytewise(collection.id)));

      // Counted with a second grouped query rather than a correlated subquery
      // in the select list. drizzle renders an interpolated column there as a
      // bare `"id"`, which the subquery's own alias then captures — the count
      // comes back as zero for every row, silently.
      const childCounts = await db
        .select({ parentId: collection.parentId, n: count() })
        .from(collection)
        .where(and(isNotNull(collection.parentId), isNull(collection.archivedAt)))
        .groupBy(collection.parentId);
      const childrenOf = new Map(childCounts.map((r) => [r.parentId, r.n]));

      const collections = roots.map((row) => ({
        ...row,
        children: childrenOf.get(row.id) ?? 0,
      }));

      return { kind: "overview", domains, collections };
    }

    const domainTopics = await topicsInDomain(db, target, options.kinds);
    if (domainTopics !== null) return domainTopics;

    const asCollection = await collectionTree(db, target);
    if (asCollection !== null) return asCollection;

    throw new UnknownTarget(target);
  });
}

type Db = Parameters<Parameters<typeof withDatabase<LsResult>>[0]>[0]["db"];

async function topicsInDomain(
  db: Db,
  domain: string,
  kinds: readonly string[] | undefined,
): Promise<LsDomain | null> {
  const rows = await db
    .select({ slug: topic.slug, title: topic.title })
    .from(topic)
    .where(and(eq(topic.domain, domain), isNull(topic.archivedAt)))
    .orderBy(asc(bytewise(topic.slug)));
  if (rows.length === 0) return null;

  const slugs = rows.map((r) => r.slug);

  const conceptCounts = await db
    .select({ slug: concept.topicSlug, n: count() })
    .from(concept)
    .where(and(inArray(concept.topicSlug, slugs), isNull(concept.archivedAt)))
    .groupBy(concept.topicSlug);

  const assetWhere =
    kinds === undefined || kinds.length === 0
      ? inArray(assetTopic.topicSlug, slugs)
      : and(inArray(assetTopic.topicSlug, slugs), inArray(asset.kind, [...kinds]));
  const assetCounts = await db
    .select({ slug: assetTopic.topicSlug, n: count() })
    .from(assetTopic)
    .innerJoin(asset, eq(asset.id, assetTopic.assetId))
    .where(assetWhere)
    .groupBy(assetTopic.topicSlug);

  // Curriculum items reach a topic through `curriculum_item_topic`; counting
  // through the module would miss any item retagged on its own later.
  const curriculumCounts = await db
    .select({ slug: curriculumItemTopic.topicSlug, n: count() })
    .from(curriculumItemTopic)
    .innerJoin(curriculumItem, eq(curriculumItem.id, curriculumItemTopic.curriculumItemId))
    .where(and(inArray(curriculumItemTopic.topicSlug, slugs), isNull(curriculumItem.archivedAt)))
    .groupBy(curriculumItemTopic.topicSlug);

  const byConcept = new Map(conceptCounts.map((r) => [r.slug, r.n]));
  const byAsset = new Map(assetCounts.map((r) => [r.slug, r.n]));
  const byCurriculum = new Map(curriculumCounts.map((r) => [r.slug, r.n]));

  return {
    kind: "domain",
    domain,
    assetKinds: kinds === undefined || kinds.length === 0 ? null : [...kinds],
    topics: rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      concepts: byConcept.get(row.slug) ?? 0,
      assets: byAsset.get(row.slug) ?? 0,
      curriculumItems: byCurriculum.get(row.slug) ?? 0,
    })),
  };
}

async function collectionTree(db: Db, id: string): Promise<LsCollection | null> {
  const found = await db.select().from(collection).where(eq(collection.id, id)).limit(1);
  const row = found[0];
  if (row === undefined) return null;

  const children = await db
    .select()
    .from(collection)
    .where(and(eq(collection.parentId, id), isNull(collection.archivedAt)))
    .orderBy(asc(collection.position), asc(bytewise(collection.id)));

  const ids = [id, ...children.map((c) => c.id)];
  const items = await db
    .select({
      id: curriculumItem.id,
      collectionId: curriculumItem.collectionId,
      title: curriculumItem.title,
      subtopics: curriculumItem.subtopics,
      position: curriculumItem.position,
    })
    .from(curriculumItem)
    .where(and(inArray(curriculumItem.collectionId, ids), isNull(curriculumItem.archivedAt)))
    .orderBy(asc(curriculumItem.position), asc(bytewise(curriculumItem.id)));

  const topics = await db
    .select({ collectionId: collectionItem.collectionId, topicSlug: collectionItem.topicSlug })
    .from(collectionItem)
    .where(and(inArray(collectionItem.collectionId, ids), isNotNull(collectionItem.topicSlug)));
  const topicOf = new Map(topics.map((r) => [r.collectionId, r.topicSlug]));

  // One level down only, deliberately: `ls` is the bounded layer and recursing
  // an arbitrarily deep tree is exactly what it must not do. Counting each
  // child's own children is what keeps that bound honest — a deeper level shows
  // up as a number instead of vanishing.
  const grandchildren = await db
    .select({ parentId: collection.parentId, n: count() })
    .from(collection)
    .where(and(inArray(collection.parentId, children.map((c) => c.id)), isNull(collection.archivedAt)))
    .groupBy(collection.parentId);
  const belowChild = new Map(grandchildren.map((r) => [r.parentId, r.n]));

  const itemsOf = (collectionId: string) =>
    items
      .filter((i) => i.collectionId === collectionId)
      .map((i) => ({
        id: i.id,
        title: i.title,
        subtopics: Array.isArray(i.subtopics) ? i.subtopics.length : 0,
      }));

  return {
    kind: "collection",
    id: row.id,
    collectionKind: row.kind,
    title: row.title,
    topicSlug: topicOf.get(row.id) ?? null,
    archived: row.archivedAt !== null,
    children: children.map((child) => ({
      id: child.id,
      kind: child.kind,
      title: child.title,
      topicSlug: topicOf.get(child.id) ?? null,
      curriculumItems: itemsOf(child.id),
      children: belowChild.get(child.id) ?? 0,
    })),
    curriculumItems: itemsOf(row.id),
  };
}

export function formatLs(result: LsResult): string {
  if (result.kind === "overview") {
    const lines = ["domains"];
    const width = Math.max(8, ...result.domains.map((d) => d.domain.length));
    for (const d of result.domains) {
      lines.push(`  ${d.domain.padEnd(width)}  ${String(d.topics).padStart(4)} topics`);
    }
    lines.push("", "collections");
    for (const c of result.collections) {
      lines.push(
        `  ${c.id.padEnd(width)}  ${String(c.children).padStart(4)} children  ${c.kind.padEnd(6)}  ${c.title}`,
      );
    }
    lines.push("", "`catalog ls <domain|id>` for one of these, `catalog show <slug>` for detail.");
    return lines.join("\n");
  }

  if (result.kind === "domain") {
    const scope = result.assetKinds === null ? "assets" : `${result.assetKinds.join("/")} assets`;
    const lines = [`${result.domain}  (${result.topics.length} topics)`, ""];
    const width = Math.max(4, ...result.topics.map((t) => t.slug.length));
    lines.push(`  ${"SLUG".padEnd(width)}  CONCEPTS  ${scope.toUpperCase().padStart(8)}  ITEMS  TITLE`);
    for (const t of result.topics) {
      lines.push(
        `  ${t.slug.padEnd(width)}  ${String(t.concepts).padStart(8)}  ` +
          `${String(t.assets).padStart(8)}  ${String(t.curriculumItems).padStart(5)}  ${t.title}`,
      );
    }
    return lines.join("\n");
  }

  const lines = [`${result.id}  ${result.collectionKind}  ${result.title}`];
  if (result.archived) lines.push("  archived: its course file no longer lists it, and it is on no page");
  if (result.topicSlug !== null) lines.push(`  topic: ${result.topicSlug}`);
  for (const item of result.curriculumItems) {
    lines.push(`  ${item.id}  ${item.title}  (${item.subtopics} subtopics)`);
  }
  for (const child of result.children) {
    lines.push("");
    lines.push(`  ${child.id}  ${child.title}${child.topicSlug ? `  → ${child.topicSlug}` : ""}`);
    for (const item of child.curriculumItems) {
      lines.push(`    ${item.id}  ${item.title}  (${item.subtopics} subtopics)`);
    }
    if (child.children > 0) {
      lines.push(`    ${child.children} more collection(s) below: catalog ls ${child.id}`);
    }
  }
  return lines.join("\n");
}
