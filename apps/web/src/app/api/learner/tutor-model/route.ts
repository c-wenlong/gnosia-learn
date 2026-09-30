import { NextResponse } from "next/server";

import { keyFor } from "@/lib/agent/providers";
import { answer, guard, readBody, readProvider, refuse } from "@/lib/provider-keys/requests";
import { failureCode, openSavedKeys } from "@/lib/provider-keys/store";
import { CHAIN_WRITE_RATE_LIMIT, chainFailed, readModel } from "@/lib/tutor-models/requests";
import { addChainEntry, moveChainEntry, removeChainEntry } from "@/lib/tutor-models/store";

export const runtime = "nodejs";

/**
 * The owner's model chain (docs/TUTOR-MODELS.md): the provider and model
 * pairs the tutor tries, top to bottom.
 *
 * `POST { provider, model }` adds an entry at the bottom. `DELETE { provider,
 * model }` removes one. `PATCH { provider, model, direction: "up" | "down" }`
 * moves one a place. Each answers 200 `{ ok: true, chain }`, the whole chain
 * after the change, top first.
 *
 * 400 `BAD_REQUEST` for a body that is not a provider and a model id of the
 * right shape, 400 `NO_KEY` when adding for a provider nothing holds a key
 * for, 409 `DUPLICATE` or `FULL`, 404 `NOT_FOUND` for an entry that is not
 * there, 403 from another origin, 429, 401 with no session, 503
 * `STORE_UNAVAILABLE`. The same guards as the provider-key routes, under
 * their own rate-limit buckets.
 */

async function entry(req: Request) {
  const owner = await guard(req, "write", CHAIN_WRITE_RATE_LIMIT, "tutor-model");
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const provider = readProvider(body);
  if (provider instanceof NextResponse) return provider;
  const model = readModel(body);
  if (model instanceof NextResponse) return model;
  return { owner, body, provider, model };
}

export async function POST(req: Request): Promise<NextResponse> {
  const read = await entry(req);
  if (read instanceof NextResponse) return read;
  const { owner, provider, model } = read;

  // Settings offers only providers with a key; this holds the route to the
  // same rule. A key removed later leaves the entry in place, skipped (T4).
  const saved = await openSavedKeys(owner).catch((error: unknown) => {
    console.warn(`tutor model add: saved provider keys unavailable (${failureCode(error)})`);
    return {};
  });
  if (keyFor(provider, saved) === null) {
    return refuse(`There is no key for ${provider}. Add one under Provider keys first.`, "NO_KEY");
  }

  try {
    return answer({ ok: true, chain: await addChainEntry(owner, provider, model) });
  } catch (error) {
    return chainFailed("add", error);
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const read = await entry(req);
  if (read instanceof NextResponse) return read;
  try {
    return answer({ ok: true, chain: await removeChainEntry(read.owner, read.provider, read.model) });
  } catch (error) {
    return chainFailed("remove", error);
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const read = await entry(req);
  if (read instanceof NextResponse) return read;
  const direction = read.body.direction;
  if (direction !== "up" && direction !== "down") return refuse(`"direction" must be "up" or "down".`);
  try {
    return answer({ ok: true, chain: await moveChainEntry(read.owner, read.provider, read.model, direction) });
  } catch (error) {
    return chainFailed("move", error);
  }
}
