import { AVATARS, isAvatar } from "@self-learn/schema/shared";
import { writeAvatar } from "@self-learn/catalog/state";

import { BadRequest, handler } from "@/lib/learner-api";

/**
 * The learner's pixel sprite: `learner.avatar`, chosen on Settings' Profile
 * tab and shown at the foot of the sidebar. One of `AVATARS`, refused
 * otherwise; there is no clearing it, since every learner has one. Answers
 * with the stored value.
 */
export const POST = handler(
  "avatar",
  (body) => {
    const avatar = body.avatar;
    if (!isAvatar(avatar)) throw new BadRequest(`"avatar" must be one of ${AVATARS.join(", ")}.`);
    return avatar;
  },
  (db, avatar, owner) => writeAvatar(db, avatar, owner),
);
