# Proposal: course items declare their concepts

Status: proposed, 2026-09-27. Nothing here is implemented.

## The problem

The catalog keeps two records of what a learner knows and joins them through
an optional link that is mostly empty.

| Side | Unit | Learner state | Written by |
| --- | --- | --- | --- |
| Course | `curriculum_item` (`cs4263-m1-t1`) | `progress` (a tick, a note), `recap` | The course path's checkbox, the session page's Save recap |
| Tutor | `concept` (`self-attention`) | `mastery` (BKT p(L)), `review` (SM-2 card), `event` | Every probe, teach step and review grade |

The join is `concept_curriculum_item`, filled from a note's `topics:`
frontmatter by the concepts indexer
([concepts.ts:157](../../services/catalog/src/index/concepts.ts)). Eight of the
32 notes fill it, all pointing into `cp4284`. The other 24 say `topics: []`, and
nine of the ten courses have no concept at all.

The course path already prefers mastery when it can. `topicDone` in
[course-path.ts](../../apps/web/src/lib/course-path.ts) marks an item done when
every mapped concept is mastered, and falls back to the tick only when no
concept is mapped. So for `cp4284` the path is a real mastery path, and for the
other nine courses it is a checklist. Today's "Courses in progress" and the
Courses grid never look at mastery: both count ticks
([today-core.ts:551](../../apps/web/src/lib/today-core.ts),
[CourseGrid.tsx:48](../../apps/web/src/components/courses/CourseGrid.tsx)), so
the dashboard and the path disagree about the same course.

Three things follow from the join being authored on the wrong side:

1. A course author cannot say what a checklist row teaches. The row's
   `subtopics` list holds the real content (`Self-attention`,
   `Tokenization pipelines`) as display-only strings
   ([content.ts:169](../../packages/schema/src/content.ts)), while the concept
   that would carry mastery for it is written elsewhere and may or may not
   point back.
2. Coverage is invisible. No file, test or command says "this course has no
   concepts", so a course path that is a checklist looks like a finished one.
3. Two paths from a concept to a course can disagree: `concept.topic_slug`
   (from `maps.concepts` in `content/topics.yaml`) reaches a module, and
   `concept_curriculum_item` (from frontmatter) reaches an item in a module.
   Nothing checks the item sits under that module.

## The proposal

The course file owns the join. A curriculum item lists the concepts it teaches,
in teaching order; the concepts indexer stops reading `topics:` from notes; and
every place that shows course progress uses the same done rule the path already
uses.

Concretely:

