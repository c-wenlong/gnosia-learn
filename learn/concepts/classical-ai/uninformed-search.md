---
id: uninformed-search
title: "Uninformed search: BFS, DFS and uniform-cost"
summary: Uninformed search strategies differ only in which frontier node they expand next, and that single choice (shallowest, deepest, or cheapest so far) decides whether they are complete, optimal, and how much time and memory they use.
requires: [search-problem-formulation]
tags: [classical-ai, search]
sources: [https://aima.cs.berkeley.edu/]
created: 2026-09-28T15:32:32.333Z
---

# Uninformed search: BFS, DFS and uniform-cost

Uninformed search strategies differ only in which frontier node they expand
next, and that single choice (shallowest, deepest, or cheapest so far) decides
whether they are complete, optimal, and how much time and memory they use.

CS4263 covers BFS, DFS and uniform-cost search as the uninformed strategies.

## Why it matters

These are the baselines every informed method is measured against, and the same
skeleton reappears in A*. Knowing exactly what each one guarantees stops the
common mistake of using BFS for a problem with varying step costs, or DFS where
the space is infinite.

## The idea

All three share one loop: keep a **frontier** of generated but unexpanded nodes,
take one out, stop if it is a goal, otherwise generate its successors and add
them. A **reached** set of states avoids re-expanding repeats. "Uninformed" means
they use no estimate of distance to the goal.

| Strategy | Frontier | Complete? | Optimal? | Time and memory |
| --- | --- | --- | --- | --- |
| Breadth-first (BFS) | FIFO queue | yes, if b is finite | only if all steps cost the same | O(b^d) time and memory |
| Depth-first (DFS) | LIFO stack | no in infinite spaces | no | memory O(bm) on a tree |
| Uniform-cost (UCS) | priority queue on path cost g(n) | yes, if step costs are positive | yes | depends on C* / smallest step cost |

Here b is the branching factor, d the depth of the shallowest goal, m the maximum
depth, and C* the optimal cost.

Two details matter for correctness:

- **UCS must test for the goal when a node is expanded,** not when it is
  generated, because a cheaper path to the goal may still be on the frontier.
  BFS can test on generation, since the first goal generated is the shallowest.
- **DFS's advantage is memory,** not speed. Iterative deepening (DFS with depth
  limits 0, 1, 2, ...) keeps that memory and regains BFS's completeness.

## Worked example

Graph: S to A costs 1, S to B costs 4, A to B costs 2, A to G costs 12, B to G
costs 3.

- **BFS** expands S (generating A then B), then expands A and generates G, and
  returns S, A, G: two steps, cost 13. It finds the fewest steps, not the lowest
  cost.
- **UCS** expands by g: S (0), A (1), then B via A (3, cheaper than the direct 4),
  then puts G on the frontier at 6 (the 13 via A is replaced), and expands G at
  cost 6: path S, A, B, G.

## Failure modes

- **BFS on weighted problems,** returning a short but expensive path.
- **Goal-testing UCS on generation,** which can return a suboptimal path.
- **DFS without cycle checking** looping forever.
- **Underestimating BFS memory:** it stores the whole frontier, which grows as
  b^d.

## Prerequisites

- [[search-problem-formulation]]

## Checks

```check
q: BFS, DFS and uniform-cost search share the same loop. What single difference distinguishes them?
a: The order in which they take nodes from the frontier: BFS uses a FIFO queue (shallowest first), DFS a LIFO stack (deepest first), UCS a priority queue on path cost g(n) (cheapest first).
why: Checks the unifying view of uninformed search.
```

```check
q: On a graph with varying step costs, why can BFS return a suboptimal solution while UCS cannot?
a: BFS finds the path with the fewest steps, which need not be the cheapest. UCS expands in order of path cost, so the first goal it expands is reached by the cheapest path (with positive step costs).
why: Checks the optimality conditions.
```

```check
q: Why must uniform-cost search apply the goal test when a node is expanded rather than when it is generated?
a: When a goal is first generated, a cheaper path to it may still be on the frontier; only when the goal is taken off the priority queue is its cost guaranteed minimal.
why: Targets a subtle correctness detail.
```
