"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import { NoteProse } from "@/components/NoteProse";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Cite } from "@/components/ui/Cite";
import { MathText } from "@/components/Math";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import type { CitationSource } from "@/lib/agent/prompt";
import { citedNumbers, parseThread, threadKey, trimForRequest, type TutorTurn } from "@/lib/tutor-thread";

/**
 * The workspace's centre panel: a chat with the concept tutor
 * (`POST /api/agent/chat` with `conceptSlug`).
 *
 * The thread is kept per concept in `sessionStorage`: it survives a reload and
 * a trip to another page in the same tab, and goes when the tab closes. That
 * is enough while chat writes no evidence; mastery moves through the session
 * and the CLI, not through this thread.
 *
 * Tutor turns render through `NoteProse`, the same renderer the note uses, so
 * a list or a formula in a reply reads the way it does in the note. A `[n]`
 * the reply uses becomes a `Cite` chip under the turn when `n` is one of the
 * numbered sources; anything else stays as the text it was.
 */

/** The longest question the input takes, well inside the route's payload bound. */
const INPUT_LIMIT = 4_000;

interface ChatReply {
  message?: { content?: string };
  sources?: CitationSource[];
  error?: string;
  code?: string;
}

/**
 * The thread store: `sessionStorage` under `threadKey(slug)`, mirrored in
 * memory so a tab whose storage is refused (a private window, a policy) still
 * keeps its conversation until it navigates away. Read through
 * `useSyncExternalStore`, whose server snapshot is empty, so the first client
 * render matches the server's HTML and the stored thread appears right after.
 */
const memory = new Map<string, string | null>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeTurns(key: string, turns: TutorTurn[]): void {
  const raw = turns.length === 0 ? null : JSON.stringify(turns);
  memory.set(key, raw);
  try {
    if (raw === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, raw);
  } catch {
    // A full or refused store costs persistence, not the conversation.
  }
  for (const listener of listeners) listener();
}

function errorFor(status: number, data: ChatReply): string {
  if (data.code === "MISSING_API_KEY") {
    return "No tutor model is configured on this server. Set NVIDIA_API_KEY, GEMINI_API_KEY or OPENROUTER_API_KEY and restart it.";
  }
  if (data.code === "CONCEPT_UNAVAILABLE") return "The knowledge base is unreachable, so the tutor has no note to read.";
  if (status === 429) return "That was a lot of questions in a minute. Wait a moment and try again.";
  return data.error ?? `The tutor did not answer (HTTP ${status}).`;
}

export function TutorChat({
  slug,
  title,
  sources: initialSources,
  suggestions,
  initialDraft,
}: {
  slug: string;
  title: string;
  sources: CitationSource[];
  suggestions: string[];
  /** Put in the input, not sent: a session's "Ask the tutor" (`?ask=`). */
  initialDraft?: string;
}) {
  const key = threadKey(slug);
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  const turns = useMemo(() => parseThread(raw), [raw]);
  const setTurns = (next: TutorTurn[]) => writeTurns(key, next);
  const [sources, setSources] = useState(initialSources);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The thread box scrolls, never the page: on a phone the page is where the
    // learner is reading.
    const box = threadRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns.length, busy]);

  async function ask(question: string, history: TutorTurn[] = turns) {
    const text = question.trim();
    if (!text || busy) return;
    const next: TutorTurn[] = [...history, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptSlug: slug, messages: trimForRequest(next) }),
      });
      const data = (await res.json().catch(() => ({}))) as ChatReply;
      if (!res.ok) throw new Error(errorFor(res.status, data));
      const content = data.message?.content?.trim();
      if (!content) throw new Error("The tutor sent an empty reply. Try asking again.");
      if (Array.isArray(data.sources) && data.sources.length > 0) setSources(data.sources);
      setTurns([...next, { role: "assistant", content }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }

  /** Ask the last question again after a failure, without a second copy of it. */
  function retry() {
    const last = turns[turns.length - 1];
    if (last?.role !== "user") return;
    void ask(last.content, turns.slice(0, -1));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  function prefill(question: string) {
    setDraft(question);
    inputRef.current?.focus();
  }

  const known = sources.map((s) => s.n);
  const byNumber = new Map(sources.map((s) => [s.n, s]));
  const lastTutor = turns.map((t) => t.role).lastIndexOf("assistant");
  const note = byNumber.get(1);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* From 900px up the panel is only as tall as the viewport leaves it, so
          the thread gives up height before the chips and the composer do. */}
      <div
        ref={threadRef}
        className="-mx-1 flex min-h-[280px] flex-1 flex-col gap-4 overflow-y-auto px-1 py-1 min-[900px]:min-h-32"
        aria-live="polite"
        aria-busy={busy}
      >
        {turns.length === 0 && (
          <TutorMessage cites={note && <Cite n={note.n} label={note.label} href={note.href} />}>
            <p className="max-w-[60ch]">
              Ask me anything about {title}. I answer from your note and cite it as [1], and I will check you as we
              go.
            </p>
          </TutorMessage>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <UserMessage key={i}>
              <MathText text={turn.content} />
            </UserMessage>
          ) : (
            <TutorMessage
              key={i}
              cites={citedNumbers(turn.content, known).map((n) => {
                const s = byNumber.get(n);
                return s ? <Cite key={n} n={n} label={s.label} href={s.href} /> : null;
              })}
              actions={
                i === lastTutor && !busy ? (
                  <>
                    <Button variant="ghost" size="sm" disabled title="Saving an answer to the note is not built yet">
                      Save to note
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void ask("Why?")}>
                      Why?
                    </Button>
                  </>
                ) : undefined
              }
            >
              <NoteProse source={turn.content} idPrefix={`t${i}-`} />
            </TutorMessage>
          ),
        )}

        {busy && (
          <p className="px-1.5 text-[13px] text-text3" role="status">
            The tutor is thinking…
          </p>
        )}

        {!busy && (error || turns[turns.length - 1]?.role === "user") && (
          // An error, or a thread restored after a reload that cut a request
          // off: either way the last question has no answer, so offer it again.
          <div role={error ? "alert" : "status"} className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-text">
            <span className="min-w-0 flex-1">{error ?? "Your last question has no answer yet."}</span>
            {turns[turns.length - 1]?.role === "user" && (
              <Button variant="secondary" size="sm" onClick={retry}>
                Try again
              </Button>
            )}
          </div>
        )}

        {turns.length > 0 && !busy && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setTurns([]);
                setError(null);
              }}
              className="rounded-sm text-[12px] text-text3 underline-offset-4 hover:text-text2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Start a new thread
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
        {suggestions.map((q) => (
          <Chip key={q} onClick={() => prefill(q)}>
            {q}
          </Chip>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex items-center gap-2.5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Ask the tutor about {title}</span>
          <input
            ref={inputRef}
            autoFocus={initialDraft !== undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={INPUT_LIMIT}
            placeholder="Ask about this concept"
            autoComplete="off"
            className="h-[52px] w-full min-w-0 rounded-2xl border-2 border-border bg-surface px-4 text-[15px] text-text outline-none transition-colors duration-100 placeholder:text-text3 focus:border-accent"
          />
        </label>
        <Button type="submit" disabled={busy || draft.trim() === ""}>
          Send
        </Button>
      </form>
    </div>
  );
}
