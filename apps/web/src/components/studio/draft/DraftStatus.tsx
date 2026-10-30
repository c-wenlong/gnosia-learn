"use client";

import type { ReactNode } from "react";

import { Failure } from "@/components/studio/draft/ThreadFoot";
import type { RecordStatus } from "@/components/studio/draft/use-draft-record";
import { PinnedDiagram } from "@/components/studio/PinnedDiagram";
import { DialogHeader } from "@/components/studio/StudioDialog";
import { Button } from "@/components/ui/Button";
import { GONE } from "@/lib/studio-chat";
import { makeVideoTitle } from "@/lib/studio-extend";

/**
 * The panel before there is a conversation to show: gone (the runner has no
 * such draft), opening, or the runner not answering. Straight from Extend,
 * the picture and the header stay where they were while the record is read,
 * rather than blinking to a blank panel.
 */
export function DraftStatus({
  status,
  arriving,
  forVideo,
  onNewConversation,
  starting,
  startError,
  downReason,
  onRetry,
}: {
  status: RecordStatus;
  /** The diagram an Extend press opened this from, with its display title. */
  arriving: { name: string; title: string } | null;
  /** Opened by Make a video of this (D86). */
  forVideo: boolean;
  onNewConversation: () => void;
  starting: boolean;
  startError: string | null;
  downReason: string | null;
  onRetry: () => void;
}) {
  if (status === "gone") {
    return (
      <>
        <DialogHeader title="New conversation" />
        <Empty>
          <p className="text-[15px] text-text">{GONE}</p>
          <Button onClick={onNewConversation} disabled={starting}>
            New conversation
          </Button>
          <Failure text={startError} />
        </Empty>
      </>
    );
  }

  if (status === "loading" && arriving !== null) {
    return (
      <>
        <DialogHeader title={forVideo ? makeVideoTitle(arriving.title) : `Extending ${arriving.title}`} />
        <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-5">
          <PinnedDiagram name={arriving.name} title={arriving.title} />
          <p className="text-center text-[13px] text-text3" role="status">
            Opening the conversation…
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader title="New conversation" />
      <Empty>
        {status === "loading" ? (
          <p className="text-[14px] text-text3" role="status">
            Opening the conversation…
          </p>
        ) : (
          <>
            <p className="text-[15px] text-text">The studio runner did not answer, so this conversation cannot be read.</p>
            {downReason !== null && <p className="text-[13px] text-text2">{downReason}</p>}
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </>
        )}
      </Empty>
    </>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-4 p-8 text-center">{children}</div>;
}
