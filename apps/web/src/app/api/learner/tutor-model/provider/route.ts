import { NextResponse } from "next/server";

import { dropByokProvider } from "@/lib/byok-sync";
import { answer, guard, readBody, readProvider, refuse } from "@/lib/provider-keys/requests";
import { CHAIN_WRITE_RATE_LIMIT, chainFailed } from "@/lib/tutor-models/requests";
import { deleteChainProvider, moveChainProvider } from "@/lib/tutor-models/store";

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
 * chain and the owner's saved key for it goes, in one transaction under the
 * learner lock (`deleteTutorProvider`). An add racing it checks for the key
 * inside the same lock, so no model is ever left without a key. A server key
 * is the environment's and stays.
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
  try {
    const removed = await deleteChainProvider(got.owner, got.provider);
    // The key went with the provider; it leaves `byok.json` too (D95), and
    // the answer says whether the runner's copy is gone.
    const byok = removed.keyRemoved ? await dropByokProvider(got.provider) : undefined;
    return answer({ ok: true, ...removed, ...(byok === undefined ? {} : { byok }) });
  } catch (error) {
    return chainFailed("remove", error);
  }
}
