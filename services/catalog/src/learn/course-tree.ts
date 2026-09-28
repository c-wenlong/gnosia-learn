import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { exportCourse, stampCourse } from "../content/courses";
import { renderType } from "../content/export";
import type { CatalogDatabase } from "../db";

/**
 * The course files `learn concept add --item` lists a concept in.
 *
 * The listing is a textual edit of one course file (`course-edit.ts`), taken
 * into the database by `course import`, the one course writer. While courses
 * are on files that file is the tree's own. Once the database owns courses
 * the tree has no course files to edit (the cut-over removed `content/`), so
 * the file is the database's export, written into a temp directory beside the
 * vocabulary and tags the course reader checks it against, edited there and
 * imported from there. The course file is stamped with the revision it was
 * exported at, so an import that would undo a write landing in between is
 * refused, as it is for any `course export`, edit, `course import`.
 */
export interface CourseTree {
  /** The root `checkItem` and `listConceptOnItem` read and edit under. */
  root: string;
  /** True for the database's export in a temp directory, which `dispose` removes. */
  temporary: boolean;
  /** Stamp the course's file with the revision it was exported at; a tree's own file is left as it is. */
  stamp(courseId: string): Promise<void>;
  /**
   * Render the vocabulary and the tags again, after the note was filed under
   * its topic: the course reader checks a listed concept against its
   * module's topic's `maps.concepts`, which the export taken before the
   * filing does not have yet. The course file is left as it is.
   */
  refreshVocabulary(): Promise<void>;
  dispose(): Promise<void>;
}

export async function courseTree(db: CatalogDatabase | null, repoRoot: string): Promise<CourseTree> {
  if (db === null) {
    const nothing = async () => {};
    return { root: repoRoot, temporary: false, stamp: nothing, refreshVocabulary: nothing, dispose: nothing };
  }
  const root = await mkdtemp(path.join(tmpdir(), "learn-course-tree-"));
  const render = async (types: readonly ("topics" | "tags" | "courses")[]) => {
    for (const type of types) {
      for (const file of await renderType(db, type)) {
        const target = path.join(root, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.bytes);
      }
    }
  };
  try {
    await render(["topics", "tags", "courses"]);
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return {
    root,
    temporary: true,
    stamp: async (courseId) => {
      const exported = await exportCourse(db, courseId);
      await writeFile(path.join(root, exported.path), stampCourse(exported.yaml, exported.base), "utf8");
    },
    refreshVocabulary: () => render(["topics", "tags"]),
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
