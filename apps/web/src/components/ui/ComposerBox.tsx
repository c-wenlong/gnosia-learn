import type { ReactNode } from "react";

import { cx } from "./classes";
import { COMPOSER_BOX } from "./composer-keys";
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
}) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col transition-[opacity,border-color] duration-150 motion-reduce:transition-none",
        COMPOSER_BOX,
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
