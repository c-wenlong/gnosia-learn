import { JobsProvider } from "@/components/studio/JobsProvider";
import { StudioZone } from "@/components/studio/StudioZone";
import { appTimeZone } from "@gnosia/tutor/server/time-zone";
import { requireStudio, studioApi } from "@/lib/studio";
import type { Job } from "@/lib/studio-jobs";

/**
 * The studio's own layout, and the reason it exists at all.
 *
 * One job: hold the jobs provider. The strip has to persist across `/studio` and
 * `/studio/d/<name>` — a job started from the canvas must still be visible after
 * navigating back to the grid — and Next keeps a layout mounted across
 * navigations within its segment. A provider in each page instead would tear
 * down the event stream and rebuild it on every click, and would lose the
 * "this tab watched that job finish" fact the strip needs to report a failure.
 *
 * The first list is fetched here rather than in the browser, so the strip is
 * right in the first paint rather than after a round trip: a reload mid-job
 * shows the running job immediately, from `GET /api/jobs`, which is the record
 * (D8). With the runner down this is an empty list and the pages below render
 * the blocked screens; a layout that threw would take those screens with it.
 *
 * `requireStudio()` is here as well as in every page, because this is an entry
 * point Next invokes on its own — `studio-gate.test.ts` walks for exactly that.
 */

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  requireStudio();

  const listed = await studioApi<{ jobs: Job[] }>("/api/jobs?limit=50", { timeoutMs: 10_000 });

  return (
    <JobsProvider initialJobs={listed.ok ? listed.data.jobs : []} streamEnabled>
      <StudioZone timeZone={appTimeZone()}>{children}</StudioZone>
    </JobsProvider>
  );
}
