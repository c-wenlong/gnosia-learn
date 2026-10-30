/**
 * What a job verb's answer says, read the same way by every press that posts
 * one (Cancel, Resume, Retry, Accept, Discard, Reindex, Revise). React-free,
 * so `use-job-verb.ts` and its tests share it.
 */

/** A POST's answer as `postJob` hands it back: status 0 is a runner that did not answer. */
export interface VerbAnswer {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

export interface VerbOutcome extends VerbAnswer {
  /** The sentence to show for it: the runner's own words when it gave any. */
  text: string;
  /** The job the verb queued (Resume, Retry and Revise start a new one), else null. */
  next: string | null;
}

/** The route a verb on one job posts to. */
export function jobVerbPath(jobId: string, verb: string): string {
  return `/studio/api/jobs/${encodeURIComponent(jobId)}/${verb}`;
}

/**
 * Read an answer. On success the runner's `note` comes first, on a refusal
 * its `error`; with neither, `<Label> answered <status>.`. A runner that did
 * not answer says so with the reason the fetch gave.
 */
export function verbOutcome(answer: VerbAnswer, label: string): VerbOutcome {
  const note = typeof answer.data.note === "string" ? answer.data.note : null;
  const error = typeof answer.data.error === "string" ? answer.data.error : null;
  const detail = typeof answer.data.detail === "string" ? answer.data.detail : null;
  const named = label.charAt(0).toUpperCase() + label.slice(1);
  const text =
    answer.status === 0
      ? `The studio runner is not answering${detail === null ? "." : `: ${detail}`}`
      : ((answer.ok ? (note ?? error) : (error ?? note)) ?? `${named} answered ${answer.status}.`);
  const next = typeof answer.data.jobId === "string" ? answer.data.jobId : null;
  return { ...answer, text, next };
}
