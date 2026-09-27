import { notMigrated, type TypeReader } from "./reader";

/**
 * The database reader for `courses`: every live course, as `Course[]` in
 * `order:`, with archived modules and items left out.
 *
 * Track B's file (docs/CONTENT-MIGRATION.md, phase 1). It implements
 * `read` from rows, returning exactly what `fileSource` returns for the same
 * content, and sets `ready: true` in the same change; nothing outside this
 * file needs to change for `catalog flip courses` to accept the type.
 */
export const reader: TypeReader<"courses"> = { ready: false, read: notMigrated("courses") };
