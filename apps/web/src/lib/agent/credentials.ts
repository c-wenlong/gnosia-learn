import "server-only";

import type { ProviderName } from "@gnosia/schema/shared";
import {
  entryCredential as entryCredentialCore,
  keyTestCredential as keyTestCredentialCore,
  tutorCredentials as tutorCredentialsCore,
} from "@gnosia/tutor/server/credentials";
import type { ChainStep, ProviderCredential } from "@gnosia/tutor/providers";

import { catalogDatabase } from "@/lib/learner-store";

type Env = Record<string, string | undefined>;

/**
 * The owner's provider credentials (docs/BYOK.md, docs/TUTOR-MODELS.md). The
 * resolution itself lives in `@gnosia/tutor/server/credentials`, which
 * the native sidecar calls with its own pool; this file hands it this app's.
 */

export async function tutorCredentials(owner: string, env: Env = process.env): Promise<ChainStep[]> {
  return tutorCredentialsCore(catalogDatabase(), owner, env);
}

export async function keyTestCredential(
  owner: string,
  provider: ProviderName,
  env: Env = process.env,
): Promise<ProviderCredential | null> {
  return keyTestCredentialCore(catalogDatabase(), owner, provider, env);
}

export async function entryCredential(
  owner: string,
  provider: ProviderName,
  model?: string,
  env: Env = process.env,
): Promise<ProviderCredential | null> {
  return entryCredentialCore(catalogDatabase(), owner, provider, model, env);
}
