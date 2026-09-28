import path from "node:path";

import { fileSource, selectSource, type SelectedSource } from "@self-learn/content";

/**
 * Course data for the tests of pure logic that want real courses: the
 * progress sums, the curriculum lookups, the agent's prompt. A test fixture,
 * not a reader the app has.
 *
 * The app reads its content from the database only (`@/data/source`), and a
 * suite like `progress.test.ts` has no database to ask and no reason to want
 * one: it tests arithmetic over whatever the courses are. So it swaps
 * `contentSource` for this, which reads the export tree through the same
 * parsers the catalog imports with:
 *
 *     vi.mock("@/data/source", async (actual) => ({
 *       ...(await actual<typeof import("@/data/source")>()),
 *       contentSource: fileContentSource,
 *     }));
 *
 * One place names the tree, so the day `content/` goes (phase 3 of
 * docs/CONTENT-MIGRATION.md keeps only `seed/`) is a one-line change here.
 */
export const TEST_CONTENT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");

const files = fileSource(TEST_CONTENT_ROOT);

export function fileContentSource(): SelectedSource {
  return selectSource({ files, variable: "files" });
}
