# The learn pipeline on tables

`learn/state/` is gone. This is what each file became, why, and what to do if
something looks wrong.

The pipeline itself is documented in [`docs/LEARN.md`](../../docs/LEARN.md);
the schema is [`SCHEMA.md`](SCHEMA.md). This file is only the move.

## File to table

| Was | Is | Rebuildable |
| --- | --- | --- |
| `learn/state/events.jsonl` | `event` | No. The only copy. Append-only, enforced by a trigger. |
| `learn/state/model.json` — `concepts` | `mastery` | Yes: `learn model --rebuild` replays `event`. |
| `learn/state/model.json` — `params` | `preference`, key `bktParams` | No, but it is four numbers with defaults. |
| `learn/state/reviews.json` — `cards` | `review` | Yes, since bundle 5: `learn review rebuild`. |
| `learn/state/reviews.json` — `cards[].history` | *(nothing)* | Every entry is an `event` of type `observation` or `review`. |
| `learn/state/index.json` | *(nothing)* | A query. `readKnowledgeBase` in `services/catalog/src/state/knowledge-base.ts`. |
| `learn/concepts/**`, `learn/sessions/**`, `learn/assets/**` | `concept`, `session_log_entry`, `diagram` rows, and since the phase 3 cut-over nothing else: the folders are gone from the repository, kept at the tag `content-files-final` ([docs/CONTENT-MIGRATION.md](../../docs/CONTENT-MIGRATION.md)) | No: the rows are the notes. `catalog export` writes the tree back (the nightly export keeps a dated copy under `$SELF_LEARN_HOME/archive/`), and `learn vault pull` writes the notes, the logs and every diagram's SVG to `~/.self-learn/vault/` for Obsidian, where `learn vault push` takes edited notes back one revision each. |
| `learn/map.md` | *(nothing)* | Yes: `learn map` renders it on demand, to stdout or to `--out <file>`. |

The split used to be the one the rest of the catalog ran on: what a person or
an agent *wrote* stayed in git, where it could be read, diffed and reverted;
what the loop *observed* went in Postgres, where it can be joined and
constrained. Since the cut-over both are in Postgres, and `content_revision`
is where a write is read, diffed (`catalog diff`) and traced to its author
(`catalog history`).

## The three fields that moved shape

**`history` has no column.** A card carried its last twenty grades, and every
one of those grades was already an event — `observe` writes an `observation`
and `review grade` writes a `review`, both with the grade in the payload. A
second copy would be a second version of the truth, and the first time one was
written without the other they would disagree with no way to tell which was
right. Nothing ever read it for behaviour: `schedule.mjs` appends to it, and
`dueCards`, `forecast` and every `--json` output ignore it.

**`params` is a preference, not a column on every row.** It is one global
setting shared by every concept. A column would have said otherwise.

**`index.json` is a query.** It was a snapshot the pipeline wrote and the Next
build baked in, which meant a study session did not reach `/learn` until the
next deploy. `readKnowledgeBase` reads the same fields out of `concept`,
`concept_prerequisite`, `mastery` and `review`, so the page is current by
construction. Three fields did not survive, because the tables do not hold them
and the page never rendered them: `tags`, `sources` and `openQuestions`.
`generatedAt` became `indexedAt`, which is a fact the database knows — when the
`concepts` source last ran.

## What the CLI does now

