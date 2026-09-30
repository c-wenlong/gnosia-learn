import { NextResponse } from "next/server";

import { entryCredential } from "@/lib/agent/credentials";
import { testProviderKey } from "@/lib/agent/providers";
import { answer, guard, readBody, readProvider, refuse } from "@/lib/provider-keys/requests";
import { CHAIN_TEST_RATE_LIMIT, chainFailed, readModel } from "@/lib/tutor-models/requests";
import { readChain } from "@/lib/tutor-models/store";

export const runtime = "nodejs";

/**
 * `POST { provider, model }`: one minimal call to exactly that chain entry,
 * its provider's endpoint with its model id and the key the tutor would use
 * (docs/TUTOR-MODELS.md, T2), and what came back.
 *
 * 200 `{ ok: true, provider, model, source, served }` when the provider
 * answered, `served` being the model it says replied; 200 `{ ok: false,
 * provider, model, source, status, message }` when it did not, with
 * `message` the provider's own words, any echo of the key taken out. 404
 * `NOT_FOUND` for an entry not in the owner's chain, 400 `NO_KEY` when nothing
 * holds a key for its provider. The key Test's guards and rate limit, in a
 * bucket of its own.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "test", CHAIN_TEST_RATE_LIMIT, "tutor-model");
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const provider = readProvider(body);
  if (provider instanceof NextResponse) return provider;
  const model = readModel(body);
  if (model instanceof NextResponse) return model;

  // Only an entry the owner holds: Test is for the chain, not for spending a
  // request on any id a caller names.
  try {
    const chain = await readChain(owner);
    if (!chain.some((e) => e.provider === provider && e.model === model)) {
      return refuse("That model is not in the chain.", "NOT_FOUND", 404);
    }
  } catch (error) {
    return chainFailed("read", error);
  }

  const credential = await entryCredential(owner, provider, model);
  if (credential === null) return refuse(`There is no key for ${provider} to test with.`, "NO_KEY");

  const result = await testProviderKey(credential);
  return answer(
    result.ok
      ? { ok: true, provider, model, source: credential.source, served: result.model }
      : { ok: false, provider, model, source: credential.source, status: result.status, message: result.message },
  );
}
