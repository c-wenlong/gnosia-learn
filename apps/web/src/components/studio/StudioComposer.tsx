"use client";

import dynamic from "next/dynamic";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from "react";

import { Composer } from "@/components/ui/Composer";
import { ComposerBox } from "@/components/ui/ComposerBox";
import { cx } from "@/components/ui/classes";
import { COMPOSER_BOX_MIN_ROWS, COMPOSER_FRAME, composerBoxFieldPx } from "@/components/ui/composer-keys";
import type { MentionComposerProps } from "@/components/ui/MentionComposer";
import { carryMentions, fallbackTagLine, mapOffset } from "@/components/ui/mention-text";
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
 * The same composer in the box layout, for the studio home (D84 of
 * docs/STUDIO-CHAT-FIRST.md). Its own `dynamic` only so the frame that stands
 * in while the chunk loads is a box of the box's height rather than the row's
 * 52px, since `loading` is not shown the props. It loads the same module, so
 * the same chunk, and falls back to the same plain composer, in a box.
 */
const LoadedBox = dynamic(
  () =>
    import("@/components/ui/MentionComposer")
      .then((module) => module.MentionComposer as unknown as (props: MentionComposerProps<DraftKind>) => ReactNode)
      .catch(() => PlainFallback),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden>
        <ComposerBox
          field={<div style={{ height: composerBoxFieldPx(COMPOSER_BOX_MIN_ROWS) }} />}
          leading={<div className="size-8" />}
          send={<div className="size-9 rounded-full bg-surface2" />}
        />
      </div>
    ),
  },
) as (props: MentionComposerProps<DraftKind>) => ReactNode;

export function MentionComposerBox(props: Omit<MentionComposerProps<DraftKind>, "layout">) {
  return <LoadedBox {...props} layout="box" />;
}

/**
 * The kit's plain `Composer` in `MentionComposer`'s place, when Lexical will
 * not load. It cannot draw chips, so it carries the ones a value already has
 * through each edit (`carryMentions`) and says so under the field. Its handle
 * focuses the field, so a panel that focuses its composer on open still can,
 * and it honours `autoFocus` when it mounts; `insertMention` has nothing to
 * put a chip in, and `keepCaretThrough` puts the textarea's caret back after a
 * toggle's edit. In the box layout it is a box too, with the caller's
 * toolbar, whose toggles change the value rather than the editor and so still
 * work here.
 */
function PlainFallback(props: MentionComposerProps<DraftKind>) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  // A caret to put back once the textarea holds `text` (a toggle's edit).
  const pendingCaret = useRef<{ text: string; start: number; end: number } | null>(null);
  useImperativeHandle(
    props.handleRef,
    () => ({
      focus: () => field.current?.focus(),
      insertMention: () => {},
      keepCaretThrough: (next, edit) => {
        const box = field.current;
        if (box === null) return;
        pendingCaret.current = { text: next.text, start: mapOffset(box.selectionStart, edit), end: mapOffset(box.selectionEnd, edit) };
      },
    }),
    [],
  );
  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    const box = field.current;
    if (pending === null || box === null || pending.text !== props.value.text) return;
    pendingCaret.current = null;
    box.setSelectionRange(pending.start, pending.end);
  }, [props.value.text]);
  const { autoFocus, disabled } = props;
  useEffect(() => {
    if (!autoFocus || disabled) return;
    if (autoFocus === true || autoFocus(document.activeElement)) field.current?.focus();
    // Mount only: a later render must not pull focus back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
        layout={props.layout}
        toolbar={props.toolbar}
        minRows={props.minRows}
      />
      <p className="px-1 text-[12px] leading-4 text-text3">{fallbackTagLine(props.value, props.mentions, props.fallbackNote)}</p>
    </div>
  );
}
