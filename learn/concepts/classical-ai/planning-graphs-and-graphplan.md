---
id: planning-graphs-and-graphplan
title: Planning graphs and Graphplan
summary: A planning graph layers the facts that might be true and the actions that might apply at each step, with mutual-exclusion links between pairs that cannot co-occur, which yields both admissible heuristics and the Graphplan algorithm that extracts a plan from it.
requires: [strips-action-schemas]
tags: [classical-ai, planning]
sources: [https://planning.wiki/ref/pddl]
created: 2026-09-28T15:38:03.715Z
---

# Planning graphs and Graphplan

A planning graph layers the facts that might be true and the actions that might
apply at each step, with mutual-exclusion links between pairs that cannot
co-occur, which yields both admissible heuristics and the Graphplan algorithm
that extracts a plan from it.

CS4263 covers planning graphs and the ideas behind Graphplan (Blum and Furst,
1995).

## Why it matters

The set of states reachable in k steps is exponential; a planning graph is a
polynomial-size over-approximation of it. That trade makes it cheap to ask "how
many steps at least until the goal could be true?", which is a heuristic, and it
prunes the search for a plan to combinations that are not obviously impossible.

## The idea

**Layers.** Start with level S0: the facts true initially. Then alternate:

- action level Ai: every action whose preconditions all appear in Si (and are not
  mutually exclusive), plus a **persistence** (no-op) action for each fact,
  which carries it forward unchanged;
- fact level Si+1: every effect of the actions in Ai.

**Mutex links** mark pairs that cannot both happen at that level.

Two actions are mutex if they have:
1. *inconsistent effects* (one adds what the other deletes);
2. *interference* (one deletes a precondition of the other);
3. *competing needs* (their preconditions are mutex at the previous level).

Two facts are mutex if one is the negation of the other, or if every pair of
actions that could achieve them is mutex (*inconsistent support*).

Facts only accumulate from level to level and mutexes only disappear, so the
graph eventually stops changing (**levels off**).

**Heuristics.** The level at which a goal first appears is a lower bound on the
steps needed to reach it. The maximum over goals (max-level) is admissible; the
sum of levels (level-sum) is not admissible but often works well; the first level
where all goals appear pairwise non-mutex (set-level) is admissible and stronger.

**Graphplan.** Extend the graph until all goals appear without mutexes between
them. Then search backward for a set of non-mutex actions at each level that
achieves the goals. If that fails, add a level and try again. If the graph has
levelled off and extraction still fails for good, there is no plan.

## Worked example

Goal: Have(Cake) ∧ Eaten(Cake), starting with Have(Cake). At A0, Eat(Cake) and
the persistence of Have(Cake) are mutex (Eat deletes Have), so at S1 Have(Cake)
and Eaten(Cake) are mutex: the goal cannot be achieved in one step. At A1,
Bake(Cake) can restore Have(Cake) after eating, the mutex disappears at S2, and a
two-step plan is extracted: Eat, then Bake.

## Failure modes

- **Treating levels as reachable states:** a level is an over-approximation, not
  a set of states that are all reachable.
- **Using level-sum where admissibility is required.**
- **Forgetting persistence actions,** which carry facts across levels.
- **Stopping at the first level where goals appear** without checking mutexes.

## Prerequisites

- [[strips-action-schemas]]

## Checks

```check
q: Name the three conditions that make two actions mutually exclusive at a level of a planning graph.
a: Inconsistent effects (one negates an effect of the other), interference (one deletes a precondition of the other), and competing needs (their preconditions are mutex at the previous level).
why: Checks the mutex rules.
```

```check
q: Why is the level at which a goal first appears a lower bound on the number of steps needed to achieve it?
a: The planning graph over-approximates reachability: every fact reachable in k steps appears by level k, so if a goal first appears at level k it cannot be achieved in fewer than k steps.
why: Checks the source of admissibility.
```

```check
q: How does Graphplan decide that a problem has no solution?
a: When the graph has levelled off (no new facts or mutex changes) and backward extraction of a plan keeps failing, so extending the graph further cannot help.
why: Checks the termination condition.
```
