import {
  asset,
  assetConcept,
  assetTopic,
  collection,
  collectionItem,
  concept,
  conceptCurriculumItem,
  conceptPrerequisite,
  curriculumItem,
  curriculumItemTopic,
  LOCAL_LEARNER_ID,
  mastery,
  mirror,
  topic,
} from "@self-learn/schema";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import { cliScope } from "../content/scope";
import { withDatabase } from "../db";
import {
  assetDerivations,
  assetsForCollection,
  assetsForConcept,
  assetsForTopic,
  byKind,
  type AssetRef,
} from "../state/assets";
import { bytewise } from "../sql-order";

/**
 * `catalog show <slug-or-id>` — one entity and everything that points at it.
 *
 * **Paths, never bodies.** Every asset comes back with its path and nothing
 * else about its contents. An agent that needs the words in a note reads the
 * file; this command's job is to tell it which file, out of several hundred,
 * that is. Returning the text here would make the cheap layer expensive and
 * would put a second, staler copy of every note in the database.
 *
 * The argument is resolved against topics, then concepts, then collections,
 * then curriculum items, then assets. Those namespaces do not collide today; if
 * one ever does, the other matches come back under `alternatives` rather than
 * being silently dropped.
 *
 * The asset lookups themselves are not here. They live in
 * `../state/assets.ts`, because the web app may import that directory and may
 * not import this one, and because one implementation is the only way the CLI
 * and a page cannot disagree about what an asset row is.
 */

export type ShowResult =
  | ShowTopic
  | ShowConcept
  | ShowCollection
  | ShowCurriculumItem
  | ShowAsset;

/**
 * Re-exported so a caller reading this file's result types does not have to
 * know the queries moved. The implementation is `../state/assets.ts`, which is
 * where the web app can reach it.
 */
export type { AssetRef };

export interface ShowTopic {
  type: "topic";
  slug: string;
  title: string;
  domain: string;
  summary: string | null;
  aliases: string[];
  /**
   * The entity itself is archived: kept for the learner rows under it (D12),
   * on no page. The lists below it hold live rows only.
   */
  archived: boolean;
  concepts: { slug: string; title: string; path: string }[];
  curriculumItems: { id: string; title: string; collectionId: string }[];
  /** Assets about this topic, grouped by kind so the shape is obvious at a glance. */
  assets: Record<string, AssetRef[]>;
  alternatives?: string[];
}

export interface ShowConcept {
  type: "concept";
  slug: string;
  title: string;
  summary: string | null;
  topicSlug: string | null;
  path: string;
  archived: boolean;
  /** What this concept depends on. */
  requires: { slug: string; title: string; kind: string }[];
  /** What depends on this concept. The reverse edge, which the graph needs as much. */
  requiredBy: { slug: string; title: string; kind: string }[];
  curriculumItems: { id: string; title: string }[];
  /** The local learner's belief, or null. Other learners are not reachable from this CLI yet. */
  mastery: { pL: number; observations: number; correct: number; lastSeen: string | null } | null;
  assets: Record<string, AssetRef[]>;
  alternatives?: string[];
}

export interface ShowCollection {
  type: "collection";
  id: string;
  kind: string;
  slug: string;
  title: string;
  parentId: string | null;
  metadata: unknown;
  topicSlug: string | null;
  archived: boolean;
  children: { id: string; kind: string; title: string }[];
  curriculumItems: { id: string; title: string; subtopics: string[] }[];
  assets: Record<string, AssetRef[]>;
  alternatives?: string[];
}

export interface ShowCurriculumItem {
  type: "curriculumItem";
  id: string;
  title: string;
  collectionId: string;
  subtopics: string[];
  archived: boolean;
  topics: string[];
  concepts: { slug: string; title: string }[];
  alternatives?: string[];
}

/** One destination's verdict on this asset, straight off the `mirror` table. */
export interface MirrorRef {
  destination: string;
  root: string;
  status: string;
  /** Which test the verdict rests on: sha256, bytes, size+mtime, or none. */
  compared: string;
  bytes: number | null;
  mtime: string | null;
  checkedAt: string;
}

