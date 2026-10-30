"use client";

import { NoteProse } from "@/components/NoteProse";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { cx } from "@/components/ui/classes";
import { TutorMessage } from "@/components/ui/Message";
import { TypingDots } from "@/components/ui/TypingDots";
import { CHECKING_BRIEF, splitReply, THINKING, type ThreadProblem } from "@/lib/studio-chat";
import type { DraftKind } from "@/lib/studio-drafts";

/**
 * What sits at the thread's foot besides the entries: the reply being
 * written, and a problem in its place when a turn fails without adding an
 * entry. `Failure` is the line a press that did nothing leaves where it was.
 */

/**
 * A reply being written: "The planner is thinking" until the first words
 * arrive, and "Checking the brief" once a reply has landed while the turn is
 * still open, as the runner validates its brief (and may ask for a fix).
 */
export function Streaming({ text, checking }: { text: string | null; checking: boolean }) {
  const reply = text === null ? null : splitReply(text, true);
  if (reply === null && checking) {
    return (
      <p className="flex items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-[14px] text-text3" role="status">
        {CHECKING_BRIEF}
        <TypingDots />
      </p>
    );
  }
  if (reply === null || (reply.prose === "" && !reply.checking)) {
    return (
      <TutorMessage label="Planner">
        <p className="flex items-center gap-2 text-[14px] text-text3" role="status">
          {THINKING}
          <TypingDots />
        </p>
      </TutorMessage>
    );
  }
  return (
    <TutorMessage label="Planner">
      {reply.prose !== "" && <NoteProse source={reply.prose} idPrefix="streaming-" images="link" />}
      {reply.checking && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-[14px] text-text3" role="status">
          {CHECKING_BRIEF}
          <TypingDots />
        </p>
      )}
    </TutorMessage>
  );
}

/** E1, E2 and E6: a `--warn-tint` card at the foot of the thread, with what to do. */
export function Problem({
  problem,
  kind = null,
  onRetry,
  onAskAgain,
  onStartOver,
  cutOffShown,
  blocked,
}: {
  problem: ThreadProblem;
  /** The kind E6's refused brief was, when the runner names it. */
  kind?: DraftKind | null;
  /**
   * Why a paid resend waits, or null: the brief is being edited, and a reply
   * may carry a new brief that retires the card with the edits on it.
   */
  blocked: string | null;
  /** The cut-off reply already says so under its text: E2 is then only Try again. */
  cutOffShown: boolean;
  onRetry: (() => void) | null;
  onAskAgain: (() => void) | null;
  onStartOver: () => void;
}) {
  if (problem.case === "E2" && cutOffShown) {
    return onRetry === null ? null : (
      <div className="-mt-3 px-1.5">
        <Button size="sm" variant="secondary" onClick={onRetry} disabled={blocked !== null} disabledReason={blocked ?? undefined}>
          Try again
        </Button>
      </div>
    );
  }
  const title =
    problem.case === "E1" ? (
      <>The planner&apos;s request was refused.</>
    ) : problem.case === "E6" ? (
      <>The planner&apos;s {kind === null ? "" : `${kind} `}brief did not pass the studio&apos;s checks twice.</>
    ) : undefined;
  return (
    <Callout
      role="alert"
      title={title}
      actions={
        problem.case !== "E6" && onRetry === null ? undefined : (
          <>
            {problem.case !== "E6" && onRetry !== null && (
              <Button size="sm" variant="secondary" onClick={onRetry} disabled={blocked !== null} disabledReason={blocked ?? undefined}>
                Try again
              </Button>
            )}
            {problem.case === "E6" && (
              <>
                {onAskAgain !== null && (
                  <Button size="sm" variant="secondary" onClick={onAskAgain} disabled={blocked !== null} disabledReason={blocked ?? undefined}>
                    Ask again
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onStartOver}>
                  Start over
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {problem.case === "E1" && (
        <>
          <p>{problem.text}</p>
          <p className="mt-1">
            The planner runs on this machine&apos;s <span className="font-mono">claude</span> login. Check it with{" "}
            <span className="font-mono">claude doctor</span>, then try again.
          </p>
        </>
      )}
      {problem.case === "E2" && <p>{problem.text}</p>}
      {problem.case === "E6" && <p className="font-mono text-[12px]">{problem.text}</p>}
    </Callout>
  );
}

/** Why New conversation or Start over did nothing, where the press was. */
export function Failure({ text, className }: { text: string | null; className?: string }) {
  if (text === null) return null;
  return (
    <p role="alert" className={cx("text-[13px] text-danger", className)}>
      {text}
    </p>
  );
}
