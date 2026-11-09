import Image from "next/image";

import { cx } from "@/components/ui/classes";

import curious from "../../../public/brand/mascot/curious.png";
import excited from "../../../public/brand/mascot/excited.png";
import happy from "../../../public/brand/mascot/happy.png";
import neutral from "../../../public/brand/mascot/neutral.png";
import reading from "../../../public/brand/mascot/reading.png";
import sleepy from "../../../public/brand/mascot/sleepy.png";

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
 *
 * The poses are static imports, not `/brand/mascot/...` strings, for two
 * reasons: each gets a content-hashed URL cached as immutable, so replacing a
 * file can never leave a browser on the old picture for the optimizer's
 * four-hour TTL, and its pixel size comes from the file itself, so
 * `MASCOT_POSES` cannot drift from the art.
 */
const MASCOT_POSES = { neutral, happy, reading, curious, excited, sleepy } as const;

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
  return (
    <span aria-hidden className={cx("inline-block", float && "gnosia-float")}>
      <Image
        src={MASCOT_POSES[pose]}
        alt=""
        preload={preload}
        draggable={false}
        className={cx("block w-auto max-w-none select-none", className)}
      />
    </span>
  );
}
