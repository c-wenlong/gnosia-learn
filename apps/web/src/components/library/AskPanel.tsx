"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { MathText } from "@/components/Math";
import { NoteProse } from "@/components/NoteProse";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Composer } from "@/components/ui/Composer";
import { isImeKey } from "@/components/ui/composer-keys";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import { tutorProblem } from "@/lib/tutor-errors";
import { trimForRequest, type TutorTurn } from "@/lib/tutor-thread";
import { takeUnanswered } from "@/components/workspace/unanswered";

interface ChatReply {
  message?: { role: "assistant"; content: string };
  error?: string;
  code?: string;
}

/**
 * Ask on a library asset: quick questions about the video, note or diagram
 * open on the page, answered on the spot by `/api/agent/chat`, which reads
 * the asset's words on the server (a video's transcript, a note's markdown, a
 * diagram's labels). A video also sends the player's position (`at`).
 *
 * The thread is this component's state and nothing else. It is not saved,
 * records no mastery and appends no event, and the line above the composer
 * says so; Clear empties it. The panel stays mounted while it is closed
 * (`Collapse`), so closing and reopening it mid-watch keeps the thread, and
 * leaving the page loses it. Nothing is sent until the learner asks: every
 * turn is paid for with the owner's provider keys.
 *
 * Opening it puts the cursor in the field, so a press on Ask is ready to
 * type. Escape in the field closes the fold and hands focus back to Ask
 * (`onDismiss`), keeping what was typed; the key is spent there, so the
 * previewer's dialog does not close over it. A second Escape, now on Ask,
 * closes the previewer as anywhere else in it.
 */
export function AskPanel({
  assetId,
  subject,
  position,
  open,
  onDismiss,
}: {
  assetId: string;
  /** Whether the fold or dialog holding it is open: on opening, the field takes focus. */
  open?: boolean;
  /**
   * Escape in the field: close the fold and put focus back on Ask. Absent in
   * the row menu's Ask dialog, where Escape closes that dialog as usual.
   */
  onDismiss?: () => void;
  /** What the composer names: "video", "note", "diagram". */
  subject: string;
  /** Where a video's player is, read as each question is sent. */
  position?: () => number | null;
}) {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);
  /**
   * The turn in flight, aborted when the panel goes away (the previewer
   * closes or steps to the next asset, the row holding it leaves the list,
   * the page is left), so a reply nobody will see is not paid for to the end
   * and never lands.
   */
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (onDismiss === undefined) return;
    if (!askFieldEscape(event.key, event.target === field.current, isImeKey(event.nativeEvent))) return;
    // Spent here: a modal dialog's close request comes from an Escape keydown
    // nobody cancelled.
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  };

  const send = async (thread: TutorTurn[]) => {
    const controller = new AbortController();
    inflight.current = controller;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, at: position?.() ?? undefined, messages: trimForRequest(thread) }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as ChatReply;
      if (controller.signal.aborted) return;
      if (!res.ok || data.message === undefined) {
        setError(tutorProblem(res.status, data));
        return;
      }
      setTurns([...thread, { role: "assistant", content: data.message.content }]);
    } catch {
      if (!controller.signal.aborted) setError("The tutor did not answer: the server could not be reached.");
    } finally {
      if (inflight.current === controller) inflight.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const ask = (text: string) => {
    const content = text.trim();
    if (content === "" || busy) return;
    // A question after a failed one takes its place, so two learner turns never go out in a row.
    const thread: TutorTurn[] = [...(takeUnanswered(turns)?.rest ?? turns), { role: "user", content }];
    setTurns(thread);
    setDraft("");
    void send(thread);
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" onKeyDown={onKeyDown}>
      {turns.length > 0 && (
        <div className="flex max-h-[28rem] flex-col gap-4 overflow-y-auto" aria-live="polite">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <UserMessage key={i} className="animate-enter motion-reduce:animate-none">
                <MathText text={turn.content} />
              </UserMessage>
            ) : (
              <TutorMessage key={i} className="animate-enter motion-reduce:animate-none">
                <NoteProse source={turn.content} idPrefix={`ask${i}-`} images="link" />
              </TutorMessage>
            ),
          )}
        </div>
      )}
      {busy && (
        <p className="animate-fade-in px-1.5 text-[14px] text-text2 motion-reduce:animate-none">The tutor is thinking…</p>
      )}
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
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={ask}
        label={`Ask the tutor about this ${subject}`}
        placeholder={`Ask about this ${subject}`}
        sendDisabled={busy}
        inputRef={field}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-text3">Not saved. Leaving the page clears it, and nothing here moves mastery.</p>
        {turns.length > 0 && !busy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTurns([]);
              setError(null);
            }}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Whether a key closes the Ask fold: Escape, typed in the field, and not the
 * Escape that cancels an input method's composition.
 */
export function askFieldEscape(key: string, inField: boolean, composing: boolean): boolean {
  return key === "Escape" && inField && !composing;
}
