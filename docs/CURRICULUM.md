# Editing the curriculum

Course content is data, not code. One YAML file per course under
`content/courses/`, read by `loadCourses()` in
[packages/content](../packages/content/src/courses.ts), the same parser the web
app, `catalog index` and `catalog course import` all go through, so a course
file means one thing everywhere. The courses are moving into Postgres
([CONTENT-MIGRATION.md](CONTENT-MIGRATION.md), Track B); until the
`courses` type is flipped the files are the truth, and after it they are the
database's export, written back by every course write.

## Where the course data lives

| File | Holds |
| --- | --- |
| `content/courses/<code>.yaml` | One course: modules, curriculum items, subtopics, curated resources |
| `content/topics.yaml` | The shared topic vocabulary each module's `topic:` names |
| `content/tags.yaml` | The cross-course themes each course's `tags:` names |

There is no TypeScript copy. `apps/web/src/data/courses/index.ts` is a thin
server-only module over the reader, holding `getCourses()` and the lookups pages
call (`getCourse`, `getModule`, `findTopic`, `getCourseTopicIds`,
`getRelatedCourses`, `totalTopicCount`) and nothing else. It reads through the
content seam once per request, so an edit to a course file shows on the next
page load of a running server, with no restart.

## Adding or changing a course

A course moves through the database one file at a time
(docs/CONTENT-MIGRATION.md, Track B). The loop is export, edit, import, and
every import is a revision with a reason, which is what the commit message
used to say:

```bash
npm run catalog -- course export cs2111 --out /tmp/cs2111.yaml   # or edit content/courses/cs2111.yaml in place
$EDITOR /tmp/cs2111.yaml
npm run catalog -- course import /tmp/cs2111.yaml --reason "cs2111-m2-t1 teaches self-attention" --dry-run
npm run catalog -- course import /tmp/cs2111.yaml --reason "cs2111-m2-t1 teaches self-attention"
npm run catalog -- history curriculum_item cs2111-m2-t1          # what changed, who, why
```

`course import` reads the file with the same parser the web app uses, then
checks what it points at against the database rather than against other
files: every module topic, tag and concept must exist, each item's concepts
must be filed under its module's topic, and no id may already belong to
another course. Every refusal is listed at once, and nothing is written
unless all of them pass. Then it writes the difference through the one write
seam: one revision per module, item or link whose content moved, none for
anything already as the file says, so importing an unchanged file writes
nothing. `--dry-run` does the whole write and rolls it back, to see what would
change.

In the same transaction, the course's file, and `content/topics.yaml` when a
module was added, dropped or moved to another topic, are rewritten in the tree
the courses were imported from (D17), so the files and the database never
disagree. A course file or `topics.yaml` there that holds edits the database
has not imported is never overwritten: the import refuses and names it. The
file being imported is the exception, since it is the edit. The check compares
bytes, so a file whose content matches but whose formatting does not (quoting,
spacing, a comment) is refused too. The files in this repository are
byte-for-byte the export's own; a tree written by hand is brought to that form
once with `npm run catalog -- export --only courses,topics --out <the tree>`.

When writing the file itself:

1. Name it after the course code in lowercase (`content/courses/<code>.yaml`).
   The directory reader refuses a file whose name and `code:` disagree.
2. Give it an `order:`. That is the order the Courses page renders them in,
   and it has to be unique across the live courses. Sorting by filename is not
   the reading order, which is why the key is authored rather than derived.
3. Point each module's `topic:` at a slug from `content/topics.yaml`. It is a
   lookup key, not free text: add or rename a topic there, never here. An
   import writes the module into that topic's `maps.courses` itself; while
   courses are still read from files, `catalog index` refuses to run when the
   two files disagree in either direction.
4. Use an existing entry from `content/tags.yaml` before inventing a theme;
   tags are how related courses find each other.
