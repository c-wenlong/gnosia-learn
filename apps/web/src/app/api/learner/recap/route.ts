import { RECAP_SOURCES, type KnowledgeSource } from "@gnosia/schema/shared";
import { upsertRecap } from "@gnosia/catalog/state";
import { isSessionToken } from "@gnosia/tutor/session-core";

import {
  BadRequest,
  handler,
  optionalBoolean,
  requireId,
  MAX_BODY_BYTES,
} from "@/lib/learner-api";

/**
 * Write, replace or clear one recap.
 *
 * Nothing here trims: `upsertRecap` clamps with `KNOWLEDGE_LIMITS`, the same
 * constants the `recap` table's CHECK constraints are built from, and an
 * entirely empty input clears the row. This route's job is to establish that
 * the shapes are right and hand them over.
 *
 * `requestId` names this one recap. The page makes one per save and sends it
 * again with every retry, so a recap whose answer was lost after it was
 * stored is not counted as a second session when it arrives again.
 */
export const POST = handler(
  "recap",
  (body) => ({
    curriculumItemId: requireId(body, "curriculumItemId"),
    input: {
      summary: text(body.summary, "summary"),
      keyPoints: textList(body.keyPoints, "keyPoints"),
      misconceptions: textList(body.misconceptions, "misconceptions"),
      openQuestions: textList(body.openQuestions, "openQuestions"),
      source: source(body.source),
    },
    countSession: optionalBoolean(body, "countSession", true),
    requestId: requestId(body.requestId),
  }),
  async (db, { curriculumItemId, input, countSession, requestId }, owner) => {
    const saved = await upsertRecap(db, curriculumItemId, input, { countSession, requestId, learnerId: owner });
    return { curriculumItemId, cleared: saved === null, recap: saved };
  },
);

function text(value: unknown, field: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new BadRequest(`"${field}" must be a string.`);
  if (value.length > MAX_BODY_BYTES) throw new BadRequest(`"${field}" is too long.`);
  return value;
}

function textList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new BadRequest(`"${field}" must be an array of strings.`);
  // Bounded before the clamp rather than after, so a caller cannot send a
  // hundred thousand items and have the server spend the time trimming them.
  if (value.length > 1000) throw new BadRequest(`"${field}" has more than 1000 entries.`);
  return value.map((entry, i) => {
    if (typeof entry !== "string") throw new BadRequest(`"${field}[${i}]" must be a string.`);
    return entry;
  });
}

function source(value: unknown): KnowledgeSource {
  if (value === undefined) return "agent";
  if (typeof value !== "string" || !(RECAP_SOURCES as readonly string[]).includes(value)) {
    throw new BadRequest(`"source" must be one of ${RECAP_SOURCES.join(", ")}.`);
  }
  return value as KnowledgeSource;
}

function requestId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isSessionToken(value)) {
    throw new BadRequest(`"requestId" must be a short token of letters, digits, "-" and "_".`);
  }
  return value;
}
