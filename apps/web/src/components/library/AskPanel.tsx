"use client";

import { useState } from "react";

import { MathText } from "@/components/Math";
import { NoteProse } from "@/components/NoteProse";
import { Button } from "@/components/ui/Button";
import { Composer } from "@/components/ui/Composer";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import { trimForRequest, type TutorTurn } from "@/lib/tutor-thread";

interface ChatReply {
  message?: { role: "assistant"; content: string };
  error?: string;
  code?: string;
}

function errorFor(status: number, data: ChatReply): string {
  if (data.code === "MISSING_API_KEY") {
    return data.error ?? "The tutor has no model provider key yet. Add one in Settings, under Providers.";
  }
  if (status === 429) return "That was a lot of questions in a minute. Wait a moment and try again.";
  return data.error ?? `The tutor did not answer (HTTP ${status}).`;
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
 */
export function AskPanel({
  assetId,
  subject,
  position,
}: {
  assetId: string;
  /** What the composer names: "video", "note", "diagram". */
  subject: string;
  /** Where a video's player is, read as each question is sent. */
  position?: () => number | null;
}) {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (thread: TutorTurn[]) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, at: position?.() ?? undefined, messages: trimForRequest(thread) }),
      });
      const data = (await res.json().catch(() => ({}))) as ChatReply;
      if (!res.ok || data.message === undefined) {
        setError(errorFor(res.status, data));
        return;
      }
      setTurns([...thread, { role: "assistant", content: data.message.content }]);
    } catch {
      setError("The tutor did not answer: the server could not be reached.");
    } finally {
      setBusy(false);
    }
  };

  const ask = (text: string) => {
    const content = text.trim();
    if (content === "" || busy) return;
    const thread: TutorTurn[] = [...turns, { role: "user", content }];
    setTurns(thread);
    setDraft("");
    void send(thread);
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      {turns.length > 0 && (
        <div className="flex max-h-[28rem] flex-col gap-4 overflow-y-auto" aria-live="polite">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <UserMessage key={i} className="animate-enter motion-reduce:animate-none">
                <MathText text={turn.content} />
              </UserMessage>
            ) : (
              <TutorMessage key={i} className="animate-enter motion-reduce:animate-none">
                <NoteProse source={turn.content} idPrefix={`ask${i}-`} />
              </TutorMessage>
            ),
          )}
        </div>
      )}
      {busy && (
        <p className="animate-fade-in px-1.5 text-[14px] text-text2 motion-reduce:animate-none">The tutor is thinking…</p>
      )}
      {error !== null && (
        <div
          role="alert"
          className="flex animate-fade-in flex-wrap items-center gap-3 rounded-xl bg-warn-tint px-4 py-3 text-[13px] text-text motion-reduce:animate-none"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void send(turns)}>
            Try again
          </Button>
        </div>
      )}
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={ask}
        label={`Ask the tutor about this ${subject}`}
        placeholder={`Ask about this ${subject}`}
        sendDisabled={busy}
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
