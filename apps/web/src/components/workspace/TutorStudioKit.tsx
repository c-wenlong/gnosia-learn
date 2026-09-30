"use client";

import { useMemo, type Ref } from "react";

import { openConceptConversation } from "@/app/(app)/studio/actions";
import { MentionComposer, type MentionComposerHandle } from "@/components/ui/MentionComposer";
import type { MentionValue } from "@/components/ui/mention-text";
import { MENTION_HINT } from "@/lib/studio-cards";
import { idempotencyKey, type DraftKind } from "@/lib/studio-drafts";
import { extendKey, forgetExtendKey, leaveOpener, sessionStore } from "@/lib/studio-extend";
import { conversationHref } from "@/lib/studio-view";
import {
  handoffKeyName,
  handoffPrint,
  handoffRefusal,
  handoffTurns,
  tagSendBlock,
  tutorLengthBlock,
  tutorMentionOptions,
  TUTOR_MENTION_PLACEHOLDER,
  type ConceptConversation,
} from "@/lib/tutor-handoff";
import type { HandoffMarker, ThreadItem } from "@/lib/tutor-thread";

export { isEmptyValue, trimValue } from "@/components/ui/mention-text";
export { OPENING_THE_STUDIO } from "@/lib/tutor-handoff";

/**
 * The concept tutor's studio half (docs/STUDIO-TUTOR-HANDOFF.md, D67 and D68):
 * the @ composer and the hand-off, as one chunk the concept page imports only
 * after a health answer says a tag can work. Nothing here is on the page's
 * first load, so a deployment without a studio never fetches Lexical, and a
 * studio that is down never does either.
 *
 * `TutorChat` owns the value and the thread; this draws the field and makes
 * the conversation.
 */

type Value = MentionValue<DraftKind>;

export function TutorMentionField({
  value,
  onChange,
  onSubmit,
  label,
  health,
  disabled,
  sendDisabled,
  disabledReason,
  autoFocus,
  handleRef,
}: {
  value: Value;
  onChange: (value: Value) => void;
  onSubmit: (value: Value) => void;
  label: string;
  /** The newest `/api/health` answer, or null when the last read got none. */
  health: unknown;
  disabled: boolean;
  sendDisabled: boolean;
  disabledReason?: string;
  autoFocus: boolean;
  handleRef: Ref<MentionComposerHandle>;
}) {
  const options = useMemo(() => tutorMentionOptions(health), [health]);
  const tagBlock = tagSendBlock(value, options);
  const tooLong = tutorLengthBlock(value);
  return (
    <MentionComposer<DraftKind>
      handleRef={handleRef}
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      label={label}
      placeholder={TUTOR_MENTION_PLACEHOLDER}
      mentions={options}
      mentionHint={MENTION_HINT}
      disabled={disabled}
      sendDisabled={sendDisabled || tagBlock !== null || tooLong !== null}
      disabledReason={disabledReason ?? tagBlock ?? tooLong ?? undefined}
      autoFocus={autoFocus}
    />
  );
}

export type Handoff = { ok: true; href: string; marker: HandoffMarker } | { ok: false; text: string };

/**
 * A tagged message to a new studio conversation (D64): the server action
 * makes the draft with the concept and the tutor's last turns, and the
 * message goes as the conversation's opener, sent when it opens. One
 * idempotency key per press, kept five minutes as Extend's is (H6), and
 * forgotten once the draft exists, so the next tagged message makes a new
 * conversation (D70). A kept key is reused only for the same message and
 * turns (`handoffPrint`), so a retry after a timeout finds the draft it may
 * have made, and an edited retry makes its own.
 */
export async function openInStudio({
  slug,
  title,
  items,
  value,
  store = sessionStore(),
}: {
  slug: string;
  title: string;
  items: readonly ThreadItem[];
  value: Value;
  /** The tab's `sessionStorage`; a test's own store. */
  store?: Storage | null;
}): Promise<Handoff> {
  const name = handoffKeyName(slug);
  const tutor = handoffTurns(items);
  const key = extendKey(store, name, () => idempotencyKey("tutor"), Date.now(), handoffPrint(value, tutor));
  let answer: ConceptConversation;
  try {
    answer = await openConceptConversation({ slug, tutor, idempotencyKey: key });
  } catch {
    // The action itself did not come back: this app's own server, not the runner.
    return { ok: false, text: "The page could not reach its server, so nothing was sent. Try again." };
  }
  if (!answer.ok) return { ok: false, text: handoffRefusal(answer, title) };
  forgetExtendKey(store, name);
  // Read back by `leaveOpener`, and kept in this page's memory when the store
  // refuses it, so the conversation always has the message to send (Greptile on #234).
  leaveOpener(store, answer.draftId, { send: value.text, sendMentions: value.mentions, compose: "", source: null });
  return {
    ok: true,
    href: conversationHref("/studio", answer.draftId),
    marker: { role: "studio", content: value.text, mentions: value.mentions, draftId: answer.draftId },
  };
}
