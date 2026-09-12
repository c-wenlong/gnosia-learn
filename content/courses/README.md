# Course data

**These files are the course data.** There is no TypeScript copy any more: the
web app and `catalog index` both go through `loadCourses()` in
[`packages/content`](../../packages/content/src/courses.ts), so a course file
means one thing in both places. Editing a page to change a course title is not
a thing that can work.

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
        subtopics: [...]
    resources:
      - id: cs2111-m1-r1
        title: ...
        url: https://...
        type: book               # paper | docs | video | book | other
```

**Ids are permanent.** Learner progress, notes and recaps are keyed by topic id
in browser storage, and concept notes under `learn/concepts/` link back through
the same ids. An id must never be renamed or renumbered. See
[docs/CURRICULUM.md](../../docs/CURRICULUM.md) for the full rule, the list of
refusals, and how to add topics safely.

**`order:` is the reading order,** not a derived one. Sorting ten files by name
gives a different sequence from the curated shortlist, and nothing would say so,
so the key is authored and has to be unique.

**`topic:` is a lookup key, not free text.** Add or rename a topic in
[`../topics.yaml`](../topics.yaml), and list the module's id under that topic's
`maps.courses`. `catalog index` refuses to run when the two files disagree in
either direction.
