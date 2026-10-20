import { diagram } from "@gnosia/schema";
import { and, eq, isNull } from "drizzle-orm";

import { diagramPaths } from "../diagram-document";
import { ownedBy } from "../scope";
import type { TypeReader } from "./reader";

/**
 * The database reader for `diagrams`: one diagram by its slug, as
 * `DiagramSource` with the document from `diagram.document`, or null.
 *
 * Track D's file (docs/CONTENT-MIGRATION.md, phase 1). It answers what
 * `fileSource` answers for the same content: the logical `.tldr` path, the
 * parsed document (the same value, whatever key order the file had, since
 * jsonb keeps none), and the SVG's logical path when the diagram has one,
 * which after Track D names a blob rather than a file (D11). An archived
 * diagram is not there, as a deleted file is not, and neither is another
 * owner's (phase 4).
 */
export const reader: TypeReader<"diagram"> = {
  ready: true,
  read: (db, scope) => async (slug) => {
    if (slug.trim() === "") return null;
    const [row] = await db
      .select({ slug: diagram.slug, document: diagram.document, svgBlobKey: diagram.svgBlobKey })
      .from(diagram)
      .where(and(eq(diagram.slug, slug), isNull(diagram.archivedAt), ownedBy(diagram.ownerId, scope.readable)))
      .limit(1);
    if (row === undefined) return null;
    const paths = diagramPaths(row.slug);
    return { slug: row.slug, path: paths.tldr, document: row.document, svgPath: row.svgBlobKey === null ? null : paths.svg };
  },
};
