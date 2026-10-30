# Editing the curriculum

Course content is data, not code. The courses are `collection` and
`curriculum_item` rows in the catalog, one SQLite file, and the database is their truth
([CONTENT-MIGRATION.md](CONTENT-MIGRATION.md), Track B and the phase 3
cut-over). A course is edited as a file all the same: one YAML file per course,
the database's export of it, parsed by `parseCourse()` in
[packages/content](../packages/content/src/courses.ts), the same parser
`catalog import` and `catalog course import` go through, so a course file means
one thing everywhere. Its format is [seed/COURSES.md](../seed/COURSES.md).

## Where the course data lives

In the database. The repository holds no course files: [`seed/`](../seed/README.md)
has one small course for the tests and a fresh clone, and the last tree the
repository held is at the tag `content-files-final`. In an export
(`catalog export --out <dir>`) the course data is three paths:

| Path in an export | Holds | Written by |
| --- | --- | --- |
| `content/courses/<code>.yaml` | One course: modules, curriculum items, subtopics, curated resources | `catalog course import`, `catalog item ...` |
| `content/topics.yaml` | The shared topic vocabulary each module's `topic:` names | `catalog topic ...` |
| `content/tags.yaml` | The cross-course themes each course's `tags:` names | `catalog tag ...` |

There is no TypeScript copy. `apps/web/src/data/courses/index.ts` is a thin
server-only module over the reader, holding `getCourses()` and the lookups pages
call (`getCourse`, `getModule`, `findTopic`, `getAllTopicIds`,
`getRelatedCourses`) and nothing else. It reads through the
content seam once per request, from the database, so an import shows on the
next page load of a running server, with no restart.

## Adding or changing a course

A course changes one file at a time. The loop is export, edit, import, and
every import is a revision with a reason, which is what the commit message
used to say:

```bash
npm run catalog -- course export cs2111 --out /tmp/cs2111.yaml
$EDITOR /tmp/cs2111.yaml
npm run catalog -- course import /tmp/cs2111.yaml --reason "cs2111-m2-t1 teaches self-attention" --dry-run
npm run catalog -- course import /tmp/cs2111.yaml --reason "cs2111-m2-t1 teaches self-attention"
npm run catalog -- history curriculum_item cs2111-m2-t1          # what changed, who, why
```

The exported file's first line is `# base-revision: N`, the newest revision
of anything the course is made of when it was exported. `course import`
refuses the file once the course has moved past N (an item archived, a
concept linked, a link deleted since), naming what moved, because importing
it would undo that; export again and reapply the edit, or pass `--force-base`
to import it as it stands. After an import the stamp in the file moves on
with it, so editing the same file and importing again is not stale. A new
course has nothing to export: write its file from the shape in
[seed/COURSES.md](../seed/COURSES.md) and import it the same way.

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

The import writes rows and no file. Once the database owns every type, as it
does after the phase 3 cut-over, there is no tree to keep in step: a module
added, dropped or moved to another topic changes that topic's `maps.courses`
in the rows, and the next `catalog export` shows it. (On a database still
part-way through its flips, the import also rewrote the course's file and
`topics.yaml` in the tree the courses were imported from, D17, and refused
when one there held an edit it had not imported.)

When writing the file itself:

1. Name it after the course code in lowercase (`<code>.yaml`). The reader
   refuses a file whose name and `code:` disagree.
2. Give it an `order:`. That is the order the Courses page renders them in,
   and it has to be unique across the live courses. Sorting by filename is not
   the reading order, which is why the key is authored rather than derived.
3. Point each module's `topic:` at a slug from the vocabulary
   (`npm run --silent catalog -- topic ls --json`). It is a lookup key, not
   free text: add or rename a topic with `catalog topic add` or `catalog topic
   rename`, never here. An import writes the module into that topic's
   `maps.courses` itself.
4. Use an existing tag before inventing a theme (`catalog tag add` makes a
   new one); tags are how related courses find each other.
5. List each item's concept notes under `concepts:`, in teaching order. Every
   item needs at least one before `catalog flip courses --strict` can arm the
   rule that says so; `npm run catalog -- doctor` lists every item still
   without one. Order them so no concept comes before one it `requires`
   (each concept counts at its first appearance in the course): the
   `course-order-respects-requires` rule refuses that once armed, and the
   doctor warns about an `assumes` edge taught the wrong way round.
