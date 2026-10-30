import { PROVIDER_IDS, providerLabel, type ProviderName } from "@gnosia/schema/shared";
import { NextResponse } from "next/server";

import { keyFor } from "@gnosia/tutor/providers";
import { answer, guard, readBody, readProvider, refuse } from "@/lib/provider-keys/requests";
import { failureCode, openSavedKeys } from "@/lib/provider-keys/store";
import { CHAIN_WRITE_RATE_LIMIT, chainFailed, readModel } from "@/lib/tutor-models/requests";
import { addChainEntry, moveChainEntry, removeChainEntry, setChainEntry } from "@/lib/tutor-models/store";

export const runtime = "nodejs";

/**
 * The owner's model chain (docs/TUTOR-MODELS.md): the provider and model
 * pairs the tutor tries, top to bottom.
 *
 * `POST { provider, model }` adds an entry at the bottom. `PUT { provider,
 * model }` makes the entry the whole chain (T16): Model selection's pick,
 * replaced in one write so a refused save keeps the chain it would have
 * replaced. `DELETE { provider, model }` removes one. `PATCH { provider,
 * model, direction: "up" | "down" }` moves one a place. Each answers 200
 * `{ ok: true, chain }`, the whole chain after the change, top first.
 *
 * 400 `BAD_REQUEST` for a body that is not a provider and a model id of the
 * right shape (a model id that looks like, or is, an API key included), 400
 * `NO_KEY` when adding for a provider nothing holds a key for, 409 `DUPLICATE` or `FULL`, 404 `NOT_FOUND` for an entry that is not
 * there, 403 from another origin, 429, 401 with no session, 503
 * `STORE_UNAVAILABLE` (the chain, or on an add the saved keys, could not be
 * read). The same guards as the provider-key routes, under
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
  const gate = await keyGate(read.owner, read.provider, read.model, "added");
  if (gate instanceof NextResponse) return gate;

  try {
    return answer({ ok: true, chain: await addChainEntry(read.owner, read.provider, read.model, gate.serverKey) });
  } catch (error) {
    return chainFailed("add", error);
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  const read = await entry(req);
  if (read instanceof NextResponse) return read;
  const gate = await keyGate(read.owner, read.provider, read.model, "saved");
  if (gate instanceof NextResponse) return gate;

  try {
    return answer({ ok: true, chain: await setChainEntry(read.owner, read.provider, read.model, gate.serverKey) });
  } catch (error) {
    return chainFailed("saved", error);
  }
}

/**
 * The key gate an add and a replace share (docs/TUTOR-MODELS.md): Settings
 * offers only providers with a key, and the route holds the same rule — a
 * key removed later leaves the entry in place, skipped (T4). A saved key
 * that cannot be read because the database is down is not "no key": say so,
 * and let the person try again. Answers the refusal, or the server's
 * key-holding for the write's own under-lock check.
 */
async function keyGate(
  owner: string,
  provider: ProviderName,
  model: string,
  what: "added" | "saved",
): Promise<NextResponse | { serverKey: boolean }> {
  let saved: Partial<Record<ProviderName, string>>;
  try {
    saved = await openSavedKeys(owner);
  } catch (error) {
    console.warn(`tutor model ${what === "added" ? "add" : "set"}: saved provider keys unavailable (${failureCode(error)})`);
    return refuse(`Not ${what}: your saved keys could not be read just now. Try again in a moment.`, "STORE_UNAVAILABLE", 503);
  }
  if (keyFor(provider, saved) === null) {
    return refuse(`There is no key for ${providerLabel(provider)}. Add one under Providers first.`, "NO_KEY");
  }
  // A key pasted into the model field would be stored in the clear and
  // exported (T11). `checkModelId` refuses anything shaped like a key; this
  // refuses the owner's own keys, saved or server, for every provider,
  // whatever their shape. Neither answer repeats what was sent.
  if (echoesKey(model, saved)) {
    return refuse("That is one of your API keys, not a model id. Keys go in a provider's API key field.");
  }
  return { serverKey: keyFor(provider, {}) !== null };
}

/** Whether `model` is, holds, or is a long part of any key the tutor could call with. */
function echoesKey(model: string, saved: Partial<Record<ProviderName, string>>): boolean {
  // The server's keys come through `keyFor`; every saved key is checked as
  // well, a custom provider's included, which `PROVIDER_IDS` does not name.
  const keys = [
    ...PROVIDER_IDS.flatMap((id) => {
      const key = keyFor(id, saved);
      return key === null ? [] : [key.apiKey];
    }),
    ...Object.values(saved).filter((key): key is string => typeof key === "string" && key !== ""),
  ];
  return keys.some((key) => model.includes(key) || (model.length >= 12 && key.includes(model)));
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
