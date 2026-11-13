/**
 * The number a module is shown under: its 1-based place in the course's
 * module list, never its authored `order`.
 *
 * `order` is the sort key and nothing else. It may have gaps (archiving a
 * module leaves 1 and 3), so printing it gave "Module 3 of 2". The list is
 * already in `order`: the database reader sorts by `position`, which an
 * import writes from `order`, and the file reader (`readCourse`) sorts by
 * `order` and refuses two modules of a course sharing one. So a module's
 * place in it runs 1..N with no gaps and never passes the count. Every header, sidebar
 * row, neighbour link, label and prompt that names a module by number goes
 * through here; `test/fixtures/module-numbers.json` holds the worked cases.
 *
 * Pure and import-free, so client components can take it from
 * `@hermes/content/module-number` without reaching the file reader.
 */

interface Listed {
  readonly modules: readonly { readonly id: string }[];
}

/** The module's 1-based place in `course.modules`. Throws for a module the course does not list. */
export function moduleNumber(course: Listed, module: { readonly id: string }): number {
  const index = course.modules.findIndex((m) => m.id === module.id);
  if (index < 0) throw new Error(`module "${module.id}" is not in this course's module list`);
  return index + 1;
}

/** "Module 2 of 2": a module page's header. */
export function modulePlace(course: Listed, module: { readonly id: string }): string {
  return `Module ${moduleNumber(course, module)} of ${course.modules.length}`;
}

/** "2. Agentic frameworks": a sidebar row and a neighbour link. */
export function numberedTitle(course: Listed, module: { readonly id: string; readonly title: string }): string {
  return `${moduleNumber(course, module)}. ${module.title}`;
}