export interface ShowAsset {
  type: "asset";
  id: string;
  kind: string;
  path: string | null;
  url: string | null;
  contentHash: string | null;
  bytes: number | null;
  title: string | null;
  sourceRepo: string;
  topics: string[];
  concepts: string[];
  /** Assets this one was produced from, and assets produced from it. */
  derivedFrom: AssetRef[];
  derivedInto: AssetRef[];
  /**
   * Where copies of this file have reached. Empty for anything no mirror is
   * expected to carry, which is everything outside manimkc's deliverables.
   */
  mirrors: MirrorRef[];
  alternatives?: string[];
}

export class NotFound extends Error {
  constructor(target: string) {
    super(
      `nothing in the catalog is called "${target}". ` +
        `Try \`catalog search ${target}\`, or \`catalog ls\` for what exists.`,
    );
    this.name = "NotFound";
  }
}

type Db = Parameters<Parameters<typeof withDatabase<ShowResult>>[0]>[0]["db"];

export async function runShow(target: string): Promise<ShowResult> {
  return withDatabase(async ({ db }) => {
    const first =
      (await showTopic(db, target)) ??
      (await showConcept(db, target)) ??
      (await showCollection(db, target)) ??
      (await showCurriculumItem(db, target)) ??
      (await showAsset(db, target));
    if (first === null) throw new NotFound(target);

    // Namespaces do not collide today. When one does, saying so beats picking.
    const others = await otherTypes(db, target, first.type);
    if (others.length > 0) first.alternatives = others;
    return first;
  });
}

async function otherTypes(db: Db, target: string, found: string): Promise<string[]> {
  const checks: [string, () => Promise<boolean>][] = [
    ["topic", async () => (await db.select({ x: topic.slug }).from(topic).where(eq(topic.slug, target)).limit(1)).length > 0],
    ["concept", async () => (await db.select({ x: concept.slug }).from(concept).where(eq(concept.slug, target)).limit(1)).length > 0],
    ["collection", async () => (await db.select({ x: collection.id }).from(collection).where(eq(collection.id, target)).limit(1)).length > 0],
    ["curriculumItem", async () => (await db.select({ x: curriculumItem.id }).from(curriculumItem).where(eq(curriculumItem.id, target)).limit(1)).length > 0],
    ["asset", async () => (await db.select({ x: asset.id }).from(asset).where(eq(asset.id, target)).limit(1)).length > 0],
  ];
  const out: string[] = [];
  for (const [name, check] of checks) {
    if (name !== found && (await check())) out.push(name);
  }
  return out;
}

async function showTopic(db: Db, slug: string): Promise<ShowTopic | null> {
  const found = (await db.select().from(topic).where(eq(topic.slug, slug)).limit(1))[0];
  if (found === undefined) return null;

  const concepts = await db
    .select({ slug: concept.slug, title: concept.title, path: concept.path })
    .from(concept)
    .where(and(eq(concept.topicSlug, slug), isNull(concept.archivedAt)))
    .orderBy(asc(bytewise(concept.slug)));

  const items = await db
    .select({
      id: curriculumItem.id,
      title: curriculumItem.title,
      collectionId: curriculumItem.collectionId,
    })
    .from(curriculumItemTopic)
    .innerJoin(curriculumItem, eq(curriculumItem.id, curriculumItemTopic.curriculumItemId))
    .where(and(eq(curriculumItemTopic.topicSlug, slug), isNull(curriculumItem.archivedAt)))
    .orderBy(asc(bytewise(curriculumItem.id)));

  return {
    type: "topic",
    slug: found.slug,
    title: found.title,
    domain: found.domain,
    summary: found.summary,
    aliases: Array.isArray(found.aliases) ? (found.aliases as string[]) : [],
    archived: found.archivedAt !== null,
    concepts,
    curriculumItems: items,
    assets: byKind(await assetsForTopic(db, slug, cliScope())),
  };
}

