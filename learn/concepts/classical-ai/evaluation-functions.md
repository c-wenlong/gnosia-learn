---
id: evaluation-functions
title: Evaluation functions and depth-limited game search
summary: When a game tree is too deep to search to the end, search is cut off at a fixed depth and the positions there are scored by an evaluation function, a fast estimate of the expected outcome, usually a weighted sum of features.
requires: [minimax]
tags: [classical-ai, games]
sources: [https://aima.cs.berkeley.edu/]
created: 2026-09-28T15:35:11.205Z
---

# Evaluation functions and depth-limited game search

When a game tree is too deep to search to the end, search is cut off at a fixed
depth and the positions there are scored by an evaluation function, a fast
estimate of the expected outcome, usually a weighted sum of features.

CS4263 covers this as the heuristic scoring of positions.

## Why it matters

Even with pruning, chess, Go and most real games cannot be searched to the end.
The evaluation function is what makes a game-playing program possible at all, and
its quality, together with the search depth, sets how well the program plays.
It is also where human knowledge about the game enters the program.

## The idea

Replace minimax's terminal test with a **cutoff test** (for example, "depth
limit reached") and its utility with an **evaluation function** EVAL(s), which
returns an estimate of the position's value for MAX. Values are then backed up
exactly as in [[minimax]].

A good evaluation function:

1. **Orders terminal states correctly:** wins above draws above losses.
2. **Is fast:** it is called at every leaf of the search.
3. **Correlates with the chance of winning** on non-terminal positions.

The usual form is a weighted linear function of features:
EVAL(s) = w1 f1(s) + w2 f2(s) + ... + wn fn(s).
In chess the classic material features count pieces with values such as pawn 1,
knight 3, bishop 3, rook 5, queen 9, plus features for king safety, mobility and
pawn structure. Weights can be set by hand or learned, and modern engines often
use a neural network in place of the linear sum.

**Where the cutoff goes matters.**

- **Quiescence:** do not cut off in the middle of an exchange. A position where a
  queen is about to be captured looks good by material and is not. Extend the
  search at "noisy" positions until they are quiet.
- **Horizon effect:** a program can make pointless delaying moves that push an
  unavoidable loss just beyond its search depth, where it no longer sees it.

## Worked example

At the depth limit, a position has White up a knight by material (+3), but it is
Black's move and Black can capture White's queen. EVAL says +3 for White; the
truth is roughly -6. Quiescence search extends only the capture sequence, sees the
queen fall, and returns about -6. The cut-off score was misleading because the
position was not quiet.

## Failure modes

- **Evaluating noisy positions** in the middle of exchanges.
- **Slow evaluation** that costs more depth than its accuracy gains.
- **Features that are not independent,** double-counting in a linear sum.
- **Mistaking the evaluation for the truth,** when it is only an estimate that
  search refines.

## Prerequisites

- [[minimax]] (values are backed up the same way)

## Checks

```check
q: What two parts of minimax are replaced to make depth-limited game search, and with what?
a: The terminal test is replaced by a cutoff test (such as a depth limit), and the utility function by an evaluation function that estimates the value of non-terminal positions.
why: Checks how the pieces fit together.
```

```check
q: What is quiescence search, and what problem does it address?
a: Extending the search beyond the depth limit at positions with pending captures or other volatile moves until the position is quiet, so the evaluation function is not applied where its estimate is about to change drastically.
why: Checks a key refinement of cut-off search.
```

```check
q: What is the horizon effect?
a: A depth-limited program making delaying moves that push an unavoidable bad outcome just beyond its search depth, so it no longer sees it, while not actually preventing it.
why: Checks a characteristic failure of fixed-depth search.
```
