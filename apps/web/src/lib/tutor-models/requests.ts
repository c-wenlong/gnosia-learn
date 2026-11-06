import "server-only";

import type { RateLimitRule } from "@/lib/agent/guard";

/**
 * The model chain routes' rate limits (docs/TUTOR-MODELS.md). The guards
 * are the provider-key routes' `guard`, under the `tutor-model` scope, and
 * the writes are the tutor's turns (`settingsRoute`).
 */

/** Add, remove and move: a person clicking, and moving an entry three places is three writes. */
export const CHAIN_WRITE_RATE_LIMIT: RateLimitRule = { limit: 60, windowMs: 60_000 };

/** An entry's Test spends a provider request, as the key Test does. */
export const CHAIN_TEST_RATE_LIMIT: RateLimitRule = { limit: 10, windowMs: 60_000 };

/** A model list is one provider request per form opened; the cache absorbs the rest. */
export const MODEL_LIST_RATE_LIMIT: RateLimitRule = { limit: 20, windowMs: 60_000 };