async function showConcept(db: Db, slug: string): Promise<ShowConcept | null> {
  const found = (await db.select().from(concept).where(eq(concept.slug, slug)).limit(1))[0];
  if (found === undefined) return null;

  const requires = await db
    .select({
      slug: concept.slug,
      title: concept.title,
      kind: conceptPrerequisite.kind,
    })
    .from(conceptPrerequisite)
    .innerJoin(concept, eq(concept.slug, conceptPrerequisite.prerequisiteSlug))
    .where(eq(conceptPrerequisite.conceptSlug, slug))
    .orderBy(asc(bytewise(conceptPrerequisite.kind)), asc(bytewise(concept.slug)));

  const requiredBy = await db
    .select({
      slug: concept.slug,
      title: concept.title,
      kind: conceptPrerequisite.kind,
    })
    .from(conceptPrerequisite)
    .innerJoin(concept, eq(concept.slug, conceptPrerequisite.conceptSlug))
    .where(eq(conceptPrerequisite.prerequisiteSlug, slug))
    .orderBy(asc(bytewise(conceptPrerequisite.kind)), asc(bytewise(concept.slug)));

  const items = await db
    .select({ id: curriculumItem.id, title: curriculumItem.title })
    .from(conceptCurriculumItem)
    .innerJoin(curriculumItem, eq(curriculumItem.id, conceptCurriculumItem.curriculumItemId))
    .where(and(eq(conceptCurriculumItem.conceptSlug, slug), isNull(curriculumItem.archivedAt)))
    .orderBy(asc(bytewise(curriculumItem.id)));

  // Mastery is per learner and per concept, so it is selected by both. There
  // is one learner until authentication exists, but filtering on the concept
  // alone and taking the first row would start returning somebody else's
  // belief the day there are two. Read here, never written.
  const belief = (
    await db
      .select({
        pL: mastery.pL,
        observations: mastery.observations,
        correct: mastery.correct,
        lastSeen: mastery.lastSeen,
      })
      .from(mastery)
      .where(and(eq(mastery.conceptSlug, slug), eq(mastery.learnerId, LOCAL_LEARNER_ID)))
      .limit(1)
  )[0];

  return {
    type: "concept",
    slug: found.slug,
    title: found.title,
    summary: found.summary,
    topicSlug: found.topicSlug,
    path: found.path,
    archived: found.archivedAt !== null,
    requires,
    requiredBy,
    curriculumItems: items,
    mastery:
      belief === undefined
        ? null
        : {
            pL: belief.pL,
            observations: belief.observations,
            correct: belief.correct,
            lastSeen: belief.lastSeen?.toISOString() ?? null,
          },
    assets: byKind(await assetsForConcept(db, slug, cliScope())),
  };
}

async function showCollection(db: Db, id: string): Promise<ShowCollection | null> {
  const found = (await db.select().from(collection).where(eq(collection.id, id)).limit(1))[0];
  if (found === undefined) return null;

  const children = await db
    .select({ id: collection.id, kind: collection.kind, title: collection.title })
    .from(collection)
    .where(and(eq(collection.parentId, id), isNull(collection.archivedAt)))
    .orderBy(asc(collection.position), asc(bytewise(collection.id)));

  const items = await db
    .select({
      id: curriculumItem.id,
      title: curriculumItem.title,
      subtopics: curriculumItem.subtopics,
    })
    .from(curriculumItem)
    .where(and(eq(curriculumItem.collectionId, id), isNull(curriculumItem.archivedAt)))
    .orderBy(asc(curriculumItem.position), asc(bytewise(curriculumItem.id)));

  const topicRow = (
    await db
      .select({ topicSlug: collectionItem.topicSlug })
      .from(collectionItem)
      .where(and(eq(collectionItem.collectionId, id), isNotNull(collectionItem.topicSlug)))
      .limit(1)
  )[0];

  const assets = await assetsForCollection(db, id, cliScope());

  return {
    type: "collection",
    id: found.id,
    kind: found.kind,
    slug: found.slug,
    title: found.title,
    parentId: found.parentId,
    metadata: found.metadata,
    topicSlug: topicRow?.topicSlug ?? null,
    archived: found.archivedAt !== null,
    children,
    curriculumItems: items.map((i) => ({
      id: i.id,
      title: i.title,
      subtopics: Array.isArray(i.subtopics) ? (i.subtopics as string[]) : [],
    })),
    assets: byKind(assets),
  };
}