6. Run the import with `--dry-run` first. It applies every rule the reader and
   the database have (unique ids across every course, every module topic and
   tag resolving, every item concept filed under its module's topic) and lists
   every refusal at once. `npm test` checks the reader and the seed's course,
   not yours.

Once the courses type is flipped, `catalog import <dir>` skips an export's
course files while they are the database's own last export and refuses them,
naming the file, when someone edited one by hand: use `course import` instead.

## A course's cover photo

The card on the Courses page shows the course's cover photo, or its code as a
placeholder when it has none. The photo is a blob in the store, named by the
course row, with its credit beside it; one command sets, replaces or clears it:

```bash
npm run catalog -- course cover cs2111 --file ./cs2111.webp \
  --photographer "Compagnons (@sigmund)" \
  --source https://unsplash.com/photos/website-wireframe-sketch-on-paper-4UGmm3WRUoQ \
  --licence "Unsplash License" --reason "a cover for the course card" --dry-run
npm run catalog -- course cover cs2111 --clear --reason "the photo was wrong for it"
```

Resize the photo to the card first: 960x540, WebP. The command refuses
anything that is not a WebP, JPEG or PNG by its bytes, anything over 2 MiB, a
credit with a field missing, and a source that is not an http(s) URL. Setting
the same image and credit again changes nothing.

A course file names its cover under `cover:` ([seed/COURSES.md](../seed/COURSES.md))
but does not change it: `course import` carries the cover over, and refuses a
file whose `cover:` differs from the one the course has (a different credit,
a different image beside the file, or no `cover:` at all for a course with
one), naming `course cover` as the way to change it.

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
| `catalog item archive <id> --reason ...` | Takes the item off its course path, and its readings' links to it with it (the file cannot list an archived item in `lessons:`). Refuses a module's last live item: a module needs at least one |
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
| A module whose `topic:` is missing or not in the vocabulary | A course row nothing else can join to |
| A missing `id`, `slug`, `code`, `title`, `credits`, `order`, `capstone` | A route that 404s, or a page with a hole in it |
| `inferred` absent, or written as a string | A reconstructed syllabus presented as an official one |
| Two courses claiming one `order` | An ambiguous order on the Courses page |
| A resource `type` outside paper/docs/video/book/other/practice | A chip the UI has no styling for |
| A reading's `lessons:` naming an id that is no item of its own module (the message names the module when the id is another module's item) | A reading placed on a lesson of another week, or on nothing; a reading belongs to its module |
| A `lessons:` id listed twice, or `lessons:` written with nothing in it | Each entry is one `curriculum_item_asset` row; an empty key is an author who meant to list something |
| A `videos:` id with no video asset prefix (`manimkc:`, `remotionkc:`, `revideokc:`, `blenderkc:`, `video:`), or `videos:` written with nothing in it | An id that can never resolve to a video; only the shape is checked, since the video tools import after the courses |
| One video listed twice in a module, across the module's `videos:` and its lessons' | The module path places a video once per module |
| A tag that is not a known tag | The chip shows the raw id, and the course drops out of the related-course list for the theme it meant |
| A module with no `topics:` | A page with an empty section and nothing to tick |
| An item's `concepts:` left empty, or written as anything but a list of strings | The tempting `Array.isArray(x) ? x : []` would index the item as if the author had meant to remove its concepts |
| A concept id listed twice on one item | The list is the teaching order and each entry gets a position; one concept cannot hold two |
| A concept listed on an item whose module topic does not name it in `maps.concepts` | The course and the vocabulary disagreeing about which topic a concept belongs to, with neither knowably right |
| `modules:`, `topics:` or `resources:` written as anything but a list of mappings | The tempting `Array.isArray(x) ? x : []` would render and index the module as if the author had meant to delete its content |

Unresolved topics, and `lessons:` ids that are no item of the reading's
module, are collected and reported together, so one run names all of them
instead of the first.

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

The same applies to concept links. An item names the concept notes that teach
it in its own `concepts:` list, which the import stores as
`concept_curriculum_item` rows; a note names no item, and the importer refuses
a `topics:` key in a note's frontmatter. So a renamed item keeps its links on
the archived old id, and the new id starts with none until its `concepts:`
list names them again.

**Prefer stable public URLs for curated resources.** A course page that links
to a lecture recording behind a login is worth less than one that links to the
textbook chapter. Dead links are not detected by anything, so favour sources
that will still exist in a year.

**Inferred syllabi must say so.** Courses whose topics were reconstructed from
an announcement plus standard treatment of the subject carry an `inferred`
flag, which renders a banner on the course page. Clear the flag only when the
official NUSMods syllabus lands and the topics have been reconciled against
it.
