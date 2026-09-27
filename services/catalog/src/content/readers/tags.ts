import { readTags } from "../tags";
import type { TypeReader } from "./reader";

/**
 * The database reader for `tags`: the cross-course themes, as `TagMeta[]` in
 * the order the home page renders the chips in.
 *
 * Track A's file (docs/CONTENT-MIGRATION.md, phase 1). The same rows, in the
 * same order, as the export that writes `content/tags.yaml`, so it returns
 * what `fileSource(root).tags()` returns for the database's own export;
 * `test/topic-readers.test.ts` holds the two equal.
 */
export const reader: TypeReader<"tags"> = {
  ready: true,
  read: (db) => () => readTags(db),
};
