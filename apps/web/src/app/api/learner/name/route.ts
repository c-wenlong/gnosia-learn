import { nameTurn } from "@gnosia/tutor/server/learner-writes";

import { turnRoute } from "@/lib/learner-api";

/**
 * What the learner asked to be called: `learner.display_name`, set on
 * Settings and shown at the foot of the sidebar. A string, or null or an
 * empty one to clear it; stored cleaned (`cleanDisplayName`) and refused past
 * `DISPLAY_NAME_MAX` characters rather than cut, so what is saved is what was
 * typed. Answers with the stored value.
 *
 * The parse and the write are `nameTurn` in
 * `@gnosia/tutor/server/learner-writes`, which the sidecar runs too.
 */
export const POST = turnRoute("name", nameTurn);
