---
id: alpha-beta-pruning
title: Alpha-beta pruning
summary: Alpha-beta pruning computes exactly the minimax decision while skipping branches that provably cannot affect it, tracking the best value each player is already guaranteed; with good move ordering it roughly doubles the depth searchable in the same time.
requires: [minimax]
tags: [classical-ai, games]
sources: [https://aima.cs.berkeley.edu/]
created: 2026-09-28T15:35:07.482Z
---

# Alpha-beta pruning

Alpha-beta pruning computes exactly the minimax decision while skipping branches
that provably cannot affect it, tracking the best value each player is already
guaranteed; with good move ordering it roughly doubles the depth searchable in
the same time.

CS4263 teaches it with [[minimax]] as the pruning half of the game-tree item.

## Why it matters

Plain minimax visits every node, so its reach is set by b^m. Alpha-beta returns
the same answer while ignoring large parts of the tree, and deeper search is the
single biggest factor in playing strength for classical engines.

## The idea

During the depth-first search, carry two bounds down the current path:

- **alpha:** the best value MAX is already guaranteed somewhere on the path (a
  lower bound);
- **beta:** the best value MIN is already guaranteed (an upper bound).

At a MIN node, as soon as one child's value is at most alpha, stop: MIN can force
a value no better for MAX than an option MAX already has, so MAX will never come
here. Symmetrically at a MAX node, stop as soon as a child's value is at least
beta. The pruning condition is alpha at least beta.

**Same answer.** Pruned branches could not change the root's value, so the move
chosen is exactly minimax's.

**Move ordering decides the gain.** If the best moves are searched first, the
number of nodes examined falls to about O(b^(m/2)), which means searching about
twice as deep in the same time. With the worst ordering there is no saving at
all. Engines order moves with cheap heuristics (captures first, the best move from
a shallower search first).

## Worked example

The same tree as in the minimax note: MIN nodes A (3, 12, 8), B (2, 4, 6), C (14,
5, 2).

1. Search A fully: its value is 3, so at the root alpha = 3.
2. Search B: the first leaf is 2, so B is worth at most 2. That is at most alpha
   (3), so MAX will never choose B; skip the leaves 4 and 6.
3. Search C: 14 (C is at most 14), 5 (at most 5), 2 (C is 2). No leaf could be
   pruned, because each bound stayed above 3 until the last one.

Root value 3, move A, as with minimax, with two leaves never examined. Had C's
children been ordered 2, 5, 14, two more would have been pruned.

## Failure modes

- **Believing pruning can change the decision.** It cannot; if it does, the
  implementation is wrong.
- **Ignoring move ordering,** and so getting little benefit.
- **Passing alpha and beta up instead of down,** or resetting them per child.
- **Pruning on strict inequality only,** which is correct but prunes less.

## Prerequisites

- [[minimax]]

## Checks

```check
q: What do alpha and beta represent during alpha-beta search?
a: Alpha is the best value MAX is already guaranteed along the current path (a lower bound); beta is the best value MIN is already guaranteed (an upper bound). A branch is pruned when alpha is at least beta.
why: Checks the meaning of the two bounds.
```

```check
q: Can alpha-beta pruning choose a different move from plain minimax? Why or why not?
a: No. It only skips branches that provably cannot change the backed-up value at the root, so the value and the chosen move are the same as minimax's.
why: Catches the belief that pruning is an approximation.
```

```check
q: Why does move ordering matter so much for alpha-beta, and what is the best-case node count?
a: Pruning happens when a strong option is already known, so searching the best moves first creates tight bounds early. With perfect ordering it examines about O(b^(m/2)) nodes, roughly doubling the searchable depth; with the worst ordering it prunes nothing.
why: Links efficiency to ordering.
```
