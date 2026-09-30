import { NextResponse } from "next/server";

import { keyTestCredential } from "@/lib/agent/credentials";
import { testProviderKey } from "@/lib/agent/providers";
import { KEY_TEST_RATE_LIMIT, answer, guard, readBody, readProvider, refuse } from "@/lib/provider-keys/requests";

export const runtime = "nodejs";

/**
 * `POST { provider }`: one minimal call to that provider with the key the
 * tutor would use for it (the owner's saved key, else the server's), and what
 * came back (docs/BYOK.md, decision 3). The model is the one the tutor would
 * call that key with first: the owner's first chain entry for the provider,
 * else its default (docs/TUTOR-MODELS.md).
 *
 * 200 `{ ok: true, provider, source, model, tested }` when the provider
 * accepted the key, `tested` being the model id sent and `model` the one the
 * provider says answered; 200 `{ ok: false, provider, source, status,
 * message, tested }` when it did not,
 * with `message` the provider's own words, any echo of the key taken out.
 * 400 `NO_KEY` when there is no key for that provider to test. The same
 * guards as a save, and a tighter rate limit, since each test spends a
 * provider request.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "test", KEY_TEST_RATE_LIMIT);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const provider = readProvider(body);
  if (provider instanceof NextResponse) return provider;

  const credential = await keyTestCredential(owner, provider);
  if (credential === null) return refuse("There is no key for this provider to test.", "NO_KEY");

  const result = await testProviderKey(credential);
  return answer(
    result.ok
      ? { ok: true, provider, source: credential.source, model: result.model, tested: credential.config.model }
      : {
          ok: false,
          provider,
          source: credential.source,
          status: result.status,
          message: result.message,
          tested: credential.config.model,
        },
  );
}
