import {
  asset,
  assetConcept,
  assetDerivation,
  assetTopic,
  collection,
  collectionItem,
  concept,
  conceptPrerequisite,
  curriculumItem,
  topic,
} from "@self-learn/schema";

import type { CatalogDatabase } from "../src/db";

/**
 * The smallest content half a state test needs.
 *
 * Every state table names a `concept` or a `curriculum_item` through a foreign
 * key, so a scratch database with no content rows cannot hold any state at
 * all. Seeding through the indexers would work and would drag in
 * `content/topics.yaml`, the course YAML and the note frontmatter — a lot of
 * unrelated surface for a test about whether a tick is stored.
 *
 * The graph below is deliberately the shape the propagation rules care about:
 * `beta` requires `alpha`, `gamma` requires `beta`, so a correct answer on
 * `gamma` has two hops to travel and `alpha` is reached once rather than twice.
 */

export const TOPIC_SLUG = "fixture-topic";
export const CONCEPTS = ["alpha", "beta", "gamma"] as const;
export const ITEMS = ["fx-m1-t1", "fx-m1-t2"] as const;

export async function seedContent(db: CatalogDatabase): Promise<void> {
  await db
    .insert(topic)
    .values({ slug: TOPIC_SLUG, title: "Fixture topic", domain: "fixtures" })
    .onConflictDoNothing();

  await db
    .insert(concept)
    .values(
      CONCEPTS.map((slug) => ({
        slug,
        title: slug[0]?.toUpperCase() + slug.slice(1),
        topicSlug: TOPIC_SLUG,
        path: `learn/concepts/fixtures/${slug}.md`,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(conceptPrerequisite)
    .values([
      { conceptSlug: "beta", prerequisiteSlug: "alpha", kind: "requires" },
      { conceptSlug: "gamma", prerequisiteSlug: "beta", kind: "requires" },
    ])
    .onConflictDoNothing();

  await db
    .insert(collection)
    .values([
      { id: "fx", kind: "course", slug: "fx", title: "Fixture course", position: 0 },
      {
        id: "fx-m1",
        kind: "module",
        slug: "m1",
        title: "Fixture module",
        parentId: "fx",
        position: 0,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(curriculumItem)
    .values(
      ITEMS.map((id, position) => ({
        id,
        collectionId: "fx-m1",
        position,
        title: `Item ${position + 1}`,
      })),
    )
    .onConflictDoNothing();
}

/**
 * The graph `buildGraph` would produce for the seeded concepts, in the shape
 * `replayMastery` wants. Built by hand rather than read off disk, because the
 * fixture concepts have no notes.
 */
export function fixtureGraph() {
  const requires: Record<string, string[]> = { alpha: [], beta: ["alpha"], gamma: ["beta"] };
  const nodes = new Map(
    CONCEPTS.map((slug) => [
      slug,
      { id: slug, title: slug, requires: requires[slug] ?? [], assumes: [], ordering: requires[slug] ?? [] },
    ]),
  );
  return { nodes };
}

/**
 * A handful of assets over the same fixture graph, for the asset queries.
 *
 * Separate from `seedContent` because two other suites call that one and
 * neither has any business growing an asset table underneath it.
 *
 * **The membership rows are built the way `src/index/courses.ts` builds them**,
 * and that is the point of this fixture rather than a detail of it. The first
 * version hand-wrote an asset-backed `collection_item` for `fx-m1`, which no
 * indexer has ever produced: the module rows are all topic-backed, and the
 * course YAML's resources become `asset_topic` rows. So the test passed against
 * a shape that does not exist while `assetsForCollection` returned nothing for
 * every real collection.
 *
 * `fx-m1` is therefore shaped exactly like an indexed module: one topic member,
 * with the resource link hanging off the topic. `fx-d1` is a deck, and carries
 * the two member shapes the CHECK constraint permits and no indexer writes yet,
 * so the query is exercised over all three branches.
 *
 * The kinds are chosen so that ordering is provable. The queries sort by kind
 * then id, and `diagram_svg` sorts before `video`, which is the opposite of the
 * insertion order below.
 */
export const ASSETS = {
  video: "fx:video",
  diagram: "fx:diagram",
  transcript: "fx:transcript",
  link: "fx:link",
  pinned: "fx:pinned",
  orphan: "fx:orphan",
} as const;

/** The deck that holds the member shapes no indexer writes. Created here. */
export const DECK_ID = "fx-d1";

export async function seedAssets(db: CatalogDatabase): Promise<void> {
  await db
    .insert(asset)
    .values([
      {
        id: ASSETS.video,
        kind: "video",
        path: "out/fixtures/alpha/alpha.mp4",
        title: "Alpha, animated",
        bytes: 1024,
        sourceRepo: "manimkc",
      },
      {
        id: ASSETS.diagram,
        kind: "diagram_svg",
        path: "learn/assets/alpha.svg",
        title: "Alpha, drawn",
        sourceRepo: "tldrawkc",
      },
      {
        id: ASSETS.transcript,
        kind: "transcript",
        path: "out/fixtures/alpha/alpha.vtt",
        sourceRepo: "manimkc",
      },
      {
        id: ASSETS.link,
        kind: "link",
        url: "https://example.invalid/alpha",
        title: "Somebody else's alpha",
        sourceRepo: "self-learn",
      },
      // Named by a collection directly, and by nothing else. The only way it
      // comes back is the `asset_id` branch.
      {
        id: ASSETS.pinned,
        kind: "note",
        path: "learn/concepts/fixtures/pinned.md",
        sourceRepo: "self-learn",
      },
      // About nothing: no topic, no concept, in no collection. The queries must
      // not reach it, which is the only thing it is here to prove.
      {
        id: ASSETS.orphan,
        kind: "note",
        path: "learn/concepts/fixtures/unfiled.md",
        sourceRepo: "self-learn",
      },
    ])
    .onConflictDoNothing();

  // The link is a course resource, and `courses.ts` files those under the
  // module's topic rather than against the module. That is the whole reason a
  // module's assets have to be resolved through its topic.
  await db
    .insert(assetTopic)
    .values([
      { assetId: ASSETS.video, topicSlug: TOPIC_SLUG },
      { assetId: ASSETS.diagram, topicSlug: TOPIC_SLUG },
      { assetId: ASSETS.transcript, topicSlug: TOPIC_SLUG },
      { assetId: ASSETS.link, topicSlug: TOPIC_SLUG },
    ])
    .onConflictDoNothing();

  // Narrower than the topic link, and deliberately not the same set: `beta` has
  // the diagram and nothing else, so "a concept with fewer assets than its
  // topic" is a case the tests can see.
  await db
    .insert(assetConcept)
    .values([
      { assetId: ASSETS.video, conceptSlug: "alpha" },
      { assetId: ASSETS.diagram, conceptSlug: "alpha" },
      { assetId: ASSETS.diagram, conceptSlug: "beta" },
    ])
    .onConflictDoNothing();

  await db
    .insert(collection)
    .values({ id: DECK_ID, kind: "deck", slug: "d1", title: "Fixture deck", position: 0 })
    .onConflictDoNothing();

  await db
    .insert(collectionItem)
    .values([
      // A module, exactly as `courses.ts` writes one: its topic, and nothing
      // else. `assetId` and `conceptSlug` are null here in every real row.
      { collectionId: "fx-m1", position: 0, topicSlug: TOPIC_SLUG },
      // The other two branches the CHECK allows. `alpha` and `beta` share the
      // diagram, which is what makes the deduplication observable.
      { collectionId: DECK_ID, position: 0, conceptSlug: "alpha" },
      { collectionId: DECK_ID, position: 1, conceptSlug: "beta" },
      { collectionId: DECK_ID, position: 2, assetId: ASSETS.pinned },
    ])
    .onConflictDoNothing();

  await db
    .insert(assetDerivation)
    .values({ assetId: ASSETS.transcript, sourceAssetId: ASSETS.video })
    .onConflictDoNothing();
}
