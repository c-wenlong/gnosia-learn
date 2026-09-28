import type { TagMeta } from "@self-learn/content";
import { tag } from "@self-learn/schema";
import { asc, desc, eq } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { POSITION_STEP } from "./positions";
import { latestRevisions } from "./revisions";
import { ownedBy, type Owners, CLI_OWNER } from "./scope";
import { type By, KEBAB, type WrittenRevision } from "./topics";
import { writeContent } from "./write";
import { type ExportedType, writeThrough } from "./write-through";

/**
 * The tag writer: `catalog tag add|edit` (docs/CONTENT-MIGRATION.md, Track
 * A). A tag is the cross-course theme a course file's `tags:` names, so its
 * id is permanent and there is no rename: `collection_tag` points at it, and
 * every course would have to move with it. Every write goes through the seam
 * and rewrites `content/tags.yaml` from the rows (D17), since the course
 * reader checks each course's tags against that file while courses are files.
 */

export class TagError extends Error {
  constructor(
    readonly code: "invalid" | "exists" | "missing",
    message: string,
  ) {
    super(message);
    this.name = "TagError";
  }
}

export interface TagWriteResult {
  tag: TagMeta;
  changed: boolean;
  revisions: WrittenRevision[];
  exported: ExportedType[];
}

function required(value: string | undefined, field: string): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") throw new TagError("invalid", `${field} is required and cannot be empty`);
  return trimmed;
}

/**
 * Every tag in the order the home page renders the chips in: the same value
 * `fileSource(root).tags()` returns for the file `catalog export` writes.
 * `owners` scopes it (phase 4); omitted, every owner's tags are read.
 */
export async function readTags(db: CatalogDatabase, owners?: Owners): Promise<TagMeta[]> {
  const rows = await db
    .select({ id: tag.id, label: tag.label, description: tag.description })
    .from(tag)
    .where(ownedBy(tag.ownerId, owners))
    .orderBy(asc(tag.position), asc(tag.id));
  return rows.map((row) => ({ id: row.id, label: row.label, description: row.description ?? "" }));
}

async function latestId(db: CatalogDatabase, id: string): Promise<number | null> {
  return (await latestRevisions(db, "tag", [id])).get(id)?.id ?? null;
}

/**
 * What a tag add can be refused for without the database. The CLI runs it
 * before it connects, so a malformed invocation is exit 2.
 */
export function checkTagInput(input: { id: string; label: string; description: string }): {
  id: string;
  label: string;
  description: string;
} {
  const id = required(input.id, "--id");
  if (!KEBAB.test(id)) throw new TagError("invalid", `--id "${id}" is not kebab-case`);
  // The file's reader requires a description, so the export must always have one to write.
  return { id, label: required(input.label, "--label"), description: required(input.description, "--description") };
}

/** `catalog tag add --id --label --description`: a new theme, at the end of the list. */
export async function addTag(
  db: CatalogDatabase,
  input: { id: string; label: string; description: string },
  by: By,
): Promise<TagWriteResult> {
  const { id, label, description } = checkTagInput(input);
  const done = await writeThrough(db, ["tags"], async (tx) => {
    const [existing] = await tx.select().from(tag).where(eq(tag.id, id));
    if (existing !== undefined) {
      throw new TagError("exists", `tag "${id}" already exists ("${existing.label}"). Edit it with \`catalog tag edit ${id}\`.`);
    }
    const [last] = await tx.select({ position: tag.position }).from(tag).orderBy(desc(tag.position)).limit(1);
    return writeContent(tx, {
      owner: CLI_OWNER,
      type: "tag",
      id,
      op: "create",
      next: { row: { id, label, description, position: (last?.position ?? 0) + POSITION_STEP } },
      base: await latestId(tx, id),
      ...by,
    });
  });
  return {
    tag: { id, label, description },
    changed: done.value.changed,
    revisions: [{ type: "tag", id, revisionId: done.value.revisionId, op: done.value.op, changed: done.value.changed }],
    exported: done.exported,
  };
}

/** `catalog tag edit <id> [--label] [--description]`. Never the id. */
export async function editTag(
  db: CatalogDatabase,
  input: { id: string; label?: string; description?: string },
  by: By,
): Promise<TagWriteResult> {
  const id = required(input.id, "the tag");
  const done = await writeThrough(db, ["tags"], async (tx) => {
    const [row] = await tx.select().from(tag).where(eq(tag.id, id));
    if (row === undefined) throw new TagError("missing", `no tag "${id}" in the catalog`);
    const next = {
      ...row,
      ...(input.label === undefined ? {} : { label: required(input.label, "--label") }),
      ...(input.description === undefined ? {} : { description: required(input.description, "--description") }),
    };
    const result = await writeContent(tx, { owner: CLI_OWNER, type: "tag", id, next: { row: next }, base: await latestId(tx, id), ...by });
    return { result, next };
  });
  const { result, next } = done.value;
  return {
    tag: { id, label: next.label, description: next.description ?? "" },
    changed: result.changed,
    revisions: result.changed
      ? [{ type: "tag", id, revisionId: result.revisionId, op: result.op, changed: true }]
      : [],
    exported: done.exported,
  };
}
