# Course data

**These files are the course data until the `courses` type is flipped, and its
export after.** There is no TypeScript copy: the web app, `catalog import` and
`catalog course import` all read them with the parser in
[`packages/content`](../../packages/content/src/courses.ts), so a course file
means one thing everywhere. Editing a page to change a course title is not a
thing that can work.

**Change a course by importing its file.** Edit the file here, or export it
first, and import it with a reason:

```bash
npm run catalog -- course export cs2111 --out /tmp/cs2111.yaml
npm run catalog -- course import /tmp/cs2111.yaml --reason "why this changed"
```

The import writes one revision per module, item or link that changed, and
rewrites the file here (and `../topics.yaml` when a module's topic changed)
to match, so the two never disagree. A module or item the file stops listing
is archived, never deleted, and the learner's progress and recap on it stay.
[docs/CURRICULUM.md](../../docs/CURRICULUM.md) has the whole loop, the item
verbs and every refusal. Once the database owns courses, a hand edit here that
was not imported is refused by the next `catalog import`, by name.

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
tags: [hci]                      # ids from ../tags.yaml
capstone: ...
modules:
  - id: cs2111-m1                # permanent
    slug: m1-foundations-of-hci  # the URL segment
    title: Foundations of HCI
    order: 1
    topic: usability-and-interaction-design   # a slug from ../topics.yaml
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
[docs/CURRICULUM.md](../../docs/CURRICULUM.md) for the full rule, the list of
refusals, and how to add topics safely.

**`order:` is the reading order,** not a derived one. Sorting ten files by name
gives a different sequence from the curated shortlist, and nothing would say so,
so the key is authored and has to be unique.

**`topic:` is a lookup key, not free text.** Add or rename a topic in
[`../topics.yaml`](../topics.yaml). `course import` lists a new module under
that topic's `maps.courses` itself; if you edit the files and run
`catalog import` instead, list it there by hand, since the index refuses to
run when the two files disagree in either direction.

**`concepts:` on every item.** Each item names the concept notes that teach it,
filed under the module's topic. `npm run catalog -- doctor` lists every item
without one; the database refuses the gap once `catalog flip courses --strict`
arms the rule.
