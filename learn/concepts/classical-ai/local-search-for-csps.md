---
id: local-search-for-csps
title: "Local search for CSPs: min-conflicts and simulated annealing"
summary: Local search starts from a complete but possibly inconsistent assignment and repeatedly changes one variable to reduce the number of violated constraints, using randomness such as simulated annealing to escape local minima; it is often very fast but cannot prove that no solution exists.
requires: [csp-backtracking-search]
tags: [classical-ai, csp]
sources: [https://aima.cs.berkeley.edu/]
created: 2026-09-28T15:33:49.027Z
---

# Local search for CSPs: min-conflicts and simulated annealing

Local search starts from a complete but possibly inconsistent assignment and
repeatedly changes one variable to reduce the number of violated constraints,
using randomness such as simulated annealing to escape local minima; it is often
very fast but cannot prove that no solution exists.

CS4263 covers min-conflicts and simulated annealing as the local search methods
for CSPs.

## Why it matters

Backtracking builds a solution piece by piece and can drown in a huge tree.
Local search works on whole assignments and only needs memory for the current
one. For large problems with many solutions (n-queens, big schedules) it is often
far faster, and it handles changes gracefully: when a constraint changes, repair
the current schedule rather than starting over.

## The idea

**Complete-state formulation.** Every variable always has a value; the "cost" of
a state is the number of violated constraints. Search moves between neighbouring
states, usually by changing one variable's value, toward cost zero.

**Min-conflicts.**

1. Start with a complete assignment (random, or greedy).
2. Pick a variable that is in conflict, at random.
3. Give it the value that minimises the number of conflicts, breaking ties at
   random.
4. Repeat until no conflicts remain or a step limit is reached.

On n-queens it is remarkably effective, solving very large instances in a small
number of steps on average.

**Getting stuck.** Greedy moves can reach a local minimum (every single change
makes things worse or no better, yet conflicts remain) or wander on a plateau.
Remedies: random restarts, allowing sideways moves, or tabu lists.

**Simulated annealing** adds controlled randomness. Pick a random move. If it
reduces conflicts, take it. If it increases them by Δ, take it anyway with
probability exp(-Δ / T), where the temperature T starts high and decreases over
time. Early on, bad moves are often accepted, which lets the search escape local
minima; later it behaves almost greedily. With a slow enough cooling schedule it
finds a global optimum with probability approaching 1, though that schedule is
usually too slow to use in practice.

The price of all local search: it is **incomplete**. If it fails, you do not know
whether the problem has no solution or the search was unlucky.

## Worked example

Eight queens, one per column; the variables are each queen's row. Start with a
random placement having, say, 5 attacking pairs. Pick a queen that is under
attack and move it within its column to the row where it is attacked least; the
count drops to 3. Repeat. When a queen's best row leaves the count unchanged, a
tie-breaking random choice or an annealing step keeps the search moving until the
count reaches 0.

## Failure modes

- **No restart or randomness,** so the search stalls at the first local minimum.
- **Cooling too fast** in simulated annealing, which turns it into greedy search.
- **Reading a failed run as proof of unsatisfiability.**
- **Using local search where you need to know that no solution exists.**

## Prerequisites

- [[csp-backtracking-search]] (the formulation this works on)

## Checks

```check
q: How does the min-conflicts algorithm choose its next move?
a: It picks a variable currently in conflict at random and assigns it the value that minimises the number of violated constraints, breaking ties randomly.
why: Checks the algorithm itself.
```

```check
q: In simulated annealing, when is a move that increases conflicts accepted, and how does that change over time?
a: With probability exp(-Δ / T), where Δ is the increase and T the temperature. T decreases over time, so worse moves are accepted often at first (escaping local minima) and rarely later.
why: Checks the acceptance rule and the role of temperature.
```

```check
q: What can backtracking search tell you that local search cannot?
a: That a problem has no solution. Local search is incomplete: a failed run does not distinguish an unsolvable problem from an unlucky search.
why: Checks the trade-off between the two families.
```
