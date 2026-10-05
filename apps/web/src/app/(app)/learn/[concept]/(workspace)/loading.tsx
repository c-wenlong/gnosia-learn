import { PageLoading } from "@/components/PageLoading";

/**
 * The concept workspace's frame: `data-layout="workspace"`, so from 900px up
 * the shell is already fixed to the viewport while the page is read, rather
 * than loading as an `app` page and then changing height under the learner.
 *
 * **Why the page sits in a `(workspace)` group.** A `loading.tsx` wraps its
 * segment's page and every segment below it, and a dynamic route is
 * prefetched only as far as the first loading boundary on its path. Beside
 * the page in `[concept]/`, this frame would also have been the boundary for
 * `[concept]/session`, so a session opened from Home, the Learn map or
 * another session's Keep going would have shown the workspace's three panels
 * before its focus page. In a group of its own it wraps the workspace alone,
 * and the session keeps its own focus frame (`session/loading.tsx`). The
 * group adds nothing to the address.
 */
export default function Loading() {
  return <PageLoading layout="workspace" label="Opening the concept" />;
}
