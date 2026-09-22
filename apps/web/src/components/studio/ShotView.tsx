import Link from "next/link";

import { missingShotReason, shotSrc, type Comparison } from "@/lib/studio-compare";
import { panelHref } from "@/lib/studio-view";

/**
 * One of a job's two pictures, filling the main area.
 *
 * The design's finished panel says clicking a thumbnail "opens it full width in
 * the main area", and this is that area: the grid or the canvas is replaced
 * while it is open, the right panel stays where it was, and the strips above do
 * not move. A 320px column is not enough to look at a diagram, which is the
 * whole reason this exists.
 *
 * A server component, because it is an `<img>` and a link. The picture comes
 * through the app's own `/studio/api` proxy from the job workspace, so it is
 * behind `STUDIO_ENABLED` like everything else here.
 *
 * **It takes the comparison, so it can say what the panel says.** A job in
 * `new` mode has no before picture and never will, and a switch link that
 * offered one anyway put a broken image full width while the thumbnail two
 * hundred pixels to the right correctly said that side did not exist. The same
 * `missingShotReason` answers both. Caught in review on this PR.
 */
export function ShotView({
  jobId,
  which,
  path,
  title,
  comparison,
  mode,
}: {
  jobId: string;
  which: "before" | "after";
  path: string;
  /** What the picture is of, for the alt text and the caption. */
  title: string;
  /** The record's own comparison, or null when the runner did not send one. */
  comparison: Comparison | null;
  /** The job's brief mode, which decides why a before is missing. */
  mode?: string;
}) {
  const label = which === "before" ? "Before" : "After";
  const other: "before" | "after" = which === "before" ? "after" : "before";
  /**
   * Why a side is not here, or null when it is.
   *
   * A runner that sent no comparison at all — one version behind — gets null
   * for both, which shows the image and lets the 404 speak. Guessing "missing"
   * from an absent field would hide a picture that is on disk.
   */
  const reason = (side: "before" | "after"): string | null => {
    if (comparison === null) return null;
    const held = side === "before" ? comparison.before : comparison.after;
    return held?.shot === true ? null : missingShotReason(side, comparison, mode);
  };
  const missing = reason(which);
  const otherMissing = reason(other);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 text-xs">
        <span className="font-medium">{label}</span>
        <span className="min-w-0 truncate font-mono text-[var(--muted)]">{title}</span>
        <div className="flex-1" />
        {otherMissing === null ? (
          <Link
            href={panelHref(path, { shot: other })}
            scroll={false}
            className="underline underline-offset-2"
          >
            Show {other}
          </Link>
        ) : (
          <span className="text-[var(--muted)]" title={otherMissing}>
            no {other}
          </span>
        )}
        <Link
          href={panelHref(path, { shot: null })}
          scroll={false}
          className="text-[var(--muted)] underline underline-offset-2"
        >
          Close
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface)] p-4">
        {missing === null ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={shotSrc(jobId, which)}
            alt={`${label}: ${title}`}
            className="mx-auto max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="mx-auto max-w-[420px] pt-8 text-center text-sm text-[var(--muted)]">
            {missing}
          </p>
        )}
      </div>
    </div>
  );
}
