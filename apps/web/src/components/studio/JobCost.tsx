import { costLabel } from "@/lib/studio-chat";

/** What a cost figure is the cost of: one job, or a whole conversation's turns. */
export type CostSubject = "job" | "conversation";

/**
 * The tooltip on a cost figure. A cancelled, timed-out or interrupted job (or
 * a turn cut off before it reported) carries the runner's accumulation from
 * the stream, which runs low. The tilde and this sentence are the whole of
 * saying so; a bare number would read as the bill.
 */
export function costTitle(source: "result" | "stream" | null, subject: CostSubject = "job"): string {
  if (subject === "conversation") {
    return source === "stream"
      ? "What this conversation has cost so far. A turn cut off before it reported is rebuilt from its stream, which runs low."
      : "What this conversation has cost so far";
  }
  return source === "stream"
    ? "An estimate from the session's usage events, which runs low: the agent was stopped before it reported its own figure."
    : "What the agent reported this job cost.";
}

/**
 * A cost figure with its tooltip, `$0.058` or `~$0.058`: the one place the
 * job panels and the conversation header format money, so the same job shows
 * the same figure everywhere. Nothing when there is no figure.
 */
export function JobCost({
  usd,
  source,
  subject = "job",
}: {
  usd: number | null;
  source: "result" | "stream" | null;
  subject?: CostSubject;
}) {
  const label = costLabel(usd, source);
  if (label === null) return null;
  return <span title={costTitle(source, subject)}>{label}</span>;
}
