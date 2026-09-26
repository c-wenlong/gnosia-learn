import Image from "next/image";

import { cx } from "@/components/ui/classes";

import mark from "../../../public/brand/mark.png";
import wordmarkCream from "../../../public/brand/wordmark-cream.png";
import wordmarkInk from "../../../public/brand/wordmark-ink.png";

/**
 * The owner's logo art: the mark, and the GNOSIA letters in two colourways,
 * deep teal for light grounds and cream for dark ones. Sources are in
 * docs/design/brand/logo/; the copies under `public/brand/` are trimmed of
 * the faint haze round the art and scaled down (the mark to 256px, the
 * letters to 96px tall).
 *
 * The letters swap on the `dark` class, in CSS, so the first paint is right
 * in every theme. Only one of the two is ever displayed, and `display: none`
 * takes the other out of the accessibility tree, so a screen reader hears
 * "Gnosia" once. The mark is decorative beside it.
 */
function Letters({ className }: { className?: string }) {
  return (
    <>
      <Image src={wordmarkInk} alt="Gnosia" draggable={false} className={cx("w-auto max-w-none dark:hidden", className)} />
      <Image
        src={wordmarkCream}
        alt="Gnosia"
        draggable={false}
        className={cx("hidden w-auto max-w-none dark:block", className)}
      />
    </>
  );
}

/**
 * The mark beside the letters, for bars and footers.
 *
 * Sized by font size: set `text-[15px]` (the app bar) or `text-[13px]` and
 * the mark follows at 1.9em, the letters at 0.8em tall, about the cap height
 * the old live-text wordmark had.
 */
export function GnosiaWordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-[0.55em] leading-none", className)}>
      <Image src={mark} alt="" draggable={false} className="size-[1.9em] shrink-0" />
      <Letters className="h-[0.8em]" />
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
      <Image src={mark} alt="" draggable={false} style={{ width: size, height: size }} />
      <span className="mt-[0.9em] inline-flex" style={{ fontSize: Math.max(12, Math.round(size * 0.3)) }}>
        <Letters className="h-[0.8em]" />
      </span>
    </span>
  );
}
