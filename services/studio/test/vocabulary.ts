import type { CatalogResult } from "../src/data/catalog";
import type { Vocabulary } from "../src/diagram/brief";

/**
 * The vocabulary the studio's tests draw against.
 *
 * The studio reads topics only through `catalog topic ls` now, so a suite that
 * validates a brief either fakes that call with {@link topicListAnswer} or, when
 * the vocabulary is not what it tests, is handed {@link testVocabulary}
 * directly. Either way nothing reads the owner's database or a file under
 * `content/`, which phase 3 of docs/CONTENT-MIGRATION.md deletes.
 */

/** Two topics, in the shape `catalog topic ls --json` prints them. */
export const TOPICS = [
  {
    slug: "vector-and-linear-algebra-basics",
    title: "Vectors and linear algebra basics",
    domain: "mathematics",
    summary: null,
    aliases: [],
    relations: [],
    maps: { manimkc: [], courses: [], concepts: ["dot-product", "vector-projection"] },
    incoming: [],
  },
  {
    slug: "tcp-congestion-control",
    title: "TCP congestion control",
    domain: "networking",
    summary: "How a sender backs off.",
    aliases: ["congestion control"],
    relations: [],
    maps: { manimkc: [], courses: [], concepts: [] },
    incoming: [],
  },
];

/** A successful `catalog topic ls`, as `catalog.ts` hands it back. */
export function topicListAnswer(topics: unknown[] = TOPICS): CatalogResult {
  return {
    ok: true,
    json: { database: "postgres://localhost:5432/test", verb: "ls", topics },
    error: null,
    offline: false,
  };
}

/** The catalog down: the CLI's exit 3, as `catalog.ts` reports it. */
export function topicListDown(): CatalogResult {
  return {
    ok: false,
    json: null,
    error: "catalog topic ls exited 3: connect ECONNREFUSED 127.0.0.1:5432",
    offline: true,
  };
}

/** The same two topics as a `Vocabulary`, for a suite that is not testing the read. */
export function testVocabulary(): Vocabulary {
  return {
    topics: new Map(TOPICS.map((t) => [t.slug, { title: t.title, concepts: [...t.maps.concepts] }])),
    entries: TOPICS.map((topic) => {
      const entry: Partial<(typeof TOPICS)[number]> = { ...topic };
      delete entry.incoming;
      return entry as Vocabulary["entries"][number];
    }),
    readAt: new Date().toISOString(),
    stale: false,
  };
}
