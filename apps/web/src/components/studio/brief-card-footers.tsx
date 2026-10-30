"use client";

import { useState } from "react";

import { Reveal } from "@/components/studio/motion-parts";
import { PanelLink } from "@/components/studio/PanelLink";
import { Button } from "@/components/ui/Button";
import { linkClasses } from "@/components/ui/classes";
import { madeLine } from "@/lib/studio-cards";
import type { DrawBlock } from "@/lib/studio-chat";

/**
 * The footers a brief card shows under its brief, one at a time, each folding
 * open and shut as the card's state moves: shared by the diagram card
 * (`ConfirmCard`) and the video card (`ConfirmCardVideo`), which differ in
 * their bodies and in the verb, not here.
 */

type Kind = "diagram" | "video";

/**
 * A footer: a rule and its content, and the card's 14px above the rule. The
 * space is the footer's own (a margin, inside its fold) rather than a gap
 * in the card, so a footer folded shut leaves nothing behind.
 */
export const FOOTER = "mt-3.5 flex flex-col gap-2 border-t border-hair pt-3.5";

/**
 * Use this brief, on a card the planner put on hold or one the conversation
 * moved past: the press's own busy state and the sentence it was refused with.
 * `use` runs the card's action, which resolves with an error sentence or null.
 */
export function useHoldAction() {
  const [using, setUsing] = useState(false);
  const [useError, setUseError] = useState<string | null>(null);
  async function use(action: (() => Promise<string | null>) | undefined): Promise<void> {
    if (action === undefined || using) return;
    setUsing(true);
    setUseError(null);
    const error = await action();
    setUsing(false);
    setUseError(error);
  }
  return { using, useError, use };
}

/** A refusal, said where it happened. Nothing when there is none. */
export function FooterError({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="text-[13px] leading-5 text-danger">
      {text}
    </p>
  );
}

/** On hold (D60): the planner's few words for why, and Use this brief. */
export function OnHoldFooter({
  open,
  reason,
  using,
  error,
  editBlock,
  onUse,
}: {
  open: boolean;
  reason: string | null;
  using: boolean;
  error: string | null;
  /** Why the press waits (a reply being written), or null. */
  editBlock: string | null;
  onUse: () => void;
}) {
  return (
    <Reveal open={open}>
      <div className={FOOTER}>
        <p className="text-[13px] leading-5 text-text">On hold: {reason ?? "the conversation contradicted this brief"}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button size="sm" variant="secondary" onClick={onUse} disabled={using || editBlock !== null} title={editBlock ?? undefined}>
            {using ? "Saving…" : "Use this brief"}
          </Button>
        </div>
        <FooterError text={error} />
      </div>
    </Reveal>
  );
}

/**
 * The live card's press, and everything said under it: why it is held, the
 * runner's refusal, the job holding the target, or that nothing is spent
 * until it is pressed.
 */
export function LiveFooter({
  open,
  kind,
  label,
  busy,
  block,
  refusal,
  holder,
  holderHref,
  paired,
  keyShortcut,
  costNote,
  onPress,
}: {
  open: boolean;
  kind: Kind;
  /** The press's words, busy or not. */
  label: string;
  busy: boolean;
  block: DrawBlock | null;
  refusal: { text: string | null } | null;
  /** The job holding the target, from the block or the refusal. */
  holder: string | null;
  holderHref: (jobId: string) => string;
  /** A pair is live, so Make both is the primary press and this card's steps back. */
  paired: boolean;
  keyShortcut: boolean;
  costNote: string | null;
  onPress: () => void;
}) {
  return (
    <Reveal open={open}>
      <div className={FOOTER}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            variant={paired ? "secondary" : "primary"}
            onClick={onPress}
            disabled={busy || block !== null}
            aria-keyshortcuts={keyShortcut ? "Meta+Enter Control+Enter" : undefined}
            data-studio-draw
            data-card-kind={kind}
          >
            {label}
          </Button>
        </div>
        {block !== null && <p className="text-[12px] leading-4 text-text2">{block.reason}</p>}
        {refusal !== null && refusal.text !== null && block === null && (
          <p role="alert" className="text-[13px] leading-5 text-text">
            {refusal.text}
          </p>
        )}
        {holder !== null && (
          <PanelLink href={holderHref(holder)} scroll={false} className={linkClasses({ size: "sm", className: "w-fit" })}>
            Open that job
          </PanelLink>
        )}
        {block === null && refusal === null && (
          <p className="text-[12px] text-text3">
            Nothing is {kind === "video" ? "made" : "drawn"} or spent until you press it.
            {costNote !== null && <> {costNote}</>}
            {keyShortcut && (
              <span className="max-md:hidden">
                {" "}
                <kbd className="font-sans">⌘</kbd>/Ctrl+Enter works too.
              </span>
            )}
          </p>
        )}
      </div>
    </Reveal>
  );
}

/** Once pressed: the job the brief started, and whether it is still going. */
export function MadeFooter({
  open,
  kind,
  jobHref,
  jobRunning,
}: {
  open: boolean;
  kind: Kind;
  jobHref: string | null;
  jobRunning: boolean;
}) {
  return (
    <Reveal open={open && jobHref !== null}>
      <div className="mt-3.5 border-t border-hair pt-3">
        {jobHref !== null && (
          <PanelLink href={jobHref} scroll={false} className={linkClasses({ size: "sm" })}>
            {madeLine(kind, jobRunning)}. Open the job
          </PanelLink>
        )}
      </div>
    </Reveal>
  );
}
