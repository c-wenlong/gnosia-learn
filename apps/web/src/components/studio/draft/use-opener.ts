"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import type { Value } from "@/components/studio/draft/thread";
import { prependValue } from "@/lib/mentions";
import { openerSend, openerValue } from "@/lib/studio-cards";
import { isEmptyConversation } from "@/lib/studio-chat";
import type { DraftView } from "@/lib/studio-drafts";
import { forgetExtendKey, OPENER_EVENT, sessionStore, takeOpener } from "@/lib/studio-extend";

/**
 * Arriving from Extend, from Talk it through on a failed job, or from a
 * video's Change: the opener left for this draft, taken once so a reload
 * never sends it again, and sent only into a conversation that is still
 * empty. A page that leaves one while this conversation is already open
 * says so with `OPENER_EVENT`, and it is taken then.
 */
export function useOpener({
  draftId,
  ready,
  view,
  send,
  setValue,
  focusSoon,
}: {
  draftId: string;
  ready: boolean;
  view: DraftView | null;
  send: (value: Value, options: { keepComposer: boolean }) => Promise<boolean>;
  setValue: Dispatch<SetStateAction<Value>>;
  focusSoon: () => void;
}) {
  // The opener effect below is a callback made once per draft, so it reaches
  // `send` through this, which always holds the latest render's (whose
  // `view` is the record, not the first render's null).
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const takeWaitingOpener = useCallback(
    (current: DraftView) => {
      const store = sessionStore();
      const opener = takeOpener(store, draftId);
      if (opener === null) return;
      // Arrived: a reload of the press that made this draft may now mint a new one.
      if (opener.source !== null) forgetExtendKey(store, opener.source);
      const composed = openerValue(opener);
      if (composed !== null) {
        // The composer first, chips ahead of the words, and a send that leaves
        // it alone: a message queued during the read and a second one still
        // being typed both survive. The composer may not be on screen yet (the
        // panel is showing a job, or the field is still loading); it builds
        // itself from this value when it mounts.
        // In front of anything already typed, never over it.
        setValue((held) => prependValue(composed, held));
        focusSoon();
      }
      const first = openerSend(opener);
      if (first !== null && isEmptyConversation(current.transcript) && !current.inFlight) {
        void sendRef.current(first, { keepComposer: true });
      }
    },
    [draftId, focusSoon, setValue],
  );

  const opened = useRef(false);
  useEffect(() => {
    if (!ready || view === null || opened.current) return;
    opened.current = true;
    takeWaitingOpener(view);
  }, [ready, view, takeWaitingOpener]);

  const viewRef = useRef<DraftView | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    const onOpener = (event: Event) => {
      const detail = (event as CustomEvent<{ draftId?: unknown }>).detail;
      if (detail?.draftId !== draftId || viewRef.current === null) return;
      takeWaitingOpener(viewRef.current);
    };
    window.addEventListener(OPENER_EVENT, onOpener);
    return () => window.removeEventListener(OPENER_EVENT, onOpener);
  }, [draftId, takeWaitingOpener]);
}
