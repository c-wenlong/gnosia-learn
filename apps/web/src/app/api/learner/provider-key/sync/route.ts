import { NextResponse } from "next/server";

import { connectByokProvider } from "@/lib/byok-sync";
import { KEY_WRITE_RATE_LIMIT, answer, guard, readBody, readProvider } from "@/lib/provider-keys/requests";

export const runtime = "nodejs";

/**
 * `POST { provider }` (D95 of docs/STUDIO-CHAT-FIRST.md): a provider whose
 * tutor key is saved joins Studio's list — for a key stored before the
 * shared-key merge, or while the runner was down. Nothing about the key is
 * sent: the runner checks it can open the saved row (docs/BYOK.md, D12) and
 * refuses when it cannot. 200 `{ ok: true, synced }`, `synced` false when
 * the provider is no BYOK preset, has no saved key the runner can open, or
 * the runner did not answer.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const owner = await guard(req, "write", KEY_WRITE_RATE_LIMIT);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (body instanceof NextResponse) return body;
  const provider = readProvider(body);
  if (provider instanceof NextResponse) return provider;

  return answer({ ok: true, synced: (await connectByokProvider(provider)) === true });
}
