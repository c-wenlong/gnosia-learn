import { useCallback, useEffect, useRef, useState } from "react";

import { tutorProblem } from "@/lib/tutor-errors";
import { trimForRequest, type TutorTurn } from "@/lib/tutor-thread";
import { takeUnanswered } from "@/components/workspace/unanswered";

interface ChatReply {
  message?: { role: "assistant"; content: string };
  error?: string;
  code?: string;
}

/** The fields of `/api/agent/chat`'s body besides `messages`: what the chat is about. */
export type ChatRequest = Record<string, unknown>;

export interface UnsavedChat {
  turns: TutorTurn[];
  draft: string;
  setDraft: (draft: string) => void;
  /** A turn is in flight. */
  busy: boolean;
  /** Why the last turn failed, for a Callout with Try again; null when it did not. */
  error: string | null;
  /** Sends a question typed in the composer. Refused when it is blank or a turn is in flight. */
  ask: (text: string) => void;
  /** Sends the thread as it stands again: Try again after a failed turn. */
  retry: () => void;
  /**
   * Opens the chat on `thread` and sends it on the next microtask, so a call
   * from an effect survives React's development double effect, whose cleanup
   * would abort a request sent in the first pass.
   */
  begin: (thread: TutorTurn[]) => void;
  /** Empties the thread, dropping a turn in flight and an error with it. */
  clear: () => void;
}

/**
 * A tutor chat that is saved nowhere: the open tutor at `/ask` and Ask on a
 * library asset. The thread is this hook's state and nothing else, and every
 * turn posts it to `/api/agent/chat` with what `request` returns, read as each
 * turn is sent (a video's position moves between questions).
 *
 * Every turn is paid for with the owner's provider keys, so a turn nobody
 * will see is aborted: when the chat unmounts, and when a new send replaces
 * one still in flight. An aborted turn changes nothing on screen. A question
 * asked after a failed one takes its place, so two learner turns never go out
 * in a row.
 */
export function useUnsavedChat(request: () => ChatRequest): UnsavedChat {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);

  // The latest `request`, so `send` stays one function for the chat's life
  // (a caller's effect depends on it) and still reads the current props.
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  });

  const send = useCallback(async (thread: TutorTurn[]) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestRef.current(), messages: trimForRequest(thread) }),
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
  }, []);

  const ask = (text: string) => {
    const content = text.trim();
    if (content === "" || busy) return;
    const thread: TutorTurn[] = [...(takeUnanswered(turns)?.rest ?? turns), { role: "user", content }];
    setTurns(thread);
    setDraft("");
    void send(thread);
  };

  const begin = useCallback(
    (thread: TutorTurn[]) => {
      setTurns(thread);
      void Promise.resolve().then(() => send(thread));
    },
    [send],
  );

  const clear = () => {
    inflight.current?.abort();
    inflight.current = null;
    setTurns([]);
    setError(null);
    setBusy(false);
  };

  return { turns, draft, setDraft, busy, error, ask, retry: () => void send(turns), begin, clear };
}
