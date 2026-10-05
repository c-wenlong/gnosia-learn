"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { providerLabel } from "@self-learn/schema/shared";
import { MathText } from "@/components/Math";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { cx, LABEL, NOTE, PAGE_TITLE } from "@/components/ui/classes";
import { Collapse } from "@/components/ui/Collapse";
import { Composer } from "@/components/ui/Composer";
import { LiveStatus } from "@/components/ui/LiveStatus";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import { TextLink } from "@/components/ui/TextLink";
import { TypingDots } from "@/components/ui/TypingDots";
import { useCopied } from "@/components/ui/use-copied";
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
  const promptId = useId();
  const { copied, copy: copyText } = useCopied<"prompt" | "terminal">();
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

  async function copy(text: string, key: "prompt" | "terminal") {
    if (!(await copyText(text, key))) {
      setError("Clipboard permission denied. Select the prompt and copy it by hand.");
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
            (data.detail ? `: ${data.detail}` : "") +
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
          `${data.error ?? "Could not generate a recap"}. Write it by hand below; it saves to the same place.`,
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
          : "Recap request failed. Write it by hand.",
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

  /** The composer's send: Enter, or the Send button. */
  async function send(value: string) {
    const text = value.trim();
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
    <div className="flex flex-col gap-6">
      <nav>
        <TextLink href={backHref} size="md">
          ← Back to module
        </TextLink>
      </nav>

      <header className="flex flex-col gap-3">
        <p className="text-[13px] font-medium text-accent-text">
          Micro-learning · {DEFAULT_AGENT_MODEL}
        </p>
        <h1 className={PAGE_TITLE}>{topic.title}</h1>
        <p className="text-[14px] text-text2">
          {course.code} · M{module.order} {module.title}
        </p>
        <p className="text-[14px] text-text2">{session.angle}</p>
      </header>

      {priorKnowledge && (
        <section className="flex flex-col gap-2">
          <RecapCard
            knowledge={priorKnowledge}
            course={course}
            module={module}
            topic={topic}
            title="Recall from last time"
          />
          <p className={NOTE}>
            This is in the tutor&apos;s context. It will resume from here rather
            than re-introducing the topic.
          </p>
        </section>
      )}

      <Card tight gap={2}>
        <h2 className={LABEL}>By the end you should be able to</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[14px] text-text2">
          {session.objectives.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ol>
      </Card>

      <section>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={startSession} disabled={started || busy}>
            {started ? "Session running" : "Start Socratic dialogue"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void copy(session.systemPrompt, "prompt")}>
            {copied === "prompt" ? "Copied" : "Copy system prompt"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void copy(
                `${session.terminalCommand}\n\n--- SYSTEM PROMPT ---\n${session.systemPrompt}\n\n--- OPENING ---\n${session.openingUserSeed}`,
                "terminal",
              )
            }
          >
            {copied === "terminal" ? "Copied" : "Copy terminal launch pack"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={showPrompt}
            aria-controls={promptId}
            onClick={() => setShowPrompt((v) => !v)}
          >
            {showPrompt ? "Hide prompt" : "Show prompt"}
          </Button>
        </div>
        {/* Glides open under the buttons; the space above it is inside the
            fold, so a shut prompt leaves none behind. */}
        <Collapse open={showPrompt} id={promptId}>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-surface2 p-3 font-mono text-[12px] leading-relaxed text-text2">
            {session.systemPrompt}
          </pre>
        </Collapse>
      </section>

      <Card flush className="min-h-[420px]">
        <p className={cx(NOTE, "border-b border-hair px-4 py-2")}>
          Browser session · {activeModel}
        </p>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {!started && messages.length === 0 && (
            <p className="text-[14px] text-text2">
              Press <strong className="font-semibold text-text">Start Socratic dialogue</strong> to launch the agent
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
              // The kit's two voices: the tutor's bare prose and the learner's
              // tinted bubble, told apart by shape, so no turn carries a
              // speaker label; only the provider, when there is one, is shown.
              m.role === "assistant" ? (
                <TutorMessage key={m.id} className="animate-enter motion-reduce:animate-none">
                  {m.meta && <p className={cx(NOTE, "mb-1")}>{m.meta}</p>}
                  <div className="whitespace-pre-wrap">
                    <MathText text={m.content} />
                  </div>
                </TutorMessage>
              ) : (
                <UserMessage key={m.id} className="animate-enter motion-reduce:animate-none">
                  <MathText text={m.content} />
                </UserMessage>
              ),
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
            <p role="status" className="flex animate-fade-in items-center gap-2 px-1.5 text-[13px] text-text3 motion-reduce:animate-none">
              <TypingDots />
              The tutor is thinking…
            </p>
          )}
          {error && (
            <Callout tone="danger" role="alert" className="animate-fade-in motion-reduce:animate-none">
              {error}
            </Callout>
          )}
          <div ref={bottomRef} />
        </div>
        {/* The kit composer: Enter sends, as the one-line field did, and
            Shift+Enter is a new line, as in the concept tutor. The whole
            field waits while a reply is on its way, as it always has. */}
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={(value) => void send(value)}
          label="Reply to the tutor"
          placeholder={
            started
              ? "Reply to the tutor…"
              : "Or type to begin without the auto seed…"
          }
          disabled={busy}
          className="border-t border-hair p-3"
        />
      </Card>

      <Card tight>
        <div className="flex flex-col gap-1">
          <h2 className={LABEL}>Keep this session</h2>
          <p className="text-[14px] text-text2">
            The dialogue itself is not stored. Save a recap and it becomes the
            durable record for this topic, shown on the module page and handed
            to the tutor the next time you open it.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={summarizeSession} disabled={!hasDialogue || summarizing}>
            {summarizing
              ? "Summarising…"
              : storedKnowledge
                ? "Save recap (replaces saved)"
                : "Save session recap"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={recapDraft !== null}
            onClick={() =>
              setRecapDraft(recapDraft ? null : (storedKnowledge ?? {}))
            }
          >
            {recapDraft ? "Close editor" : "Write recap by hand"}
          </Button>
        </div>

        {!hasDialogue && (
          <p className={NOTE}>
            Run at least one exchange with the tutor to auto-summarise, or write
            the recap by hand.
          </p>
        )}

        {recapError && (
          <Callout role="status" className="animate-fade-in motion-reduce:animate-none">
            {recapError}
          </Callout>
        )}

        {saveError && (
          <Callout tone="danger" role="alert" className="animate-fade-in motion-reduce:animate-none">
            {saveError}
          </Callout>
        )}

        {recapDraft && (
          <RecapEditor
            initial={recapDraft}
            submitLabel="Save recap"
            className="animate-fade-in motion-reduce:animate-none"
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
          <div className="flex flex-col gap-2 animate-fade-in motion-reduce:animate-none">
            <LiveStatus
              text={justSaved ? "Saved. This now appears on the module page." : null}
              tone="ok"
            />
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

        <p className={NOTE}>
          Recaps live in this browser and survive a progress reset. Use{" "}
          <strong className="font-semibold">Copy as Markdown</strong> to keep one outside it.
        </p>
      </Card>
    </div>
  );
}
