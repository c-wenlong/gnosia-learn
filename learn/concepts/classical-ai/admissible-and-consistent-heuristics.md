---
id: admissible-and-consistent-heuristics
title: Admissible and consistent heuristics
summary: A heuristic is admissible if it never overestimates the true cost to the goal and consistent if it obeys a triangle inequality along every edge; these properties make A* optimal, and good ones are usually built by solving a relaxed version of the problem.
requires: [a-star-search]
tags: [classical-ai, search]
sources: [https://www.redblobgames.com/pathfinding/a-star/introduction.html]
created: 2026-09-28T15:32:39.882Z
---

# Admissible and consistent heuristics

A heuristic is admissible if it never overestimates the true cost to the goal and
consistent if it obeys a triangle inequality along every edge; these properties
make A* optimal, and good ones are usually built by solving a relaxed version of
the problem.

CS4263 covers these under informed search: heuristic design, admissibility and
consistency.

## Why it matters

A* is only as good as its heuristic. Too optimistic (always 0) and it degrades to
uniform-cost search; overestimating and it can return a worse path than
necessary. Knowing the two properties, and a method for building heuristics that
have them, is what makes A* usable on a new problem.

## The idea

Let h*(n) be the true cheapest cost from n to a goal.

- **Admissible:** h(n) is at most h*(n) for every n. It never overestimates.
  With an admissible heuristic, A* tree search is optimal.
- **Consistent** (monotone): for every node n and every successor n' reached by
  an action of cost c(n, a, n'), h(n) is at most c(n, a, n') + h(n'), and
  h(goal) = 0. The estimate never drops by more than the step actually costs.
  Consistency implies admissibility, makes f non-decreasing along any path, and
  guarantees that the first time A* expands a state it has the cheapest path to
  it, so graph search with a reached set stays optimal.

**Dominance.** If h2(n) is at least h1(n) for every n, and both are admissible,
h2 dominates h1: A* with h2 never expands more nodes than with h1 (up to ties).
Prefer the larger admissible heuristic.

**Designing heuristics by relaxation.** Remove a constraint from the problem; the
exact cost of the easier problem is an admissible heuristic for the original,
because every solution of the original is also a solution of the relaxed one.
The maximum of several admissible heuristics is admissible and dominates each.

## Worked example

The 8-puzzle rule: a tile can move to an adjacent square if that square is blank.

- Drop both conditions (any tile can jump anywhere): the cost is the number of
  misplaced tiles, h1.
- Drop only "if blank" (tiles slide to any adjacent square): the cost is the sum
  of each tile's Manhattan distance to its goal square, h2.

A tile three moves from home adds 1 to h1 and 3 to h2. Both are admissible; h2 is
never below h1, so it dominates, and A* with h2 expands far fewer nodes. Straight-
line distance for route finding is the same idea: drop the constraint of
following roads.

## Failure modes

- **Overestimating,** for example weighting a distance heuristic "to be safe".
- **Assuming admissible means consistent.** An admissible but inconsistent
  heuristic can break graph-search A* unless states are allowed to be re-opened.
- **Choosing a cheap weak heuristic** when a dominant one is available at similar
  cost.
- **Forgetting the cost of computing h,** which can outweigh the nodes it saves.

## Prerequisites

- [[a-star-search]]

## Checks

```check
q: Define an admissible heuristic and a consistent heuristic.
a: Admissible: h(n) never exceeds the true cheapest cost from n to a goal. Consistent: for every edge from n to n' with cost c, h(n) is at most c + h(n'), with h(goal) = 0. Consistency implies admissibility.
why: Checks both definitions precisely.
```

```check
q: Why does solving a relaxed problem give an admissible heuristic?
a: Relaxing removes constraints, so every solution of the original problem is also a solution of the relaxed one; the relaxed optimum can therefore be no more than the original optimum, and never overestimates.
why: Checks the reasoning behind the design method, not just the recipe.
```

```check
q: For the 8-puzzle, which dominates, misplaced tiles or total Manhattan distance, and what does dominance buy you?
a: Manhattan distance dominates, since each misplaced tile contributes at least 1 to it. A* with a dominating admissible heuristic expands no more nodes (up to ties), usually far fewer.
why: Applies dominance to the standard example.
```
