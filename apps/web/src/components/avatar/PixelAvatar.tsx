import type { AvatarId } from "@gnosia/schema/shared";

import { cx } from "@/components/ui/classes";

import { SPRITES, spriteRuns } from "./sprites";

/**
 * A learner's pixel sprite on its disc, sized by `className` (`size-8`).
 * Decorative by default, since a name or a label beside it says who it is;
 * pass `label` where the picture stands alone. `crispEdges` keeps the pixels
 * square at any size. No state and no hooks, so a server component can draw
 * one too.
 */
export function PixelAvatar({ avatar, className, label }: { avatar: AvatarId; className?: string; label?: string }) {
  const sprite = SPRITES[avatar];
  return (
    <svg
      viewBox="-4 -4 24 24"
      className={cx("shrink-0", className)}
      shapeRendering="crispEdges"
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      <circle cx="8" cy="8" r="12" fill={sprite.disc} shapeRendering="geometricPrecision" />
      {spriteRuns(sprite).map((run) => (
        <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.width} height={1} fill={run.fill} />
      ))}
    </svg>
  );
}
