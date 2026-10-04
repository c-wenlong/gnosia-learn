import Link from "next/link";
import type { ReactNode } from "react";

import { PanelLink } from "@/components/studio/PanelLink";
import { Banner } from "@/components/ui/Banner";

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
 * as the type floor, 6px on controls and 12px on cards. D22 is why there is no
 * `text-[10px]` in this file or in any other under `components/studio/` — at
 * `--muted` on `--surface` that size is under the contrast floor, and the
 * studio's metadata rows are denser than anything else in the app.
 */

/**
 * The 40px strip under the app header, 48px as the head of the home view's
 * assets panel (`surface`). Sticky, and its height never changes.
 *
 * `min-w-0`, and the page under it too: the strip's controls do not shrink,
 * so its min-content width used to widen the whole page on a phone, and the
 * grid laid out two columns for a screen that shows one. Now the topic chips
 * give up their room first, as their overflow already allows.
 */
export function StudioStrip({ children, surface = false }: { children: ReactNode; surface?: boolean }) {
  return (
    <div
      className={
        surface
          ? // On the assets panel of the home view: its ground, inside its rounded top.
            "sticky top-0 z-10 flex h-12 min-w-0 shrink-0 items-center gap-2 rounded-t-3xl border-b border-[var(--border)] bg-surface px-3 md:px-5"
          : "sticky top-0 z-10 flex h-10 min-w-0 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--background)] px-3"
      }
    >
      {children}
    </div>
  );
}

export function Spacer() {
  return <div className="flex-1" />;
}

/** A label-role chip. `tone` is the only thing that varies. */
export function Chip({
  children,
  tone = "muted",
  title,
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "warn" | "danger" | "ok";
  title?: string;
}) {
  const tones = {
    muted: "border-[var(--border)] bg-[var(--chip-bg)] text-[var(--muted-strong)]",
    accent: "border-[var(--accent)]/40 bg-[var(--nav-active-bg)] text-[var(--accent-strong)]",
    warn: "border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)]",
    danger: "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]",
    ok: "border-[var(--ok)]/40 bg-[var(--chip-bg)] text-[var(--ok-text)]",
  } as const;
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-xs ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** A chip that is also a link: the topic filter, and the topic on the strip. */
export function ChipLink({
  href,
  children,
  active = false,
  title,
}: {
  href: string;
  children: ReactNode;
  active?: boolean;
  title?: string;
}) {
  return (
    <PanelLink
      href={href}
      title={title}
      className={`inline-flex h-7 max-w-full shrink-0 items-center gap-1 truncate rounded-md border px-2 text-xs transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--nav-active-bg)] text-[var(--accent-strong)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-hover)]"
      }`}
    >
      {children}
    </PanelLink>
  );
}

/** A 32px-tall control. Bordered by default, filled when it is the one action. */
export function Button({
  children,
  filled = false,
  ...rest
}: { children: ReactNode; filled?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        filled
          ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
          : "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
      }`}
    >
      {children}
    </button>
  );
}

/** The same shape as `Button`, for the places navigation is the action. */
export function ButtonLink({
  href,
  children,
  filled = false,
  title,
}: {
  href: string;
  children: ReactNode;
  filled?: boolean;
  title?: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      title={title}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
        filled
          ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
          : "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
      }`}
    >
      {children}
    </Link>
  );
}

/** A heading inside the right panel. */
export function PanelHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold text-[var(--muted-strong)]">
      {children}
    </h2>
  );
}

/** One `label · value` row in the inspector. 32px, the dense rhythm. */
export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3 border-b border-[var(--border)] py-1.5 last:border-b-0">
      <span className="w-24 shrink-0 text-xs text-[var(--muted)]">{label}</span>
      <span className="min-w-0 flex-1 break-words text-xs text-[var(--muted-strong)]">{children}</span>
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
  report: { verb: string; ok: boolean; headline: string; detail: string | null };
  clearHref: string;
}) {
  return (
    <Banner tone={report.ok ? "ok" : "danger"} dismissHref={clearHref}>
      <span className="font-semibold">{report.verb}: </span>
      {report.headline}
      {report.detail !== null && report.detail !== "" && (
        <span className="block font-mono text-[12px] text-text2">{report.detail}</span>
      )}
    </Banner>
  );
}
