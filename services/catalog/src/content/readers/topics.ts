import { notMigrated, type TypeReader } from "./reader";

/**
 * The database reader for `topics`: the shared topic vocabulary, as
 * `TopicEntry[]` in authored order, with `maps` and `relations` rebuilt from
 * rows.
 *
 * Track A's file (docs/CONTENT-MIGRATION.md, phase 1). It implements
 * `read` from rows, returning exactly what `fileSource` returns for the same
 * content, and sets `ready: true` in the same change; nothing outside this
 * file needs to change for `catalog flip topics` to accept the type.
 */
export const reader: TypeReader<"topics"> = { ready: false, read: notMigrated("topics") };
