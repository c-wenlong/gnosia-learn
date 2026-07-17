"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Course, Module, Topic } from "@/lib/types";
import { useLearner } from "@/lib/learner-context";
import {
  buildAgentSessionContext,
  DEFAULT_AGENT_MODEL,
} from "@/lib/agent/prompt";

type Role = "user" | "assistant";

interface UiMessage {
  id: string;
  role: Role;
  content: string;
  meta?: string;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AgentSession({
  course,
  module,
  topic,
}: {
  course: Course;
  module: Module;
  topic: Topic;
}) {
  const { state } = useLearner();
  const learnerNote = state.notes[topic.id] ?? "";
  const session = useMemo(
    () =>
      buildAgentSessionContext(course, module, topic, {
        learnerNote: learnerNote || undefined,
      }),
    [course, module, topic, learnerNote],
  );

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState(session.model);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Clipboard permission denied — select and copy manually.");
    }
  }

  async function callAgent(history: UiMessage[]) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseSlug: course.slug,
          moduleSlug: module.slug,
          topicId: topic.id,
          learnerNote: learnerNote || undefined,
          messages: history.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = (await res.json()) as {
        message?: { content?: string };
        error?: string;
        code?: string;
        detail?: string;
        model?: string;
        providerLabel?: string;
        attempts?: Array<{ provider: string; message: string }>;
      };
      if (!res.ok) {
        const attemptHint =
          data.attempts && data.attempts.length
            ? ` Attempts: ${data.attempts
                .map((a) => `${a.provider}: ${a.message.slice(0, 80)}`)
                .join(" | ")}`
            : "";
        throw new Error(
          data.error +
            (data.detail ? ` — ${data.detail}` : "") +
            attemptHint +
            (data.code === "MISSING_API_KEY"
              ? " Use Copy system prompt or Terminal launch below."
              : ""),
        );
      }
      const content = data.message?.content?.trim();
      if (!content) throw new Error("Empty assistant reply");
      if (data.model) {
        setActiveModel(
          data.providerLabel
            ? `${data.providerLabel} · ${data.model}`
            : data.model,
        );
      }
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content,
          meta: data.providerLabel
            ? `${data.providerLabel} · ${data.model ?? ""}`
            : data.model,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function startSession() {
    if (started || busy) return;
    setStarted(true);
    const seed: UiMessage = {
      id: uid(),
      role: "user",
      content: session.openingUserSeed,
    };
    setMessages([seed]);
    await callAgent([seed]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next: UiMessage = { id: uid(), role: "user", content: text };
    const history = [...messages, next];
    setMessages(history);
    setInput("");
    if (!started) setStarted(true);
    await callAgent(history);
  }

  const backHref = `/courses/${course.slug}/${module.slug}`;

  return (
    <div className="space-y-6">
      <nav className="text-sm text-[var(--muted)]">
        <Link
          href={backHref}
          className="text-[var(--accent-strong)] hover:underline"
        >
          ← Back to module
        </Link>
      </nav>

      <header className="space-y-3">
        <p className="text-sm font-medium text-[var(--accent-strong)]">
          Micro-learning · {DEFAULT_AGENT_MODEL}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {topic.title}
        </h1>
        <p className="text-sm text-[var(--muted-strong)]">
          {course.code} · M{module.order} {module.title}
        </p>
        <p className="text-sm text-[var(--muted-strong)]">{session.angle}</p>
      </header>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          By the end you should be able to
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--muted-strong)]">
          {session.objectives.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ol>
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startSession}
          disabled={started || busy}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {started ? "Session running" : "Start Socratic dialogue"}
        </button>
        <button
          type="button"
          onClick={() => copy(session.systemPrompt, "prompt")}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-hover)]"
        >
          {copied === "prompt" ? "Copied" : "Copy system prompt"}
        </button>
        <button
          type="button"
          onClick={() =>
            copy(
              `${session.terminalCommand}\n\n--- SYSTEM PROMPT ---\n${session.systemPrompt}\n\n--- OPENING ---\n${session.openingUserSeed}`,
              "terminal",
            )
          }
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-hover)]"
        >
          {copied === "terminal" ? "Copied" : "Copy terminal launch pack"}
        </button>
        <button
          type="button"
          onClick={() => setShowPrompt((v) => !v)}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-hover)]"
        >
          {showPrompt ? "Hide prompt" : "Show prompt"}
        </button>
      </section>

      {showPrompt && (
        <pre className="max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)] p-3 text-xs leading-relaxed text-[var(--muted-strong)] whitespace-pre-wrap">
          {session.systemPrompt}
        </pre>
      )}

      <section className="flex min-h-[420px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
          Browser session · {activeModel} · progress stays local
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!started && messages.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Click <strong>Start Socratic dialogue</strong> to launch the agent
              with the full topic system prompt. Production uses free providers:
              NVIDIA NIM → Gemini Flash → OpenRouter free.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                m.role === "assistant"
                  ? "bg-[var(--sidebar-bg)] text-[var(--foreground)]"
                  : "ml-6 border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {m.role === "assistant" ? "Agent" : "You"}
                {m.meta ? ` · ${m.meta}` : ""}
              </p>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {busy && (
            <p className="text-sm text-[var(--muted)]">Agent is thinking…</p>
          )}
          {error && (
            <p className="rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
        <form
          onSubmit={onSubmit}
          className="flex gap-2 border-t border-[var(--border)] p-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              started
                ? "Reply to the tutor…"
                : "Or type to begin without the auto seed…"
            }
            disabled={busy}
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
