"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Composer } from "@/components/ui/Composer";
import { isImeKey } from "@/components/ui/composer-keys";
import { ChatTurn, TutorThinking } from "@/components/workspace/ChatTurn";
import { useUnsavedChat } from "@/components/workspace/use-unsaved-chat";
import { TurnError } from "@/components/workspace/TurnError";

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
  /*
   * The turn in flight is aborted when the panel goes away (the previewer
   * closes or steps to the next asset, the row holding it leaves the list,
   * the page is left), so a reply nobody will see is not paid for to the end
   * and never lands. The player's position is read as each question is sent.
   */
  const { turns, draft, setDraft, busy, error, ask, retry, clear } = useUnsavedChat(() => ({
    assetId,
    at: position?.() ?? undefined,
  }));
  const field = useRef<HTMLTextAreaElement | null>(null);
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

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" onKeyDown={onKeyDown}>
      {turns.length > 0 && (
        <div className="flex max-h-[28rem] flex-col gap-4 overflow-y-auto" aria-live="polite">
          {turns.map((turn, i) => (
            <ChatTurn key={i} turn={turn} idPrefix={`ask${i}-`} />
          ))}
        </div>
      )}
      {busy && <TutorThinking />}
      {error !== null && <TurnError error={error} onRetry={retry} />}
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
          <Button variant="ghost" size="sm" onClick={clear}>
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
