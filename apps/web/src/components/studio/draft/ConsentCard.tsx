"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Glyph } from "@/components/ui/Glyph";
import { KIND_NAME, suggestionTitle } from "@/lib/studio-cards";
import type { TagKind } from "@/lib/studio-drafts";

/**
 * The consent card (D106): the planner's offer of a make (what it would
 * show, what the kind has cost here) with the answers: Allow once, Always
 * allow (this conversation, paid kinds only), Deny. An svg offer is the
 * same card minus the spend: it costs nothing, so there is no band and
 * nothing to always-allow (D110). A declined offer collapses to a quiet
 * line; the runner was told and the planner will not re-offer.
 */
export function ConsentCard({
  kind,
  pitch,
  declined,
  cost,
  unavailable,
  onAllow,
  onDecline,
}: {
  kind: TagKind;
  pitch: string | null;
  declined: boolean;
  cost: string | null;
  unavailable: string | null;
  onAllow: (always: boolean) => Promise<boolean>;
  onDecline: () => Promise<boolean>;
}) {
  const [answering, setAnswering] = useState<"once" | "always" | "deny" | null>(null);
  if (declined) {
    return (
      <p className="text-[12px] text-text3" data-consent="declined">
        <Glyph name={kind} size={14} className="mr-1 inline-block align-[-2px]" />
        {KIND_NAME[kind]} declined — the planner will not offer it again.
      </p>
    );
  }
  const press = (answer: "once" | "always" | "deny") => {
    setAnswering(answer);
    const done = answer === "deny" ? onDecline() : onAllow(answer === "always");
    // A refused step re-arms the card: a card stuck disabled on an answer
    // that never landed reads as consent given when none was.
    void done.then((ok) => {
      if (!ok) setAnswering(null);
    });
  };
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3" data-consent={kind}>
      <p className="flex items-center gap-2 text-[13px] font-medium text-text">
        <Glyph name={kind} size={16} className="text-accent-text" />
        {suggestionTitle(kind)}
      </p>
      {pitch !== null && <p className="mt-1 text-[13px] leading-5 text-text2">{pitch}</p>}
      {cost !== null && <p className="mt-1 text-[12px] leading-4 text-text3">A make of this kind {cost}.</p>}
      {unavailable !== null && <p className="mt-1 text-[12px] leading-4 text-text3">{unavailable}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => press("once")} disabled={answering !== null || unavailable !== null} title={unavailable ?? undefined}>
          {answering === "once" ? "Sending…" : "Allow once"}
        </Button>
        {kind !== "svg" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => press("always")}
            disabled={answering !== null || unavailable !== null}
            title={unavailable ?? "Let the planner start this kind on its own, on this conversation only"}
          >
            {answering === "always" ? "Allowing…" : "Always allow here"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => press("deny")} disabled={answering !== null}>
          {answering === "deny" ? "Noting…" : "Deny"}
        </Button>
      </div>
    </div>
  );
}
