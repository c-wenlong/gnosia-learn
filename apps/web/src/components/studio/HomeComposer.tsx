"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { NEW_CHAT_EVENT } from "@/components/studio/panel-host";
import { MentionComposer } from "@/components/studio/StudioComposer";
import { useStartDraft } from "@/components/studio/useStartDraft";
import { focusIsUnclaimed } from "@/components/studio/dialog-focus";
import type { MentionComposerHandle } from "@/components/ui/MentionComposer";
import { EMPTY_MENTION_VALUE, isEmptyValue, trimValue, type MentionValue } from "@/components/ui/mention-text";
import { MENTION_HINT, mentionOptions, valueSendBlock } from "@/lib/studio-cards";
import { DRAFT_KINDS, type DraftKind, type VideoAvailability } from "@/lib/studio-drafts";

type Value = MentionValue<DraftKind>;

/**
 * The studio's way in: one composer in the middle of the home view, the
 * diagrams and videos under it (docs/STUDIO-CHAT-FIRST.md, "Home and the
 * full-screen conversation"). It replaced the plus card.
 *
 * Send starts a conversation with these words as its first turn: the
 * conversation opens full screen at once, showing them, while the draft is
 * made, and sends them once it has read its record (`useStartDraft`). A
 * refusal brings the person back here with the words still in the box and
 * the reason under it.
 *
 * Tags work as they do in a conversation: `@`, or the plus, puts Diagram or
 * Video in the sentence, and a message with neither is talk the planner
 * answers. A bare tag gives the planner nothing to go on in a conversation
 * with no turn yet (T15), so Send waits for words.
 */
export function HomeComposer({ path, video }: { path: string; video: VideoAvailability | null }) {
  const { start, busy, error } = useStartDraft(path);
  const [value, setValue] = useState<Value>(EMPTY_MENTION_VALUE);
  const composer = useRef<MentionComposerHandle | null>(null);

  useEffect(() => {
    const focus = () => composer.current?.focus();
    window.addEventListener(NEW_CHAT_EVENT, focus);
    return () => window.removeEventListener(NEW_CHAT_EVENT, focus);
  }, []);

  // A new conversation has the current runner's kinds: both. It re-reads them
  // from its record, and a tag it cannot take comes back into its composer
  // with the reason.
  const options = useMemo(() => mentionOptions({ plannerKinds: [...DRAFT_KINDS] }, video), [video]);
  const block = valueSendBlock(value, true);

  async function submit(next: Value) {
    const body = trimValue(next);
    if (busy || isEmptyValue(body) || valueSendBlock(body, true) !== null) return;
    if (await start(body)) setValue(EMPTY_MENTION_VALUE);
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <MentionComposer
        handleRef={composer}
        value={value}
        onChange={setValue}
        onSubmit={(next) => void submit(next)}
        label="Start a conversation with the planner"
        placeholder="Describe an idea to draw or animate…"
        mentions={options}
        mentionHint={MENTION_HINT}
        // Focus on arrival, unless the person has already gone elsewhere.
        autoFocus={focusIsUnclaimed}
        fallbackNote="Tags could not load, so none can be added here."
        sendDisabled={busy || block !== null}
        disabledReason={busy ? "Opening the conversation." : (block ?? undefined)}
      />
      {error !== null && (
        <p role="alert" className="px-1 text-[13px] text-danger">
          The conversation could not start: {error}
        </p>
      )}
    </div>
  );
}
