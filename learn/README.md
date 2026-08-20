# The Learning Pipeline

A local, file-backed tutoring loop that runs inside Claude Code. It measures
what you know, plans a path from there, teaches one step at a time, and
schedules what you will forget.

Everything it knows lives in this directory as plain files you can read,
diff, and revert. Nothing important is trapped in a chat transcript.

```
learn/
  concepts/<id>.md      atomic concept notes — the durable knowledge
  sessions/<id>.md      one log per session, appended live
  assets/<id>.svg       diagrams generated during teaching
  state/
    model.json          mastery per concept          (derived)
    reviews.json        spaced-repetition schedule   (NOT rebuildable)
    events.jsonl        every observation, appended  (SOURCE OF TRUTH)
    index.json          snapshot the web hub reads   (derived)
  map.md                mermaid knowledge map        (derived)
```

Everything marked derived can be rebuilt from `events.jsonl` and the notes:
`npm run learn -- model --rebuild && npm run learn -- map && npm run learn -- index`.

**`reviews.json` is the exception and is not backed up by anything.** Review
events are appended to the log, but no command replays them, so deleting the
file loses every scheduled review permanently. Treat it as authoritative until
a rebuild path exists.

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
| **State** | Mastery p(L) over every concept, plus the prerequisite DAG | `state/model.json`, `concepts/*.md` |
| **Action** | Which concept to teach or ask about next | `learn teach`, `learn probe` |
| **Observation** | The learner's answer, right or wrong | `learn observe` |
| **Reward** | Correctness, valued highest near the target difficulty | mastery delta in `events.jsonl` |
| **Transition** | Bayesian update of belief, then the learning step | `lib/bkt.mjs` |
| **Policy** | Teach the weakest concept at the frontier | `lib/graph.mjs` → `frontier()` |
| **Trajectory** | Append-only log of every step | `state/events.jsonl` |
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
and arrows pointing at nothing.

### Phase 4 — Close

Write the durable artefacts: fill in the concept notes, record open
questions, add at least one **check** per concept taught, close the session,
regenerate the map and index.

Then self-assess honestly on three axes — *coverage* (did we reach the
planned concepts), *restraint* (did the tutor avoid simply answering), and
*understanding* (was it demonstrated or assumed). An inflated self-assessment
poisons the next session's starting assumptions.

---

## Primitives

Everything is `npm run learn -- <command>`; add `--json` for parseable output.

| Command | Purpose |
| --- | --- |
| `status` | Where you are: counts, due reviews, frontier |
| `concept add\|edit\|list\|show` | Define and inspect concepts; `edit` changes edges without touching the note body |
| `check add\|list` | Verification questions stored in the note |
| `probe [--goal]` | What to ask next, by information gain |
| `observe --concept --correct` | **The RL step.** Record one answer |
| `frontier [--goal]` | The edge of understanding |
| `plan --goal [--mermaid]` | Ordered path from known to goal |
| `teach [--goal]` | The single next concept, with context |
| `review due\|grade\|forecast` | Spaced repetition |
| `session start\|log\|close\|list` | The session log |
| `model [--rebuild]` | Mastery table; rebuild replays the event log |
| `map` / `index` | Regenerate `map.md` / `state/index.json` |
| `doctor` | Validate the graph — cycles, dangling edges, orphans |

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
topics: [cp4284-m1-t1]
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

`topics` links a concept back to a course topic in the web hub, which is how
the two halves of this repo connect.

**Event** — one line of the trajectory, append-only:

```json
{"at":"2026-08-18T01:45:58Z","type":"observation","concept":"softmax",
 "correct":true,"source":"probe","opportunity":false,
 "pLBefore":0.25,"pLAfter":0.6,"session":"2026-08-18-react-agents"}
```

**Learner model** — derived from the events, cached for speed.

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
(0.25) because good distractors beat random picking. Tune these in
`state/model.json` and rebuild — the event log makes that non-destructive.

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
and would be the right upgrade. SM-2 is here because it is ~40 lines with no
trained parameter vector, no Python dependency, and behaviour you can predict
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
  below the 0.95 threshold. It can raise confidence to just short of mastered,
  but the last step has to be earned by answering about the concept directly.
  A belief already above the cap keeps what it earned.

Propagation does not increment `observations`, which counts questions actually
asked. Rebuilds recompute it from the *current* graph rather than replaying it
from the event, so correcting a prerequisite and rebuilding re-derives history
under the fixed structure.

### Frontier

```
frontier = { c : ¬mastered(c) ∧ ∀p ∈ requires(c). mastered(p) }
```

Sorted weakest-first. This is the entire teaching policy, and it is why the
dependency graph has to be right — `doctor` refuses to let a cycle through,
because a cycle makes the curriculum unlearnable.

---

## Setup

Nothing to install — plain Node ESM, zero dependencies.

```bash
npm run learn -- init
```

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

| File | Role |
| --- | --- |
| `.claude/skills/learn/SKILL.md` | The orchestrator — runs all four phases |
| `.claude/skills/review/SKILL.md` | Spaced-repetition session |
| `.claude/agents/concept-mapper.md` | Goal → concept DAG |
| `.claude/agents/fact-checker.md` | Verify claims before teaching |
| `.claude/agents/diagram-maker.md` | SVG that checks its own output |

The interactive phases run in the **main conversation**, not in a subagent,
because asking the user a question mid-turn requires a tool subagents do not
have. Subagents handle only the non-interactive work: mapping, verification,
diagrams. This is a real constraint of the harness, not a style choice.

### Using it with Obsidian

Point a vault at `learn/`. Wikilinks, embeds, tags and the mermaid map all
render natively. The session log is worth keeping open while a session runs —
it is written live.

---

## Design decisions worth knowing

- **The event log is the database.** Files under `state/` other than
  `events.jsonl` are caches. This is what makes parameter changes safe and
  the model auditable.
- **Probing does not teach.** `--source probe` skips the transit step.
  Without this distinction, measuring would inflate what it measures.
- **Checks live in the note, not a side table.** The thing that asserts a
  claim and the thing that tests it stay together, and both remain readable
  in any editor.
- **Reviews survive progress resets.** Clearing progress means "study this
  again", not "forget what I concluded".
- **Writes are atomic** (temp file + rename), so an interrupted run cannot
  truncate state.
- **No runtime dependencies.** The pipeline is plain Node; the graph renderer
  in the web hub is hand-rolled SVG rather than a graph library.

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
