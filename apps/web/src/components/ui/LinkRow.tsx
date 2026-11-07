import Link from "next/link";
import type { ReactNode } from "react";

import { cx, FOCUS } from "./classes";

/**
 * Kit list row that is one link: a lead mark (a glyph, a mastery dot, a
 * thumbnail), the title, an optional meta line under it, and an optional
 * trailing note (a day, a module, "last seen"). The whole row is the target,
 * so a press anywhere on it goes where the title says.
 *
 * Home's cards (Pick up where you left off, Next from here, Worth a quick
 * recall) and the studio's Made list draw their rows with it, so they share
 * one padding (8px all round, set into the list with `-mx-2` where the list
 * sits flush with a card's text) and the kit's focus ring (`FOCUS`).
 *
 * `variant="divided"` is a row of a bordered list split by hairlines (a
 * `<ul>` with `divide-y`, `rounded-xl` and a border, each row in its `<li>`),
 * as the studio's Made list is: square corners except the list's first and
 * last row, which follow its 12px radius, so the hover fill never shows a
 * corner inside the border; 12px by 8px padding, off the border; and the
 * focus ring drawn inside the row (`-outline-offset-2`), so it overlaps
 * neither the list's border nor the lines between rows.
 *
 * `srKind` is read before the title by a screen reader only ("Conversation: ",
 * "Course module: "), for a row whose kind its glyph shows. A row with a meta
 * line sets its title in medium weight, so the two lines read as title and
 * detail. No state and no hooks, so a server component can draw it.
 */
export function LinkRow({
  href,
  lead,
  title,
  meta,
  trailing,
  srKind,
  variant = "plain",
  className,
}: {
  href: string;
  /** Drawn before the title; decorative, so mark it `aria-hidden` or give it no text. */
  lead?: ReactNode;
  title: ReactNode;
  /** A second line under the title, in 12px secondary text. */
  meta?: ReactNode;
  /** After the title, at the row's end. */
  trailing?: ReactNode;
  /** A word a screen reader hears before the title, e.g. "Conversation". */
  srKind?: string;
  /** `plain` for a row on a card's ground; `divided` for a row of a bordered, divided list. */
  variant?: "plain" | "divided";
  className?: string;
}) {
  const head = (
    <>
      {srKind !== undefined && <span className="sr-only">{srKind}: </span>}
      {title}
    </>
  );
  return (
    <Link
      href={href}
      className={cx(
        "flex min-w-0 items-center gap-3 text-[14px] text-text",
        "transition-colors duration-100 hover:bg-surface2 motion-reduce:transition-none",
        FOCUS,
        variant === "divided"
          ? "rounded-none px-3 py-2 focus-visible:-outline-offset-2 [li:first-child>&]:rounded-t-xl [li:last-child>&]:rounded-b-xl"
          : "rounded-lg p-2",
        className,
      )}
    >
      {lead}
      {meta === undefined ? (
        <span className="min-w-0 flex-1 truncate">{head}</span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{head}</span>
          <span className="flex min-w-0 items-center gap-2 text-[12px] text-text2">{meta}</span>
        </span>
      )}
      {trailing}
    </Link>
  );
}
