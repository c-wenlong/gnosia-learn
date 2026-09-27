import { notMigrated, type TypeReader } from "./reader";

/**
 * The database reader for `diagrams`: one diagram by its slug, as
 * `DiagramSource` with the document from `diagram.document`, or null.
 *
 * Track D's file (docs/CONTENT-MIGRATION.md, phase 1). It implements
 * `read` from rows, returning exactly what `fileSource` returns for the same
 * content, and sets `ready: true` in the same change; nothing outside this
 * file needs to change for `catalog flip diagrams` to accept the type.
 */
export const reader: TypeReader<"diagram"> = { ready: false, read: notMigrated("diagrams") };
