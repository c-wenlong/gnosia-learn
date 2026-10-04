"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent } from "react";

import { NoteProse } from "@/components/NoteProse";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/classes";
import { Cite } from "@/components/ui/Cite";
import { Composer } from "@/components/ui/Composer";
import { MathText } from "@/components/Math";
import { MentionChip } from "@/components/ui/MentionChip";
import type { MentionComposerHandle } from "@/components/ui/MentionComposer";
import type { MentionValue } from "@/components/ui/mention-text";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import type { CitationSource } from "@/lib/agent/prompt";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import type { DraftKind } from "@/lib/studio-drafts";
import { HEALTH_READ_MS, readHealth, studioCanTag, whenIdle } from "@/lib/tutor-studio";
import {
  chatTurns,
  citedNumbers,
  markerPieces,
  parseThread,
  threadKey,
  trimForRequest,
  type HandoffMarker,
  type ThreadItem,
} from "@/lib/tutor-thread";

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
 *
 * **Tags, where the studio can take them** (docs/STUDIO-TUTOR-HANDOFF.md).
 * With `studio` (the server's `studioEnabled()`), the page reads the studio's
 * health once it is idle, and again on focus at most every 30 seconds. A good
 * answer fetches `TutorStudioKit`, the @ composer and the hand-off in one
 * chunk, and swaps it in for the plain field only while the field is empty
 * and not focused, so nothing is swapped under a caret or an IME composition
 * (D68). Until then, and for good when the studio is off, down or the chunk
 * will not load, the field is the plain `Composer`, and an `@video` typed
 * there is words to the tutor (H18).
 *
 * A message with no chip goes to the tutor as before. A message with a chip
 * goes to a new studio conversation about this concept, in this tab, and is
 * sent there on arrival (D64); the thread keeps it as a marker linking to
 * that conversation (D70), which is never sent to the tutor.
 *
 * **Motion.** A turn added here rises in (`animate-enter`); turns restored
 * from storage, which arrive in the render after hydration, only fade in, as
 * the greeting does, and the greeting is not drawn at all until the client
 * knows whether a thread replaces it, so neither flashes for a frame. The
 * thread glides to its newest turn, except on its first paint and under
 * reduced motion, where it jumps.
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

/** True once the client has hydrated; false on the server and the hydrating render. */
const noSubscribe = () => () => undefined;

function writeTurns(key: string, turns: ThreadItem[]): void {
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
    // The server says which case it is: no key anywhere, or a model list
    // whose providers have none (docs/TUTOR-MODELS.md, T4).
    return data.error ?? "The tutor has no model provider key yet. Add one in Settings, under Provider keys.";
  }
  if (data.code === "CONCEPT_UNAVAILABLE") return "The knowledge base is unreachable, so the tutor has no note to read.";
  if (status === 429) return "That was a lot of questions in a minute. Wait a moment and try again.";
  return data.error ?? `The tutor did not answer (HTTP ${status}).`;
}

type Value = MentionValue<DraftKind>;
type Kit = typeof import("./TutorStudioKit");

const EMPTY: Value = { text: "", mentions: [] };

