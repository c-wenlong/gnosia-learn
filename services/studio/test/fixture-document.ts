/**
 * A `.tldr` a test can leave in `learn/assets/` without breaking another suite.
 *
 * The studio's tests write fixture documents into the real `learn/assets/`,
 * because every path the runner computes is repo-relative and that is the
 * directory it computes. Meanwhile `services/catalog`'s end-to-end test indexes
 * that same directory, vitest runs test files in parallel, and the diagram
 * indexer **refuses an unstamped `.tldr` by name** — which is the rule working
 * exactly as designed, and which turns "a fixture existed for 200ms" into a
 * failure in a suite that has nothing to do with it.
 *
 * So a fixture carries the one thing that refusal is about: a topic that exists
 * in `content/topics.yaml`. An index run that catches one mid-flight writes a
 * row into its own scratch database and drops it with the database, instead of
 * throwing.
 *
 * Found in phase 3, where adding three tests to `queue.test.ts` moved the
 * timing enough to make a latent race fire on every run.
 */

/** A topic that exists in the vocabulary, so the stamp resolves. */
export const FIXTURE_TOPIC = "vector-and-linear-algebra-basics";

/**
 * The smallest document the JSON reader and `tldrawkc list` both understand:
 * the `document:document` record, carrying `meta.tldrawkc`.
 */
export function fixtureDocument(
  over: { topic?: string; title?: string; concepts?: string[] } = {},
): string {
  return JSON.stringify({
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2 },
    records: [
      {
        typeName: "document",
        id: "document:document",
        gridSize: 10,
        name: "",
        meta: {
          tldrawkc: {
            kc: 1,
            topic: over.topic ?? FIXTURE_TOPIC,
            title: over.title ?? "a test fixture",
            concepts: over.concepts ?? [],
          },
        },
      },
    ],
  });
}
