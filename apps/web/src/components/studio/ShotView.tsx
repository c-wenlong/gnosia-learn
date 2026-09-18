import Link from "next/link";

import { shotSrc } from "@/lib/studio-compare";
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
 * behind `STUDIO_ENABLED` like everything else here, and a job that has no
 * picture of that side answers 404 — which the panel already said in words
 * before anyone could click a tile that was not a link.
 */
export function ShotView({
  jobId,
  which,
  path,
  title,
}: {
  jobId: string;
  which: "before" | "after";
  path: string;
  /** What the picture is of, for the alt text and the caption. */
  title: string;
}) {
  const label = which === "before" ? "Before" : "After";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 text-xs">
        <span className="font-medium">{label}</span>
        <span className="min-w-0 truncate font-mono text-[var(--muted)]">{title}</span>
        <div className="flex-1" />
        <Link
          href={panelHref(path, { shot: which === "before" ? "after" : "before" })}
          scroll={false}
          className="underline underline-offset-2"
        >
          Show {which === "before" ? "after" : "before"}
        </Link>
        <Link
          href={panelHref(path, { shot: null })}
          scroll={false}
          className="text-[var(--muted)] underline underline-offset-2"
        >
          Close
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface)] p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shotSrc(jobId, which)}
          alt={`${label}: ${title}`}
          className="mx-auto max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  );
}
