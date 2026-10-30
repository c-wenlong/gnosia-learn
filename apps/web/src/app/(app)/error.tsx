"use client";

import { Notice } from "@/components/ui/Notice";
import { Button } from "@/components/ui/Button";

/**
 * What a page under the app's shell shows when its server render throws.
 *
 * Inside the shell on purpose: `(app)/layout.tsx` is above this boundary, so
 * the sidebar and the learner's numbers stay, and only the page's
 * own area is replaced. That is edge case 20 of docs/CONTENT-MIGRATION.md:
 * since phase 2 every page reads its content from the database only
 * (`@/data/source`), so a database that is down, or a content type nobody
 * has flipped, fails the page rather than falling back to files.
 *
 * But a database is only one way a page can fail: a bug in a component or a
 * provider failure lands here too, so the notice says the page failed and
 * offers the catalog as the likeliest cause, not the only one (S7-19 of the
 * 2026-10 audit). Next strips a server error's message before it reaches the
 * browser and hands over a digest instead; the server's log line carrying
 * that digest says what it was, with the command (`catalog flip <type>`) when
 * it was a flip.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    // `app`, as the loading frame it replaces is, so the shell keeps its gutters.
    <div data-layout="app" className="flex animate-enter flex-col gap-4 py-6 motion-reduce:animate-none">
      <Notice
        role="alert"
        title="This page hit an error."
        command="npm run catalog -- doctor"
        actions={
          <Button variant="secondary" onClick={() => retry()}>
            Try again
          </Button>
        }
      >
        <p>
          Something failed while this page was being drawn. The server&rsquo;s log has the error under the digest
          below. When it is the catalog database (not answering, or a kind of content not yet moved into it), the
          command below says so and names what to run.
        </p>
        {error.digest !== undefined && (
          <p className="mt-2 font-mono text-[12px] text-text3">digest {error.digest}</p>
        )}
      </Notice>
    </div>
  );
}
