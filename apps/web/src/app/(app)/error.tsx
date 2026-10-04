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
 * The page cannot say which of the two it was. Next strips a server error's
 * message before it reaches the browser and hands over a digest instead, so
 * this names both causes and the digest, and the server's log line carrying
 * that digest names the one it was, with the command (`catalog flip <type>`)
 * when it was a flip.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="flex animate-enter flex-col gap-4 py-6 motion-reduce:animate-none">
      <Notice
        role="alert"
        title="This page could not read its content."
        command="npm run catalog -- doctor"
        actions={
          <Button variant="secondary" onClick={() => retry()}>
            Try again
          </Button>
        }
      >
        <p>
          The app reads every course, topic, note and diagram from the catalog database, and that read failed.
          Either the database is not answering, or a kind of content has not been moved into it yet. The
          server&rsquo;s log says which, and names the command to run.
        </p>
        {error.digest !== undefined && (
          <p className="mt-2 font-mono text-[12px] text-text3">digest {error.digest}</p>
        )}
      </Notice>
    </div>
  );
}
