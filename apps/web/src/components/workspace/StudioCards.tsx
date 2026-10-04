import Link from "next/link";
import { useId, type ReactNode } from "react";

import { assetDisplayTitle, assetKindLabel } from "@/components/asset-meta";
import { ConceptGraph } from "@/components/ConceptGraph";
import { MathText } from "@/components/Math";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/classes";
import { AssetThumb } from "@/components/workspace/AssetThumb";
import type { CheckStatus, ConceptWorkspace } from "@/lib/concept-workspace-core";
import { historyBars } from "@/lib/concept-workspace-core";
import { conceptMapHref } from "@/lib/learn-index";
import { assetHref } from "@/lib/library";

/**
 * The workspace's right panel (hi-fi 04): the things made from a concept.
 * Mastery with its history and schedule, the note's checks, the assets that
 * explain it, and its neighbourhood graph. Server-rendered.
 */

function CardHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-[13px] font-bold text-text">{children}</h3>;
}

const CHECK_DOT: Record<CheckStatus, string> = {
  passed: "bg-ok",
  missed: "bg-warn",
  untried: "border-2 border-m-lo bg-surface",
};

const CHECK_WORD: Record<CheckStatus, string> = {
  passed: "answered right last time",
  missed: "missed last time",
  untried: "not tried yet",
};

export interface StudioAsset {
  id: string;
  kind: string;
  title: string | null;
  path: string | null;
  url: string | null;
  bytes: number | null;
  /** A poster or the diagram itself, already resolved; null for no picture. */
  thumbnail: string | null;
}

export function StudioCards({
  workspace,
  assets,
  nextReview,
}: {
  workspace: ConceptWorkspace;
  assets: StudioAsset[];
  /** "Fri", "today", "overdue": worked out on the server in the learner's zone. */
  nextReview: string | null;
}) {
  const w = workspace;
  const bars = historyBars(w.history);
  const checks = w.checks;
  // The empty-checks line is Quiz me's reason; the button points at it rather than repeating it.
  const noChecksId = useId();

  return (
    <>
      <Card tight aria-label="Mastery">
        <div className="flex items-center gap-3">
          <p className="font-display text-[30px] leading-none font-bold text-accent-text tabular-nums">
            {w.pL.toFixed(2)}
          </p>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-text">mastery p(L)</p>
            <p className="text-[12px] text-text2">
              {w.observations} observation{w.observations === 1 ? "" : "s"} · {w.correct} correct
            </p>
          </div>
        </div>
        {bars.length > 0 ? (
          <div className="flex h-[22px] items-end gap-1" role="img" aria-label={`p(L) after the last ${bars.length} answers: ${bars.map((b) => b.toFixed(2)).join(", ")}`}>
            {bars.map((b, i) => (
              <span key={i} className="w-2 rounded-[2px] bg-accent" style={{ height: `${Math.max(3, Math.round(b * 22))}px` }} />
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-text3">No answers recorded yet.</p>
        )}
        <p className="text-[12px] text-text3">
          {w.review === null
            ? "No review scheduled"
            : `${nextReview === "overdue" ? "Review overdue" : `Next review ${nextReview ?? "soon"}`} · interval ${w.review.intervalDays}d · ease ${w.review.ease.toFixed(1)}`}
          {w.review?.leech ? " · leech" : ""}
        </p>
      </Card>

      <Card tight aria-label="Checks">
        <CardHeading>Checks · {checks.length}</CardHeading>
        {checks.length === 0 ? (
          <p id={noChecksId} className="text-[13px] text-text3">
            The note has no checks yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {checks.map((c) => (
              <li key={c.id} className="flex min-w-0 items-center gap-2 text-[13px] text-text" title={c.question}>
                <span aria-hidden className={cx("size-2 shrink-0 rounded-full", CHECK_DOT[c.status])} />
                <MathText text={c.question} className="min-w-0 truncate" />
                <span className="sr-only">, {CHECK_WORD[c.status]}</span>
              </li>
            ))}
          </ul>
        )}
        <span className="mt-1">
          {checks.length > 0 ? (
            <Button variant="secondary" size="sm" href={`/learn/${w.slug}/session?mode=check`}>
              Quiz me
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled aria-describedby={noChecksId}>
              Quiz me
            </Button>
          )}
        </span>
      </Card>

      <Card tight aria-label="Assets">
        <CardHeading>Assets</CardHeading>
        {assets.length === 0 ? (
          <p className="text-[13px] text-text3">No video or diagram explains this yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {assets.map((a) => (
              <li key={a.id}>
                <Link
                  href={assetHref(a.id)}
                  className="flex h-11 min-w-0 items-center gap-2.5 rounded-xl bg-surface2 px-2 text-[12px] text-text2 transition-colors duration-100 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <AssetThumb src={a.thumbnail} />
                  <span className="min-w-0 flex-1 truncate px-1">
                    {assetKindLabel(a.kind)} · {assetDisplayTitle(a).text}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card tight aria-label="Neighbourhood">
        <CardHeading>Neighbourhood</CardHeading>
        <div className="rounded-xl bg-surface2 px-1 py-1">
          <ConceptGraph
            nodes={w.graph.nodes}
            edges={w.graph.edges}
            focus={w.slug}
            hrefFor={(id) => `/learn/${id}`}
            compact
            label={`Neighbourhood of ${w.title}: ${w.requires.length + w.assumes.length} prerequisites, ${w.dependants.length} dependants`}
          />
        </div>
        <span className="mt-1">
          <Button variant="secondary" size="sm" href={conceptMapHref(w.slug)}>
            Open in the map
          </Button>
        </span>
      </Card>
    </>
  );
}
