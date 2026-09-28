---
id: agent-failure-mode-analysis
title: Failure mode analysis for autonomous agents
summary: Analyse an agent step by step for how each action can fail, how far the error can spread, whether it can be detected and whether it can be undone, because small per-step error rates compound over long runs.
requires: []
assumes: [react-loop, bounding-agent-tasks]
tags: [agentic-ai, security]
sources: []
created: 2026-09-28T15:25:00.204Z
---

# Failure mode analysis for autonomous agents

Analyse an agent step by step for how each action can fail, how far the error
can spread, whether it can be detected and whether it can be undone, because
small per-step error rates compound over long runs.

CS3227 focuses on two failure shapes: cascading errors and irreversible actions.

## Why it matters

A single model call that is right 95% of the time sounds dependable. An agent
makes many calls in sequence, each building on the last, and the chance that
every one of them is right falls quickly. Designing an agent without asking
where it will go wrong means discovering the answer in production.

## The idea

**Errors compound.** If each step of a run succeeds independently with
probability p, a run of n steps succeeds with probability p to the power n. At
p = 0.95, twenty steps succeed about 36% of the time. Real steps are not
independent, but the lesson holds: long unsupervised runs need checks inside
them, not only at the end.

**Errors cascade.** In a [[react-loop]] each step's output is the next step's
input. An early wrong belief (the wrong file, a misread error message) is
treated as fact by every later step, which then builds more work on top of it.
The final result can be far from the goal while every individual step looks
reasonable.

**Some actions are irreversible.** Deleting data, sending a message, spending
money, running a production migration. A mistake here cannot be fixed by a later
step, so the cost of one bad action is unbounded by the rest of the run.

A practical analysis borrows from engineering's failure mode and effects
analysis. For each step or tool, write down:

1. How can it fail? (wrong target, wrong arguments, misread result, loops)
2. What is the effect, and how far can it spread?
3. Would we detect it, and when?
4. Can it be undone?

Then mitigate where effect is large and detection or reversal is poor: add a
verification step, a budget or step limit, a dry run, or a human checkpoint
before the action ([[bounding-agent-tasks]]).

## Worked example

An agent cleans up old cloud resources. Step 3 lists buckets and misreads a
date column, so it believes production buckets are stale. Steps 4 to 10 each
act correctly on that belief, deleting buckets one by one. Analysis flags the
delete tool as severe, irreversible, and detected only after the fact. The fix:
the agent produces a deletion plan, a person approves it, and deletes run with
a soft-delete retention period.

## Failure modes

- **Testing only the happy path** of the agent end to end.
- **Judging a run by its last step,** when the error entered at step three.
- **No step or cost budget,** so a looping agent runs until someone notices.
- **Treating "can be reverted later" as reversible** when side effects (emails,
  deploys) have already happened.

## Prerequisites

Background: [[react-loop]] (each step feeds the next) and
[[bounding-agent-tasks]] (checkpoints before irreversible steps).

## Checks

```check
q: Each step of an agent run is right 95% of the time. Roughly how likely is a 20-step run to be right throughout, and what does that imply for design?
a: About 0.95 to the power 20, roughly 36%. Long runs need verification inside the run, limits on length, and checkpoints, not just a check of the final output.
why: Makes compounding concrete.
```

```check
q: What makes a cascading error hard to spot by reading the agent's last few steps?
a: Each later step acts sensibly on an earlier wrong belief that it treats as fact, so the individual steps look reasonable and the error sits upstream of them.
why: Checks the learner traces errors to where they entered.
```

```check
q: Name the four questions to ask of each agent step or tool in a failure mode analysis.
a: How can it fail; what is the effect and how far can it spread; would we detect it and when; and can it be undone.
why: Checks recall of the analysis method itself.
```
