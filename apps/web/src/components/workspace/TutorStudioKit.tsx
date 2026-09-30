"use client";

import { useMemo, type Ref } from "react";

import { openConceptConversation } from "@/app/(app)/studio/actions";
import { MentionComposer, type MentionComposerHandle } from "@/components/ui/MentionComposer";
import type { MentionValue } from "@/components/ui/mention-text";
import { lengthSendBlock, MENTION_HINT } from "@/lib/studio-cards";
import { idempotencyKey, type DraftKind } from "@/lib/studio-drafts";
import { extendKey, forgetExtendKey, leaveOpener, sessionStore } from "@/lib/studio-extend";
import { conversationHref } from "@/lib/studio-view";
import {
  handoffKeyName,
  handoffRefusal,
  handoffTurns,
  tagSendBlock,
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

/** The tutor's own input limit, which a tagged message keeps too: it is the same field. */
const INPUT_LIMIT = 4_000;

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
  const tooLong = lengthSendBlock(value, INPUT_LIMIT);
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
 * conversation (D70).
 */
export async function openInStudio({
  slug,
  title,
  items,
  value,
}: {
  slug: string;
  title: string;
  items: readonly ThreadItem[];
  value: Value;
}): Promise<Handoff> {
  const store = sessionStore();
  const name = handoffKeyName(slug);
  const key = extendKey(store, name, () => idempotencyKey("tutor"));
  let answer: ConceptConversation;
  try {
    answer = await openConceptConversation({ slug, tutor: handoffTurns(items), idempotencyKey: key });
  } catch {
    // The action itself did not come back: this app's own server, not the runner.
    return { ok: false, text: "The page could not reach its server, so nothing was sent. Try again." };
  }
  if (!answer.ok) return { ok: false, text: handoffRefusal(answer, title) };
  forgetExtendKey(store, name);
  leaveOpener(store, answer.draftId, { send: value.text, sendMentions: value.mentions, compose: "", source: null });
  return {
    ok: true,
    href: conversationHref("/studio", answer.draftId),
    marker: { role: "studio", content: value.text, mentions: value.mentions, draftId: answer.draftId },
  };
}
