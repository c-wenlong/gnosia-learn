# Editing the curriculum

Course content is data, not code. One YAML file per course under
`content/courses/`, read by `loadCourses()` in
[packages/content](../packages/content/src/courses.ts) — the same function the
web app and `catalog index` both go through, so a course file means one thing
everywhere.

## Where the course data lives

| File | Holds |
| --- | --- |
| `content/courses/<code>.yaml` | One course: modules, curriculum items, subtopics, curated resources |
| `content/topics.yaml` | The shared topic vocabulary each module's `topic:` names |
| `content/tags.yaml` | The cross-course themes each course's `tags:` names |

There is no TypeScript copy. `src/data/courses/index.ts` is a thin server-only
module over the reader, holding the lookups pages call (`getCourse`,
`getModule`, `findTopic`, `getCourseTopicIds`, `getRelatedCourses`,
`totalTopicCount`) and nothing else.

## Adding or changing a course

1. Write or edit `content/courses/<code>.yaml`, named after the course code in
   lowercase. The reader refuses a file whose name and `code:` disagree.
2. Give it an `order:`. That is the order the home page and the sidebar render
   in, and it has to be unique across the shortlist. Sorting by filename is not
   the reading order, which is why the key is authored rather than derived.
3. Point each module's `topic:` at a slug from `content/topics.yaml`. It is a
   lookup key, not free text: add or rename a topic there, never here. If the
   module is new, also add its id to that topic's `maps.courses`. `catalog
   index` refuses to run when the two files disagree in either direction.
4. Use an existing entry from `content/tags.yaml` before inventing a theme;
   tags are how related courses find each other.
5. Run `npm test`. `packages/content/test/courses.test.ts` checks the
   curriculum integrity: the shortlist is complete, topic ids are unique across
   every file, `inferred` is set only on the courses that are genuinely
   inferred, every module names a real topic, every tag resolves.
6. Run `npm run catalog -- index --only courses` to refresh the database from
   the edited files. Without it the catalog keeps serving the last indexed
   state, and nothing says so.

## What the reader refuses

All of these fail the read with the file name in the message, rather than
rendering something wrong:

| Refusal | Why it matters |
| --- | --- |
| A duplicated course, module, topic or resource id | Ids are permanent keys; two things sharing one silently merge whatever they had recorded |
| A module whose `topic:` is missing or not in `content/topics.yaml` | A course row nothing else can join to |
| A missing `id`, `slug`, `code`, `title`, `credits`, `order`, `capstone` | A route that 404s, or a page with a hole in it |
| `inferred` absent, or written as a string | A reconstructed syllabus presented as an official one |
| Two courses claiming one `order` | An ambiguous sidebar |
| A resource `type` outside paper/docs/video/book/other | A chip the UI has no styling for |

Unresolved topics are collected and reported together, so one run names all of
them instead of the first.

## Rules worth keeping

**Topic ids are permanent.** Every learner's progress, notes and recaps are
keyed by topic id in browser `localStorage`, which nothing migrates for you.
Renaming `cs2111-m1-t1` silently orphans whatever that topic had recorded
against it. Keep the `<course>-m<N>-t<N>` shape, and add new topics at the end
of a module rather than renumbering.

The same applies to concept links. A topic id also appears in the `topics:`
frontmatter of concept notes under `learn/concepts/`, which is how the
knowledge base connects back to the roadmap. Changing an id breaks that link
without any error being raised.

**Prefer stable public URLs for curated resources.** A course page that links
to a lecture recording behind a login is worth less than one that links to the
textbook chapter. Dead links are not detected by anything, so favour sources
that will still exist in a year.

**Inferred syllabi must say so.** Courses whose topics were reconstructed from
an announcement plus standard treatment of the subject carry an `inferred`
flag, which renders a banner on the course page. Clear the flag only when the
official NUSMods syllabus lands and the topics have been reconciled against
it.
