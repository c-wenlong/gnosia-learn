import { type BlobStore, key as blobKey } from "@gnosia/blob";
import { isSourceUrl } from "@gnosia/content";
import { collection, LOCAL_LEARNER_ID, type RevisionOp } from "@gnosia/schema";
import { eq } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { openBlobStore, uploadBlob } from "./blob";
import { CourseWriteError, summarise, type WriteThroughSummary } from "./courses";
import { type CoverCredit, CoverImageError, type CoverImage, readCoverImage, storedCredit } from "./cover-image";
import { latestRevisions, lockEntity } from "./revisions";
import { writeContents } from "./write";
import { writeThrough } from "./write-through";

/**
 * `catalog course cover <id>`: set, replace or clear one course's cover photo.
 *
 * A cover is two things on the course's `collection` row: the image's blob
 * key in `cover_blob_key` and its credit (photographer, source page,
 * licence) in `metadata.coverCredit`. The database holds both or neither
 * (`collection_cover_credit_check`), so a photo cannot arrive without the
 * licence it is used under.
 *
 * **Setting one** follows the order every blob writer keeps
 * (docs/CONTENT-MIGRATION.md 0.4, `uploadBlob`): the file is read and
 * checked first (a WebP, JPEG or PNG by its bytes, at most
 * `COURSE_COVER_MAX_BYTES`), then stored, its `blob_object` row pending until
 * the store confirms it, and only then is the course row pointed at the key,
 * in one transaction through the write seam, with a revision carrying the
 * reason. So no row ever names bytes the store does not hold. The key is the
 * hash, so setting the same image and credit again uploads nothing and
 * appends no revision, which is what makes the move script safe to rerun.
 *
 * **Clearing one** writes the row without the key and the credit. The blob
 * stays: an earlier revision names it, and content addressing is what keeps
 * an old revision resolvable (D5). `catalog blob audit` lists it as
 * unreferenced once nothing points at it.
 *
 * **Refused**, before anything is stored: a course that does not exist or is
 * archived, an id that is a module, a course another owner holds, an image of
 * any other type or size, and a credit with a field missing or a source that
 * is not an http(s) URL. While a type is still on files (D17) the course file
 * and its cover image are rewritten in the tree courses were imported from,
 * through the shared write-through; after the cut-over nothing is written but
 * rows.
 */

export interface CourseCoverOptions {
  /** The course's id (for every course today, also its slug). */
  course: string;
  /** Whose course it is, and whose store prefix the image goes under. */
  owner?: string;
  reason: string;
  author?: string;
  /** The image and its credit; omitted with `clear`. */
  set?: { file: string } & CoverCredit;
  clear?: boolean;
  /** Check everything and say what would change; store nothing, write nothing. */
  dryRun?: boolean;
  /** The store to put the image in: the one the process opens, unless a test says otherwise. */
  store?: BlobStore;
}

export interface CoverState {
  key: string;
  credit: CoverCredit | null;
}

export interface CourseCoverResult {
  course: string;
  owner: string;
  action: "set" | "clear";
  dryRun: boolean;
  /** The cover the course had before this command. */
  previous: CoverState | null;
  /** The cover it has after (or would have, on a dry run). */
  cover: (CoverState & { sha256: string; bytes: number; mime: string }) | null;
  /** False when the image was already in the store, and on a dry run. */
  uploaded: boolean;
  /** Whether the course row changed: false for the same image and credit again. */
  changed: boolean;
  /** The course's latest revision after the write, or null on a dry run. */
  revisionId: number | null;
  /** What the appended revision records, or null when nothing was appended. */
  op: RevisionOp | null;
  writeThrough: WriteThroughSummary;
}

const NOTHING_WRITTEN: WriteThroughSummary = { written: [], removed: [], recorded: [], conflicts: [] };

/** One credit field: trimmed, one line, not empty. */
function field(value: string, name: string): string {
  const out = value.trim();
  if (out === "") throw new CourseWriteError(`course cover needs --${name}: a cover always carries its credit`);
  if (/[\r\n]/.test(out)) throw new CourseWriteError(`--${name} must be one line`);
  return out;
}

function checkCredit(credit: CoverCredit): CoverCredit {
  const out = {
    photographer: field(credit.photographer, "photographer"),
    source: field(credit.source, "source"),
    licence: field(credit.licence, "licence"),
  };
  if (!isSourceUrl(out.source)) {
    throw new CourseWriteError(`--source "${out.source}" must be an http(s) URL: the page the photo came from`);
  }
  return out;
}

type CollectionRow = typeof collection.$inferSelect;

