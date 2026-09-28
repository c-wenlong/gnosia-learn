---
id: arc-consistency
title: Arc consistency and constraint propagation
summary: Constraint propagation removes domain values that cannot appear in any solution; forward checking prunes the neighbours of each newly assigned variable, and arc consistency (AC-3) keeps pruning until every value of every variable has a compatible value in each neighbour.
requires: [csp-backtracking-search]
tags: [classical-ai, csp]
sources: [https://aima.cs.berkeley.edu/]
created: 2026-09-28T15:33:36.500Z
---

# Arc consistency and constraint propagation

Constraint propagation removes domain values that cannot appear in any solution;
forward checking prunes the neighbours of each newly assigned variable, and arc
consistency (AC-3) keeps pruning until every value of every variable has a
compatible value in each neighbour.

CS4263 covers AC-3 and forward checking as the two main forms of propagation.

## Why it matters

Backtracking alone finds a dead end only when it tries to assign the variable
that has no legal value left. Propagation finds such dead ends earlier, sometimes
before any search at all, and shrinks domains so the search has fewer choices.
On many real problems this is the difference between instant and infeasible.

## The idea

**Arc.** For a binary constraint between X and Y there are two directed arcs,
X to Y and Y to X. The arc X to Y is **consistent** if for every value x in X's
domain there is some value y in Y's domain that satisfies the constraint. If some
x has no such y, x can be deleted: it cannot be part of any solution.

**AC-3.**

1. Put every arc in a queue.
2. Take an arc X to Y and delete from X's domain every value without support in
   Y's domain.
3. If X's domain lost a value, add back every arc Z to X for X's other
   neighbours Z, since their values may have lost their support.
4. If any domain becomes empty, the problem (from this state) has no solution.
5. Stop when the queue is empty.

With n variables, c binary constraints and domains of size d, AC-3 runs in
O(c d^3) time.

**Forward checking** is the cheap, local version used during backtracking: after
assigning X, delete from each unassigned neighbour's domain the values
inconsistent with X. It does not look further, so it misses failures between two
unassigned variables. Running full arc consistency after each assignment is
called maintaining arc consistency (MAC).

Arc consistency is not a solver on its own: every arc can be consistent while no
full solution exists.

## Worked example

Australia map colouring with colours red, green, blue. Assign WA = red and
Q = green.

- Forward checking: NT loses red (from WA) and green (from Q), leaving {blue};
  SA also ends with {blue}; NSW is left with {red, blue}. No domain is empty, so
  forward checking sees no problem.
- Arc consistency: check NT to SA. NT's only value, blue, needs a different value
  in SA, but SA has only blue. Delete blue from NT: its domain is empty, so this
  partial assignment is a dead end, detected before assigning NT or SA.

## Failure modes

- **Forgetting to re-queue neighbouring arcs,** leaving the network only partly
  consistent.
- **Treating arc consistency as a proof a solution exists.**
- **Expecting forward checking to catch conflicts between unassigned variables.**
- **Running expensive propagation where cheap checking suffices** on easy problems.

## Prerequisites

- [[csp-backtracking-search]]

## Checks

```check
q: When is the arc from X to Y consistent?
a: When every value in X's domain has at least one value in Y's domain that satisfies the constraint between them.
why: Checks the core definition, including its direction.
```

```check
q: In AC-3, after deleting values from X's domain while revising arc X to Y, which arcs go back on the queue and why?
a: Every arc Z to X for X's neighbours Z other than Y, because values of Z that were supported only by the deleted values of X may now have no support.
why: Targets the propagation step people get wrong.
```

```check
q: With WA = red and Q = green in the Australia map, forward checking finds no problem but arc consistency does. Why?
a: Forward checking only prunes neighbours of assigned variables and leaves NT and SA both with {blue}. Arc consistency also checks the arc between NT and SA, which are adjacent and cannot both be blue, so it empties a domain and detects the dead end.
why: Checks the difference in reach between the two methods.
```
