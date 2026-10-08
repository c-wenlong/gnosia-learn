import { NextResponse } from "next/server";

import { syncByokFromSaved } from "@/lib/byok-sync";
import { KEY_WRITE_RATE_LIMIT, answer, guard, readBody, readProvider } from "@/lib/provider-keys/requests";

export const runtime = "nodejs";

/**
 * `POST { provider }` (D95 of docs/STUDIO-CHAT-FIRST.md): the saved tutor key
 * pushed to the studio runner's `byok.json` — for a provider whose key was
 * stored before the shared-key merge, or while the runner was down. The key
 * is opened server-side, sent to the runner over loopback, and never answers
 * anything about it. 200 `{ ok: true, synced }`, `synced` false when the
 * provider is no BYOK preset, has no saved key, or the runner did not take
 * it.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "write", KEY_WRITE_RATE_LIMIT);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const provider = readProvider(body);
  if (provider instanceof NextResponse) return provider;

  return answer({ ok: true, synced: await syncByokFromSaved(owner, provider) });
}