5. List each item's concept notes under `concepts:`, in teaching order. Every
   item needs at least one before `catalog flip courses --strict` can arm the
   rule that says so; `npm run catalog -- doctor` lists every item still
   without one.
6. Run `npm test`. `packages/content/test/courses.test.ts` checks the
   curriculum integrity: the shortlist is complete, topic ids are unique across
   every file, `inferred` is set only on the courses that are genuinely
   inferred, every module names a real topic, every tag resolves.

`catalog index --only courses` still reads every course file into the database
while the courses type is on files. Once it is flipped, `catalog index` skips
the course files while they are the database's own export and refuses them,
naming the file, when someone edited one by hand: use `course import` instead.

## Dropping an item or a module

Nothing a course file stops listing is deleted (D12). `course import` archives
a module or item the course held and the file no longer lists, and reports it
by id. It leaves the course path and the export, and every learner's tick,
note and recap on it stays in `progress` and `recap`, which the Settings export
still carries. A file that lists it again restores it. Only a curated link
that no module points at any more is deleted, since nothing is recorded
against a link.

The item verbs do the same one item at a time, each with a reason:

| Command | What it does |
| --- | --- |
| `catalog item archive <id> --reason ...` | Takes the item off its course path. Refuses a module's last live item: a module needs at least one |
| `catalog item restore <id> --reason ...` | Puts an archived item back, with the concept links it had when it was last live. Also undoes a purge, learner rows included |
| `catalog item purge <id> --reason ...` | Deletes an archived item. Refuses while any `progress` or `recap` row names it |
| `catalog item purge <id> --with-learner-data --reason ...` | Copies those rows into the purge's revision, then deletes them with the item |

## What the reader refuses

All of these fail the read with the file name in the message, rather than
rendering something wrong:

| Refusal | Why it matters |
| --- | --- |
| A duplicated course, module, topic or resource id | Ids are permanent keys; two things sharing one silently merge whatever they had recorded |
| Two modules of one course sharing a slug | They are the same URL, so the second module is unreachable and its link renders the first |
| A module whose `topic:` is missing or not in `content/topics.yaml` | A course row nothing else can join to |
| A missing `id`, `slug`, `code`, `title`, `credits`, `order`, `capstone` | A route that 404s, or a page with a hole in it |
| `inferred` absent, or written as a string | A reconstructed syllabus presented as an official one |
| Two courses claiming one `order` | An ambiguous order on the Courses page |
| A resource `type` outside paper/docs/video/book/other | A chip the UI has no styling for |
| A tag that is not in `content/tags.yaml` | The chip shows the raw id, and the course drops out of the related-course list for the theme it meant |
| A module with no `topics:` | A page with an empty section and nothing to tick |
| An item's `concepts:` left empty, or written as anything but a list of strings | The tempting `Array.isArray(x) ? x : []` would index the item as if the author had meant to remove its concepts |
| A concept id listed twice on one item | The list is the teaching order and each entry gets a position; one concept cannot hold two |
| A concept listed on an item whose module topic does not name it in `maps.concepts` | Two files disagreeing about which topic a concept belongs to, with neither knowably right |
| `modules:`, `topics:` or `resources:` written as anything but a list of mappings | The tempting `Array.isArray(x) ? x : []` would render and index the module as if the author had meant to delete its content |

Unresolved topics are collected and reported together, so one run names all of
them instead of the first.

## Rules worth keeping

**Topic ids are permanent.** Every learner's progress, notes and recaps are
rows keyed by topic id in `progress` and `recap`, and nothing migrates them for
you. Renaming `cs2111-m1-t1` does not rename those rows: the import archives
the old id, with the learner's tick and recap still on it, and creates the new
one empty. Both tables are `RESTRICT` on `curriculum_item`, so no import or
index run can take them away; only `catalog item purge --with-learner-data`
deletes them, and it keeps a copy in its revision. Keep the
`<course>-m<N>-t<N>` shape, and add new topics at the end of a module rather
than renumbering.

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
