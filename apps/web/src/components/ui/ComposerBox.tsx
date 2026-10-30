import type { ReactNode, Ref } from "react";

import { cx } from "./classes";
import { COMPOSER_BOX, COMPOSER_REASON } from "./composer-keys";
import { Glyph } from "./Glyph";
import { IconButton } from "./IconButton";

/**
 * The kit composers' box layout (`layout="box"` on `Composer` and
 * `MentionComposer`, D88 of docs/STUDIO-CHAT-FIRST.md): the field on top, and
 * under it, inside the same frame, a row of controls ending in a round Send,
 * the way Gauth's Atlas prompt box is laid out
 * (docs/design/reference/gauth/components.md, "Atlas prompt box"). The row
 * layout, a 52px field with a Send pill beside it, stays the default, so the
 * conversation and the concept tutor do not change.
 *
 * One shell for both composers, so the textarea a failed Lexical chunk falls
 * back to is the same box with the same controls. No state and no hooks.
 */
export function ComposerBox({
  field,
  leading,
  toolbar,
  send,
  disabled = false,
  className,
  ref,
}: {
  /** The text field, which pads itself (`composerBoxFieldPx`). */
  field: ReactNode;
  /** First in the row: the plus that opens the @ menu. */
  leading?: ReactNode;
  /** After it: the caller's controls, such as the studio home's Diagram and Video toggles. */
  toolbar?: ReactNode;
  /** Last, at the right edge. */
  send: ReactNode;
  disabled?: boolean;
  className?: string;
  /** The frame, for a menu placed against it. */
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cx(
        "flex min-w-0 flex-col",
        COMPOSER_BOX,
        // After the box's own `transition-colors duration-100`, so this one
        // wins: the border's 150ms the box has always shown, and the fade
        // when it is disabled.
        "transition-[opacity,border-color] duration-150 motion-reduce:transition-none",
        "focus-within:border-accent",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {field}
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-2 pb-2">
        {leading}
        {toolbar}
        <div className="ml-auto">{send}</div>
      </div>
    </div>
  );
}

/**
 * The composers' row layout, the default: the field in its own frame (a
 * framed textarea, or the mention field's frame around its plus and field),
 * and Send beside it, held 2px up so its face sits where the old centred row
 * put it while the field grows downwards.
 */
export function ComposerRow({ field, send }: { field: ReactNode; send: ReactNode }) {
  return (
    <div className="flex items-end gap-2.5">
      {field}
      <div className="pb-0.5">{send}</div>
    </div>
  );
}

/**
 * The line under either composer saying why it, or Send, is off: the field's
 * and Send's description (`id`), fading in as it arrives. `quiet` keeps it for
 * a screen reader only. Nothing while there is no reason.
 */
export function ComposerReason({ id, reason, quiet = false }: { id: string; reason: string | null; quiet?: boolean }) {
  if (reason === null) return null;
  return (
    <p id={id} className={quiet ? "sr-only" : cx(COMPOSER_REASON, "animate-fade-in motion-reduce:animate-none")}>
      {reason}
    </p>
  );
}

/**
 * The box's Send: a 36px disc with an arrow, named by `label`. The primary
 * button's face when it can send, `--surface2` when it cannot, as Atlas's
 * grey disc is while its box is empty.
 */
export function SendDisc({ label, disabled = false, describedBy }: { label: string; disabled?: boolean; describedBy?: string }) {
  return (
    // A 44px target under a finger, the face still 36px.
    <IconButton type="submit" label={label} size="lg" tone="solid" touch disabled={disabled} aria-describedby={describedBy}>
      <Glyph name="send" size={18} />
    </IconButton>
  );
}
