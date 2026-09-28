---
id: monte-carlo-tree-search
title: Monte Carlo Tree Search
summary: MCTS grows a game tree by repeating four steps (select a promising path with a bandit rule, expand a node, simulate a playout to the end, back up the result), so moves are judged by sampled outcomes rather than by an evaluation function.
requires: []
assumes: [minimax, exploration-vs-exploitation]
tags: [classical-ai, games]
sources: [https://ieeexplore.ieee.org/document/6145622]
created: 2026-09-28T15:35:14.930Z
---

# Monte Carlo Tree Search

MCTS grows a game tree by repeating four steps (select a promising path with a
bandit rule, expand a node, simulate a playout to the end, back up the result),
so moves are judged by sampled outcomes rather than by an evaluation function.

CS4263 covers the four phases; the reference is Browne and colleagues' 2012
survey of MCTS methods.

## Why it matters

Alpha-beta needs a good evaluation function and a manageable branching factor.
Go has neither: its branching factor is in the hundreds and positions are hard to
score by hand. MCTS needs only the rules of the game and a way to play random (or
cheap) moves to the end, and it was the basis of the jump in computer Go, later
combined with neural networks in AlphaGo.

## The idea

Each tree node stores how many times it was visited (n) and the total reward from
those visits (w). Repeat until time runs out:

1. **Selection.** From the root, descend by choosing children with a rule that
   balances exploitation (high average reward w/n) and exploration (few visits).
   The standard rule, UCT, picks the child maximising
   w_i / n_i + c * sqrt(ln N / n_i),
   where N is the parent's visit count and c is a constant (sqrt(2) in theory,
   tuned in practice).
2. **Expansion.** At a node with untried moves, add one new child.
3. **Simulation (playout).** From the new node, play moves (random or by a cheap
   policy) until the game ends, and record the result.
4. **Backpropagation.** Update n and w on every node along the path, with the
   result counted from the perspective of the player who moved into each node.

Finally, play the root move with the **most visits** (more robust than the
highest average from a few lucky playouts).

Properties: it is an anytime algorithm (stop whenever, keep the best so far), it
focuses effort on promising lines, and in the limit UCT's move values converge to
the minimax values. Its weakness is sharp tactics: a single refutation deep in a
line can be missed if random playouts rarely find it.

## Worked example

A root with two moves after 10 simulations: move X visited 6 times with 4 wins,
move Y visited 4 times with 2 wins. With c = 1.4 and N = 10, the exploration term
is 1.4 * sqrt(ln 10 / n): about 0.87 for X and 1.06 for Y. UCT scores: X is
0.67 + 0.87 = 1.53, Y is 0.50 + 1.06 = 1.56. So the next simulation explores Y,
even though X has the better average, because Y is less certain.

## Failure modes

- **Pure random playouts** in games where random play says little about the
  position.
- **Picking the move with the best average** from very few visits.
- **Missing narrow tactical refutations.**
- **Scoring rewards from one player's view** at every node instead of the mover's.

## Prerequisites

Background: [[minimax]] (the values MCTS approximates by sampling).

## Checks

```check
q: Name the four phases of Monte Carlo Tree Search in order and say what each does.
a: Selection (descend the tree choosing children by a rule such as UCT), expansion (add a new child node), simulation (play out from it to the end of the game), and backpropagation (update visit counts and rewards on the path).
why: Checks the core loop.
```

```check
q: In the UCT formula, what do the two terms represent, and why is the second needed?
a: The first term, w_i / n_i, is the average reward (exploitation); the second, c * sqrt(ln N / n_i), grows for rarely visited children (exploration). Without it, the search could lock onto a move that got lucky early and never test the alternatives.
why: Connects MCTS to the exploration-exploitation trade-off.
```

```check
q: Why can MCTS play Go well where alpha-beta with a hand-built evaluation function struggles?
a: Go's branching factor is very large and positions are hard to evaluate by hand. MCTS needs no evaluation function, only the rules for playouts, and concentrates its sampling on promising moves.
why: Checks when to prefer MCTS.
```