async function showCurriculumItem(db: Db, id: string): Promise<ShowCurriculumItem | null> {
  const found = (
    await db.select().from(curriculumItem).where(eq(curriculumItem.id, id)).limit(1)
  )[0];
  if (found === undefined) return null;

  const topics = await db
    .select({ slug: curriculumItemTopic.topicSlug })
    .from(curriculumItemTopic)
    .where(eq(curriculumItemTopic.curriculumItemId, id))
    .orderBy(asc(bytewise(curriculumItemTopic.topicSlug)));

  const concepts = await db
    .select({ slug: concept.slug, title: concept.title })
    .from(conceptCurriculumItem)
    .innerJoin(concept, eq(concept.slug, conceptCurriculumItem.conceptSlug))
    .where(eq(conceptCurriculumItem.curriculumItemId, id))
    .orderBy(asc(bytewise(concept.slug)));

  return {
    type: "curriculumItem",
    id: found.id,
    title: found.title,
    collectionId: found.collectionId,
    subtopics: Array.isArray(found.subtopics) ? (found.subtopics as string[]) : [],
    archived: found.archivedAt !== null,
    topics: topics.map((t) => t.slug),
    concepts,
  };
}

async function showAsset(db: Db, id: string): Promise<ShowAsset | null> {
  const found = (await db.select().from(asset).where(eq(asset.id, id)).limit(1))[0];
  if (found === undefined) return null;

  const topics = await db
    .select({ slug: assetTopic.topicSlug })
    .from(assetTopic)
    .where(eq(assetTopic.assetId, id))
    .orderBy(asc(bytewise(assetTopic.topicSlug)));

  const concepts = await db
    .select({ slug: assetConcept.conceptSlug })
    .from(assetConcept)
    .where(eq(assetConcept.assetId, id))
    .orderBy(asc(bytewise(assetConcept.conceptSlug)));

  // Both directions of `asset_derivation`, from `../state/assets.ts` rather
  // than from four statements written out here: the web app may import that
  // module and may not import this one, and one implementation is what stops
  // `catalog show` and a page disagreeing about what an asset was made from.
  const derivations = await assetDerivations(db, id, cliScope());

  const mirrors = await db
    .select({
      destination: mirror.destination,
      root: mirror.root,
      status: mirror.status,
      compared: mirror.compared,
      bytes: mirror.bytes,
      mtime: mirror.mtime,
      checkedAt: mirror.checkedAt,
    })
    .from(mirror)
    .where(eq(mirror.assetId, id))
    .orderBy(asc(bytewise(mirror.destination)));

  return {
    type: "asset",
    id: found.id,
    kind: found.kind,
    path: found.path,
    url: found.url,
    contentHash: found.contentHash,
    bytes: found.bytes,
    title: found.title,
    sourceRepo: found.sourceRepo,
    topics: topics.map((t) => t.slug),
    concepts: concepts.map((c) => c.slug),
    derivedFrom: derivations.sources,
    derivedInto: derivations.derived,
    mirrors: mirrors.map((row) => ({
      ...row,
      mtime: row.mtime?.toISOString() ?? null,
      checkedAt: row.checkedAt.toISOString(),
    })),
  };
}

function assetLines(assets: Record<string, AssetRef[]>, indent = "  "): string[] {
  const lines: string[] = [];
  for (const [kind, rows] of Object.entries(assets)) {
    lines.push(`${indent}${kind} (${rows.length})`);
    for (const row of rows) lines.push(`${indent}  ${row.path ?? row.url ?? row.id}`);
  }
  return lines;
}

