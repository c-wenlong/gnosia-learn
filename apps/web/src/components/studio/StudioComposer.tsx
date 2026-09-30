"use client";

import dynamic from "next/dynamic";
import { useImperativeHandle, useRef, type ReactNode } from "react";

import { Composer } from "@/components/ui/Composer";
import { cx } from "@/components/ui/classes";
import { COMPOSER_FRAME } from "@/components/ui/composer-keys";
import type { MentionComposerProps } from "@/components/ui/MentionComposer";
import { carryMentions, fallbackTagLine } from "@/components/ui/mention-text";
import type { DraftKind } from "@/lib/studio-drafts";

/**
 * The studio's composer, loaded only when a conversation opens: it carries
 * Lexical, which the grid behind the panel has no use for (open question 4
 * of docs/STUDIO-MENTIONS.md). Until it arrives, a frame of the same height
 * stands in, so the panel does not move.
 *
 * Shared by the conversation (`DraftPanel`) and the Extend panel before it
 * (`ExtendStart`), so a tag typed in one is a chip in the other and both
 * fall back the same way. Both load the one chunk.
 */
export const MentionComposer = dynamic(
  () =>
    import("@/components/ui/MentionComposer")
      .then((module) => module.MentionComposer as unknown as (props: MentionComposerProps<DraftKind>) => ReactNode)
      // A chunk that will not load (a rebuild while the tab was open, the
      // network gone) costs the tags, never the page: the plain composer
      // stands in, and words still send.
      .catch(() => PlainFallback),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-end gap-2.5" aria-hidden>
        <div className={cx("h-[52px] min-w-0 flex-1", COMPOSER_FRAME)} />
        <div className="h-11 w-[84px] rounded-full bg-surface2" />
      </div>
    ),
  },
) as (props: MentionComposerProps<DraftKind>) => ReactNode;

/**
 * The kit's plain `Composer` in `MentionComposer`'s place, when Lexical will
 * not load. It cannot draw chips, so it carries the ones a value already has
 * through each edit (`carryMentions`) and says so under the field. Its handle
 * focuses the field, so a panel that focuses its composer on open still can;
 * `insertMention` has nothing to put a chip in.
 */
function PlainFallback(props: MentionComposerProps<DraftKind>) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(props.handleRef, () => ({ focus: () => field.current?.focus(), insertMention: () => {} }), []);
  return (
    <div className="flex flex-col gap-1">
      <Composer
        value={props.value.text}
        onChange={(text) => props.onChange({ text, mentions: carryMentions(props.value, text) })}
        onSubmit={(text) => props.onSubmit({ text, mentions: carryMentions(props.value, text) })}
        label={props.label}
        placeholder={props.placeholder}
        disabled={props.disabled}
        sendDisabled={props.sendDisabled}
        disabledReason={props.disabledReason}
        onModEnter={props.onModEnter}
        inputRef={field}
      />
      <p className="px-1 text-[12px] leading-4 text-text3">{fallbackTagLine(props.value, props.mentions)}</p>
    </div>
  );
}
