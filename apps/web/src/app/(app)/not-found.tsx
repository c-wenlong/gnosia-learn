import { NotFoundNotice } from "@/components/NotFoundNotice";
import { PAGE_ENTER } from "@/components/PageLoading";

/**
 * What a `notFound()` from a page under the shell shows: a course, a concept,
 * a module or an asset that does not exist.
 *
 * Here rather than only at the root: Next renders the nearest `not-found.tsx`
 * above the segment that called `notFound()`, and the root one sits above
 * `(app)/layout.tsx`, so the sidebar went with the page and the learner was
 * left on a bare notice with one link out. This one is inside the layout, so
 * only the page's own area is replaced, as `error.tsx` does for a failed
 * read. An address that matches no route still gets the root one, which
 * Next uses for every unmatched URL.
 *
 * `app`, as the loading frame it replaces is, so the shell keeps its gutters.
 */
export default function AppNotFound() {
  return (
    <div data-layout="app" className={PAGE_ENTER}>
      <div className="mx-auto w-full max-w-xl py-6">
        <NotFoundNotice />
      </div>
    </div>
  );
}
