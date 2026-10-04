import "server-only";

import { TutorModelError } from "@self-learn/catalog/state";
import { checkModelId } from "@self-learn/schema/shared";
import { NextResponse } from "next/server";

import type { RateLimitRule } from "@/lib/agent/guard";
import { refuse } from "@/lib/provider-keys/requests";
import { failureCode } from "@/lib/provider-keys/store";

/**
 * What the model chain's routes share (docs/TUTOR-MODELS.md): their rate
 * limits, reading a model id from a body, and turning a failure into an
 * answer. The guards themselves are the provider-key routes' `guard`, under
 * the `tutor-model` scope.
 */

/** Add, remove and move: a person clicking, and moving an entry three places is three writes. */
export const CHAIN_WRITE_RATE_LIMIT: RateLimitRule = { limit: 60, windowMs: 60_000 };

/** An entry's Test spends a provider request, as the key Test does. */
export const CHAIN_TEST_RATE_LIMIT: RateLimitRule = { limit: 10, windowMs: 60_000 };

/** A model list is one provider request per form opened; the cache absorbs the rest. */
export const MODEL_LIST_RATE_LIMIT: RateLimitRule = { limit: 20, windowMs: 60_000 };

/** `body.model` as a checked model id, or the 400 to answer with. Never echoes what was sent. */
export function readModel(body: Record<string, unknown>): string | NextResponse {
  const checked = checkModelId(body.model);
  return checked.ok ? checked.model : refuse(checked.reason);
}

const STATUS: Record<TutorModelError["code"], number> = { INVALID: 400, DUPLICATE: 409, FULL: 409, NOT_FOUND: 404, NO_KEY: 400 };

/** A chain change that did not happen: the chain's own refusal, or a database that could not be reached. */
export function chainFailed(what: string, error: unknown): NextResponse {
  if (error instanceof TutorModelError) return refuse(error.message, error.code, STATUS[error.code]);
  console.warn(`tutor model ${what} failed (${failureCode(error)})`);
  return refuse(`Not ${what === "read" ? "read" : "saved"}: the database is unreachable.`, "STORE_UNAVAILABLE", 503);
}
