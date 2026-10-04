import { providerLabel } from "@self-learn/schema/shared";
import { NextResponse } from "next/server";

import { entryCredential } from "@/lib/agent/credentials";
import { answer, guard, readBody, readProvider, refuse } from "@/lib/provider-keys/requests";
import { cachedModelList } from "@/lib/tutor-models/model-list";
import { MODEL_LIST_RATE_LIMIT } from "@/lib/tutor-models/requests";

export const runtime = "nodejs";

/**
 * `POST { provider }`: the models that provider lists, for Settings' Add a
 * model (docs/TUTOR-MODELS.md, T2). Fetched on the server from the provider's
 * configured base URL, which no request can change, with the key the tutor
 * would use; the key never reaches the browser. Cached per owner and
 * provider for a few minutes (`cachedModelList`).
 *
 * 200 `{ ok: true, provider, models: [{ id, free? }], cached }`; 200 `{ ok:
 * false, provider, status, message }` when the provider refused or could not
 * be read, `message` redacted as the key Test's is. 400 `NO_KEY` when nothing
 * holds a key for that provider. A POST rather than a GET so the same-origin
 * check applies: a browser sends no `Origin` on a same-origin GET.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "models", MODEL_LIST_RATE_LIMIT, "tutor-model");
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const provider = readProvider(body);
  if (provider instanceof NextResponse) return provider;

  const credential = await entryCredential(owner, provider);
  if (credential === null) return refuse(`There is no key for ${providerLabel(provider)}. Add one under Providers first.`, "NO_KEY");

  const result = await cachedModelList(owner, credential);
  return answer(
    result.ok
      ? { ok: true, provider, models: result.models, cached: result.cached }
      : { ok: false, provider, status: result.status, message: result.message },
  );
}
