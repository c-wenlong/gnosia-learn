import Image from "next/image";

import { cx } from "@/components/ui/classes";

/**
 * The mascot: the hooded tome with the glowing crescent eyes. Each pose is
 * one of the owner's renders, drawn on a transparent ground, trimmed to the
 * art and scaled to 900px on its longest side under `public/brand/mascot/`.
 * The full 1254px renders are in docs/design/brand/mascot/, and the mascot
 * sheet (docs/design/brand/mascot-sheet.png) stays as the reference.
 *
 * Always decorative (`alt=""`). Size it by height with a class
 * (`h-[200px] lg:h-[400px]`); the width follows the pose's own proportions.
 * `float` adds the slow bob from globals.css, which only runs for a reader
 * who has not asked for reduced motion. Rules for which pose goes where are
 * in docs/design/BRAND.md.
 */
export const MASCOT_POSES = {
  neutral: { width: 666, height: 900 },
  happy: { width: 847, height: 900 },
  reading: { width: 619, height: 900 },
  curious: { width: 664, height: 900 },
  excited: { width: 881, height: 900 },
  sleepy: { width: 654, height: 900 },
} as const;

export type MascotPose = keyof typeof MASCOT_POSES;

export function GnosiaMascot({
  pose = "neutral",
  className,
  float = false,
  preload = false,
}: {
  pose?: MascotPose;
  /** Set the height here; the width is `auto`. */
  className?: string;
  float?: boolean;
  /** For the one mascot above the fold (`preload` replaced `priority` in Next 16). */
  preload?: boolean;
}) {
  const { width, height } = MASCOT_POSES[pose];
  return (
    <span aria-hidden className={cx("inline-block", float && "gnosia-float")}>
      <Image
        src={`/brand/mascot/${pose}.png`}
        alt=""
        width={width}
        height={height}
        preload={preload}
        draggable={false}
        className={cx("block w-auto max-w-none select-none", className)}
      />
    </span>
  );
}
