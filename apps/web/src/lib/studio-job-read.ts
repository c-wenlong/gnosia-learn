import { readJobLookup, type JobLookup } from "@/lib/studio-video-job";

/**
 * `GET /api/jobs/{id}` through the studio proxy: the one read of a single
 * job, with its brief, which the list rows do not carry. Every caller reads
 * the answer as a `JobLookup`, so only a 404 is "no such job" and a runner
 * that failed says why rather than passing for a missing job.
 */
export async function getJob(jobId: string): Promise<JobLookup> {
  try {
    const response = await fetch(`/studio/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    return readJobLookup({ status: response.status, body });
  } catch (error) {
    return readJobLookup({ error: (error as Error).message });
  }
}
