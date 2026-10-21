import { cleanDisplayName, DISPLAY_NAME_MAX } from "@gnosia/schema/shared";
import { writeDisplayName } from "@gnosia/catalog/state";

import { BadRequest, handler } from "@/lib/learner-api";

/**
 * What the learner asked to be called: `learner.display_name`, set on
 * Settings and shown at the foot of the sidebar. A string, or null or an
 * empty one to clear it; stored cleaned (`cleanDisplayName`) and refused past
 * `DISPLAY_NAME_MAX` characters rather than cut, so what is saved is what was
 * typed. Answers with the stored value.
 */
export const POST = handler(
  "name",
  (body) => {
    const name = body.name;
    if (name !== null && typeof name !== "string") throw new BadRequest('"name" must be a string, or null to clear it.');
    const cleaned = cleanDisplayName(name);
    if (cleaned !== null && cleaned.length > DISPLAY_NAME_MAX) {
      throw new BadRequest(`"name" must be at most ${DISPLAY_NAME_MAX} characters.`);
    }
    return cleaned;
  },
  (db, name, owner) => writeDisplayName(db, name, owner),
);
