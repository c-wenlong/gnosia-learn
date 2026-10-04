import { NextResponse } from "next/server";

import { tutorCredentials } from "@/lib/agent/credentials";
import { CHAT_RATE_LIMIT, enforceRateLimit, enforceSameOrigin } from "@/lib/agent/guard";
import { buildJudgePrompt, judgeRequest, parseVerdict } from "@/lib/agent/judge";
import {
  availableProviderSummary,
  completeWithFallback,
  missingKeyMessage,
  skippedEntries,
} from "@/lib/agent/providers";
import { isConceptSlug, toConceptPromptInput } from "@/lib/concept-workspace-core";
import { readConceptWorkspace } from "@/lib/concept-workspace";
import { requestOwner } from "@/lib/learner-api";
import { CHAT_ANSWER_LIMIT, CHECK_QUESTION_LIMIT, matchCheck } from "@/lib/tutor-check";

export const runtime = "nodejs";

/**
 * `POST /api/agent/judge` with `{ conceptSlug, question, answer }`: the
 * judge's verdict on one answer to a check the concept tutor asked in the
 * chat (R5 of docs/proposals/recall-in-chat.md).
 *
 * The chat page calls it beside `POST /api/agent/chat` when the learner
 * replies to a turn that carried a `CHECK:` marker, so the tutor's reply and
 * the verdict arrive independently and neither waits on the other. The
 * concept is read on the server from its slug, as the chat's is; the note's
 * check closest to the question, when one is close enough, is the judge's
 * reference.
 *
 * It writes nothing. Its verdict pre-selects a button in the verdict row, and
 * only the learner's tap writes, through `POST /api/learner/observe` (R2).
 *
 * 200 `{ verdict: { correct, feedback }, model, provider, providerLabel }`.
 * 400 `BAD_REQUEST`, 403, 429, 404 `CONCEPT_NOT_FOUND`, 503
 * `CONCEPT_UNAVAILABLE`, 503 `MISSING_API_KEY`, 502 `ALL_PROVIDERS_FAILED`,
 * and 502 `UNSTRUCTURED_REPLY` when the model answered without a usable
 * verdict: the row then shows both buttons with neither chosen. Its rate
 * limit is the chat's rule in a bucket of its own.
 */
export async function POST(req: Request) {
  const crossOrigin = enforceSameOrigin(req);
  if (crossOrigin) return crossOrigin;
  const owner = await requestOwner();
  if (owner instanceof NextResponse) return owner;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return bad("The body must be a JSON object");
  const { conceptSlug, question, answer } = body as Record<string, unknown>;
  if (!isConceptSlug(conceptSlug)) return bad("conceptSlug must be a concept id (lowercase letters, digits and hyphens)");
  if (typeof question !== "string" || question.trim() === "" || question.length > CHECK_QUESTION_LIMIT) {
    return bad(`question must be the check the tutor asked, 1 to ${CHECK_QUESTION_LIMIT} characters`);
  }
  if (typeof answer !== "string" || answer.trim() === "" || answer.length > CHAT_ANSWER_LIMIT) {
    return bad(`answer must be the learner's reply, 1 to ${CHAT_ANSWER_LIMIT} characters`);
  }

  // Before the read, so an unknown slug is not a free way to spin the limiter.
  const limited = enforceRateLimit(req, "judge", CHAT_RATE_LIMIT);
  if (limited) return limited;

  const read = await readConceptWorkspace(conceptSlug);
  if (read.state === "unreachable") {
    return NextResponse.json(
      { error: "The knowledge base could not be reached, so there is no note to judge against.", code: "CONCEPT_UNAVAILABLE" },
      { status: 503 },
    );
  }
  if (read.state === "not-found") {
    return NextResponse.json({ error: "Concept not found", code: "CONCEPT_NOT_FOUND" }, { status: 404 });
  }

  const concept = toConceptPromptInput(read.workspace);
  const match = matchCheck(question, read.workspace.checks);
  const credentials = await tutorCredentials(owner);
  const outcome = await completeWithFallback(
    [
      {
        role: "system",
        content: buildJudgePrompt({
          title: concept.title,
          summary: concept.summary,
          body: concept.body ?? null,
          question: question.trim(),
          answer,
          reference: match ? { question: match.question, answer: match.answer, why: match.why } : null,
        }),
      },
      { role: "user", content: judgeRequest(answer) },
    ],
    credentials,
  );

  if (!outcome.ok) {
    return outcome.code === "MISSING_API_KEY"
      ? NextResponse.json(
          {
            error: missingKeyMessage(credentials),
            code: "MISSING_API_KEY",
            attempts: outcome.attempts,
            providers: availableProviderSummary(credentials),
          },
          { status: 503 },
        )
      : NextResponse.json(
          { error: "All free providers failed", code: "ALL_PROVIDERS_FAILED", attempts: outcome.attempts },
          { status: 502 },
        );
  }

  const parsed = parseVerdict(outcome.result.content);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: `The judge did not return a usable verdict. ${parsed.reason}`, code: "UNSTRUCTURED_REPLY" },
      { status: 502 },
    );
  }
  return NextResponse.json(
    {
      verdict: { correct: parsed.correct, feedback: parsed.feedback },
      model: outcome.result.model,
      provider: outcome.result.provider,
      providerLabel: outcome.result.providerLabel,
      ...skippedEntries(outcome.attempts),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function bad(error: string) {
  return NextResponse.json({ error, code: "BAD_REQUEST" }, { status: 400 });
}
