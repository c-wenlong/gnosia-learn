"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { NEW_CHAT_EVENT } from "@/components/studio/panel-host";
import { MentionComposerBox } from "@/components/studio/StudioComposer";
import { useStartDraft } from "@/components/studio/useStartDraft";
import { focusIsUnclaimed } from "@/components/studio/dialog-focus";
import { chipClasses, cx, FOCUS } from "@/components/ui/classes";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import type { MentionComposerHandle } from "@/components/ui/MentionComposer";
import {
  EMPTY_MENTION_VALUE,
  hasMention,
  isEmptyValue,
  isUsable,
  toggleMentionEdit,
  trimValue,
  type MentionOption,
  type MentionValue,
} from "@/components/ui/mention-text";
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
 *
 * The box (D88) also has a Diagram and a Video toggle in its bottom row. A
 * press puts that kind's chip at the start of the message, or takes it out,
 * and focuses the field; it never sends. Each shows pressed whenever its chip
 * is in the message, typed with `@` included, so the buttons always say what
 * Send will ask for.
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
  const [announcement, setAnnouncement] = useState("");

  function toggle(option: MentionOption<DraftKind>) {
    const tagged = hasMention(value, option.id);
    // An unavailable kind can still be taken out, never put in.
    if (!tagged && !isUsable(option)) return;
    const { value: next, edit } = toggleMentionEdit(value, option.id);
    if (edit === null) return;
    // The caret, or a selection, stays where the person left it, moved by the chip.
    composer.current?.keepCaretThrough(next, edit);
    setValue(next);
    setAnnouncement(`${option.name} tag ${tagged ? "removed" : "added"}.`);
    composer.current?.focus();
  }

  async function submit(next: Value) {
    const body = trimValue(next);
    if (busy || isEmptyValue(body) || valueSendBlock(body, true) !== null) return;
    if (await start(body)) setValue(EMPTY_MENTION_VALUE);
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <MentionComposerBox
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
        fallbackNote="The @ menu could not load; the Diagram and Video buttons still add tags."
        sendDisabled={busy || block !== null}
        // A bare tag's reason is heard, not shown: a line appearing under
        // the box on every tag was noise, and the disabled Send says enough.
        disabledReason={busy ? "Opening the conversation." : (block ?? undefined)}
        quietReason={!busy}
        toolbar={options.map((option) => (
          <KindToggle key={option.id} option={option} pressed={hasMention(value, option.id)} onPress={() => toggle(option)} />
        ))}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {error !== null && (
        <p role="alert" className="px-1 text-[13px] text-danger">
          The conversation could not start: {error}
        </p>
      )}
    </div>
  );
}

/**
 * A kind's toggle in the box's bottom row: a pill with the kind's glyph and
 * name, tinted with the accent while its chip is in the message, the shape of
 * Atlas's Search pill. An unavailable kind (the doctor turned videos off) is
 * `aria-disabled` rather than `disabled`, so it keeps its focus and its reason
 * can be read; a pressed one stays pressable, so its chip can still come out.
 */
function KindToggle({ option, pressed, onPress }: { option: MentionOption<DraftKind>; pressed: boolean; onPress: () => void }) {
  const reasonId = useId();
  const blocked = !pressed && !isUsable(option);
  return (
    <>
      <button
        type="button"
        aria-pressed={pressed}
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? reasonId : undefined}
        title={blocked ? (option.disabledReason ?? undefined) : option.description}
        // The field keeps its focus and its caret, as the plus does.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onPress}
        // A blocked kind is aria-disabled, which the chip's `disabled:` styles
        // do not read, so it drops the hover and dims as a disabled chip does.
        className={chipClasses({
          active: pressed,
          tone: "tint",
          interactive: !blocked,
          className: cx(
            blocked && cx(FOCUS, "cursor-not-allowed opacity-50"),
            // A 44px target under a finger, the face 34px.
            "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[5px] pointer-coarse:after:content-['']",
          ),
        })}
      >
        <Glyph name={(option.icon ?? option.id) as GlyphName} size={16} />
        {option.name}
      </button>
      {/* Beside the button, not in it, so the reason describes it rather than joining its name. */}
      {blocked && (
        <span id={reasonId} className="sr-only">
          {option.disabledReason}
        </span>
      )}
    </>
  );
}
