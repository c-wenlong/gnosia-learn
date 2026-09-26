import { NextResponse } from "next/server";
import {
  CHAT_RATE_LIMIT,
  enforcePayloadBounds,
  enforceRateLimit,
  enforceSameOrigin,
} from "@/lib/agent/guard";
import { findTopicBySlugs } from "@/lib/agent/lookup";
import { buildAgentSessionContext, buildConceptSessionContext, type CitationSource } from "@/lib/agent/prompt";
import { isConceptSlug, toConceptPromptInput } from "@/lib/concept-workspace-core";
import { readConceptWorkspace } from "@/lib/concept-workspace";
import {
  availableProviderSummary,
  completeWithFallback,
  type ChatMessage,
} from "@/lib/agent/providers";
import { KNOWLEDGE_LIMITS } from "@/lib/storage";
import type { TopicKnowledge } from "@/lib/types";

export const runtime = "nodejs";

/**
 * One of two shapes. The topic tutor (the course session) sends
 * `courseSlug`, `moduleSlug` and `topicId`. The concept tutor (the workspace)
 * sends `conceptSlug` instead, and when it is present the three topic fields
 * are ignored. The request and response shapes are written down in
 * docs/design/IMPLEMENTATION.md under "The concept tutor API".
 */
interface ChatBody {
  courseSlug?: string;
  moduleSlug?: string;
  topicId?: string;
  conceptSlug?: unknown;
  messages: ChatMessage[];
  learnerNote?: string;
  priorKnowledge?: Partial<TopicKnowledge>;
}

/**
 * Recaps live in the learner's browser, so they arrive with the request.
 * Clamp them before they reach the prompt.
 */
function sanitizeKnowledge(
  raw: Partial<TopicKnowledge> | undefined,
  topicId: string,
): TopicKnowledge | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const list = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim().slice(0, KNOWLEDGE_LIMITS.itemChars))
          .filter(Boolean)
          .slice(0, KNOWLEDGE_LIMITS.listItems)
      : [];

  const summary =
    typeof raw.summary === "string"
      ? raw.summary.trim().slice(0, KNOWLEDGE_LIMITS.summaryChars)
      : "";
  const keyPoints = list(raw.keyPoints);
  const misconceptions = list(raw.misconceptions);
  const openQuestions = list(raw.openQuestions);
  if (
    !summary &&
    keyPoints.length === 0 &&
    misconceptions.length === 0 &&
    openQuestions.length === 0
  ) {
    return undefined;
  }

  return {
    topicId,
    summary,
    keyPoints,
    misconceptions,
    openQuestions,
    source: raw.source === "manual" ? "manual" : "agent",
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date().toISOString(),
    sessions:
      typeof raw.sessions === "number" && raw.sessions > 0
        ? Math.floor(raw.sessions)
        : 1,
  };
}

export async function POST(req: Request) {
  // Cheapest first, so a refused request never costs a provider call: the
  // origin check needs no body at all.
  const crossOrigin = enforceSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "The body must be a JSON object" }, { status: 400 });
  }
  if (body.conceptSlug !== undefined) return conceptTurn(req, body);

  const { courseSlug, moduleSlug, topicId, messages, learnerNote, priorKnowledge } =
    body;
  if (!courseSlug || !moduleSlug || !topicId || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "courseSlug, moduleSlug, topicId, and messages are required" },
      { status: 400 },
    );
  }

  const tooLarge = enforcePayloadBounds(messages, learnerNote);
  if (tooLarge) return tooLarge;

  // Before the topic lookup on purpose: otherwise a caller could spin the
  // limiter for free by varying the slugs and collecting 404s.
  const rateLimited = enforceRateLimit(req, "chat", CHAT_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const found = findTopicBySlugs(courseSlug, moduleSlug, topicId);
  if (!found) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const session = buildAgentSessionContext(
    found.course,
    found.module,
    found.topic,
    {
      learnerNote,
      priorKnowledge: sanitizeKnowledge(priorKnowledge, topicId),
    },
  );

  return completeTurn(session.systemPrompt, messages);
}

/**
 * A turn of the concept tutor. The context is the concept's note, its
 * neighbours and the learner's mastery and recent answers on it, all read on
 * the server from `conceptSlug`; nothing about the concept is taken from the
 * browser. The response adds `concept` and the numbered `sources` the reply
 * may cite as `[n]`.
 */
async function conceptTurn(req: Request, body: ChatBody) {
  const { conceptSlug, messages, learnerNote } = body;
  if (!isConceptSlug(conceptSlug) || !Array.isArray(messages)) {
    return NextResponse.json(
      {
        error: "conceptSlug must be a concept id (lowercase letters, digits and hyphens), and messages an array",
        code: "BAD_REQUEST",
      },
      { status: 400 },
    );
  }

  const tooLarge = enforcePayloadBounds(messages, learnerNote);
  if (tooLarge) return tooLarge;

  // Before the lookup, for the same reason as the topic path: an unknown slug
  // must not be a free way to spin the limiter.
  const rateLimited = enforceRateLimit(req, "chat", CHAT_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const read = await readConceptWorkspace(conceptSlug);
  if (read.state === "unreachable") {
    return NextResponse.json(
      {
        error: "The knowledge base could not be reached, so the tutor has no note to work from.",
        code: "CONCEPT_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
  if (read.state === "not-found") {
    return NextResponse.json({ error: "Concept not found", code: "CONCEPT_NOT_FOUND" }, { status: 404 });
  }

  const session = buildConceptSessionContext(toConceptPromptInput(read.workspace));
  const note =
    typeof learnerNote === "string" && learnerNote.trim()
      ? `\n## Learner notes (from their study hub)\n${learnerNote.trim()}\n`
      : "";
  return completeTurn(session.systemPrompt + note, messages, {
    concept: { slug: read.workspace.slug, title: read.workspace.title },
    sources: session.sources,
  });
}

/** Send the turn to the provider cascade and shape the answer both tutors share. */
async function completeTurn(
  systemPrompt: string,
  messages: ChatMessage[],
  extra: { concept?: { slug: string; title: string }; sources?: CitationSource[] } = {},
) {
  // Always inject our system prompt as the authoritative first message.
  const payloadMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.filter((m) => m.role !== "system"),
  ];

  const outcome = await completeWithFallback(payloadMessages);

  if (!outcome.ok) {
    if (outcome.code === "MISSING_API_KEY") {
      return NextResponse.json(
        {
          error:
            "No free provider API keys configured. Set NVIDIA_API_KEY (primary), GEMINI_API_KEY (backup), and/or OPENROUTER_API_KEY (final free backup). Or use Copy prompt / Terminal launch.",
          code: "MISSING_API_KEY",
          providers: availableProviderSummary(),
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "All free providers failed",
        code: "ALL_PROVIDERS_FAILED",
        attempts: outcome.attempts,
        providers: availableProviderSummary(),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    message: { role: "assistant", content: outcome.result.content },
    model: outcome.result.model,
    provider: outcome.result.provider,
    providerLabel: outcome.result.providerLabel,
    fallbackAttempts: outcome.attempts.length,
    ...extra,
  });
}
