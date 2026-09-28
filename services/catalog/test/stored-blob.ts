import { createHash } from "node:crypto";

import { blobObject, LOCAL_LEARNER_ID } from "@self-learn/schema";

import type { CatalogDatabase } from "../src/db";

/**
 * A `present` blob_object row, for a fixture asset of a stored kind (a video,
 * a sidecar, a poster, a diagram SVG) to name. Since migration 0013 such a row
 * cannot exist without one (`asset_stored_blob_check`), and a fixture that
 * wrote one with a path alone would describe a database that can no longer
 * happen. No bytes go anywhere: suites that read the bytes store them for
 * real. The key is the one `@self-learn/blob` would make for `seed`'s hash.
 */
export async function storedBlob(db: CatalogDatabase, seed: string, ext = "bin"): Promise<string> {
  const sha256 = createHash("sha256").update(seed).digest("hex");
  const key = `${LOCAL_LEARNER_ID}/${sha256}.${ext}`;
  await db
    .insert(blobObject)
    .values({
      key,
      ownerId: LOCAL_LEARNER_ID,
      sha256,
      bytes: Buffer.byteLength(seed),
      mime: "application/octet-stream",
      provider: "fs",
      state: "present",
      confirmedAt: new Date(),
    })
    .onConflictDoNothing();
  return key;
}
