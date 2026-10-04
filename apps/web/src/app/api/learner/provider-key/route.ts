import { isCustomProviderId } from "@self-learn/schema/shared";
import { NextResponse } from "next/server";

import { readOwnerCustomProviders } from "@/lib/custom-providers/store";
import { KEY_WRITE_RATE_LIMIT, answer, guard, readBody, readProvider, refuse } from "@/lib/provider-keys/requests";
import { checkKeyShape } from "@/lib/provider-keys/seal";
import { failureCode, NoKeySecretError, removeProviderKey, saveProviderKey } from "@/lib/provider-keys/store";

export const runtime = "nodejs";

/**
 * The owner's own model provider keys (docs/BYOK.md).
 *
 * `POST { provider, key }` seals and saves a key, replacing the owner's key
 * for that provider: 200 `{ ok: true, key: { provider, last4, updatedAt,
 * readable } }`. `DELETE { provider }` removes it: 200 `{ ok: true, removed }`.
 * 400 `BAD_REQUEST` for a body that is not a provider and a key of the right
 * shape, 403 from another origin, 429, 401 with no session, 503
 * `STORE_UNAVAILABLE` when the database cannot be written, 503 `NO_SECRET`
 * when the deployment has no `AUTH_SECRET` to seal with.
 *
 * Write-only. No answer carries the key or its ciphertext, and nothing is
 * logged but a code: a refused key is refused without repeating it, and a
 * failed write is reported without the driver's message, which would quote
 * the sealed bytes.
 */

export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "write", KEY_WRITE_RATE_LIMIT);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const provider = readProvider(body);
  if (provider instanceof NextResponse) return provider;
  const shape = checkKeyShape(body.key);
  if (!shape.ok) return refuse(shape.reason);

  try {
    // A key is filed under a custom id only while the owner has that provider (T14).
    if (isCustomProviderId(provider) && !(await readOwnerCustomProviders(owner)).some((p) => p.id === provider)) {
      return refuse("That is not one of your providers.", "NOT_FOUND", 404);
    }
    const key = await saveProviderKey(owner, provider, shape.key);
    return answer({ ok: true, key });
  } catch (error) {
    return failed("save", error);
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "write", KEY_WRITE_RATE_LIMIT);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const provider = readProvider(body);
  if (provider instanceof NextResponse) return provider;

  try {
    return answer({ ok: true, removed: await removeProviderKey(owner, provider) });
  } catch (error) {
    return failed("remove", error);
  }
}

function failed(what: string, error: unknown): NextResponse {
  if (error instanceof NoKeySecretError) {
    return refuse("This server has no AUTH_SECRET, so it cannot store a key.", "NO_SECRET", 503);
  }
  console.warn(`provider key ${what} failed (${failureCode(error)})`);
  return refuse("Not saved: the database is unreachable.", "STORE_UNAVAILABLE", 503);
}
