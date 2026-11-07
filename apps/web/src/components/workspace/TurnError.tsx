import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FADE_IN } from "@/components/ui/motion";

/**
 * A tutor turn that failed, said in the thread where the answer would have
 * been: the kit's warn `Callout` as an alert, with Try again under the words
 * when there is a question to send again. The open tutor, the library's Ask
 * panel and the course topic tutor draw it; `ChatTurn` draws the turns
 * around it.
 */
export function TurnError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Callout
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
