import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

import { type CourseCover, type CourseCoverExtension } from "@gnosia/content";
import { COURSE_COVER_MAX_BYTES, COURSE_COVER_TYPES } from "@gnosia/schema";

/**
 * What a course cover image is, decided from its bytes, never its name.
 *
 * `catalog course cover` and the courses source of `catalog import` both take
 * an image from a file and store it as a blob, and both go through
 * `readCoverImage`: a regular file, not empty, at most
 * `COURSE_COVER_MAX_BYTES`, whose first bytes say WebP, JPEG or PNG. The type
 * comes from those bytes, so a PNG named `.webp` is stored as the PNG it is,
 * and anything else (an SVG, which is a document; a HEIC nobody's browser
 * reads) is refused by name before a byte reaches the store.
 */

export class CoverImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoverImageError";
  }
}

export interface CoverImage {
  bytes: Buffer;
  sha256: string;
  mime: string;
  ext: CourseCoverExtension;
}

/** The image type the bytes begin with, or null for anything but the three. */
export function sniffCover(bytes: Buffer): { mime: string; ext: CourseCoverExtension } | null {
  // RIFF....WEBP: a RIFF container whose form type is WEBP.
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return { mime: COURSE_COVER_TYPES.webp, ext: "webp" };
  }
  // SOI then the first marker's FF.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: COURSE_COVER_TYPES.jpg, ext: "jpg" };
  }
  // The eight-byte PNG signature.
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) {
    return { mime: COURSE_COVER_TYPES.png, ext: "png" };
  }
  return null;
}

/**
 * One cover image, read whole (it is small by rule) and checked. `where` is
 * how the refusal names it: the path a person gave, or the export file.
 */
export async function readCoverImage(file: string, where = file): Promise<CoverImage> {
  let handle;
  try {
    handle = await open(file, "r");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new CoverImageError(
      code === "ENOENT" ? `${where}: no such file` : `${where}: cannot be read (${code ?? (error as Error).message})`,
    );
  }
  try {
    const facts = await handle.stat();
    if (!facts.isFile()) throw new CoverImageError(`${where}: not a regular file`);
    if (facts.size === 0) throw new CoverImageError(`${where}: the file is empty`);
    if (facts.size > COURSE_COVER_MAX_BYTES) {
      throw new CoverImageError(
        `${where}: ${facts.size} bytes, over the ${COURSE_COVER_MAX_BYTES}-byte cap for a cover. A card shows it at ` +
          `960x540 at most; resize it (a WebP at that size is under 100 KB).`,
      );
    }
    const bytes = await handle.readFile();
    const type = sniffCover(bytes);
    if (type === null) {
      throw new CoverImageError(`${where}: not a WebP, JPEG or PNG image by its first bytes, and a cover must be one`);
    }
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), ...type };
  } finally {
    await handle.close();
  }
}

/** The credit a cover carries in `collection.metadata.coverCredit`. */
export interface CoverCredit {
  photographer: string;
  source: string;
  licence: string;
}

/** The three credit fields of an export's `cover:`, in the order the metadata holds them. */
export function creditOf(cover: Pick<CourseCover, "photographer" | "source" | "licence">): CoverCredit {
  return { photographer: cover.photographer, source: cover.source, licence: cover.licence };
}

/** `metadata.coverCredit` read back, or null when it is not the three strings. */
export function storedCredit(metadata: unknown): CoverCredit | null {
  const credit = (metadata as { coverCredit?: unknown } | null)?.coverCredit;
  if (credit === null || typeof credit !== "object") return null;
  const { photographer, source, licence } = credit as Record<string, unknown>;
  if (typeof photographer !== "string" || typeof source !== "string" || typeof licence !== "string") return null;
  return { photographer, source, licence };
}

/** The sha256 and extension a blob key names: `<owner>/<sha256>.<ext>`. */
export function keyParts(key: string): { sha256: string; ext: string } {
  const name = key.slice(key.indexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return { sha256: name.slice(0, dot), ext: name.slice(dot + 1) };
}
