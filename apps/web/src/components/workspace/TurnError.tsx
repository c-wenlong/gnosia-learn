import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import type { CalloutTone } from "@/components/ui/classes";
import { FADE_IN } from "@/components/ui/motion";

/**
 * A tutor turn that failed, said in the thread where the answer would have
 * been: the kit's `Callout` as an alert, with Try again under the words when
 * there is a question to send again. The open tutor, the library's Ask panel
 * and the course topic tutor draw it; `ChatTurn` draws the turns around it.
 *
 * `tone` is `warn` by default (the open tutor and the Ask panel); the course
 * topic tutor's `AgentSession` passes `danger`, the tone its box always had.
 */
export function TurnError({
  error,
  onRetry,
  tone = "warn",
}: {
  error: string;
  onRetry?: () => void;
  tone?: Extract<CalloutTone, "warn" | "danger">;
}) {
  return (
    <Callout
      tone={tone}
      role="alert"
      className={FADE_IN}
      actions={
        onRetry === undefined ? undefined : (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {error}
    </Callout>
  );
}
