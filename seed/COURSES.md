# Course files

**A course file is the database's export of one course, and the way to edit
it.** The courses are `collection` and `curriculum_item` rows; the file is what
`catalog course export` writes from them and `catalog course import` reads
back. There is no TypeScript copy and no copy in the repository: the import
parses a file with the parser in
[`packages/content`](../packages/content/src/courses.ts), and the database's
course reader returns the same `Course` shape that parser does, so a course
file means one thing everywhere. Editing a page to change a course title is not a
thing that can work.

**Change a course by exporting it, editing the file and importing it with a
reason:**

```bash
npm run catalog -- course export cs2111 --out /tmp/cs2111.yaml
$EDITOR /tmp/cs2111.yaml
npm run catalog -- course import /tmp/cs2111.yaml --reason "why this changed"
```

The import writes one revision per module, item or link that changed. A
module or item the file stops listing is archived, never deleted, and the
learner's progress and recap on it stay. The exported file's first line names
the revision it was read at, and the import refuses it once the course has
moved past that. [docs/CURRICULUM.md](../docs/CURRICULUM.md) has the whole
loop, the item verbs and every refusal. A course file inside an export tree
that someone edited by hand is refused by the next `catalog import`, by name.

One YAML file per course, named `<code>.yaml` in lowercase (e.g. `cs2111.yaml`).
The reader refuses a file whose name and `code:` disagree.

```yaml
id: cs2111                       # permanent
slug: cs2111                     # the URL segment
code: CS2111
title: Human-Centred Computing
credits: 4
order: 1                         # display order across the shortlist, unique
prereq: CS1010                   # optional
track: HCI focus area primary    # optional
notes: ...                       # optional
inferred: false                  # required, and must be a real boolean
tags: [hci]                      # tag ids (content/tags.yaml in an export)
cover:                           # optional: the card's photo, beside this file
  file: cs2111.cover.webp        # <code>.cover.<webp|jpg|png>, in lowercase
  photographer: Compagnons (@sigmund)
  source: https://unsplash.com/photos/website-wireframe-sketch-on-paper-4UGmm3WRUoQ
  licence: Unsplash License
capstone: ...
modules:
  - id: cs2111-m1                # permanent
    slug: m1-foundations-of-hci  # the URL segment
    title: Foundations of HCI
    order: 1
    topic: usability-and-interaction-design   # a topic slug (catalog topic ls)
    topics:
      - id: cs2111-m1-t1         # permanent: learner progress keys on it
        title: What HCI is
        concepts: [...]          # optional: concept note ids, in teaching order
        subtopics: [...]         # the reading list, display only
    resources:
      - id: cs2111-m1-r1
        title: ...
        url: https://...
        type: book               # paper | docs | video | book | other
```

**Ids are permanent.** Learner progress, notes and recaps are keyed by topic id
in the `progress` and `recap` tables, and concept links hang off the same ids.
An id must never be renamed or renumbered: a renamed item is an archived one
plus a new, empty one. See
[docs/CURRICULUM.md](../docs/CURRICULUM.md) for the full rule, the list of
refusals, and how to add topics safely.

**`order:` is the reading order,** not a derived one. Sorting ten files by name
gives a different sequence from the curated shortlist, and nothing would say so,
so the key is authored and has to be unique.

**`topic:` is a lookup key, not free text.** Add or rename a topic with
`catalog topic add` or `catalog topic rename` ([README.md](README.md#writing-the-vocabulary-and-the-tags)),
never here. `course import` lists a new module under that topic's
`maps.courses` itself, so the two never disagree.

**`cover:` names an image; it does not store one.** In the database a cover
is a blob the course row names by key, with its credit in the row's metadata;
the export writes the image beside the course file as `<code>.cover.<ext>`
and names it here, and `catalog import <dir>` stores it back under the same
key. The file name is the course code's and nothing else, and the reader
refuses any other, so no path is ever built out of what a file says.
`course import` of a single file carries the cover over and refuses a
`cover:` that differs from the course's; `catalog course cover` is the one
way to set, replace or clear it ([docs/CURRICULUM.md](../docs/CURRICULUM.md)).

**`concepts:` on every item.** Each item names the concept notes that teach it,
filed under the module's topic. `npm run catalog -- doctor` lists every item
without one; the database refuses the gap once `catalog flip courses --strict`
arms the rule.
