"use client";

import { Failure } from "@/components/studio/draft/ThreadFoot";
import { JobPanel } from "@/components/studio/JobPanel";
import { FADE_IN } from "@/components/studio/motion";
import { PanelLink } from "@/components/studio/PanelLink";
import { DialogHeader } from "@/components/studio/StudioDialog";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { jobKind } from "@/lib/studio-cards";
import { isTerminal, type Job } from "@/lib/studio-jobs";
import { panelHref } from "@/lib/studio-view";

/**
 * The conversation panel's second body (`?draft=&job=`): the job a press
 * started, with a bar back to the chat, and once the job has ended a line
 * saying where the next one starts.
 */
export function DraftJobView({
  jobId,
  jobs,
  path,
  title,
  inline,
  onNewConversation,
  starting,
  startError,
}: {
  jobId: string;
  jobs: readonly Job[];
  path: string;
  /** The conversation's title, for a job the jobs cache has not listed yet. */
  title: string;
  /** The pane is beside the page rather than full screen. */
  inline: boolean;
  onNewConversation: () => void;
  starting: boolean;
  startError: string | null;
}) {
  const job = jobs.find((entry) => entry.jobId === jobId) ?? null;
  const settled = job !== null && (isTerminal(job.state) || job.state === "awaiting_review");
  const ended = job !== null && isTerminal(job.state);
  const kind = job === null ? "diagram" : jobKind(job);
  return (
    <>
      {/* No cost here: the job's own line under it carries the job's, and the
          conversation's beside it read as one confusing total (phase 2). The
          conversation's cost is in the conversation. */}
      <DialogHeader title={job?.title ?? title} />
      <BackBar href={panelHref(path, { job: null })} />
      <div className={cx("min-h-0 flex-1 overflow-y-auto", FADE_IN)}>
        {ended && (
          <div className="flex flex-wrap items-center gap-3 border-b border-hair px-5 py-3">
            <p className="min-w-0 flex-1 text-[14px] text-text2">
              {job.state === "accepted"
                ? "Accepted. Ask for a change or something new in the same conversation."
                : job.state === "failed" || job.state === "interrupted"
                  ? `${kind === "video" ? "The video" : "The drawing"} did not pass. What the checks found is in the conversation.`
                  : "Ask for a change, or start something new."}
            </p>
            <Button size="sm" href={panelHref(path, { job: null })}>
              Back to the conversation
            </Button>
            <Button size="sm" variant="secondary" onClick={onNewConversation} disabled={starting}>
              New conversation
            </Button>
            <Failure text={startError} className="basis-full" />
          </div>
        )}
        <div className={inline ? "mx-auto w-full max-w-4xl" : undefined}>
          <JobPanel jobId={jobId} path={path} embedded inConversation />
        </div>
        {settled && !ended && (
          <p className="px-5 pb-5 text-[13px] text-text3">
            Accept or Discard above. Either way, the conversation is where the next one starts.
          </p>
        )}
      </div>
    </>
  );
}

function BackBar({ href }: { href: string }) {
  return (
    <div className="flex h-10 shrink-0 items-center border-b border-hair bg-surface2 px-3">
      <PanelLink
        href={href}
        scroll={false}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-text2 transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Glyph name="previous" size={16} />
        From your conversation
      </PanelLink>
    </div>
  );
}
