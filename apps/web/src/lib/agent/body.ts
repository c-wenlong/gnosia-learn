import { NextResponse } from "next/server";

import { BodyTooLarge, readBodyText } from "@/lib/learner-api";

/*
 * The agent routes' bounded body read. Its own module, not `guard.ts`:
 * `@/lib/learner-api` imports the guards, so the guards importing it back
 * would be a cycle.
 */

/**
 * The most bytes each agent route reads of a body. Each is well past the
 * largest body its page sends: check-options is two ids; a session question
 * adds at most four earlier prompts of 400 characters; a judge body is a
 * 400-character question, a 4,000-character answer and a commitment; chat and
 * summarize forward at most `PAYLOAD_LIMITS.maxTotalChars` (24,000) of
 * transcript, plus a note or prior knowledge, and UTF-8 can take up to four
 * bytes a character. Without a cap `req.json()` buffered whatever was sent,
 * and the three routes that validate before the limiter parsed it for free.
 */
export const AGENT_BODY_LIMITS = {
  checkOptions: 4_096,
  session: 16_384,
  judge: 64_000,
  chat: 256_000,
  summarize: 256_000,
} as const;

/**
 * The request body parsed as JSON, read no further than `maxBytes`, or the
 * response to answer with: 413 `PAYLOAD_TOO_LARGE` past the limit (before
 * anything is buffered when `Content-Length` says so), 400 `BAD_REQUEST` for
 * a body that is not JSON. Nothing is echoed back.
 */
export async function readAgentBody(req: Request, maxBytes: number): Promise<{ body: unknown } | NextResponse> {
  let text: string;
  try {
    text = await readBodyText(req, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      return NextResponse.json(
        { error: `The request body is too large (at most ${maxBytes} bytes).`, code: "PAYLOAD_TOO_LARGE" },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON body", code: "BAD_REQUEST" }, { status: 400 });
  }
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "BAD_REQUEST" }, { status: 400 });
  }
}
