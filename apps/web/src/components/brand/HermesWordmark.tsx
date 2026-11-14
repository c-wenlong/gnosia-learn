import Image from "next/image";

import { cx } from "@/components/ui/classes";

import mark from "../../../public/brand/mark.png";
import wordmarkInk from "../../../public/brand/wordmark-ink.png";

/**
 * The hat mark beside the Hermes letters. The letters are terracotta on
 * light grounds and cream on dark ones. The mark copy under `public/brand/`
 * is the charcoal hat at 1024px, so it reads on cream and white.
 *
 * The original letter art is an alpha mask: CSS changes its colour without
 * redrawing the owner's letterforms. A screen reader hears "Hermes" once.
 * The mark is decorative beside it.
 */
function Letters({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Hermes"
      className={cx("inline-block shrink-0 bg-current text-brand-terracotta dark:text-brand-cream", className)}
      style={{
        aspectRatio: `${wordmarkInk.width} / ${wordmarkInk.height}`,
        maskImage: `url(${wordmarkInk.src})`,
        maskSize: "100% 100%",
        maskRepeat: "no-repeat",
      }}
    />
  );
}

/**
 * The mark beside the letters, for bars and footers.
 *
 * Sized by font size: set `text-[15px]` (the app bar) or `text-[13px]` and
 * the mark follows at 1.9em, the letters at 0.8em tall, about the cap height
 * the old live-text wordmark had.
 */
export function HermesWordmark({ className }: { className?: string }) {
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
export function HermesLockup({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("inline-flex flex-col items-center leading-none", className)}>
      <Image src={mark} alt="" draggable={false} style={{ width: size, height: size }} />
      <span className="mt-[0.9em] inline-flex" style={{ fontSize: Math.max(12, Math.round(size * 0.3)) }}>
        <Letters className="h-[0.8em]" />
      </span>
    </span>
  );
}