- `topics[].concepts` in `content/courses/<code>.yaml` is a list of concept ids
  in teaching order. Optional per item during the transition (see
  [Transition](#transition)); when present, every id must be a note under
  `learn/concepts/` or the read refuses, the same way an unknown `topic:` does
  today.
- `concept_curriculum_item` gains a `position` and is owned by the courses
  indexer. The concepts indexer no longer writes it.
- An item's done state is `topicDone` everywhere: mastered when it has concepts
  and all of them are mastered, ticked otherwise. `progress.completed_at` stays
  as the manual tick for items with no concepts and as the learner's note
  carrier; it stops being the source of truth for an item that has concepts.
- A concept's module must agree with its vocabulary topic. If `self-attention`
  is listed on `cp4284-m1-t1`, and `cp4284-m1` names topic
  `transformer-architecture-and-training`, then `maps.concepts` for that topic must include
  `self-attention`. The read refuses when the two files disagree, which is the
  same rule the module `topic:` already has.
- `catalog status` reports item coverage per course: items with concepts over
  items total. That is the number that says how much of the catalogue the
  frontier can reach.

## YAML shape

Today, from `content/courses/cp4284.yaml`:

```yaml
modules:
  - id: cp4284-m1
    slug: m1-llm-foundations-recap
    title: LLM Foundations Recap
    order: 1
    topic: transformer-architecture-and-training
    topics:
      - id: cp4284-m1-t1
        title: Transformer architecture and tokenization
        subtopics:
          - Self-attention
          - Tokenization pipelines
```

and, in six separate note files:

```yaml
topics: [cp4284-m1-t1]
```

Proposed:

```yaml
modules:
  - id: cp4284-m1
    slug: m1-llm-foundations-recap
    title: LLM Foundations Recap
    order: 1
    topic: transformer-architecture-and-training
    topics:
      - id: cp4284-m1-t1
        title: Transformer architecture and tokenization
        concepts:                       # teaching order; ids under learn/concepts/
          - query-key-value-projections
          - attention-weights
          - self-attention
          - multi-head-attention
          - positional-encoding
          - transformer-block
        subtopics:                      # unchanged: the reading list, display only
          - Self-attention
          - Tokenization pipelines
      - id: cp4284-m1-t2
        title: Pretraining vs fine-tuning vs RLHF
        subtopics: [...]                # no concepts yet: the tick is the answer
```

The note's `topics:` key goes away. A note that still carries a non-empty one
is refused by the concepts indexer with the file and the item named, so the
eight existing notes are edited in the same change that adds the lists above.

Rules the reader enforces, added to the table in
[CURRICULUM.md](../CURRICULUM.md):

| Refusal | Why it matters |
| --- | --- |
| `concepts:` written as anything but a list of strings | The tempting `Array.isArray(x) ? x : []` would index the item as if the author had meant to remove its concepts |
| A concept id listed twice on one item | Two positions for one concept; the path would draw it twice |
| A concept id that is not a note under `learn/concepts/` | A path node with no page and no mastery |
| A concept listed on an item whose module topic does not list it in `maps.concepts` | Two files disagreeing about which topic a concept belongs to, with neither knowably right |

A concept may appear on more than one item, in more than one course. That is
the existing many-to-many and it stays: `self-attention` can be in a
transformers course and in an agents course, with one mastery row.

## Schema and migration

One column. `packages/schema/src/content.ts`:

```ts
export const conceptCurriculumItem = pgTable(
  "concept_curriculum_item",
  {
    conceptSlug: text("concept_slug")
      .notNull()
      .references(() => concept.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    curriculumItemId: text("curriculum_item_id")
      .notNull()
      .references(() => curriculumItem.id, { onDelete: "cascade", onUpdate: "cascade" }),
    /** Teaching order within the item, from the course file. */
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.conceptSlug, t.curriculumItemId] }),
    index("concept_curriculum_item_curriculum_item_id_idx").on(t.curriculumItemId),
  ],
);
```

`npm run generate -w @self-learn/catalog` writes
`services/catalog/drizzle/0009_concept_curriculum_item_position.sql`:

```sql
-- Teaching order of the concepts on a curriculum item.
--
-- The link used to be written from a note's `topics:` frontmatter, which has
-- no order. It is now written from `topics[].concepts` in the course file,
-- which does. Existing rows get 0 and are rewritten by the next
-- `catalog index`, since every row in this table is derived.
ALTER TABLE "concept_curriculum_item" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;
```

Nothing else in the schema moves. `progress`, `recap`, `mastery` and `review`
keep their keys; the change is who writes the join and who reads it.

The migration is additive and safe to apply before the indexer change lands:
a courses indexer that does not know the column leaves it at 0.

## Indexer

Three changes in `services/catalog/src/index/`.

**Ownership.** `conceptCurriculumItem` moves from `conceptsIndexer.owns` to
`coursesIndexer.owns`. Each source prunes only what it owns, so this is what
lets the courses run delete a link when an id is removed from the YAML.

**Order.** `run.ts` runs sources in the order the foreign keys require. Today
that is topics, courses, concepts, because a note's `topics:` names an item the
courses run has to have produced. After the change the arrow points the other
way: the courses run inserts `(concept_slug, curriculum_item_id, position)` and
needs the concept row to exist, so the order becomes topics, concepts, courses.
Nothing else depends on the relative order of those two.

**Refusal.** The courses indexer resolves every `concepts[]` id against the
`concept` rows the concepts run just wrote, and collects an `IndexError` per
unknown id, the same shape as the existing unresolved-slug errors. The concepts
indexer refuses a note whose `topics:` is non-empty, naming the file and
pointing at the course YAML. After the transition the key is not read at all.

`learn index` ([cli.ts:1261](../../services/catalog/src/learn/cli.ts)) runs
`--only concepts`. Because `--only` selects downstream sources too, and courses
is now downstream of concepts, it will run both. That is the right behaviour:
a new note cannot be linked to a course until it is a row, and the course run
is the one that links it.

## The web app

The path needs nothing. `conceptsForTopic` sorts by `authored`, today the
module topic's `maps.concepts`; it should sort by the new `position` instead,
which the knowledge base can carry on `KbConcept.topics` as `{ item, position }`
rather than a bare id list
([knowledge-base.ts:153](../../services/catalog/src/state/knowledge-base.ts)).
`resolveTopicMastery`, `topicDone` and `isLocked` are unchanged.

Today and the Courses grid adopt the path's rule. `coursesInProgress` takes a
`done` set instead of `completed`, built server-side with `topicDone` over the
knowledge base and the learner's ticks. The grid is a client component reading
`state.completed`; it needs the same `done` set handed down from the page, or
it keeps counting ticks and the two screens keep disagreeing.

## The CLI

`concept add --topics <item-id,…>` writes the retired frontmatter key. It
becomes `concept add --item <item-id>`, which appends the new concept id to
that item's `concepts:` list in the course file, the way `--topic` already
appends to `maps.concepts` in `content/topics.yaml`. Both edits happen in the
same command so a note written during a `/learn` session lands on the course
path in one step.

`catalog status` gains a per-course line: `cp4284: 3 of 22 items have
concepts`. `catalog doctor` (or the content test) fails on a concept listed on
an item whose module topic does not name it.

## Transition

1. Apply migration 0009.
2. Add `concepts:` to `cp4284.yaml` for the three items the eight notes name
   today: `cp4284-m1-t1` (the six transformer notes, in the order above),
   `cp4284-m3-t1` (`react-loop`), `cp4284-m3-t2` (`tool-calling`).
3. Delete `topics:` from all 32 notes. The 24 empty ones are noise; the eight
   real ones are now in the course file.
4. Land the reader, indexer, knowledge-base and CLI changes together, since
   the indexer refuses the old key and the reader accepts the new one.
5. `npm run catalog -- index`. The link table comes back identical for those
   eight rows, now with positions.
6. Update `CURRICULUM.md`, `content/courses/README.md`, `SCHEMA.md` (the
   "Two things called topic" section and the source table) and
   `learn/README.md` where it documents `topics:`.

`concepts:` stays optional per item until the shortlist has coverage. Making it
required today would refuse nine courses that have nothing to put there.
Required is the end state, and `catalog status` is how to see the distance.

## Tests

- `packages/content/test/courses.test.ts`: the new refusals, and a fixture
  with concepts.
- `services/catalog/test/catalog.test.ts`: ownership moved (the courses run
  prunes a link the YAML dropped; the concepts run leaves the table alone),
  order (concepts before courses), the frontmatter refusal.
- `apps/web/src/lib/course-path.test.ts`: `conceptsForTopic` sorts by
  position.
- `apps/web/src/lib/today-core.test.ts`: `coursesInProgress` over a `done`
  set that mixes mastered items and ticked ones.

## Out of scope

Each of these came out of the same audit and is a separate change:

- A `check` table, with `review` keyed per check rather than per concept.
- A `curriculum_item_id` on `session`, so events attribute to a course.
- Dropping `collection_item`, `curriculum_item_topic` and the `deck` kind,
  none of which the app reads.
- Making `concepts:` required.

## Decisions needed

1. Does `subtopics` stay once an item has concepts? This proposal keeps it as
   the reading list and lets the two coexist. The alternative is to refuse an
   item that has both, which forces every subtopic to become a note.
2. Does `learn index` running the courses source as well need a flag, or is
   the extra second acceptable on every `concept add`?
