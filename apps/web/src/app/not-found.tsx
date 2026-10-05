import { NotFoundNotice } from "@/components/NotFoundNotice";

/**
 * What an unknown address shows, and a `notFound()` from a page outside the
 * shell. The root boundary, so it is drawn inside the root layout only, with
 * no shell around it; it centres itself on the page's ground rather than
 * sitting in the corner.
 *
 * A `notFound()` from a page under the shell (a course, a concept or an
 * asset that does not exist) stops at `(app)/not-found.tsx` instead, which
 * keeps the sidebar. An address that matches no route never reaches that
 * one: Next sends every unmatched URL here.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-16">
      <NotFoundNotice />
    </main>
  );
}
