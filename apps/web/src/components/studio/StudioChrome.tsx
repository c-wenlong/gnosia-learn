import type { ReactNode } from "react";

import { PanelLink } from "@/components/studio/PanelLink";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { cx, LABEL } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";

/**
 * The small, shared pieces of the studio's own chrome.
 *
 * All server components, and all React-free where they can be: nothing here
 * holds state, so nothing here needs a client boundary. That also keeps the
 * `"use client"` trap out of the way — a client module's exports are client
 * references, so a helper exported from one and called on the server throws at
 * request time and builds clean (`asset-meta.ts` beside `AssetCard.tsx` is the
 * repo's existing answer to the same problem).
 *
 * Every size here comes from the design tokens table: 40px and 32px rows, 12px
 * as the type floor and 12px on cards. D22 is why there is no `text-[10px]` in
 * this file or in any other under `components/studio/`: at `--text2` on
 * `--surface` that size is under the contrast floor, and the studio's metadata
 * rows are denser than anything else in the app.
 *
 * The controls are the kit's, at the studio's density: a `Button` at `xs`
 * (28px, a flat face, `href` for a link), a `Badge` for a label in a tone, a
 * small `Chip` (or `chipClasses` on a `PanelLink`) for a topic filter, an
 * `IconButton` for a mark. This file used to export its own `Button`,
 * `ButtonLink`, `Chip` and `ChipLink`, which shadowed the kit's names and
 * drew a 6px box with no focus ring; the lint rule `gnosia/studio-kit` fails if a studio
 * file exports one of those names again or hand-builds such a control. The
 * tile and the home view's sheet are studio-local surfaces, in `surfaces.ts`.
 */

/**
 * The strip under the app header, and the head of the home view's assets
 * panel (`surface`). Sticky.
 *
 * `min-w-0`, and the page under it too: the strip's controls do not shrink,
 * so its min-content width used to widen the whole page on a phone, and the
 * grid laid out two columns for a screen that shows one. Now the topic chips
 * give up their room first, as their overflow already allows.
 *
 * On the assets panel it is at least 48px and grows to fit what it holds:
 * the toolbar there (`StudioToolbar`) lays its controls out on one row when
 * the panel is wide enough and on two when it is not, so every control stays
 * on screen at 390px. It does not change height while the page scrolls.
 *
 * Bare, under the app header, it is 40px and grows the same way: the canvas
 * page's strip (`Strip` in `studio/d/[name]/page.tsx`) is one row where it
 * has room and two on a phone.
 */
export function StudioStrip({ children, surface = false }: { children: ReactNode; surface?: boolean }) {
  return (
    <div
      className={
        surface
          ? // On the assets panel of the home view: its ground, inside its rounded top.
            "sticky top-0 z-10 flex min-h-12 min-w-0 shrink-0 items-center gap-2 rounded-t-3xl border-b border-border bg-surface px-3 py-2 md:px-5"
          : "sticky top-0 z-10 flex min-h-10 min-w-0 shrink-0 items-center gap-2 border-b border-border bg-page px-3"
      }
    >
      {children}
    </div>
  );
}

/**
 * The way back to the grid from a canvas, first on its strip: a ghost kit
 * `Button` at `xs`, drawn by the canvas page and by its loading frame, so it
 * works before the canvas does.
 */
export function BackToStudio() {
  return (
    <Button href="/studio" variant="ghost" size="xs" aria-label="Back to the studio">
      <Glyph name="previous" size={16} className="-ml-0.5" />
      Studio
    </Button>
  );
}

/** A heading inside the right panel. */
export function PanelHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className={cx(LABEL, "mb-2")}>
      {children}
    </h2>
  );
}

/** One `label · value` row in the inspector. 32px, the dense rhythm. */
export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3 border-b border-border py-1.5 last:border-b-0">
      <span className="w-24 shrink-0 text-xs text-text2">{label}</span>
      <span className="min-w-0 flex-1 break-words text-xs text-text">{children}</span>
    </div>
  );
}

/** A path, a slug or a count. Fixed at the 12px mono role. */
export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs break-all">{children}</span>;
}

/**
 * What the verb a person just pressed actually did.
 *
 * Rendered from the query string the action redirected to, so a 409 or a 502
 * reads as an answer rather than as a button that did nothing. It carries a
 * link that drops the message, since a stale outcome pinned in a URL somebody
 * bookmarked would be worse than no outcome at all.
 *
 * The kit's `Banner`, as the studio's other strips are (U3 and U5: the catalog
 * is unreachable, or the page bundle is older than its source; both mean
 * "everything still works", which is a banner and never a wall, the wall
 * being U4's `StudioBlocked`).
 */
export function VerbNotice({
  report,
  clearHref,
}: {
  report: { ok: boolean; headline: string; said: string | null; detail: string | null };
  clearHref: string;
}) {
  // The headline is the studio's own; the runner's words came through the
  // URL, so they are quoted under it and never read as the studio speaking.
  return (
    <Banner tone={report.ok ? "ok" : "danger"} dismissHref={clearHref} dismissLink={PanelLink}>
      <span className="font-semibold">{report.headline}</span>
      {(report.said !== null || (report.detail !== null && report.detail !== "")) && (
        <span className="block text-[12px] text-text2">
          The runner said: “{[report.said, report.detail].filter((part) => part !== null && part !== "").join(" · ")}”
        </span>
      )}
    </Banner>
  );
}
