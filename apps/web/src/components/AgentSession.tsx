"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { MathText } from "@/components/Math";
import type {
  Course,
  KnowledgeInput,
  Module,
  Topic,
  TopicKnowledge,
} from "@/lib/types";
import { useLearner } from "@/lib/learner-context";
import {
  buildAgentSessionContext,
  DEFAULT_AGENT_MODEL,
} from "@/lib/agent/prompt";
import { RecapCard, RecapEditor } from "@/components/TopicRecap";

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
  const { state, ready, saveKnowledge, saveError } = useLearner();
  const learnerNote = state.notes[topic.id] ?? "";
  const storedKnowledge = state.knowledge[topic.id];

  // Snapshot the recap once localStorage has hydrated, then hold it: the
  // session resumes from what was known when it opened, so saving a recap
  // mid-session doesn't rewrite the tutor's premise underneath it.
  const [priorKnowledge, setPriorKnowledge] = useState<
    TopicKnowledge | undefined
  >(undefined);
  const priorFrozen = useRef(false);

  useEffect(() => {
    if (priorFrozen.current || !ready) return;
    priorFrozen.current = true;
    setPriorKnowledge(storedKnowledge);
  }, [ready, storedKnowledge]);

  const session = useMemo(
    () =>
      buildAgentSessionContext(course, module, topic, {
        learnerNote: learnerNote || undefined,
        priorKnowledge,
      }),
    [course, module, topic, learnerNote, priorKnowledge],
  );

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState(session.model);
  const [summarizing, setSummarizing] = useState(false);
  const [recapError, setRecapError] = useState("");
  const [recapDraft, setRecapDraft] = useState<Partial<KnowledgeInput> | null>(
    null,
  );
  const [justSaved, setJustSaved] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasDialogue = messages.some((m) => m.role === "assistant");

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
          priorKnowledge,
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
              ? " Or use Copy system prompt or Terminal launch below."
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

  async function summarizeSession() {
    if (summarizing || !hasDialogue) return;
    setSummarizing(true);
    setRecapError("");
    try {
      const res = await fetch("/api/agent/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseSlug: course.slug,
          moduleSlug: module.slug,
          topicId: topic.id,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = (await res.json()) as {
        knowledge?: KnowledgeInput;
        error?: string;
        code?: string;
        raw?: string;
      };

      if (!res.ok || !data.knowledge) {
        // Fall back to hand-writing it, seeded with whatever came back.
        setRecapDraft({
          summary: data.raw?.trim() ?? "",
          keyPoints: [],
          misconceptions: [],
          openQuestions: [],
        });
        setRecapError(
          `${data.error ?? "Could not generate a recap"} — write it by hand below; it saves to the same place.`,
        );
        return;
      }

      saveKnowledge(topic.id, data.knowledge);
      setJustSaved(true);
      setRecapDraft(null);
    } catch (e) {
      setRecapError(
        e instanceof Error ? e.message : "Recap request failed — write it by hand.",
      );
      setRecapDraft({});
    } finally {
      setSummarizing(false);
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

      {priorKnowledge && (
        <section className="space-y-2">
          <RecapCard
            knowledge={priorKnowledge}
            course={course}
            module={module}
            topic={topic}
            title="Recall from last time"
          />
          <p className="text-xs text-[var(--muted)]">
            This is in the tutor&apos;s context. It will resume from here rather
            than re-introducing the topic.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--muted-strong)]">
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
              {/* No "Agent" or "You" over each turn: the two sides are told
                  apart by their shape, so only the provider, when there is
                  one, is shown. */}
              {m.role === "assistant" && m.meta && (
                <p className="mb-1 text-xs text-[var(--muted)]">{m.meta}</p>
              )}
              <span className="sr-only">{m.role === "assistant" ? "Tutor: " : "You: "}</span>
              <div className="whitespace-pre-wrap">
                <MathText text={m.content} />
              </div>
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
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base outline-none ring-[var(--accent)] focus:ring-2 md:text-sm"
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

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--muted-strong)]">
            Keep this session
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-strong)]">
            The dialogue itself is not stored. Save a recap and it becomes the
            durable record for this topic — shown on the module page, and handed
            to the tutor the next time you open it.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={summarizeSession}
            disabled={!hasDialogue || summarizing}
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {summarizing
              ? "Summarising…"
              : storedKnowledge
                ? "Save recap (replaces saved)"
                : "Save session recap"}
          </button>
          <button
            type="button"
            onClick={() =>
              setRecapDraft(recapDraft ? null : (storedKnowledge ?? {}))
            }
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-hover)]"
          >
            {recapDraft ? "Close editor" : "Write recap by hand"}
          </button>
        </div>

        {!hasDialogue && (
          <p className="text-xs text-[var(--muted)]">
            Run at least one exchange with the tutor to auto-summarise, or write
            the recap by hand.
          </p>
        )}

        {recapError && (
          <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
            {recapError}
          </p>
        )}

        {saveError && (
          <p className="rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700/50 dark:bg-red-950/40 dark:text-red-200">
            {saveError}
          </p>
        )}

        {recapDraft && (
          <RecapEditor
            initial={recapDraft}
            submitLabel="Save recap"
            onSave={(input) => {
              saveKnowledge(topic.id, input);
              setRecapDraft(null);
              setRecapError("");
              setJustSaved(true);
            }}
            onCancel={() => setRecapDraft(null)}
          />
        )}

        {storedKnowledge && !recapDraft && (
          <div className="space-y-2">
            {justSaved && (
              <p className="text-xs font-medium text-[var(--accent-strong)]">
                Saved — this now appears on the module page.
              </p>
            )}
            <RecapCard
              knowledge={storedKnowledge}
              course={course}
              module={module}
              topic={topic}
              title="Saved recap"
              onEdit={() => setRecapDraft(storedKnowledge)}
            />
          </div>
        )}

        <p className="text-xs text-[var(--muted)]">
          Recaps live in this browser and survive a progress reset. Use{" "}
          <strong>Copy as Markdown</strong> to keep one outside it.
        </p>
      </section>
    </div>
  );
}
