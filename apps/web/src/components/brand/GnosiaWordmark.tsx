import { cx } from "@/components/ui/classes";

import { GnosiaMark } from "./GnosiaMark";

/**
 * The mark beside the letter-spaced GNOSIA (Figtree 600, 0.3em), for bars and footers.
 *
 * Sized by font size: set `text-[15px]` (the app bar) or `text-[13px]` and the
 * mark follows at 1.9em. The mark is teal, the letters take the surrounding
 * text colour. The trailing negative margin cancels the tracking after the
 * last letter, so the lockup centres on what is drawn. A screen reader hears
 * "Gnosia" once: the mark is hidden, the letters are uppercase by CSS only.
 */
export function GnosiaWordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-[0.6em] leading-none", className)}>
      <GnosiaMark className="size-[1.9em] shrink-0 text-brand-teal" />
      <span className="-mr-[0.3em] translate-y-[0.06em] font-sans font-semibold tracking-[0.3em] uppercase">Gnosia</span>
    </span>
  );
}

/**
 * The vertical lockup: the mark over the letters, centred. For a card or a
 * splash (the sign-in card). `size` is the mark in px; the letters are a
 * fixed fraction of it so the two stay in proportion.
 */
export function GnosiaLockup({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("inline-flex flex-col items-center leading-none", className)}>
      <GnosiaMark size={size} className="text-brand-teal" />
      <span
        className="mt-[0.9em] -mr-[0.3em] font-sans font-semibold tracking-[0.3em] uppercase"
        style={{ fontSize: Math.max(12, Math.round(size * 0.3)) }}
      >
        Gnosia
      </span>
    </span>
  );
}