export function TutorChat({
  slug,
  title,
  sources: initialSources,
  suggestions,
  initialDraft,
  studio = false,
}: {
  slug: string;
  title: string;
  sources: CitationSource[];
  suggestions: string[];
  /** Put in the input, not sent: a session's "Ask the tutor" (`?ask=`). H16: words, never a chip. */
  initialDraft?: string;
  /** `studioEnabled()` on the server: whether to ask the studio at all (D67). */
  studio?: boolean;
}) {
  const router = useRouter();
  const key = threadKey(slug);
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  const turns = useMemo(() => parseThread(raw), [raw]);
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  /**
   * How many turns were already stored when the page opened: those were said
   * before, and fade in; a turn at this index or later is new, and rises in.
   * Read from storage once, on the client, where the server's empty thread is
   * not the truth. "Start a new thread" puts it back to zero.
   */
  const [restored, setRestored] = useState(() => (typeof window === "undefined" ? 0 : parseThread(readRaw(key)).length));
  const setTurns = (next: ThreadItem[]) => writeTurns(key, next);
  const [sources, setSources] = useState(initialSources);
  // `?ask=` fills the field once. Its first send takes it off the URL
  // (`dropAsk`), so Back to this page, whose cached render still carries the
  // prefill, finds a URL without it and leaves the field empty.
  const [value, setValueState] = useState<Value>(() => ({
    text: initialDraft !== undefined && askInUrl() ? initialDraft : "",
    mentions: [],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  /* The studio's half: health, the lazy chunk, the swap and the hand-off. */
  const [health, setHealth] = useState<unknown>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  /** The @ composer is in the plain field's place; once in, it stays. */
  const [swapped, setSwapped] = useState(false);
  /** Whether the swapped-in field takes focus when it mounts: only when the plain one had it, after a send. */
  const [focusOnSwap, setFocusOnSwap] = useState(false);
  const [opening, setOpening] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const richRef = useRef<MentionComposerHandle | null>(null);
  // Read by the swap, which runs from callbacks that outlive the render that made them.
  const valueNow = useRef(value);
  const focused = useRef(false);
  const kitNow = useRef<Kit | null>(null);
  const setValue = useCallback((next: Value) => {
    valueNow.current = next;
    setValueState(next);
  }, []);

  /**
   * Swap the @ composer in if the field is idle: loaded, empty and not
   * focused (D68). `afterSend` is the one moment a focused field may be
   * swapped, since it has just been emptied and nothing is being composed;
   * the new field then takes the focus.
   */
  const swapIfIdle = useCallback((afterSend = false) => {
    if (kitNow.current === null) return;
    const held = valueNow.current;
    if (held.text !== "" || held.mentions.length > 0) return;
    if (focused.current && !afterSend) return;
    setFocusOnSwap(afterSend && focused.current);
    setSwapped(true);
  }, []);

  const readAt = useRef(0);
  const kitAsked = useRef(false);
  const check = useCallback(async () => {
    readAt.current = Date.now();
    const answer = await readHealth();
    setHealth(answer);
    if (!studioCanTag(answer) || kitAsked.current) return;
    kitAsked.current = true;
    try {
      const loaded = await import("./TutorStudioKit");
      kitNow.current = loaded;
      setKit(loaded);
      swapIfIdle();
    } catch {
      // A chunk that will not load costs the tags, never the tutor: the
      // plain field stays, as the studio's own fallback does (D68).
    }
  }, [swapIfIdle]);

  useEffect(() => {
    if (!studio) return;
    // One read once the page is idle, so the page never waits on the runner,
    // then on focus at most every 30 seconds (D67).
    const cancel = whenIdle(() => void check());
    const onFocus = () => {
      if (Date.now() - readAt.current >= HEALTH_READ_MS) void check();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancel();
      window.removeEventListener("focus", onFocus);
    };
  }, [studio, check]);

  const onFieldFocus = () => {
    focused.current = true;
  };
  const onFieldBlur = (event: FocusEvent<HTMLDivElement>) => {
    // Focus moving to Send, or into the menu, is still the field's.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    // The window lost focus (another app, another tab): the field keeps it
    // and its caret, and gets it back with the window, so nothing is swapped.
    if (!document.hasFocus()) return;
    focused.current = false;
    swapIfIdle();
  };

  const scrolledOnce = useRef(false);
  useEffect(() => {
    // The thread box scrolls, never the page: on a phone the page is where the
    // learner is reading.
    const box = threadRef.current;
    if (!box) return;
    const glide = scrolledOnce.current && turns.length > 0 && !prefersReducedMotion();
    scrolledOnce.current = turns.length > 0;
    if (glide) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    else box.scrollTop = box.scrollHeight;
  }, [turns.length, busy]);

  async function ask(question: string, history: ThreadItem[] = turns) {
    const text = question.trim();
    if (!text || busy || opening) return;
    const next: ThreadItem[] = [...history, { role: "user", content: text }];
    setTurns(next);
    setValue(EMPTY);
    setRefusal(null);
    dropAsk();
    swapIfIdle(true);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Markers are the person's record of a hand-off, not the tutor's turns.
        body: JSON.stringify({ conceptSlug: slug, messages: trimForRequest(chatTurns(next)) }),
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
    // The unanswered question, past any hand-off marker after it: asked
    // again from where it was, so the thread never holds it twice.
    const at = turns.findLastIndex((item) => item.role !== "studio");
    const unanswered = turns[at];
    if (unanswered?.role !== "user") return;
    void ask(unanswered.content, [...turns.slice(0, at), ...turns.slice(at + 1)]);
  }

  function prefill(question: string) {
    // The field is locked with the message going to the studio in it.
    if (opening) return;
    setValue({ text: question, mentions: [] });
    if (swapped) richRef.current?.focus();
    else inputRef.current?.focus();
  }

  /** A send from the @ composer: the tutor's without a chip, the studio's with one (D64). */
  function submitTagged(sent: Value) {
    if (kit === null) return;
    const body = kit.trimValue(sent);
    if (kit.isEmptyValue(body)) return;
    if (body.mentions.length === 0) void ask(body.text);
    else void handOff(body);
  }

  async function handOff(body: Value) {
    if (kit === null || busy || opening) return;
    setOpening(true);
    setRefusal(null);
    const outcome = await kit.openInStudio({ slug, title, items: parseThread(readRaw(key)), value: body });
    if (!outcome.ok) {
      // The message and its chips stay in the field; nothing reached either agent.
      setOpening(false);
      setRefusal(outcome.text);
      return;
    }
    // The field stays locked until the page has gone, so nothing typed now is lost.
    writeTurns(key, [...parseThread(readRaw(key)), outcome.marker]);
    setValue(EMPTY);
    dropAsk();
    router.push(outcome.href);
  }

  const known = sources.map((s) => s.n);
  const byNumber = new Map(sources.map((s) => [s.n, s]));
  const lastTutor = turns.map((t) => t.role).lastIndexOf("assistant");
  // The tutor's last turn, markers left out: a hand-off after an unanswered
  // question must not hide its Try again.
  const last = chatTurns(turns).at(-1);
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
          <TutorMessage
            cites={note && <Cite n={note.n} label={note.label} href={note.href} />}
            // Unseen until hydration has said there is no stored thread to show instead.
            className={hydrated ? "animate-fade-in motion-reduce:animate-none" : "opacity-0"}
          >
            <p className="max-w-[60ch]">
              Ask me anything about {title}. I answer from your note and cite it as [1], and I will check you as we
              go.
            </p>
          </TutorMessage>
        )}

        {turns.map((turn, i) => {
          const enter = i < restored ? "animate-fade-in motion-reduce:animate-none" : "animate-enter motion-reduce:animate-none";
          return turn.role === "studio" ? (
            <Handed key={i} marker={turn} className={enter} />
          ) : turn.role === "user" ? (
            <UserMessage key={i} className={enter}>
              <MathText text={turn.content} />
            </UserMessage>
          ) : (
            <TutorMessage
              key={i}
              className={enter}
              cites={citedNumbers(turn.content, known).map((n) => {
                const s = byNumber.get(n);
                return s ? <Cite key={n} n={n} label={s.label} href={s.href} /> : null;
              })}
              actions={
                i === lastTutor && !busy ? (
                  // The hi-fi's "Save to note" joins Why? here once a turn can be
                  // written to the note (DESIGN.md: extend POST /api/learner/note).
                  <Button variant="ghost" size="sm" onClick={() => void ask("Why?")}>
                    Why?
                  </Button>
                ) : undefined
              }
            >
              <NoteProse source={turn.content} idPrefix={`t${i}-`} />
            </TutorMessage>
          );
        })}

        {busy && (
          <p className="animate-fade-in px-1.5 text-[13px] text-text3 motion-reduce:animate-none" role="status">
            The tutor is thinking…
          </p>
        )}

        {!busy && (error || last?.role === "user") && (
          // An error, or a thread restored after a reload that cut a request
          // off: either way the last question has no answer, so offer it again.
          <div
            role={error ? "alert" : "status"}
            className="flex animate-fade-in flex-wrap items-center gap-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-text motion-reduce:animate-none"
          >
            <span className="min-w-0 flex-1">{error ?? "Your last question has no answer yet."}</span>
            {last?.role === "user" && (
              <Button variant="secondary" size="sm" onClick={retry}>
                Try again
              </Button>
            )}
          </div>
        )}

        {turns.length > 0 && !busy && (
          <div className="flex animate-fade-in justify-center motion-reduce:animate-none">
            <button
              type="button"
              onClick={() => {
                setTurns([]);
                setRestored(0);
                setError(null);
              }}
              className="rounded-sm text-[12px] text-text3 underline-offset-4 transition-colors duration-100 hover:text-text2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

      {/* Under 768px the page scrolls, and the composer sticks to the bottom
          edge, above the home indicator, so a field that grows while the page
          is scrolled cannot end up below the screen with Send half hidden.
          The surface fill and the panel's 16px side padding keep what scrolls
          past from showing at its edges. From 768px it sits in the flow. */}
      <div
        onFocus={onFieldFocus}
        onBlur={onFieldBlur}
        className="flex flex-col gap-1.5 max-md:sticky max-md:bottom-[env(safe-area-inset-bottom)] max-md:z-10 max-md:-mx-4 max-md:bg-surface max-md:px-4 max-md:pt-1.5 max-md:pb-2"
      >
        {kit !== null && swapped ? (
          // The @ field fades in over the plain one it replaces.
          <div className="flex animate-fade-in flex-col motion-reduce:animate-none">
            <kit.TutorMentionField
              handleRef={richRef}
              value={value}
              onChange={setValue}
              onSubmit={submitTagged}
              label={`Ask the tutor about ${title}`}
              health={health}
              disabled={opening}
              sendDisabled={busy}
              disabledReason={opening ? kit.OPENING_THE_STUDIO : undefined}
              autoFocus={focusOnSwap}
            />
          </div>
        ) : (
          <Composer
            value={value.text}
            onChange={(text) => setValue({ text, mentions: [] })}
            onSubmit={(text) => void ask(text)}
            label={`Ask the tutor about ${title}`}
            placeholder="Ask about this concept"
            maxLength={INPUT_LIMIT}
            autoFocus={initialDraft !== undefined}
            inputRef={inputRef}
            sendDisabled={busy}
          />
        )}
        {refusal !== null && (
          <p role="alert" className="animate-fade-in rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-text motion-reduce:animate-none">
            {refusal}
          </p>
        )}
      </div>
    </div>
  );
}

/** Whether the page's URL still carries `?ask=`. Server-side, where there is no URL, it is taken to. */
function askInUrl(): boolean {
  return typeof window === "undefined" || new URLSearchParams(window.location.search).has("ask");
}

/** Take `?ask=` off the URL in place, once the question it prefilled has been sent. */
function dropAsk(): void {
  if (!askInUrl() || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("ask");
  // Next folds a native replaceState into its router (the docs' "Native History API").
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

const KIND_NAMES: Record<string, string> = { diagram: "Diagram", video: "Video" };

/**
 * A tagged message the studio took (D70): the words with their chips, as the
 * studio draws a sent message, and a link to the conversation it opened.
 */
function Handed({ marker, className }: { marker: HandoffMarker; className?: string }) {
  return (
    <div className={cx("flex flex-col items-end gap-1", className)}>
      <UserMessage className="w-full">
        {markerPieces(marker).map((piece, at) =>
          "text" in piece ? (
            <span key={at}>{piece.text}</span>
          ) : (
            <MentionChip
              key={at}
              name={KIND_NAMES[piece.kind] ?? piece.kind}
              icon={piece.kind === "diagram" || piece.kind === "video" ? piece.kind : null}
            />
          ),
        )}
      </UserMessage>
      <Link
        href={`/studio?draft=${encodeURIComponent(marker.draftId)}`}
        className="rounded-sm px-1.5 text-[12px] text-text2 underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Opened in the studio
      </Link>
    </div>
  );
}