/** The course row, or the refusal that says why there is none to write. */
async function courseRow(db: CatalogDatabase, id: string, owner: string): Promise<CollectionRow> {
  const [row] = await db.select().from(collection).where(eq(collection.id, id));
  if (row === undefined) throw new CourseWriteError(`no course "${id}" in the catalog. Nothing was written.`);
  if (row.kind !== "course") {
    throw new CourseWriteError(
      `"${id}" is a ${row.kind}, not a course; only a course has a cover${row.parentId === null ? "" : ` (its course is "${row.parentId}")`}. Nothing was written.`,
    );
  }
  if (row.archivedAt !== null) {
    throw new CourseWriteError(`course "${id}" is archived, and an archived course is shown nowhere. Nothing was written.`);
  }
  if (row.ownerId !== owner) {
    throw new CourseWriteError(
      `course "${id}" belongs to ${row.ownerId}, and this command is for ${owner}. Ids are shared across owners ` +
        `(D23 of docs/CONTENT-MIGRATION.md); nothing was stored or written.`,
    );
  }
  return row;
}

function stateOf(row: CollectionRow): CoverState | null {
  return row.coverBlobKey === null ? null : { key: row.coverBlobKey, credit: storedCredit(row.metadata) };
}

function sameCredit(a: CoverCredit | null, b: CoverCredit | null): boolean {
  return a?.photographer === b?.photographer && a?.source === b?.source && a?.licence === b?.licence;
}

export async function setCourseCover(db: CatalogDatabase, options: CourseCoverOptions): Promise<CourseCoverResult> {
  const owner = (options.owner ?? LOCAL_LEARNER_ID).trim();
  const reason = options.reason.trim();
  if (reason === "") {
    throw new CourseWriteError("course cover needs a --reason: every revision carries one, and catalog history shows it");
  }
  if ((options.set === undefined) === (options.clear !== true)) {
    throw new CourseWriteError("course cover takes either --file with its credit, or --clear");
  }
  const action = options.clear === true ? "clear" : "set";
  const dryRun = options.dryRun === true;

  // Everything that can be refused is refused before a byte is stored.
  let image: CoverImage | null = null;
  let credit: CoverCredit | null = null;
  if (options.set !== undefined) {
    credit = checkCredit(options.set);
    try {
      image = await readCoverImage(options.set.file);
    } catch (error) {
      if (error instanceof CoverImageError) throw new CourseWriteError(`${error.message}. Nothing was stored.`);
      throw error;
    }
  }
  const before = await courseRow(db, options.course, owner);
  const previous = stateOf(before);
  const key = image === null ? null : blobKey(owner, image.sha256, image.ext);
  const cover =
    image === null || key === null ? null : { key, credit, sha256: image.sha256, bytes: image.bytes.length, mime: image.mime };
  const changed = (previous?.key ?? null) !== key || !sameCredit(previous?.credit ?? null, credit);

  if (dryRun) {
    return {
      course: options.course,
      owner,
      action,
      dryRun,
      previous,
      cover,
      uploaded: false,
      changed,
      revisionId: null,
      op: null,
      writeThrough: NOTHING_WRITTEN,
    };
  }

  const store = options.store ?? openBlobStore();
  let uploaded = false;
  if (image !== null && options.set !== undefined) {
    uploaded = (
      await uploadBlob(db, store, {
        ownerId: owner,
        file: options.set.file,
        mime: image.mime,
        ext: image.ext,
        sha256: image.sha256,
        bytes: image.bytes.length,
      })
    ).uploaded;
  }

  const { value, exported } = await writeThrough(
    db,
    ["courses"],
    async (tx) => {
      // Read again under the course's lock: what was checked above could
      // have moved, and the write's base must be the revision it builds on.
      await lockEntity(tx, "collection", options.course);
      const row = await courseRow(tx, options.course, owner);
      const latest = (await latestRevisions(tx, "collection", [options.course])).get(options.course);
      const metadata: Record<string, unknown> = { ...(row.metadata as Record<string, unknown>) };
      delete metadata["coverCredit"];
      if (credit !== null) metadata["coverCredit"] = credit;
      const [written] = await writeContents(tx, [
        {
          owner,
          type: "collection",
          id: options.course,
          base: latest?.id ?? null,
          author: options.author ?? LOCAL_LEARNER_ID,
          authorKind: "person",
          reason,
          next: { row: { ...row, metadata, coverBlobKey: key } },
        },
      ]);
      if (written === undefined) throw new Error(`course "${options.course}" was not written`);
      return written;
    },
    { store },
  );

  return {
    course: options.course,
    owner,
    action,
    dryRun,
    previous,
    cover,
    uploaded,
    changed: value.changed,
    revisionId: value.revisionId,
    op: value.op,
    writeThrough: summarise(exported),
  };
}
