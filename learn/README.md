# The Learning Pipeline

A local, file-backed tutoring loop that runs inside Claude Code. It measures
what you know, plans a path from there, teaches one step at a time, and
schedules what you will forget.

Nothing important is trapped in a chat transcript. What it knows is split in
two, along one line: what somebody *wrote* is authored content, and what the
loop *observed* is a row in Postgres. The authored half is moving from files
in git into Postgres too ([docs/CONTENT-MIGRATION.md](../docs/CONTENT-MIGRATION.md));
where the notes and logs are today is under [Where the notes and logs
live](#where-the-notes-and-logs-live).

```
learn/
  concepts/<domain>/<id>.md   atomic concept notes — the durable knowledge
  sessions/<id>.md            one log per session, appended live
  assets/<id>.svg             diagrams generated during teaching
  map.md                      mermaid knowledge map        (derived, not rewritten)

postgres  (DATABASE_URL, default postgres://localhost:5432/self_learn)
  event      every observation, appended     (SOURCE OF TRUTH, append-only)
  mastery    p(L) per concept                (derived)
  review     spaced-repetition schedule      (derived)
  progress   the web hub's ticks and notes
  recap      the web hub's "what I learnt" records
  preference theme, epoch, last visited, BKT parameters
```

Everything marked derived can be rebuilt:

```bash
npm run learn -- model --rebuild   # mastery, from the event log
npm run learn -- review rebuild    # the schedule, from the same log
npm run learn -- map --out learn/map.md   # the map, from the notes and the mastery
npm run learn -- index             # the notes back into the catalog, while they are files
```

### Where the notes and logs live

Two rows in `content_source` decide it, one for `concepts` and one for
`sessions`, written by `catalog flip`. Until a type is flipped its files under
`learn/` are the truth, as they always were, and `catalog import` copies them
into the catalog. From the flip on, the rows are: a note is its `concept` row
(the frontmatter as columns, the markdown after it as `concept.body`), a log
is its `session_log_entry` rows (each one exactly what was appended), every
write goes through the catalog's write seam with a reason and leaves a
revision, and nothing under `learn/` changes. `catalog export --only
concepts,sessions --out <dir>` writes the files back out at any moment.

Every command below works the same on either side, and every one that writes
a note or a log reads the `content_source` row first, so it needs the database
running. A whole note is edited through a checkout, not in `learn/concepts/`:

```bash
npm run learn -- concept checkout attention-weights --json   # {id, path, revision}
# edit the file at `path` (outside the repository)
npm run learn -- concept commit attention-weights --reason "close: what the session showed"
```

The commit is refused, with both revisions named, when the note changed after
the checkout; check it out again and reapply. `concept edit <id> --body-file F
--reason R` replaces the body in one step.

To read and edit every note at once, in Obsidian, pull the vault:

```bash
npm run learn -- vault pull                 # ~/.self-learn/vault, or --out <dir>
# edit notes in Obsidian
npm run learn -- vault push --reason "tidied the proofs"
```

`vault pull` writes each note as `concepts/<domain>/<slug>.md` and each log as
`sessions/<id>.md`, with `.vault.json` recording what every file was based on
(the note's revision, or how many entries the log had) and the sha256 of what
was written. The folder defaults to `$SELF_LEARN_HOME/vault`, outside the
repository, and one inside it is refused. Neither command overwrites an edit
nobody pushed:

| Case | What happens |
| --- | --- |
| Pull, file unedited | Replaced by the database's version |
| Pull, file edited, database unchanged since | Kept, listed as edited |
| Pull, file edited, database moved | Kept; the database's version is written beside it as `<name>.incoming.md` |
| Push, note edited, database unchanged since | Committed through the write seam against the recorded revision: one concept revision (and one for its `note:` asset) |
| Push, note edited, database moved | Refused; the database's version is written beside it as `<name>.conflict.md` |
| Push, session log edited | Refused by name: a log is a record of what happened, and a correction belongs in the note it touched |
| Push, a new file under `concepts/` | Refused: a new note needs a topic, so it is made with `concept add --topic` |

Settling an `.incoming` or `.conflict` copy is deleting it: merge what you
want of it into the note first, and the note is based on that newer version
from then on, so the next push commits it. A copy you wrote in yourself is
never replaced. An edited log goes back to the database's by deleting it and
pulling. Neither command runs without `catalog flip concepts` and `catalog flip
sessions` (pull needs both, push needs concepts); before them `learn/` is the
vault. A vault pulled from another database (a `createdb -T` copy counts)
refuses to push until a pull adopts the new one. The rules a note's row keeps are in
[services/catalog/SCHEMA.md](../services/catalog/SCHEMA.md): values, not
frontmatter layout, and no frontmatter key beyond the eight a note uses.

`learn/state/` used to hold `model.json`, `reviews.json`, `events.jsonl` and
`index.json`. It was retired in bundle 5; the mapping, and why each file became
what it did, is in
[services/catalog/LEARN.md](../services/catalog/LEARN.md). The move was one
command that asserted its own result, and it is still runnable against any old
checkout's `state/` directory.

---

## Why it is shaped like this

Ordinary learning is many-to-many: each book or course is written for many
students, and each student pulls from many sources. Both directions leak.
A resource built for everyone cannot sit at *your* edge of understanding,
and every switch between sources costs effort that never reaches the
material.

The fix is one-to-one in both directions — a single tutor that aggregates
many sources and is fitted to one mind. Two principles follow, and they are
the only two the system actually enforces:

1. **Teach at the edge of understanding.** Below it you are reciting what
   they hold; above it they cannot follow.
2. **Concentrate all struggle into the material.** Difficulty in the ideas
   is the point. Difficulty in figuring out what to study next, finding
   resources, or remembering to revise is pure waste — the system absorbs
   all of it.

Everything below is machinery in service of those two sentences.

---

## The RL framing

Calling this a "personal RL environment" is not decoration — the components
map cleanly, and the mapping is what makes the design decisions fall out.

| RL concept | Here | Where it lives |
| --- | --- | --- |
| **State** | Mastery p(L) over every concept, plus the prerequisite DAG | `mastery` table, `concepts/*.md` |
| **Action** | Which concept to teach or ask about next | `learn teach`, `learn probe` |
| **Observation** | The learner's answer, right or wrong | `learn observe` |
| **Reward** | Correctness, valued highest near the target difficulty | `pLBefore`/`pLAfter` in the `event` payload |
| **Transition** | Bayesian update of belief, then the learning step | `lib/bkt.mjs` |
| **Policy** | Teach the weakest concept at the frontier | `lib/graph.mjs` → `frontier()` |
| **Trajectory** | Append-only log of every step | `event` table |
| **Episode** | One session | `sessions/*.md` |

The learner is the environment; the tutor is the agent. What is being
optimised is not the tutor's reward but **your** mastery vector — the system
is a controller steering a partially observed state it can only influence
through questions and explanations.

Three consequences worth naming:

- **The trajectory is the source of truth.** Because every observation is
  logged with its before/after belief, the entire model is replayable. Change
  the BKT parameters and `learn model --rebuild` re-derives history under the
  new assumptions. You can audit why the system thinks you know something.
- **Partial observability is the whole problem.** Mastery is never observed
  directly, only inferred through noisy answers — which is exactly why guess
  and slip rates are explicit parameters rather than a rounding error.
- **Exploration has a cost the learner pays.** Every probe question spends
  attention. So probing selects for maximum *expected information gain* per
  question, not coverage.

---

## The loop

### Phase 1 — Probe

Measure before teaching. `learn probe` ranks concepts by expected
information gain — the reduction in entropy of the belief:

```
IG(c) = H(p) − [ P(correct)·H(p | correct) + P(wrong)·H(p | wrong) ]
```

Asking where the belief is *least certain* is what makes this a binary
search over the dependency graph rather than a march through a syllabus. A
correct answer high in the graph lets you skip everything beneath it —
mastery of a dependent implies its prerequisites.

Probe observations are recorded with `--source probe`, which deliberately
**skips the learning step**: being asked a question is not being taught, and
counting it as teaching would inflate mastery.

### Phase 2 — Plan

`learn plan --goal <id>` returns the topologically ordered path from what you
hold to the goal, with mastered prerequisites already dropped.

Two things happen here that are easy to skip and shouldn't be:

- **Verification.** The `fact-checker` subagent checks claims before they are
  taught. A wrong note is worse than a missing one — it gets reviewed,
  reinforced, and built upon.
- **The graph gets rendered.** Not for decoration: committing to an explicit
  ordering *before* teaching is what stops a model from winging it, and it
  shows the learner what is coming.

### Phase 3 — Teach

`learn teach` returns the single next concept — the weakest one at the
frontier — with its prerequisite mastery attached.

The tutor moves **one reasoning step at a time**, checks understanding, and
records the answer. The step size targets roughly **85% success** — the optimal training
accuracy found by [Wilson et al. (2019)](https://www.nature.com/articles/s41467-019-12552-4),
whose result puts a number on the zone of proximal development. All correct
means the steps are too small; half wrong means too big. Adjust the step,
never the standard.

Answers are classified into four cases, each with its own response:

| Response | What happens |
| --- | --- |
| Correct | Confirm briefly, advance |
| Incorrect | Locate the wrong belief, give a counter-example, re-ask — never just answer |
| A question | Answer at the level asked, return to the step |
| Confused | Back up a prerequisite; the step was too big |

Diagrams come from the `diagram-maker` subagent, which **views its own SVG
and fixes it** before returning. Writing SVG blind produces overlapping text
and arrows pointing at nothing. A diagram lives in the catalog, not under
`learn/assets/`: the agent draws in the file `learn diagram checkout <id>`
prints and ends with `learn diagram commit <id> --reason`, which stores the
document and its SVG as one revision.

### Phase 4 — Close

Write the durable artefacts: fill in the concept notes (check each out, edit
the copy, commit it with a reason), record open questions, add at least one
**check** per concept taught, close the session, and print the map.

Then self-assess honestly on three axes — *coverage* (did we reach the
planned concepts), *restraint* (did the tutor avoid simply answering), and
*understanding* (was it demonstrated or assumed). An inflated self-assessment
poisons the next session's starting assumptions.

---

## Primitives

Everything is `npm run learn -- <command>`; add `--json` for parseable output.

| Command | Purpose |
| --- | --- |
| `init` | Create the `learn/` tree on a fresh checkout |
| `status` | Where you are: counts, due reviews, frontier |
| `concept add\|edit\|list\|show` | Define and inspect concepts; `add --topic <slug>` files the new note under a vocabulary topic and indexes it; `edit` changes edges without touching the note body, or replaces the body with `--body-file F --reason R` |
| `concept checkout\|commit` | Edit a whole note: a copy outside the repository, written back with `--reason`, refused if the note moved |
| `vault pull\|push [--out D]` | Every note and log as a folder for Obsidian, and edited notes written back, one revision each; never overwrites an unpushed edit |
| `check add\|list` | Verification questions stored in the note |
| `probe [--goal]` | What to ask next, by information gain |
| `observe --concept --correct` | **The RL step.** Record one answer |
| `frontier [--goal]` | The edge of understanding |
| `plan --goal [--mermaid]` | Ordered path from known to goal |
| `teach [--goal]` | The single next concept, with context |
| `review due\|grade\|forecast\|rebuild` | Spaced repetition |
| `session start\|log\|close\|list` | The session log |
| `void --session S --reason R` | Retract a session's evidence as unreliable |
| `model [--rebuild]` | Mastery table; rebuild replays the event log |
| `review rebuild` | Replay the log into the schedule |
| `map [--out F]` / `index` | The map, to stdout or a file / re-read the notes into the catalog while they are files |
| `diagram checkout\|commit\|put\|list\|show` | Diagrams in the catalog, as `catalog diagram` does them, attributed to the `diagram-maker` agent unless `--author-kind` says otherwise. `put --svg --topic` stores an SVG drawn without the canvas |
| `doctor` | Validate the graph — cycles, dangling edges, orphans |

### A new concept needs a topic

A note is a file until the vocabulary claims it. `concept.topic_slug` is a
foreign key, so a note in no topic's `maps.concepts` in
[`content/topics.yaml`](../content/topics.yaml) cannot be indexed, and a concept
that is not indexed cannot carry mastery: `observe` refuses it outright.

`--topic` closes that gap in one call.

```bash
npm run --silent catalog -- search "master theorem" --json   # find the slug
npm run learn -- concept add --title "Master Theorem" --domain algorithms \
  --topic recurrence-relations --requires comparing-growth-rates
```

It checks the slug against the catalog *before* writing anything (the topic is
a live row, the concept sits under no other topic, and `content/topics.yaml` is
what the database would export, so no unimported edit is overwritten), then
files the concept under the topic through the catalog's write seam, as
`concept.topic_slug` with a revision whose reason is `--reason` or a default,
rewrites `content/topics.yaml` from the rows so its `maps.concepts` lists the
new id, and runs the concepts indexer, so the note is queryable at the next
command. `--json` reports `{ id, path, topic, item, indexed }`.

`--item <row-id>` is the course-side half. A row id is a `topics[].id` in a
course file, like `cp4284-m1-t1`; the flag lists the new id under that row's
`concepts:` so the note is on the course path, and it implies `--topic`,
because the row's module names the topic the note must be mapped to. Passing
both with a topic that is not the module's is refused before anything is
written, since the course reader would refuse the file that resulted. The edit
is textual, locked, and read back through the real reader before it is kept.
Once the database owns the notes, the edited file then goes in through
`catalog course import`, which writes the row's link as a revision with the
command's reason and rewrites the file as the database exports it. A dry run of
that import comes first, before the note is written, and refuses when any
course file or `topics.yaml` is not what the database holds, or when the row's
own file holds an edit nobody imported, since the import would take that edit
in under this command's reason.

```bash
npm run learn -- concept add --title "Tokenization pipelines" --domain transformers \
  --item cp4284-m1-t1
```

The course edit is textual, one line of the YAML, so the file keeps its
comments and ordering and the diff stays reviewable. It is checked afterwards by
re-reading the file through the real parser: if the id did not land on the row
that was asked for, the original text goes back and the command fails.

Three refusals, all before the note is written: a slug that is no live topic, a
concept another topic already claims, and a `content/topics.yaml` holding an
edit the database has not imported. Each source id belongs to exactly one topic, which
is what makes a query for "everything about this subject" answerable.

Without `--topic` the note is still written and the command says which edit is
missing. Do not hand-edit `content/topics.yaml` from inside a tutoring session:
the flag exists so a session never has to.

Note the singular. `--topic` is one vocabulary slug and `--item` is one course
row. A note's place on a course is not the note's to state: the course file
lists concept ids under each row's `concepts:`
([content/courses/README.md](../content/courses/README.md)), and the indexer
refuses a note that still carries the old `topics:` key. `npm run catalog --
status` prints, per course, how many rows list a concept.

### The three data structures

**Concept note** — one atomic idea, testable with one question. Obsidian-
compatible: wikilinks resolve, embeds render, the frontmatter is standard.

````markdown
---
id: attention-weights
title: Attention weights
summary: Attention weights are a softmax over scaled query-key dot products.
requires: [dot-product, softmax, query-key-value-projections]
tags: [transformers]
---

# Attention weights

## The idea
…

## Checks

```check
q: Why divide by the square root of the key dimension?
a: Without it, dot products grow with dimension and push softmax into
   saturation, where gradients vanish.
why: Catches treating the scale factor as arbitrary.
```
````

### Folders and ids

Concepts sit one folder deep, grouped by domain:

```
concepts/
  algorithms/     21
  transformers/    7
  agents/          2
  foundations/     2
```

**The folder is presentation only. The id stays the bare slug.** Ids appear in
every `requires:` edge, every `[[wikilink]]`, and the `concept_slug` column of
`event`, `mastery` and `review`, so folding the folder into the id would break
all of them and moving a note between domains would orphan its history —
which, now that the history is a foreign key, would be a constraint error
rather than a silent loss. `concept edit --domain`
moves the file and nothing else changes.

The domain is read from the path rather than stored in frontmatter, so the two
can never disagree. Nesting is one level: deeper folders are ignored by the
scanner, because a shelf that needs its own filing system is not a shelf.

Filenames must be unique across domains, since the id is the filename and
Obsidian resolves wikilinks the same way. `doctor` reports a clash as an error
and a note left at the root as a warning.

Folders answer "where does this live". Tags stay for everything cross-cutting,
which is most of it: 21 of 32 concepts carry more than one tag, usually a facet
like `notation` or `proof` alongside their domain.

**Sessions stay flat.** They are already indexed by the date in the filename and
by two-way links to every concept they touched. A domain folder would add a
third index that answers nothing the links do not, and it would have to be lossy:
one session already spans two domains, touching 5 transformers concepts and 2
foundations ones. If the folder ever gets crowded, group by year, since time is
the one axis a session genuinely has one of.

### Two kinds of edge

`requires` means the concept cannot be understood without the other one. It
gates teaching, orders the plan, and carries evidence when an answer
propagates.

`assumes` means useful background. It orders the plan and nothing else: it
never blocks teaching, and it never moves belief.

| | Orders the plan | Gates the frontier | Carries evidence |
| --- | --- | --- | --- |
| `requires` | yes | yes | yes |
| `assumes` | yes | no | no |

The split exists because one relation was doing both jobs and the strictest
reading won. Declaring the transformer stack as a prerequisite of tool calling
made nine concepts mandatory before a reasoning loop could be taught, which is
defensible as ordering and wrong as a gate. That edge is now `assumes`: the
ordering knowledge is kept, the blocking is gone.

When in doubt, use `assumes`. Over-declaring a hard prerequisite produces a
graph where nothing is ever at the frontier.

A concept's place on a course is authored on the course side, as
`topics[].concepts` in `content/courses/<code>.yaml`, which is how the two
halves of this repo connect. The `topics` field the `--json` index still
reports per concept is always empty now and stays for the plugin's sake.

**Event** — one row of the trajectory, append-only. `at`, `type`,
`concept_slug` and `session_id` are columns; everything type-specific is in a
`payload` jsonb, which is what the old JSONL line held at the top level:

```json
{"at":"2026-08-18T01:45:58Z","type":"observation","concept":"softmax",
 "correct":true,"source":"probe","opportunity":false,"scheduled":true,
 "pLBefore":0.25,"pLAfter":0.6,"session":"2026-08-18-react-agents"}
```

Append-only is enforced by a trigger, not by discipline. An UPDATE or a DELETE
raises. The correction path is a new row: `learn void --session S --reason R`
retracts a session's evidence, and the next rebuild skips it while the history
stays readable.

**Learner model** — derived from the events. A wrong number there is a bug to
recompute, never data to recover.

---

## The algorithms

### Bayesian Knowledge Tracing

Mastery is a probability p(L) updated on every answer. Four parameters:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `pL0` | 0.25 | Prior belief before any evidence |
| `pT` | 0.15 | Chance of learning it at each opportunity |
| `pG` | 0.20 | Answering right *without* mastery (guessing) |
| `pS` | 0.10 | Answering wrong *despite* mastery (slipping) |

Posterior after an observation (matching the standard formulation, e.g.
[pyBKT](https://arxiv.org/pdf/2105.00385)):

```
correct:    p(L)(1−pS) / [ p(L)(1−pS) + (1−p(L))pG ]
incorrect:  p(L)pS     / [ p(L)pS     + (1−p(L))(1−pG) ]
```

then the learning step `p(L') = post + (1−post)·pT`, applied only when the
item was a teaching opportunity. Mastery threshold is 0.95.

The guess default assumes four-option multiple choice, nudged below chance
(0.25) because good distractors beat random picking. Tune them in the
`preference` row keyed `bktParams` and rebuild — the event log makes that
non-destructive, and a rebuild now keeps the tuned values rather than resetting
them to the defaults.

### SM-2 spaced repetition

Grades 0–5; below 3 fails the card. Intervals go 1 day, 6 days, then
`previous × ease`, with ease updated on a pass by:

```
EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02)),  floored at 1.3
```

Implementation is checked against the published
[SM-2 specification](https://super-memory.com/english/ol/sm2.htm), including
the detail that is easy to get wrong: **a failed item restarts the interval
sequence but its E-Factor is left untouched.** Penalising ease on a lapse as
well would punish it twice and send a struggling card into a spiral. The
conformance tests in `lib/schedule.test.mjs` lock this behaviour.

**Why SM-2 and not FSRS:** FSRS is the better-calibrated modern scheduler
and would be the right upgrade. SM-2 is here because `lib/schedule.mjs` is
under 150 lines with no trained parameter vector, no Python dependency, and
behaviour you can predict
by reading your own queue. For a personal knowledge base of a few hundred
concepts the accuracy difference is dominated by whether you actually do the
reviews. Swap `lib/schedule.mjs` if that stops being true.

### Propagation

A correct answer is evidence about the concept asked and about everything it
rests on. Getting ReAct right says something real about tool calling.

`prerequisiteDistances` walks the prerequisites breadth-first and returns each
one **once**, at its shortest hop distance. That deduplication is load-bearing:
`transformer-block` reaches `vector-as-a-list-of-numbers` by six separate
routes, and BKT treats every update as independent evidence. Walking routes
instead of the set would count one answer six times and promote a concept the
learner was never asked about.

Each prerequisite is then blended toward the full posterior, attenuated by
distance:

```
p' = p + decay^hops · (posterior(p, correct) − p)     decay = 0.4
```

Two rules keep this honest:

- **Only correct answers propagate.** A wrong answer may reflect something
  specific to the concept asked, so inferring failure downward would punish
  foundations that are probably fine.
- **Indirect evidence cannot confer mastery.** Propagation is capped at 0.9,
  below the 0.95 mastery threshold, so the last step has to be earned by
  answering about the concept directly. A belief already above the cap keeps
  what it earned.

**Known open issue: the ceiling no longer gates teaching.** The 0.9 cap was
chosen when the frontier required mastery, which made it a guarantee that a
concept could never be unlocked without being asked about. The frontier now
gates on readiness at 0.75, which sits *below* the cap, so a prerequisite can
reach 0.9 on indirect evidence alone and unblock a dependent it was never
questioned on. Seven correct answers on a dependent are enough. That may well
be the behaviour you want, since it is what stops the march through
foundations the learner obviously holds, but nobody chose it deliberately and
it is not what the ceiling was designed to guarantee. Decide which of the two
numbers is wrong before trusting the frontier on a deep graph. Background:
[docs/HANDOFF-2026-08-20.md](../docs/HANDOFF-2026-08-20.md).

Propagation does not increment `observations`, which counts questions actually
asked. Rebuilds recompute it from the *current* graph rather than replaying it
from the event, so correcting a prerequisite and rebuilding re-derives history
under the fixed structure.

### Frontier

```
frontier = { c : ¬mastered(c) ∧ ∀p ∈ requires(c). ready(p) }

ready(p)    ⟺  p(L) ≥ READY_THRESHOLD    = 0.75
mastered(c) ⟺  p(L) ≥ MASTERY_THRESHOLD  = 0.95
```

A prerequisite only has to be **ready**, not mastered. Requiring mastery all
the way down means nothing is ever teachable on a graph of any depth: a
prerequisite solid enough to support an explanation is the real bar. Both
thresholds are defined in `lib/bkt.mjs`.

Sorted weakest-first. This is the entire teaching policy, and it is why the
dependency graph has to be right: `doctor` refuses to let a cycle through,
because a cycle makes the curriculum unlearnable.

---

## The JSON shapes

Add `--json` to any command. Five of those shapes are a contract: the `/learn`
and `/review` skills live in a plugin outside this repo and parse them, so they
are pinned by golden tests in
[`services/catalog/test/learn-cli.test.ts`](../services/catalog/test/learn-cli.test.ts)
and any change to them is a breaking change to the plugin.

`status` — what both skills open with, and stop on if it fails:

```json
{
  "stats": { "total": 32, "mastered": 0, "learning": 11, "untouched": 21 },
  "due": 11,
  "frontier": [{ "id": "…", "title": "…", "pL": 0.04, "requires": [] }],
  "sessions": 3
}
```

`frontier` — the `frontier` array above, on its own, unbounded:

```json
[{ "id": "…", "title": "…", "pL": 0.04, "requires": ["…"] }]
```

`plan --goal <id>`:

```json
{
  "goal": "transformer-block",
  "steps": [
    { "id": "…", "title": "…", "pL": 0.38, "mastered": false, "gap": true, "requires": ["…"] }
  ],
  "incomplete": false,
  "skipped": 0
}
```

`observe --concept C --correct true|false` — the RL step:

```json
{
  "concept": "softmax",
  "correct": true,
  "pLBefore": 0.25,
  "pLAfter": 0.6,
  "delta": 0.35,
  "mastery": "shaky",
  "mastered": false,
  "due": "2026-08-21T06:40:22.087Z",
  "logged": false,
  "propagated": [{ "concept": "…", "hops": 1, "pLBefore": 0.25, "pLAfter": 0.39 }]
}
```

`review due` — each card with the checks stored in its note, so a review has
something concrete to ask:

```json
[
  {
    "id": "softmax",
    "title": "Softmax",
    "due": "2026-08-21T06:40:22.087Z",
    "intervalDays": 1,
    "lapses": 0,
    "leech": false,
    "checks": [{ "id": "c1", "question": "…", "answer": "…", "why": "…", "source": "" }]
  }
]
```

## Setup

```bash
createdb self_learn                    # once, against the Homebrew Postgres 17
npm run catalog -- migrate             # apply every outstanding migration
npm run learn -- init                  # create learn/, check the store
```

`DATABASE_URL` defaults to `postgres://localhost:5432/self_learn`; see
[services/catalog/.env.example](../services/catalog/.env.example). Nothing
works with the database down any more: mastery and the schedule are tables,
and `concept add`, `check add` and `session log` read the `content_source` row
to know whether they write a file or a row. `status`, which both skills run
first, has always needed it.

Then in Claude Code:

```
/learn <whatever you want to understand>
```

The skill orients itself, builds the concept graph if the topic is new
(via the `concept-mapper` subagent), and runs the four phases. Later:

```
/review
```

### The Claude Code layer

The instruction layer is **not in this repo**. It lives in the `learning`
plugin under the `learning` marketplace, at
`~/.quiver/plugins/learning/learning` (marketplace, then plugin), so `/learn`
and `/review` work from
any project:

| File in the plugin | Role |
| --- | --- |
| `skills/learn/SKILL.md` | The orchestrator — runs all four phases |
| `skills/review/SKILL.md` | Spaced-repetition session |
| `agents/concept-mapper.md` | Goal → concept DAG |
| `agents/fact-checker.md` | Verify claims before teaching |
| `agents/diagram-maker.md` | SVG that checks its own output |

The split is deliberate. The instructions are portable and belong to you; the
CLI and the knowledge base belong to the project. Both skills open by running
`npm run learn -- status` and stop if it fails, so invoking `/learn` in a
project without the pipeline says so rather than improvising a session that
records nothing.

Do not copy these back into `.claude/`. A local copy would shadow the plugin
and the two would drift.

Plugins run from a cache copy rather than from the marketplace source, so after
editing the plugin push the change through:

```bash
claude plugin update learning@learning
```

The interactive phases run in the **main conversation**, not in a subagent,
because asking the user a question mid-turn requires a tool subagents do not
have. Subagents handle only the non-interactive work: mapping, verification,
diagrams. This is a real constraint of the harness, not a style choice.

### Using it with Obsidian

Until the flip, point a vault at `learn/`. Wikilinks, embeds, tags and the
mermaid map all render natively. The session log is worth keeping open while a
session runs, since it is written live. Once notes and logs are flipped there
is no live file under `learn/`: `learn vault pull` writes them to
`~/.self-learn/vault/` (the folder to open in Obsidian), and `learn vault push`
writes edited notes back, as described under "Where the notes and logs live"
above. The vault gets no `.obsidian/` from the command; the config is yours.
Pull again to see what a session wrote; it is a snapshot, not a live sync.

---

## Design decisions worth knowing

- **The event log is the database.** `mastery` and `review` are projections of
  it. This is what makes parameter changes safe and the model auditable, and it
  is why `event` is append-only at the database level rather than by
  convention.
- **Probing does not teach.** `--source probe` skips the transit step.
  Without this distinction, measuring would inflate what it measures.
- **Checks live in the note, not a side table.** The thing that asserts a
  claim and the thing that tests it stay together, and both remain readable
  in any editor.
- **Reviews survive progress resets.** Clearing progress means "study this
  again", not "forget what I concluded".
- **Evidence is an event first.** Every command that records something appends
  to `event` and updates the projections after, in that order. A crash between
  the two costs a rebuild, not the observation.
- **The maths is one implementation.** `lib/bkt.mjs`, `lib/graph.mjs` and
  `lib/schedule.mjs` are imported by the TypeScript CLI rather than restated in
  it, and they keep their own conformance tests. The web hub computes the
  frontier by calling the same `frontier()` the CLI does, so the two cannot
  disagree about where teaching should happen.

## Known limits

- **Propagation strength is hop count, not coupling.** Hard edges are all
  treated as equally strong, because the graph carries no weights. Typing an
  edge as `requires` or `assumes` is a two-way switch, not a dial.
- **BKT assumes mastery never decays.** It cannot go down except through a
  wrong answer. Forgetting is modelled only by the review scheduler, and the
  two models do not talk to each other. A single decayed-mastery model would
  be more honest.
- **Parameters are global**, not per-concept. Real items differ in how
  guessable they are; BKT normally fits parameters per skill from data.
- **The 85% target is a heuristic** the tutor aims at by judgment. Nothing
  measures or enforces it.
- **Concept quality is unverified.** `doctor` checks graph structure — cycles,
  dangling edges, orphans — not whether a concept is genuinely atomic or its
  prerequisites are genuinely necessary.
- **A studied concept cannot be deleted.** `event.concept_slug` is `ON DELETE
  RESTRICT`, so a note with recorded evidence cannot be pruned from the catalog
  while that evidence exists. That is the append-only rule doing its job, and
  it means renaming a concept id is a data migration rather than a file
  rename.
- **Self-assessment is self-reported.** LLM judgments of teaching quality
  agree with human raters weakly; treat the Close-phase scores as a trend,
  never a gate.

## Credits

The four-phase shape — probe with a quiz tool, plan as a rendered DAG,
teach one reasoning step at a time with periodic checks, close — follows
Eero Alvar's [How I Use AI to Learn Things](https://www.youtube.com/watch?v=kzcI5F4tGiU),
which is the origin of this design.

Algorithms, each verified against a primary source rather than memory:

- **Bayesian Knowledge Tracing** — Corbett & Anderson (1994); update
  equations cross-checked against [pyBKT](https://arxiv.org/pdf/2105.00385).
- **SM-2** — Wozniak (1987), [published specification](https://super-memory.com/english/ol/sm2.htm).
- **The 85% target** — Wilson et al., *The Eighty Five Percent Rule for
  optimal learning*, [Nature Communications 10, 4646 (2019)](https://www.nature.com/articles/s41467-019-12552-4).

Several patterns were taken from prior art surveyed while
building this — the self-verifying diagram loop and the validation command
from [anki-llm](https://github.com/raine/anki-llm), the lint-as-separate-pass
idea from [claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian),
the "make the plan produce its own grader" idea from
[CurricuLLM](https://github.com/labicon/CurricuLLM), and the four-way
response taxonomy from [SocraticLM](https://github.com/Ljyustc/SocraticLM).
