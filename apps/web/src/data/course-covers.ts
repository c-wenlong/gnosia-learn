import "server-only";

import { courseCovers } from "@gnosia/catalog/state";
import type { OwnerScope } from "@gnosia/schema/shared";
import { connection } from "next/server";
import { cache } from "react";

import { catalogDatabase } from "@/lib/learner-store";
import { currentScope } from "@/lib/owner";

/**
 * Which courses have a cover photo to show, and the hash that versions its URL
 * (`coverUrl` in `@/lib/course-summary`).
 *
 * A cover is a blob the course row names (`collection.cover_blob_key`, set by
 * `catalog course cover`), read here for the signed-in owner and the commons
 * (phase 4), and only when its upload is confirmed (`present`): a card must
 * not link an image the route would answer with a 404.
 *
 * **It degrades to no covers.** A cover is decoration, so a read that fails
 * (the store's table unreachable, or a database that has not had 0016) costs
 * the photos and not the page: every card draws its code placeholder and the
 * server log says why. The courses themselves are a separate read, which
 * refuses on its own terms (`@/data/source`).
 */
export async function readCourseCovers(scope: OwnerScope): Promise<ReadonlyMap<string, string>> {
  try {
    const covers = await courseCovers(await catalogDatabase(), scope);
    return new Map(
      [...covers].filter(([, cover]) => cover.state === "present").map(([slug, cover]) => [slug, cover.sha256] as const),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`course covers: unavailable, so every card draws its placeholder: ${message}`);
    return new Map();
  }
}

/** Once per render. The owner is resolved outside the fallback: no owner is a refusal, never "no covers". */
export const getCourseCovers = cache(async (): Promise<ReadonlyMap<string, string>> => {
  await connection();
  return readCourseCovers(await currentScope());
});
