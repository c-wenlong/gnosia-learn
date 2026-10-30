"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { postJob, useStudioJobs } from "@/components/studio/JobsProvider";
import { usePanelHost } from "@/components/studio/panel-host";
import { jobVerbPath, verbOutcome, type VerbOutcome } from "@/lib/studio-job-verb";
import { panelHref } from "@/lib/studio-url";

export interface SendOptions {
  body?: unknown;
  /** The word for the fallback sentence, `Resume answered 502.`. */
  label: string;
  /**
   * Move the panel to the job the answer names, when it names one other than
   * `from`: Resume, Retry and Revise queue a new job, and staying on the old
   * one would leave a person watching the record of the job that stopped.
   */
  follow?: { from: string | null };
  /**
   * Post without reading the job list after it (`postJob`): for Revise, whose
   * old job already reads discarded in that list, so the panel moves first and
   * the caller reads the list after.
   */
  quiet?: boolean;
}

/**
 * Post a job verb, read what the runner said, and follow a job it queued.
 *
 * Every press on a job (Cancel, Resume, Retry, Accept, Discard, Reindex,
 * Revise) goes through here, so the answer is read one way (`verbOutcome`)
 * and a new job is opened one way: through the panel host when the studio
 * draws the panel in the browser, a router push only when it does not. A
 * server render of `/studio` reads the catalog three times, which is what the
 * host exists to avoid (S1-07 of the web audit).
 *
 * `busy` is the verb in flight, or null.
 */
export function useJobVerb(path: string) {
  const { post, refresh } = useStudioJobs();
  const host = usePanelHost();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const hostPath = host?.path ?? path;

  /** Go to `href`: the host first, a router push when the host does not draw it. */
  const go = useCallback(
    (href: string): void => {
      if (host?.navigate(href) !== true) router.push(href, { scroll: false });
    },
    [host, router],
  );

  const send = useCallback(
    async (url: string, options: SendOptions): Promise<VerbOutcome> => {
      setBusy(options.label);
      try {
        const answer = options.quiet === true ? await postJob(url, options.body) : await post(url, options.body);
        const outcome = verbOutcome(answer, options.label);
        const from = options.follow?.from;
        if (options.follow !== undefined && outcome.ok && outcome.next !== null && outcome.next !== from) {
          go(panelHref(hostPath, { job: outcome.next }));
        }
        return outcome;
      } finally {
        setBusy(null);
      }
    },
    [post, go, hostPath],
  );

  /** A verb on one job: `run(jobId, "resume", { follow: true })`. */
  const run = useCallback(
    (jobId: string, verb: string, options: Omit<SendOptions, "label" | "follow"> & { follow?: boolean } = {}) =>
      send(jobVerbPath(jobId, verb), {
        ...options,
        label: verb,
        follow: options.follow === true ? { from: jobId } : undefined,
      }),
    [send],
  );

  return { run, send, busy, go, refresh };
}
