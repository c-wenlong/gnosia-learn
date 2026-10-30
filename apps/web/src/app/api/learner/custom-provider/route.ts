import { CustomProviderError } from "@gnosia/catalog/state";
import { isCustomProviderId } from "@gnosia/schema/shared";
import { NextResponse } from "next/server";

import { pointsAtThisApp } from "@/lib/custom-providers/self-address";
import { changeCustomProvider, createCustomProvider } from "@/lib/custom-providers/store";
import { answer, guard, readBody, refuse } from "@/lib/provider-keys/requests";
import { checkKeyShape } from "@gnosia/tutor/server/seal";
import { failureCode, NoKeySecretError } from "@/lib/provider-keys/store";
import { CHAIN_WRITE_RATE_LIMIT } from "@/lib/tutor-models/requests";

export const runtime = "nodejs";

/**
 * A provider the owner adds themselves (docs/TUTOR-MODELS.md, T14).
 *
 * `POST { label, baseUrl, key }` makes it: the name and the base URL are
 * checked (`checkBaseUrl`: https, or http to this machine only, and never
 * this app's own port or the studio runner's: `pointsAtThisApp`), the key's
 * shape is checked before anything is stored, and the row and the key,
 * sealed under the id made from the name, are written in one transaction, so
 * a provider never exists without its key. The answer names the new id,
 * never the key.
 *
 * `PATCH { provider, label?, baseUrl?, key? }` renames it, moves it, and
 * replaces its key, all in one transaction: a key that cannot be stored
 * leaves the name and the URL as they were. Its models stay. Its Delete is
 * the provider route's, which removes it whole.
 */

const SELF_ADDRESS = "That address is this app or its studio runner, not a model provider.";

function failed(what: string, error: unknown): NextResponse {
  if (error instanceof CustomProviderError) {
    return refuse(error.message, error.code, error.code === "NOT_FOUND" ? 404 : error.code === "FULL" ? 409 : 400);
  }
  if (error instanceof NoKeySecretError) return refuse("This server has no AUTH_SECRET, so it cannot store a key.", "NO_SECRET", 503);
  console.warn(`custom provider ${what} failed (${failureCode(error)})`);
  return refuse("Not saved: the database is unreachable.", "STORE_UNAVAILABLE", 503);
}

export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "write", CHAIN_WRITE_RATE_LIMIT, "tutor-model");
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  if (pointsAtThisApp(body.baseUrl, req.url)) return refuse(SELF_ADDRESS);
  const shape = checkKeyShape(body.key);
  if (!shape.ok) return refuse(shape.reason);

  try {
    const created = await createCustomProvider(owner, { label: body.label, baseUrl: body.baseUrl }, shape.key);
    return answer({ ok: true, ...created });
  } catch (error) {
    return failed("add", error);
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "write", CHAIN_WRITE_RATE_LIMIT, "tutor-model");
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  if (!isCustomProviderId(body.provider)) return refuse(`"provider" must be the id of one of your providers (custom-…).`);
  if (body.label === undefined && body.baseUrl === undefined && body.key === undefined) {
    return refuse("Send a new name, a new base URL, a new key, or any of them.");
  }
  if (pointsAtThisApp(body.baseUrl, req.url)) return refuse(SELF_ADDRESS);
  let key: string | undefined;
  if (body.key !== undefined) {
    const shape = checkKeyShape(body.key);
    if (!shape.ok) return refuse(shape.reason);
    key = shape.key;
  }
  try {
    const changed = await changeCustomProvider(owner, body.provider, { label: body.label, baseUrl: body.baseUrl }, key);
    return answer({ ok: true, ...changed });
  } catch (error) {
    return failed("change", error);
  }
}
