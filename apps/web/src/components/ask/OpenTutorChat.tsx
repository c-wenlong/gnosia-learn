"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Composer } from "@/components/ui/Composer";
import { ASK_START_KEY } from "@/lib/ask-core";
import { ChatTurn, TutorThinking } from "@/components/workspace/ChatTurn";
import { useUnsavedChat } from "@/components/workspace/use-unsaved-chat";
import { TurnError } from "@/components/workspace/TurnError";

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
 * stays on screen with Try again, which resends the same thread; a question
 * typed instead takes the unanswered one's place. Leaving aborts the turn in
 * flight.
 *
 * Until the browser has said which it is, it draws nothing, rather than an
 * empty chat that Start then replaces; Start and the chat each fade in, and
 * every turn rises in as it is added (none is restored: the thread is not
 * saved).
 */
export function OpenTutorChat({ subject }: { subject: string }) {
  // The turn in flight is aborted when the chat goes away (a new subject
  // remounts it, and so does leaving the page), so a reply nobody will see is
  // not paid for to the end and never lands.
  const { turns, draft, setDraft, busy, error, ask, retry, begin } = useUnsavedChat(() => ({ subject }));
  /** Null until the browser has said whether the Ask box asked for this subject. */
  const [waiting, setWaiting] = useState<boolean | null>(null);
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setWaiting(false);
    // Sent on a microtask, as the concept tutor's opening is: under React's
    // development double effect the hook's abort runs between the two passes,
    // and would cut a request the effect below had already sent.
    begin([{ role: "user", content: `I want to learn about ${subject}.` }]);
  }, [begin, subject]);

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
        {turns.map((turn, i) => (
          <ChatTurn key={i} turn={turn} idPrefix={`t${i}-`} />
        ))}
        {busy && <TutorThinking />}
        {error !== null && <TurnError error={error} onRetry={retry} />}
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
