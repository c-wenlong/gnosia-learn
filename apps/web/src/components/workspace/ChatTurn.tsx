import type { ReactNode } from "react";

import { MathText } from "@/components/Math";
import { NoteProse } from "@/components/NoteProse";
import { cx, NOTE } from "@/components/ui/classes";
import { TutorMessage, UserMessage } from "@/components/ui/Message";
import { ENTER } from "@/components/ui/motion";

/**
 * One turn of a tutor chat, in the kit's two voices: the tutor's bare prose
 * and the learner's tinted bubble, told apart by shape, so no turn carries a
 * speaker label. The tutor writes markdown, and an image in it is a link,
 * never fetched; the learner's words are text with maths. Each turn rises in
 * as it is added.
 *
 * `idPrefix` keeps the ids NoteProse writes for headings and footnotes unique
 * across a thread, so it differs per turn. `meta` is a line above the tutor's
 * prose, the provider that answered it where one is shown. `cites` and
 * `actions` are the row under a tutor turn (the concept tutor's citation
 * chips and its Why?), and `className` replaces the rise for a turn that
 * should only fade (a thread restored from storage).
 */
export function ChatTurn({
  turn,
  idPrefix,
  meta,
  cites,
  actions,
  className = ENTER,
}: {
  turn: { role: "user" | "assistant"; content: string };
  idPrefix: string;
  meta?: string;
  cites?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  if (turn.role === "user") {
    return (
      <UserMessage className={className}>
        <MathText text={turn.content} />
      </UserMessage>
    );
  }
  return (
    <TutorMessage className={className} cites={cites} actions={actions}>
      {meta && <p className={cx(NOTE, "mb-1")}>{meta}</p>}
      <NoteProse source={turn.content} idPrefix={idPrefix} images="link" />
    </TutorMessage>
  );
}

/**
 * The line a chat shows while the tutor's reply is on its way. A status of
 * its own, so it is announced wherever it sits: AskPanel draws it outside its
 * thread's live region.
 */
export function TutorThinking() {
  return (
    <p role="status" className="animate-fade-in px-1.5 text-[14px] text-text2 motion-reduce:animate-none">
      The tutor is thinking…
    </p>
  );
}
