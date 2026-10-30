import { checkDistractor } from "@gnosia/schema";
import { CHECK_DISTRACTOR_LIMITS } from "@gnosia/schema/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { ensureLearner } from "./learner";

/**
 * The tutor's wrong options per note check (`check_distractor`), the one
 * reader and writer of that table. Every call names its learner: a row is
 * that learner's and nobody else's, so a read for one learner never sees
 * another's options, even for a note both can read.
 *
 * The rows are a cache keyed by `check_hash`; deciding whether a row still
 * fits its check (the hash) and what goes in it (the model call) is the
 * tutor package's job (`packages/tutor/src/server/check-options.ts`). This
 * module only stores and returns rows.
 */

/** One check's stored options. */
export interface StoredCheckDistractor {
  conceptSlug: string;
  checkId: string;
  checkHash: string;
  /** Exactly three, as stored. */
  options: string[];
  model: string | null;
  provider: string | null;
}

/** A row's `options`, or null when it is not three strings (a row nothing here wrote). */
function parseOptions(raw: string): string[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length !== CHECK_DISTRACTOR_LIMITS.options) return null;
    return value.every((v) => typeof v === "string") ? (value as string[]) : null;
  } catch {
    return null;
  }
}

/**
 * Every stored row for these concepts, this learner's only. A row whose
 * options do not read as three strings is left out, as if it were missing.
 * Throws when the table is not there (a database behind 0003): the callers
 * treat any failure as no rows.
 */
export async function readCheckDistractors(
  db: CatalogDatabase,
  learnerId: string,
  conceptSlugs: readonly string[],
): Promise<StoredCheckDistractor[]> {
  const slugs = [...new Set(conceptSlugs)];
  if (slugs.length === 0) return [];
  const rows = await db
    .select({
      conceptSlug: checkDistractor.conceptSlug,
      checkId: checkDistractor.checkId,
      checkHash: checkDistractor.checkHash,
      options: checkDistractor.options,
      model: checkDistractor.model,
      provider: checkDistractor.provider,
    })
    .from(checkDistractor)
    .where(and(eq(checkDistractor.learnerId, learnerId), inArray(checkDistractor.conceptSlug, slugs)));
  return rows.flatMap((row) => {
    const options = parseOptions(row.options);
    return options === null ? [] : [{ ...row, options }];
  });
}

/**
 * Store one check's options for this learner, replacing whatever the row
 * held (an older hash's options included). Refuses anything but three
 * strings of at most `CHECK_DISTRACTOR_LIMITS.maxOptionChars` (a
 * `RangeError`), so the table's CHECK is never the first to say so.
 */
export async function writeCheckDistractor(
  db: CatalogDatabase,
  learnerId: string,
  row: Omit<StoredCheckDistractor, "model" | "provider"> & { model?: string | null; provider?: string | null },
): Promise<void> {
  const { options } = row;
  if (
    options.length !== CHECK_DISTRACTOR_LIMITS.options ||
    options.some((o) => typeof o !== "string" || o.trim() === "" || o.length > CHECK_DISTRACTOR_LIMITS.maxOptionChars)
  ) {
    throw new RangeError(
      `A check's wrong options are ${CHECK_DISTRACTOR_LIMITS.options} non-empty strings of at most ${CHECK_DISTRACTOR_LIMITS.maxOptionChars} characters.`,
    );
  }
  await ensureLearner(db, learnerId);
  const values = {
    learnerId,
    conceptSlug: row.conceptSlug,
    checkId: row.checkId,
    checkHash: row.checkHash,
    options: JSON.stringify(options),
    model: row.model ?? null,
    provider: row.provider ?? null,
  };
  await db
    .insert(checkDistractor)
    .values(values)
    .onConflictDoUpdate({
      target: [checkDistractor.learnerId, checkDistractor.conceptSlug, checkDistractor.checkId],
      set: {
        checkHash: values.checkHash,
        options: values.options,
        model: values.model,
        provider: values.provider,
        updatedAt: sql`cast(unixepoch('subsec') * 1000 as integer)`,
      },
    });
}
