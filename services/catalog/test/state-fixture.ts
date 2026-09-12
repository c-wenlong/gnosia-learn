import {
  collection,
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
