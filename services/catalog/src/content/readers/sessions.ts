import { notMigrated, type TypeReader } from "./reader";

/**
 * The database reader for `sessions`: one session log by its id, as
 * `SessionLogSource`, its entries concatenated, or null.
 *
 * Track C's file (docs/CONTENT-MIGRATION.md, phase 1). It implements
 * `read` from rows, returning exactly what `fileSource` returns for the same
 * content, and sets `ready: true` in the same change; nothing outside this
 * file needs to change for `catalog flip sessions` to accept the type.
 */
export const reader: TypeReader<"sessionLog"> = { ready: false, read: notMigrated("sessions") };
