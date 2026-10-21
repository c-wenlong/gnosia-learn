import path from "node:path";

import { fileSource, selectSource, type SelectedSource } from "@gnosia/content";

/**
 * Course data for the tests of pure logic that want real courses: the
 * progress sums, the curriculum lookups, the agent's prompt. A test fixture,
 * not a reader the app has.
 *
 * The app reads its content from the database only (`@/data/source`), and a
 * suite like `progress.test.ts` has no database to ask and no reason to want
 * one: it tests arithmetic over whatever the courses are. So it swaps
 * `contentSource` for this, which reads the export tree through the same
 * parsers the catalog imports with. The tree is `seed/` (seed/README.md), a
 * fixed slice of the content, so the counts a suite asserts do not move when
 * the owner edits a course:
 *
 *     vi.mock("@/data/source", async (actual) => ({
 *       ...(await actual<typeof import("@/data/source")>()),
 *       contentSource: fileContentSource,
 *     }));
 *
 * Read only: `vitest.setup.ts` fails a test file that changes a byte under
 * `seed/`, and this reader never writes.
 */
export const TEST_CONTENT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "seed");

const files = fileSource(TEST_CONTENT_ROOT);

export function fileContentSource(): SelectedSource {
  return selectSource({ files, variable: "files" });
}
