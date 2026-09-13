import { NextResponse } from "next/server";
import {
  CHAT_RATE_LIMIT,
  enforcePayloadBounds,
  enforceRateLimit,
  enforceSameOrigin,
} from "@/lib/agent/guard";
import { findTopicBySlugs } from "@/lib/agent/lookup";
import { buildAgentSessionContext } from "@/lib/agent/prompt";
import {
  availableProviderSummary,
  completeWithFallback,
  type ChatMessage,
} from "@/lib/agent/providers";
import { KNOWLEDGE_LIMITS } from "@/lib/storage";
import type { TopicKnowledge } from "@/lib/types";

export const runtime = "nodejs";

interface ChatBody {
  courseSlug: string;
  moduleSlug: string;
  topicId: string;
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

  // Always inject our system prompt as the authoritative first message.
  const payloadMessages: ChatMessage[] = [
    { role: "system", content: session.systemPrompt },
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
  });
}
