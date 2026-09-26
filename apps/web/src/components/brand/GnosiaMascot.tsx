import Image from "next/image";

import { cx } from "@/components/ui/classes";

/**
 * The mascot: the hooded tome with the glowing crescent eyes, from the
 * owner's mascot sheet (docs/design/brand/mascot-sheet.png). Each pose is a
 * cut-out PNG under `public/brand/mascot/`, background removed, with its own
 * soft shadow baked in.
 *
 * Always decorative (`alt=""`). Size it by height with a class
 * (`h-[200px] lg:h-[400px]`); the width follows the pose's own proportions.
 * `float` adds the slow bob from globals.css, which only runs for a reader
 * who has not asked for reduced motion. Rules for which pose goes where are
 * in docs/design/BRAND.md.
 *
 * The cut-outs carry a pale shadow ellipse under the tail. On cream it reads
 * as a shadow; on navy it reads as a spotlight, so in dark the bottom 8.5% of
 * the picture is clipped away (a tail tip that reaches that low loses a few pixels).
 */
export const MASCOT_POSES = {
  neutral: { width: 343, height: 416 },
  happy: { width: 399, height: 416 },
  reading: { width: 362, height: 416 },
  curious: { width: 388, height: 406 },
  excited: { width: 434, height: 412 },
  sleepy: { width: 390, height: 405 },
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
        className={cx("block w-auto max-w-none select-none dark:[clip-path:inset(0_0_8.5%_0)]", className)}
      />
    </span>
  );
}
