"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MathText } from "@/components/Math";
import { NoteProse } from "@/components/NoteProse";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Composer } from "@/components/ui/Composer";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import { ASK_START_KEY } from "@/lib/ask-core";
import { tutorProblem } from "@/lib/tutor-errors";
import { trimForRequest, type TutorTurn } from "@/lib/tutor-thread";

interface ChatReply {
  message?: { role: "assistant"; content: string };
  error?: string;
  code?: string;
}

/**
 * The open tutor's chat (docs/proposals/home-page.md, part 1): a conversation
 * on a subject nothing in the catalog covers, reached from Home's Ask box.
 *
 * It opens by asking for the subject itself, so the tutor's first turn is its
 * question about where the learner starts. It sends that opening on its own
 * only when the Ask box sent the owner here (`ASK_START_KEY`, read once);
 * from a link or a reload it waits for Start, since every turn is paid for
 * with the owner's provider keys and a link can come from anywhere. The
 * thread lives in this page's state and nowhere else: it is not saved and
 * records no mastery (H4), which the page says above the chat. A failed turn
 * stays on screen with Try again, which resends the same thread.
 *
 * Until the browser has said which it is, it draws nothing, rather than an
 * empty chat that Start then replaces; Start and the chat each fade in, and
 * every turn rises in as it is added (none is restored: the thread is not
 * saved).
 */
export function OpenTutorChat({ subject }: { subject: string }) {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Null until the browser has said whether the Ask box asked for this subject. */
  const [waiting, setWaiting] = useState<boolean | null>(null);
  const started = useRef(false);

  const send = useCallback(
    async (thread: TutorTurn[]) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, messages: trimForRequest(thread) }),
        });
        const data = (await res.json().catch(() => ({}))) as ChatReply;
        if (!res.ok || data.message === undefined) {
          setError(tutorProblem(res.status, data));
          return;
        }
        setTurns([...thread, { role: "assistant", content: data.message.content }]);
      } catch {
        setError("The tutor did not answer: the server could not be reached.");
      } finally {
        setBusy(false);
      }
    },
    [subject],
  );

  const ask = (text: string) => {
    const content = text.trim();
    if (content === "" || busy) return;
    const thread: TutorTurn[] = [...turns, { role: "user", content }];
    setTurns(thread);
    setDraft("");
    void send(thread);
  };

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setWaiting(false);
    const opening: TutorTurn[] = [{ role: "user", content: `I want to learn about ${subject}.` }];
    setTurns(opening);
    void send(opening);
  }, [send, subject]);

  useEffect(() => {
    let asked = false;
    try {
      asked = window.sessionStorage.getItem(ASK_START_KEY) === subject;
      window.sessionStorage.removeItem(ASK_START_KEY);
    } catch {
      // No storage: wait for Start.
    }
    if (asked) start();
    // What session storage said is only known here, after hydration, so the
    // first render draws neither the chat nor Start. A second run (React's
    // development double effect) finds the mark gone, and must not put a chat
    // that already started back behind Start.
    else if (!started.current) setWaiting(true);
  }, [start, subject]);

  // Before hydration has read session storage: neither Start nor the chat, so neither flashes.
  if (waiting === null) return null;

  if (waiting) {
    return (
      <div className="flex animate-fade-in flex-col items-start gap-3 motion-reduce:animate-none">
        <p className="text-[14px] text-text2">The tutor starts by asking where you are with it.</p>
        <Button onClick={start}>Start</Button>
      </div>
    );
  }

  return (
    <div className="flex animate-fade-in flex-col gap-5 motion-reduce:animate-none">
      <div className="flex flex-col gap-4" aria-live="polite">
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <UserMessage key={i} className="animate-enter motion-reduce:animate-none">
              <MathText text={turn.content} />
            </UserMessage>
          ) : (
            <TutorMessage key={i} className="animate-enter motion-reduce:animate-none">
              <NoteProse source={turn.content} idPrefix={`t${i}-`} images="link" />
            </TutorMessage>
          ),
        )}
        {busy && <p className="animate-fade-in px-1.5 text-[14px] text-text2 motion-reduce:animate-none">The tutor is thinking…</p>}
        {error !== null && (
          <Callout
            role="alert"
            className="animate-fade-in motion-reduce:animate-none"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void send(turns)}>
                Try again
              </Button>
            }
          >
            {error}
          </Callout>
        )}
      </div>
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={ask}
        label={`Ask the tutor about ${subject}`}
        placeholder="Answer, or ask a question"
        sendDisabled={busy}
      />
    </div>
  );
}
