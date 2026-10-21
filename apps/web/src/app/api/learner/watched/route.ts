import { appendEvent, assetsByIds, StateError } from "@gnosia/catalog/state";

import { BadRequest, handler } from "@/lib/learner-api";
import { ownerScope } from "@/lib/owner";

/**
 * The longest asset id accepted. Ids are `<source>:<path>` and a manimkc path
 * runs deep (the longest in the catalog today is 117 characters), so the
 * 128-character cap `requireId` applies to curriculum ids would refuse real
 * rows within a folder or two. This still bounds the lookup.
 */
export const MAX_ASSET_ID_CHARS = 512;

/**
 * Mark a library asset watched (a video) or read (anything else).
 *
 * Appends one `watched` event, `{ asset, kind }`, with no concept: watching is
 * study and never evidence, so it moves no p(L) and schedules
 * no card (`EVENT_TYPES` in `packages/schema/src/shared.ts` has the rule).
 * Every press appends, so watching twice is two events, the same way a second
 * review is a second row.
 *
 * The id has to name a row. `event.payload` has no foreign key, so without the
 * lookup a typo would land in an append-only log forever; a missing row is a
 * `StateError`, which the shared handler turns into a 400.
 */
export const POST = handler(
  "watched",
  (body) => {
    const value = body.assetId;
    if (typeof value !== "string" || value.trim() === "") {
      throw new BadRequest('"assetId" is required and must be a non-empty string.');
    }
    if (value.length > MAX_ASSET_ID_CHARS) {
      throw new BadRequest(`"assetId" is longer than ${MAX_ASSET_ID_CHARS} characters.`);
    }
    return { assetId: value };
  },
  async (db, { assetId }, owner) => {
    const [row] = await assetsByIds(db, [assetId], ownerScope(owner));
    if (row === undefined) throw new StateError(`no asset in the catalog for "${assetId}"`);
    const event = await appendEvent(db, { type: "watched", asset: row.id, kind: row.kind }, owner);
    return { assetId: row.id, at: event.at };
  },
);
