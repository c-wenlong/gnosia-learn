"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { providerLabel } from "@self-learn/schema/shared";
import { MathText } from "@/components/Math";
import { FIELD_TEXT } from "@/components/ui/classes";
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
import { VerdictRow } from "@/components/workspace/VerdictRow";
import {
  chatRequestId,
  closeChatSession,
  judgeAnswer,
  recordAnswer,
} from "@/lib/chat-recall";
import {
  checkSource,
  newVerdict,
  pendingCheck,
  type TurnCheck,
  type Verdict,
} from "@/lib/tutor-check";
import { scrollBehavior } from "@/lib/motion";

type Role = "user" | "assistant";

interface UiMessage {
  id: string;
  role: Role;
  content: string;
  meta?: string;
  /** A tutor turn that asked a check, naming the topic concept it tests (phase 3 of docs/proposals/recall-in-chat.md). */
  check?: TurnCheck | null;
  /** A learner turn that answered one: its verdict row, and the concept it records against. */
  verdict?: Verdict | null;
  concept?: string;
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
  const router = useRouter();
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
    bottomRef.current?.scrollIntoView({ behavior: scrollBehavior() });
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
        check?: TurnCheck | null;
        error?: string;
        code?: string;
        detail?: string;
        model?: string;
        providerLabel?: string;
        attempts?: Array<{ provider: string; model?: string; message: string }>;
      };
      if (!res.ok) {
        const attemptHint =
          data.attempts && data.attempts.length
            ? ` Attempts: ${data.attempts
                .map(
                  (a) =>
                    `${providerLabel(a.provider)}${a.model ? ` ${a.model}` : ""}: ${a.message.slice(0, 80)}`,
                )
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
          // The route keeps a check only when it names a concept this topic declares.
          check:
            data.check?.question && data.check.concept
              ? { question: data.check.question, concept: data.check.concept }
              : null,
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
        e instanceof Error
          ? e.message
          : "Recap request failed — write it by hand.",
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

  /** Change one answer's verdict row. */
  function patchVerdict(messageId: string, patch: Partial<Verdict>) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.verdict
          ? { ...m, verdict: { ...m.verdict, ...patch } }
          : m,
      ),
    );
  }

  /** Request ids with a write in flight: a second tap waits on the first. */
  const recording = useRef(new Set<string>());
  /** This topic's chat session (R6), shared with nothing else on the page. */
  const scope = `topic-${topic.id}`;

  /** The learner's tap: one observation on the check's concept, replayed rather than doubled on a retry. */
  async function record(messageId: string, tappedNow: boolean) {
    const m = messages.find((x) => x.id === messageId);
    const verdict = m?.verdict;
    if (
      !m ||
      !verdict ||
      !m.concept ||
      verdict.state === "saving" ||
      verdict.state === "recorded"
    )
      return;
    if (recording.current.has(verdict.requestId)) return;
    const correct = verdict.tapped ?? tappedNow;
    recording.current.add(verdict.requestId);
    patchVerdict(messageId, { state: "saving", tapped: correct, error: null });
    try {
      const recorded = await recordAnswer({
        scope,
        sessionLabel: topic.id,
        conceptSlug: m.concept,
        correct,
        source: verdict.source,
        requestId: verdict.requestId,
        question: verdict.question,
        answer: m.content,
        // The session is the topic's: its answers span the concepts the topic declares.
        sessionTitle: `${course.code} · ${topic.title}`,
        sessionGoal: topic.id,
      });
      patchVerdict(messageId, { state: "recorded", error: null, recorded });
      // The shell's learner snapshot (mastery, progress) reads the new state.
      router.refresh();
    } catch (e) {
      patchVerdict(messageId, {
        state: "failed",
        error: e instanceof Error ? e.message : "The answer was not recorded.",
      });
    } finally {
      recording.current.delete(verdict.requestId);
    }
  }

  // R6: the topic's chat session closes when the page goes away. Best-effort.
  useEffect(() => {
    const onHide = () => closeChatSession(scope);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      closeChatSession(scope);
    };
  }, [scope]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    // A reply to a turn that asked a check is its answer, on the concept the check named.
    const asked = pendingCheck(messages);
    const check = asked === null ? null : messages[asked].check;
    const next: UiMessage =
      check?.concept && asked !== null
        ? {
            id: uid(),
            role: "user",
            content: text,
            concept: check.concept,
            verdict: newVerdict(
              check.question,
              chatRequestId(),
              checkSource(messages, asked),
            ),
          }
        : { id: uid(), role: "user", content: text };
    if (next.verdict && next.concept) {
      const id = next.id;
      void judgeAnswer(next.concept, next.verdict.question, text).then((v) =>
        patchVerdict(
          id,
          v === null
            ? { judged: "unavailable", suggested: null }
            : { judged: "ready", suggested: v.correct, feedback: v.feedback },
        ),
      );
    }
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
          Browser session · {activeModel}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!started && messages.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Click <strong>Start Socratic dialogue</strong> to launch the agent
              with the full topic system prompt. Production uses free providers:
              NVIDIA NIM → Gemini Flash → OpenRouter free.
            </p>
          )}
          {messages.map((m, i) => {
            // Each answer's row sits under the tutor's reply to it, or under the answer until that arrives.
            const answered =
              messages[i - 1]?.role === "user" && m.role === "assistant"
                ? messages[i - 1]
                : m.role === "user" && messages[i + 1]?.role !== "assistant"
                  ? m
                  : null;
            const lastVerdict = messages.findLastIndex((x) => x.verdict);
            return [
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
                <span className="sr-only">
                  {m.role === "assistant" ? "Tutor: " : "You: "}
                </span>
                <div className="whitespace-pre-wrap">
                  <MathText text={m.content} />
                </div>
              </div>,
              answered?.verdict ? (
                <VerdictRow
                  key={`v-${answered.id}`}
                  verdict={answered.verdict}
                  live={messages.indexOf(answered) === lastVerdict}
                  onRecord={(correct) => void record(answered.id, correct)}
                />
              ) : null,
            ];
          })}
          {busy && (
            <p className="text-sm text-[var(--muted)]">Agent is thinking…</p>
          )}
          {error && (
            <p className="rounded-md border border-danger/45 bg-danger/5 px-3 py-2 text-sm text-danger">
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
            className={`min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none ring-[var(--accent)] focus:ring-2 ${FIELD_TEXT.sm}`}
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
          <p className="rounded-md border border-warn bg-warn-tint px-3 py-2 text-sm text-text">
            {recapError}
          </p>
        )}

        {saveError && (
          <p className="rounded-md border border-danger/45 bg-danger/5 px-3 py-2 text-sm text-danger">
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
