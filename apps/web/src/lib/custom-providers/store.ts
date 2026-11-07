import "server-only";

import {
  readOwnerCustomProviders as readOwnerCustomProvidersCore,
  type CustomProvider,
} from "@gnosia/tutor/server/custom-providers";

import { catalogDatabase } from "@/lib/learner-store";

/**
 * The providers the owner adds themselves (docs/TUTOR-MODELS.md, T14). The
 * reads and writes live in `@gnosia/tutor/server/custom-providers`; this
 * file hands them this app's pool.
 */

export type { CustomProvider };

export async function readOwnerCustomProviders(owner: string): Promise<CustomProvider[]> {
  return readOwnerCustomProvidersCore(await catalogDatabase(), owner);
}
