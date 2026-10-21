import { createHash } from "node:crypto";

import { DIAGRAMS_DIR } from "@gnosia/content";

import { canonicalJson } from "./snapshot";

/**
 * What a diagram's stored document is, as bytes and names: the pieces the
 * importer (`index/diagrams.ts`) and the writer (`content/diagrams.ts`) share,
 * kept free of either so neither imports the other.
 *
 * **What a document's bytes are.** jsonb keeps no key order, so the stored
 * document cannot give back the file it was read from byte for byte. Its
 * bytes are therefore defined here, once: the canonical JSON (keys sorted at
 * every depth, no whitespace), which is what the export writes, what a
 * checkout writes, and what `diagram.document_hash` and the `.tldr` asset's
 * `content_hash` are the sha256 of. tldraw reads a document whatever its key
 * order, and parity compares `.tldr` files parsed, so nothing that reads a
 * `.tldr` can tell. The one visible effect is that the first export after the
 * import rewrites each file's key order.
 */

export const DIAGRAM_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The logical names a diagram keeps after its files are gone (D11). */
export function diagramPaths(slug: string): { tldr: string; svg: string } {
  return { tldr: `${DIAGRAMS_DIR}/${slug}.tldr`, svg: `${DIAGRAMS_DIR}/${slug}.svg` };
}

export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The bytes a document is stored, exported and checked out as. */
export function documentBytes(document: unknown): Buffer {
  return Buffer.from(canonicalJson(document), "utf8");
}

export function documentHash(document: unknown): string {
  return sha256(documentBytes(document));
}

/** Why a `.tldr` could not be taken as a document, or null when it can. */
export function documentProblem(parsed: unknown): string | null {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "its top level is not an object";
  }
  if (!Array.isArray((parsed as { records?: unknown }).records)) return 'it has no "records" list';
  return null;
}

/** Shapes on the canvas: records whose `typeName` is `shape`, as `tldrawkc list` counts them. */
export function shapeCount(document: unknown): number {
  const records = (document as { records?: unknown } | null)?.records;
  if (!Array.isArray(records)) return 0;
  return records.filter((r) => (r as { typeName?: unknown } | null)?.typeName === "shape").length;
}
