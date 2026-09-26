import type { Metadata } from "next";

import { ReviewSession } from "@/components/review/ReviewSession";
import { loadReviewSession } from "@/lib/review-queue";

export const metadata: Metadata = { title: "Review" };

/**
 * Review (hi-fi 08, and 14 on a phone): the due cards one at a time with
 * Anki's four ratings, in focus mode.
 *
 * `?concept=<slug>` puts that concept first, due or not, which is how "Review
 * now" on a concept's workspace asks for it. The queue is read here, on the
 * server, and handed to the client session whole: the session needs nothing
 * else until it writes a grade. `asOf` fixes the clock the relative dates are
 * computed from, so the server's render and the browser's agree.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.concept) ? params.concept[0] : params.concept;
  const focus = typeof raw === "string" && raw !== "" && raw.length <= 128 ? raw : null;
  const session = await loadReviewSession(focus);
  const asOf = new Date().toISOString();
  return (
    <div data-layout="focus">
      <ReviewSession initial={session} focus={focus} asOf={asOf} />
    </div>
  );
}