Every command name and every `--json` shape is unchanged; the shapes are listed
in [`docs/LEARN.md`](../../docs/LEARN.md#the-json-shapes) and pinned by
`test/learn-cli.test.ts`. What changed underneath:

- `scripts/learn/cli.mjs` is a shim. It spawns `services/catalog/src/learn/cli.ts`, which is the
  command. The entry point stays because the `/learn` and `/review` skills, and
  `npm run learn`, name it.
- The pure modules under `scripts/learn/lib/` have not moved and are imported
  rather than rewritten. They are the definition of the BKT update, the concept
  DAG and SM-2, and they keep their own tests.
- `learn index` re-read the notes into the catalog instead of writing
  `state/index.json`, refusing a note in no topic's `maps.concepts`: a note
  with no topic cannot be reached from a course or a video about the same
  subject, and it cannot carry mastery either, because `mastery.concept_slug`
  is a foreign key. Once the database owns the notes it has nothing to read
  and says so; a note is written as its row, filed under its topic.
- `learn review rebuild` is new. The pipeline's README used to say outright that
  `reviews.json` "is not backed up by anything"; it is now, and exactly rather
  than approximately, because `observe` and `review grade` take one clock for
  the card, the model and the event, and an observation records whether it
  scheduled.
- `observe --force` can no longer record evidence about a concept the catalog
  has never seen. There is nowhere to put it.
- `observe`'s write is `recordObservation` in `src/state/observe.ts`, the
  function the web app's session also calls (`POST /api/learner/observe`), the
  way `review grade` became `gradeReview`. The `--json` shape did not move. An
  observation from the page carries a `requestId` in its payload, so a retried
  request is found rather than recorded twice; one from the terminal carries
  none, so its payload is what it always was. An answer from a module's week
  check also carries `module`, the module's id, checked to be a live module
  the learner can read; the terminal never sends one.
- `concept add --topic <slug>` is new, and it is the other half of that refusal.
  It checks the slug against the catalog's topics before writing anything,
  and writes the note as its row filed under the topic (its `maps.concepts`)
  in one transaction, so a note written mid-session can carry mastery at the
  next `observe`. The `--json` shape is `{ id, path, topic, item, indexed }`,
  and `path` is the note's logical name in the export layout.

  It began as a textual one-line edit of `content/topics.yaml` under a lock
  file, re-read through `loadTopics` and put back if the concept did not
  land. Track A moved the mapping into the topic rows, written through the
  catalog, and the cut-over removed the file. With `--item <id>` it also lists
  the concept on that course row, through `course import` of the course's
  export in a temp directory (`src/learn/course-tree.ts`), stamped with the
  revision it was exported at, so a course write in between is refused.

- Since the cut-over the CLI reads files only from the tree `LEARN_ROOT`
  names (a test's, a scratch copy), and never creates `learn/` in the
  repository. Without `LEARN_ROOT`, a type the database does not own, or a
  database that does not answer, is refused with a message saying which,
  where it used to read an empty folder and report no notes.

## If something looks wrong

```bash
npm run catalog -- status              # migrations, row counts, source freshness
npm run learn -- doctor                # the graph, and whether the store is reachable
npm run learn -- model --rebuild       # recompute mastery from the log
npm run learn -- review rebuild        # recompute the schedule from the log
```

A wrong number in `mastery` or `review` is a bug to recompute. A wrong row in
`event` is not: the correction is a new row. `learn void --session S --reason R`
retracts a session's evidence, and the next rebuild skips it while the history
stays readable.

## The backfill

```bash
npm run catalog -- backfill --from learn/state
```

Ran once, on 2026-09-13, against the real files. It is idempotent and still
runnable against any `state/` directory, which is what makes an old checkout
recoverable.

It replays `events.jsonl` in order with its own timestamps, loads
`reviews.json` into `review`, synthesises a `review` event for any `history`
entry the log does not already account for, rebuilds `mastery` from the log,
and then **asserts** that the rebuilt model equals `model.json` per concept
within 1e-6 and every card equals `reviews.json`. It prints a per-concept diff
and exits non-zero on any mismatch.

Two details worth keeping in mind if it is ever run again.

**Synthesis is matched, not blind.** Almost every `history` entry is already an
`observation` event, because `observe` schedules a card as well as updating the
model. Writing a `review` event for every entry regardless would double the
evidence and the mastery assertion would fail — which is how that was found.
Entries are matched one-to-one against events by concept, grade and instant,
and only the unmatched ones are written.

**`lastSeen` drifts by a few milliseconds and that is expected.** Before this
bundle, `observe` called `new Date()` separately for the model's `lastSeen` and
for the event's `at`. A replay takes `lastSeen` from the event, so every
historical concept is 2–4ms later than `model.json` said. The assertion
tolerates 5 seconds and reports the drift rather than hiding it. Anything
larger is a real mismatch and fails.
