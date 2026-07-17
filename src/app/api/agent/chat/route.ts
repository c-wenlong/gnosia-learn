import { NextResponse } from "next/server";
import { findTopicBySlugs } from "@/lib/agent/lookup";
import { buildAgentSessionContext } from "@/lib/agent/prompt";
import {
  availableProviderSummary,
  completeWithFallback,
  type ChatMessage,
} from "@/lib/agent/providers";

export const runtime = "nodejs";

interface ChatBody {
  courseSlug: string;
  moduleSlug: string;
  topicId: string;
  messages: ChatMessage[];
  learnerNote?: string;
}

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { courseSlug, moduleSlug, topicId, messages, learnerNote } = body;
  if (!courseSlug || !moduleSlug || !topicId || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "courseSlug, moduleSlug, topicId, and messages are required" },
      { status: 400 },
    );
  }

  const found = findTopicBySlugs(courseSlug, moduleSlug, topicId);
  if (!found) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const session = buildAgentSessionContext(
    found.course,
    found.module,
    found.topic,
    { learnerNote },
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
