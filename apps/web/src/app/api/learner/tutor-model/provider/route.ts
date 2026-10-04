import { NextResponse } from "next/server";

import { answer, guard, readBody, readProvider, refuse } from "@/lib/provider-keys/requests";
import { failureCode, removeProviderKey } from "@/lib/provider-keys/store";
import { CHAIN_WRITE_RATE_LIMIT, chainFailed } from "@/lib/tutor-models/requests";
import { moveChainProvider, removeChainProvider } from "@/lib/tutor-models/store";

export const runtime = "nodejs";

/**
 * One provider in the Settings Providers card, as a whole
 * (docs/TUTOR-MODELS.md, T12).
 *
 * `PATCH { provider, direction }` moves the provider's models together past
 * the next provider's, which is how the card's provider order is stored: a
 * provider's place is where its models sit in the chain.
 *
 * `DELETE { provider }` is the card's Delete: the provider's models leave the
 * chain, then the owner's saved key for it goes. In that order, so a failure
 * part way leaves a key with no models (the tutor skips it, and Delete again
 * finishes the job) rather than models with no key. A server key is the
 * environment's and stays.
 */

async function read(req: Request) {
  const owner = await guard(req, "write", CHAIN_WRITE_RATE_LIMIT, "tutor-model");
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const provider = readProvider(body);
  if (provider instanceof NextResponse) return provider;
  return { owner, body, provider };
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const got = await read(req);
  if (got instanceof NextResponse) return got;
  const direction = got.body.direction;
  if (direction !== "up" && direction !== "down") return refuse(`"direction" must be "up" or "down".`);
  try {
    return answer({ ok: true, chain: await moveChainProvider(got.owner, got.provider, direction) });
  } catch (error) {
    return chainFailed("move", error);
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const got = await read(req);
  if (got instanceof NextResponse) return got;
  let chain;
  try {
    chain = await removeChainProvider(got.owner, got.provider);
  } catch (error) {
    return chainFailed("remove", error);
  }
  try {
    return answer({ ok: true, chain, keyRemoved: await removeProviderKey(got.owner, got.provider) });
  } catch (error) {
    console.warn(`provider delete: key not removed (${failureCode(error)})`);
    return refuse(
      "Its models were removed, but your key could not be: the database is unreachable. Delete again to finish.",
      "STORE_UNAVAILABLE",
      503,
    );
  }
}
