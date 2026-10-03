import "server-only";

import { conceptSummaries, listAssets } from "@self-learn/catalog/state";

import { getCourses } from "@/data/courses";
import type { AskEntry } from "@/lib/ask-core";
import { catalogDatabase } from "@/lib/learner-store";
import { currentScope } from "@/lib/owner";

/**
 * Everything the Ask box can find, read for one request: the owner's concepts
 * and the commons', every course and module, and every video in the library.
 *
 * Each source degrades on its own. A box that finds courses but not concepts
 * while one read is failing still finds courses, and the box never claims
 * the catalog is empty: it only ever lists what it found.
 */
export async function readAskEntries(): Promise<AskEntry[]> {
  const scope = await currentScope();
  const [concepts, courses, videos] = await Promise.all([
    settle("concepts", async () => {
      const db = await catalogDatabase();
      return (await conceptSummaries(db, scope)).map(
        (c): AskEntry => ({
          kind: "concept",
          key: `concept:${c.conceptId}`,
          title: c.title,
          detail: c.domain,
          href: `/learn/${encodeURIComponent(c.conceptId)}`,
          aliases: [c.conceptId.replace(/-/g, " ")],
        }),
      );
    }),
    settle("courses", async () =>
      (await getCourses()).flatMap((course): AskEntry[] => [
        {
          kind: "course",
          key: `course:${course.slug}`,
          title: course.title,
          detail: course.code,
          href: `/courses/${encodeURIComponent(course.slug)}`,
          aliases: [course.code],
        },
        ...course.modules.map(
          (m): AskEntry => ({
            kind: "module",
            key: `module:${course.slug}/${m.slug}`,
            title: m.title,
            detail: `${course.code} · Module ${m.order}`,
            href: `/courses/${encodeURIComponent(course.slug)}/${encodeURIComponent(m.slug)}`,
          }),
        ),
      ]),
    ),
    settle("videos", async () => {
      const db = await catalogDatabase();
      return (await listAssets(db, { kind: "video" }, scope))
        .filter((a) => a.title !== null && a.title.trim() !== "")
        .map(
          (a): AskEntry => ({
            kind: "video",
            key: `video:${a.id}`,
            title: a.title as string,
            detail: "Video",
            href: `/library/${encodeURIComponent(a.id)}`,
          }),
        );
    }),
  ]);
  return [...concepts, ...courses, ...videos];
}

async function settle(what: string, read: () => Promise<AskEntry[]>): Promise<AskEntry[]> {
  try {
    return await read();
  } catch (error) {
    console.warn(`ask: ${what} unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
