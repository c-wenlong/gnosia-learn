import type { ReactNode } from "react";

import { cx, PANEL_TITLE } from "./classes";
import { Glyph } from "./Glyph";
import { IconButton } from "./IconButton";

/**
 * The header row of a kit `Dialog`: 48px with a hairline under it, an
 * optional `leading` mark, the title, the caller's `actions`, and Close at the
 * right. Pinned over the dialog's body, which scrolls under it (`shrink-0`).
 *
 * The title is `PANEL_TITLE`, the role IMPLEMENTATION.md names for a 48px bar
 * with a hairline: the bar is chrome around what the dialog holds, which
 * often has a heading of its own (a note's), so it is quieter than a card's
 * title.
 *
 * Close is the kit `IconButton` marked `data-dialog-close`, the one place that
 * attribute is written (`DialogHeader.test.ts` fails a second). `showModal()`
 * puts focus on the first control in the dialog, which is this button when
 * nothing comes before it, and the studio reads the attribute to tell focus
 * nobody chose from focus a person moved (`focusIsUnclaimed` in
 * `components/studio/dialog-focus.ts`), so a composer that arrives late may
 * still take it. A press calls `onClose`, the same function the `Dialog` is
 * given, so Close, Escape and the backdrop all go one way.
 *
 * Close is the 36px round button with a 16px glyph. `closeSize="sm"` makes it
 * a 28px square with an 18px glyph instead, for a row whose `actions` are a
 * run of 28px square tools (the Library previewer's), so Close stands in line
 * with them rather than a size larger. The right padding grows from 8px to
 * 12px with it, which keeps the glyph's centre the same 26px from the edge.
 * Everything else about Close is the same: the label, `data-dialog-close`,
 * the one `onClose`.
 *
 * On a phone every dialog is the whole screen, so the header is the top of
 * the screen: it pads by the notch inset and grows by the same amount, so
 * the row under the notch keeps its 48px. From 768px the dialog is a panel
 * in the middle and there is no inset to keep clear of.
 *
 * No state and no hooks; it takes a function, so it is rendered from a
 * client component, as the `Dialog` around it is.
 */
export function DialogHeader({
  title,
  onClose,
  leading,
  actions,
  closeSize = "lg",
}: {
  title: ReactNode;
  /** Close pressed: the `Dialog`'s own `onClose`. */
  onClose: () => void;
  /** Drawn before the title: a kind's glyph, say. */
  leading?: ReactNode;
  /**
   * Drawn between the title and Close, each spaced like the rest of the row:
   * a link to the raw file, a running cost, a tool.
   */
  actions?: ReactNode;
  /**
   * `lg`, the default: Close is a 36px round button, 16px glyph. `sm`: a 28px
   * square with an 18px glyph, to line up with `actions` that are 28px square
   * tools.
   */
  closeSize?: "lg" | "sm";
}) {
  const compact = closeSize === "sm";
  return (
    <div
      className={cx(
        "flex shrink-0 items-center gap-3 border-b border-hair pl-5",
        compact ? "pr-3" : "pr-2",
        "h-[calc(3rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] md:h-12 md:pt-0",
      )}
    >
      {leading}
      <h2 className={cx(PANEL_TITLE, "min-w-0 flex-1 truncate")}>{title}</h2>
      {actions}
      <IconButton
        label="Close"
        size={compact ? "sm" : undefined}
        shape={compact ? "square" : undefined}
        onClick={onClose}
        data-dialog-close=""
      >
        <Glyph name="close" size={compact ? 18 : 16} />
      </IconButton>
    </div>
  );
}
