# Editing the curriculum

Course data is typed TypeScript, not a CMS. One file per course under
`src/data/courses/`, aggregated in `index.ts`, with the shared `Course`,
`Module` and `Topic` types in `src/lib/types`.

## Where the course data lives

Two representations today, and they are kept identical by a test.

| File | Status |
| --- | --- |
| `src/data/courses/<code>.ts` | What the web app loads. Authoritative until bundle 4. |
| `content/courses/<code>.yaml` | The same data, plus a `topic:` slug per module. Read by `catalog index`. |

`src/data/courses/parity.test.ts` loads each YAML file, strips the added
`topic` keys and asserts deep equality against the TypeScript export. **Edit
both, in the same commit**, or that test fails.

**This flips once bundle 4 lands** ([#22](https://github.com/c-wenlong/self-learn/issues/22)):
`content/courses/*.yaml` becomes the single authoritative source, the
TypeScript files go away, and the web app reads the catalog. Until then the
TypeScript is what ships and the YAML is a second copy that must not drift.

Each module's `topic:` is a slug from `content/topics.yaml`, the shared topic
vocabulary. It is a lookup key, not free text, and `catalog index` refuses to
run when the two files disagree about which topic a module belongs to. Add or
rename a topic there, never here.

## Adding or changing a course

1. Write or edit `src/data/courses/<code>.ts`, exporting a `Course` object.
2. Import it in `src/data/courses/index.ts` and add it to the `courses` array.
   Array order is the order the catalog and sidebar render in.
3. Cross-course themes come from `src/data/tags.ts`. Reuse an existing tag
   before inventing one; tags are how related courses find each other.
4. Run `npm run test`. `src/data/courses/index.test.ts` checks curriculum
   integrity: the shortlist is complete, topic ids are unique, `inferred` is
   set only on the courses that are genuinely inferred, slugs resolve, and
   related courses are reachable through shared tags.

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