export function formatShow(result: ShowResult): string {
  const lines: string[] = [];
  const note = (label: string, value: string | null) => {
    if (value !== null && value !== "") lines.push(`${label.padEnd(9)} ${value}`);
  };

  if (result.type === "topic") {
    lines.push(`topic     ${result.slug}`);
    if (result.archived) note("archived", "yes: kept, on no page");
    note("title", result.title);
    note("domain", result.domain);
    note("summary", result.summary);
    if (result.aliases.length > 0) note("aliases", result.aliases.join(", "));
    if (result.concepts.length > 0) {
      lines.push("", `concepts (${result.concepts.length})`);
      for (const c of result.concepts) lines.push(`  ${c.slug}  ${c.path}`);
    }
    if (result.curriculumItems.length > 0) {
      lines.push("", `curriculum items (${result.curriculumItems.length})`);
      for (const i of result.curriculumItems) lines.push(`  ${i.id}  ${i.title}`);
    }
    const assets = assetLines(result.assets);
    if (assets.length > 0) lines.push("", "assets", ...assets);
  } else if (result.type === "concept") {
    lines.push(`concept   ${result.slug}`);
    if (result.archived) note("archived", "yes: kept, on no page");
    note("title", result.title);
    note("summary", result.summary);
    note("topic", result.topicSlug);
    note("path", result.path);
    if (result.mastery !== null) {
      note(
        "mastery",
        `p(L) ${result.mastery.pL.toFixed(2)}, ${result.mastery.correct}/${result.mastery.observations} correct`,
      );
    }
    if (result.requires.length > 0) {
      lines.push("", "requires");
      for (const p of result.requires) lines.push(`  ${p.kind.padEnd(8)} ${p.slug}`);
    }
    if (result.requiredBy.length > 0) {
      lines.push("", "required by");
      for (const p of result.requiredBy) lines.push(`  ${p.kind.padEnd(8)} ${p.slug}`);
    }
    if (result.curriculumItems.length > 0) {
      lines.push("", "curriculum items");
      for (const i of result.curriculumItems) lines.push(`  ${i.id}  ${i.title}`);
    }
    const assets = assetLines(result.assets);
    if (assets.length > 0) lines.push("", "assets", ...assets);
  } else if (result.type === "collection") {
    lines.push(`${result.kind.padEnd(9)} ${result.id}`);
    if (result.archived) note("archived", "yes: its course file no longer lists it");
    note("title", result.title);
    note("parent", result.parentId);
    note("topic", result.topicSlug);
    if (result.children.length > 0) {
      lines.push("", `children (${result.children.length})`);
      for (const c of result.children) lines.push(`  ${c.id}  ${c.title}`);
    }
    if (result.curriculumItems.length > 0) {
      lines.push("", `curriculum items (${result.curriculumItems.length})`);
      for (const i of result.curriculumItems) lines.push(`  ${i.id}  ${i.title}`);
    }
    const assets = assetLines(result.assets);
    if (assets.length > 0) lines.push("", "assets", ...assets);
  } else if (result.type === "curriculumItem") {
    lines.push(`item      ${result.id}`);
    if (result.archived) note("archived", "yes: its course file no longer lists it");
    note("title", result.title);
    note("module", result.collectionId);
    if (result.topics.length > 0) note("topics", result.topics.join(", "));
    if (result.subtopics.length > 0) {
      lines.push("", "subtopics");
      for (const s of result.subtopics) lines.push(`  ${s}`);
    }
    if (result.concepts.length > 0) {
      lines.push("", "concepts");
      for (const c of result.concepts) lines.push(`  ${c.slug}  ${c.title}`);
    }
  } else {
    lines.push(`asset     ${result.id}`);
    note("kind", result.kind);
    note("title", result.title);
    note("path", result.path ?? result.url);
    note("repo", result.sourceRepo);
    note("bytes", result.bytes === null ? null : String(result.bytes));
    note("sha256", result.contentHash);
    if (result.topics.length > 0) note("topics", result.topics.join(", "));
    if (result.concepts.length > 0) note("concepts", result.concepts.join(", "));
    if (result.derivedFrom.length > 0) {
      lines.push("", "derived from");
      for (const a of result.derivedFrom) lines.push(`  ${a.path ?? a.url ?? a.id}`);
    }
    if (result.derivedInto.length > 0) {
      lines.push("", "source of");
      for (const a of result.derivedInto) lines.push(`  ${a.path ?? a.url ?? a.id}`);
    }
    if (result.mirrors.length > 0) {
      lines.push("", "mirrors");
      const width = Math.max(...result.mirrors.map((m) => m.destination.length));
      for (const m of result.mirrors) {
        lines.push(
          `  ${m.destination.padEnd(width)}  ${m.status.padEnd(7)} by ${m.compared.padEnd(10)} ` +
            `checked ${m.checkedAt}`,
        );
      }
    }
  }

  if (result.alternatives !== undefined && result.alternatives.length > 0) {
    lines.push("", `also names a ${result.alternatives.join(" and a ")} with the same id`);
  }
  return lines.join("\n");
}
