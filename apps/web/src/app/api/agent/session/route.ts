import { NextResponse } from "next/server";

import { CHAT_RATE_LIMIT, enforceRateLimit, enforceSameOrigin } from "@/lib/agent/guard";
import { availableProviderSummary, completeWithFallback } from "@/lib/agent/providers";
import {
  buildSessionQuestionPrompt,
  parseSessionQuestion,
  QUESTION_LIMITS,
  sessionQuestionRequest,
  type QuestionStep,
} from "@/lib/agent/session";
import { readConceptWorkspace } from "@/lib/concept-workspace";
import { isConceptSlug, toConceptPromptInput } from "@/lib/concept-workspace-core";
import { readTutorStyle } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * `POST /api/agent/session` with `{ conceptSlug, step: "probe" | "check", avoid? }`:
 * one multiple-choice question for a session step, written by the tutor model
 * as structured JSON.
 *
 * A sibling of `POST /api/agent/chat` with its guards: same origin, then the
 * chat's rate limit in a bucket of its own (20 a minute per client), then the
 * concept read. Nothing about the concept comes from the browser but its slug;
 * the prompt is built on the server from the workspace, as the chat's is.
 * `avoid` is the questions already asked this session (at most four, each
 * clipped), so the check after teaching is not the probe again.
 *
 * 200 `{ question, model, provider, providerLabel }`, where `question` is a
 * `SessionQuestion` with the options already shuffled. 400 `BAD_REQUEST`, 403,
 * 429, 404 `CONCEPT_NOT_FOUND`, 503 `CONCEPT_UNAVAILABLE`, 503
 * `MISSING_API_KEY`, 502 `ALL_PROVIDERS_FAILED`, and 502 `UNSTRUCTURED_REPLY`
 * when the model answered but not with a usable question: the page then falls
 * back to the note's own check, or says there is no question to ask. It writes
 * nothing; grading is `POST /api/learner/observe`.
 */

const MAX_AVOID = 4;

export async function POST(req: Request) {
  const crossOrigin = enforceSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return bad("The body must be a JSON object");
  const { conceptSlug, step, avoid } = body as Record<string, unknown>;
  if (!isConceptSlug(conceptSlug)) return bad("conceptSlug must be a concept id (lowercase letters, digits and hyphens)");
  if (step !== "probe" && step !== "check") return bad('step must be "probe" or "check"');
  if (avoid !== undefined && (!Array.isArray(avoid) || avoid.length > MAX_AVOID || avoid.some((q) => typeof q !== "string"))) {
    return bad(`avoid must be a list of at most ${MAX_AVOID} questions`);
  }
  const asked = ((avoid as string[] | undefined) ?? []).map((q) => q.slice(0, QUESTION_LIMITS.prompt));

  // Before the read, so an unknown slug is not a free way to spin the limiter.
  const limited = enforceRateLimit(req, "session", CHAT_RATE_LIMIT);
  if (limited) return limited;

  const read = await readConceptWorkspace(conceptSlug);
  if (read.state === "unreachable") {
    return NextResponse.json(
      { error: "The knowledge base could not be reached, so there is no note to ask from.", code: "CONCEPT_UNAVAILABLE" },
      { status: 503 },
    );
  }
  if (read.state === "not-found") {
    return NextResponse.json({ error: "Concept not found", code: "CONCEPT_NOT_FOUND" }, { status: 404 });
  }

  // The learner's tutor style shapes the explanation; read after the concept,
  // as the chat does.
  const style = await readTutorStyle();
  const outcome = await completeWithFallback([
    {
      role: "system",
      content: buildSessionQuestionPrompt(toConceptPromptInput(read.workspace), step as QuestionStep, asked, style),
    },
    { role: "user", content: sessionQuestionRequest(step as QuestionStep) },
  ]);

  if (!outcome.ok) {
    return outcome.code === "MISSING_API_KEY"
      ? NextResponse.json(
          { error: "No tutor model is configured on this server.", code: "MISSING_API_KEY", providers: availableProviderSummary() },
          { status: 503 },
        )
      : NextResponse.json(
          { error: "All free providers failed", code: "ALL_PROVIDERS_FAILED", attempts: outcome.attempts },
          { status: 502 },
        );
  }

  const parsed = parseSessionQuestion(outcome.result.content);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: `The tutor did not write a usable question. ${parsed.reason}`, code: "UNSTRUCTURED_REPLY" },
      { status: 502 },
    );
  }
  return NextResponse.json(
    {
      question: parsed.question,
      model: outcome.result.model,
      provider: outcome.result.provider,
      providerLabel: outcome.result.providerLabel,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function bad(error: string) {
  return NextResponse.json({ error, code: "BAD_REQUEST" }, { status: 400 });
}
