import { notMigrated, type TypeReader } from "./reader";

/**
 * The database reader for `tags`: the cross-course themes, as `TagMeta[]` in
 * authored order.
 *
 * Track A's file (docs/CONTENT-MIGRATION.md, phase 1). It implements
 * `read` from rows, returning exactly what `fileSource` returns for the same
 * content, and sets `ready: true` in the same change; nothing outside this
 * file needs to change for `catalog flip tags` to accept the type.
 */
export const reader: TypeReader<"tags"> = { ready: false, read: notMigrated("tags") };
