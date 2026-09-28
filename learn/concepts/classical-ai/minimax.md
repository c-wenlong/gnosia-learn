---
id: minimax
title: Minimax
summary: "In a two-player zero-sum game with perfect information, minimax values each position by assuming both players play optimally: the maximising player picks the child with the highest value, the minimising player the lowest, back up from the terminal outcomes."
requires: []
assumes: [uninformed-search]
tags: [classical-ai, games]
sources: [https://aima.cs.berkeley.edu/]
created: 2026-09-28T15:35:03.613Z
---

# Minimax

In a two-player zero-sum game with perfect information, minimax values each
position by assuming both players play optimally: the maximising player picks
the child with the highest value, the minimising player the lowest, backed up
from the terminal outcomes.

CS4263 covers minimax through game trees and the optimal-play assumption, with
alpha-beta pruning as its speed-up ([[alpha-beta-pruning]]).

## Why it matters

Single-agent search asks "which path reaches the goal?". In a game the outcome
also depends on an opponent who is working against you, so a plan must be a
strategy: a response to every opponent move. Minimax is the basic way to compute
such a strategy, and nearly every classical game engine is built on it.

## The idea

A **game** here is two players (MAX and MIN) taking turns, deterministic moves,
both seeing the whole state, and zero-sum outcomes (one player's gain is the
other's loss). A **utility** function scores terminal states from MAX's point of
view, for example +1 win, 0 draw, -1 loss.

The minimax value of a node:

- terminal: its utility;
- MAX to move: the maximum of its children's values;
- MIN to move: the minimum of its children's values.

Computed by depth-first recursion to the leaves, then backed up. MAX then plays
the move leading to the child with the highest value.

**What "optimal" means.** Minimax guarantees MAX at least the root's value
against any opponent. If MIN plays suboptimally, MAX does at least as well, but
minimax does not try to exploit a weak opponent.

**Cost.** It visits the whole tree: O(b^m) time for branching factor b and
maximum depth m, O(bm) memory as depth-first search. For chess (b around 35,
games of dozens of moves) that is hopeless, which is why pruning and evaluation
functions exist.

## Worked example

MAX to move with three options, each leading to a MIN node whose children are
terminal:

- A leads to leaves 3, 12, 8: MIN picks 3.
- B leads to leaves 2, 4, 6: MIN picks 2.
- C leads to leaves 14, 5, 2: MIN picks 2.

The root's value is max(3, 2, 2) = 3, so MAX plays A. C contains the biggest
payoff (14), but MIN would never allow it.

## Failure modes

- **Chasing the best leaf** rather than the best guaranteed outcome.
- **Mixing up perspectives,** scoring some leaves for the player to move and
  others for MAX.
- **Applying plain minimax to chance games** (dice) without expectation nodes
  (expectiminimax).
- **Expecting it to exploit a weak opponent;** it assumes the strongest one.

## Checks

```check
q: How is the minimax value of a node defined?
a: At a terminal node it is the utility; at a MAX node, the maximum of the children's values; at a MIN node, the minimum of the children's values.
why: Checks the recursive definition.
```

```check
q: MAX's options lead to MIN nodes with leaves (3, 12, 8), (2, 4, 6) and (14, 5, 2). What is the root's value, and why does MAX not aim for the 14?
a: The MIN nodes are worth 3, 2 and 2, so the root is 3 and MAX plays the first move. The 14 sits under a MIN node where MIN can choose 2 instead, so it is never reachable against an optimal opponent.
why: Tests backing up values and the optimal-opponent assumption.
```

```check
q: What does the minimax value guarantee, and what does it not attempt?
a: It guarantees MAX at least that value against any opponent. It does not try to exploit a suboptimal opponent to get more.
why: Clarifies what optimal play means here.
```
