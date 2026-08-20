# Handoff

State of the learning pipeline as of 2026-08-20, branch `topic-recaps`,
working tree clean, 170 tests passing.

Architecture lives in [learn/README.md](learn/README.md) and is not repeated
here. This file covers what happened, what is unfinished, and what to watch.

---

## What exists

Two things were built on top of the existing course hub.

**Topic recaps.** Sessions on the web hub now leave a durable record per topic,
and reopening a topic hands that record to the tutor so it resumes rather than
restarting. Commit `f8425d4`.

**The learning pipeline.** A Probe → Plan → Teach → Close loop that runs inside
Claude Code against a local, file-backed knowledge base. Driven by a
dependency-free Node CLI in [scripts/learn](scripts/learn), orchestrated by
[.claude/skills/learn](.claude/skills/learn/SKILL.md), surfaced in the web app
at `/learn`. Commit `c057673` and everything after it.

```bash
npm run learn -- status      # where you are
npm run learn -- help        # the full command surface
npm run learn -- doctor      # validate the concept graph
```

In Claude Code: `/learn <topic>` and `/review`.

---

## Commits on this branch

Newest first. Everything is committed; nothing is in flight.

| Commit | What |
| --- | --- |
| `fb6b596` | Fold two sessions' lessons back into the learn skill |
| `d6c8532` | Gate the frontier on readiness (75%), not mastery (95%) |
| `da59a97` | Schedule every answered question; link sessions to concepts both ways |
| `d5bf583` | Split prerequisites into hard `requires` and soft `assumes` |
| `c98ebc5` | Propagate a correct answer to its prerequisites |
| `5854c4b` | Write the session log live, as the exchange happens |
| `ae77545` | Untrack Obsidian vault state |
| `f2a89ce` | Vary MCQ answer position; add `void` to retract bad evidence |
| `516962c` | Fix SM-2 conformance: no ease penalty on a lapse |
| `c057673` | Add the Probe → Plan → Teach → Close pipeline |
| `f8425d4` | Persist per-topic session recaps |

**Two commits I did not write and have not reviewed:** `c98ebc5` and
`d5bf583`. They appeared in the working tree mid-session, implement mastery
propagation and the `requires`/`assumes` split, carry their own tests, and pass.
Both are load-bearing now: propagation fires on every correct answer, and
`assumes` is what stops the over-declared-prerequisite bug from recurring.
Worth a read before this branch merges.

---

## Current knowledge base

11 concepts covering vectors through the transformer block to ReAct agents,
tied to CP4284 topics. 7 in progress, 4 untouched, none mastered. 3 session
logs. 7 review cards, first due 2026-08-21.

The frontier sits at `tool-calling` (25%) and `vector-as-a-list-of-numbers`
(38%).

Five concepts are scheduled for review with **no checks written**, so `/review`
will have to improvise a question for them: `attention-weights`,
`multi-head-attention`, `positional-encoding`, `self-attention`,
`transformer-block`. `session close` warns about this; nothing fixes it
automatically.

The `2026-08-19-react-agents` session is **voided**. All seven of its questions
put the correct answer in slot 1, so the answers measured pattern-matching. The
observations remain in `events.jsonl` for audit and are skipped on rebuild.

---

## Open defects

| Defect | Effect | Notes |
| --- | --- | --- |
| Cold-start probe ranking is flat | Every concept ties at 0.296 bits with nothing observed, and the tiebreak favours fewest-prerequisites, which points at the bottom of the graph | The skill tells the tutor to start near the goal and override it. Mild. |
| Nothing enforces drawing spatial ideas | The tutor can explain a rotation in prose and only find out it failed when the learner complains | Rule added to the skill; no mechanism behind it |
| The 0.25 prior is pessimistic | A foundation the learner obviously holds still needs two correct answers to clear the 75% ready bar | Mitigation in the skill: ask what they already know instead of proving it. A proper fix is per-concept priors or an `assert` command. |
| BKT models no forgetting | Mastery only falls on a wrong answer. Decay lives entirely in the SM-2 scheduler and the two models never talk | Documented in learn/README.md |

---

## The finding that matters most

Every defect found in live use surfaced because **the learner objected**, never
because the system noticed.

- The nine-concept prerequisite chain: caught by "how is this question related
  to react though".
- The answer always sitting in slot 1: caught by "you're making it easy for me
  to guess".
- The empty session log: caught by comparing against screenshots of someone
  else's setup.
- Prose instead of a diagram: caught by "its badly phrased, you should generate
  that first".

The Close phase now asks the tutor to self-assess what it got wrong, which is
weak, since a tutor able to notice would not have made the mistake. If the
pattern holds over a few more sessions, the real fix is an adversarial pass over
a finished session log by a separate agent, rather than a self-check inside the
loop.

---

## Verification standards used

Every change ran `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
before commit. Beyond that:

- BKT update equations and SM-2 were checked against primary sources rather than
  memory. That check found a real bug: ease was being penalised on a lapse,
  which SM-2 does not do. Fixed in `516962c`.
- The event log's replay property was verified by wiping `model.json` and
  confirming the rebuild reproduces every mastery value exactly.
- The `/learn` page's SVG layout was checked programmatically for node overlaps
  and edge direction, not by eye.
- The pipeline was exercised in two real sessions, which is where the defect
  list above came from.

Do not trust a green test run as evidence the loop works. It did not catch a
single one of the defects above.

---

## Where to pick up

Ordered by value.

1. **Review `c98ebc5` and `d5bf583`.** Unreviewed, load-bearing, already
   affecting every session.
2. **Continue the transformer-block session.** `vector-as-a-list-of-numbers` is
   at 38% and genuinely teachable; the path to `transformer-block` is 9 steps
   and only the first has been started. This is also the cheapest way to keep
   finding defects.
3. **Write checks for the five concepts that have none**, or `/review` degrades
   into improvised questions.
4. **Decide on the adversarial review pass** described above.

Untracked and deliberately left alone: `roadmap/` (your PDFs) and `docs/`
(your own notes on the source video, which overlap `learn/README.md` and are
worth reconciling).
