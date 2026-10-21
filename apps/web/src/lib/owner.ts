import "server-only";

import {
  COMMONS_OWNER,
  LOCAL_LEARNER_ID,
  ownerScope,
  readableOwners,
  type OwnerScope,
} from "@gnosia/schema/shared";
import { cache } from "react";

import { isSignedIn } from "@/lib/auth/session";

/**
 * Whose data a request reads and writes: the tenancy seam (phase 4 of
 * docs/CONTENT-MIGRATION.md).
 *
 * Every catalog read and write the app makes names an owner. State functions
 * take it as `learnerId`, content reads as an `OwnerScope`; none of them is
 * left to its `'local'` default, and `owner-calls.test.ts` fails the build of
 * a call that is. This module is the one place that answers the question, so
 * accounts plug in here and nowhere else.
 *
 * **Today** there is one owner and no accounts. A request carrying the
 * owner's session cookie (`@/lib/auth`) is `local`, the learner id every row
 * already holds, so every read and write resolves exactly as before this seam
 * existed. When accounts arrive, the session names a learner id and this
 * returns it.
 *
 * **No session, no owner.** A request without a valid session gets
 * `NoOwnerError`, never `local`: an owner that could fall back would make a
 * forged or expired cookie read the owner's data, and the whole point of the
 * seam is that nothing reaches the database on a default. The proxy and the
 * `(app)` layout have already turned such a request away, so this is the
 * third lock on the same door, the one that holds if both are ever bypassed.
 */

export { COMMONS_OWNER, ownerScope, readableOwners, type OwnerScope };

/** The request has no signed-in owner. Route handlers answer it with a 401. */
export class NoOwnerError extends Error {
  constructor() {
    super("No signed-in owner: this request carries no valid session.");
    this.name = "NoOwnerError";
  }
}

/**
 * The owner id for this request. Once per server render (`cache`); a route
 * handler, where React does not memoise, asks once per call, which is one
 * HMAC over a cookie.
 */
export const currentOwner = cache(async (): Promise<string> => {
  if (!(await isSignedIn())) throw new NoOwnerError();
  return LOCAL_LEARNER_ID;
});

/** `currentOwner()` as the scope a content read takes: that owner and the commons. */
export async function currentScope(): Promise<OwnerScope> {
  return ownerScope(await currentOwner());
}
