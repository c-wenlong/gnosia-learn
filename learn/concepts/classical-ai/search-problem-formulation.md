---
id: search-problem-formulation
title: Formulating a search problem
summary: A problem becomes solvable by search once it is stated as an initial state, the actions available in each state, a transition model saying what each action does, a goal test and a path cost, which together define a state space.
requires: []
tags: [classical-ai, search]
sources: [https://aima.cs.berkeley.edu/]
created: 2026-09-28T15:32:28.496Z
---

# Formulating a search problem

A problem becomes solvable by search once it is stated as an initial state, the
actions available in each state, a transition model saying what each action does,
a goal test and a path cost, which together define a state space.

CS4263 opens with this (states, actions, goals), following AIMA's chapter on
solving problems by searching.

## Why it matters

Every search algorithm in the course takes a formulated problem as input. The
algorithm cannot fix a bad formulation: a state that leaves out something that
matters gives wrong answers, and one that includes things that do not matter
makes the space too large to search. Formulation is where most of the
intelligence in a search-based solution actually lives.

## The idea

Five components:

1. **Initial state:** where the agent starts.
2. **Actions:** ACTIONS(s), the moves available in state s.
3. **Transition model:** RESULT(s, a), the state reached by doing a in s.
4. **Goal test:** whether a state is a goal (one specific state, or any state
   with a property).
5. **Path cost:** the cost of a sequence of actions, usually the sum of step
   costs.

Together, the initial state, actions and transition model define the **state
space**: a graph whose nodes are states and whose edges are actions. A
**solution** is a path from the initial state to a goal; an **optimal** solution
has the lowest path cost.

The key design act is **abstraction**: deciding what a state includes. A good
state keeps exactly what affects which actions are possible, what they lead to,
and what they cost. For route finding, "current city" is enough; the weather,
the radio station and the exact lane are abstracted away.

The state space is usually not stored; algorithms generate it on demand from
ACTIONS and RESULT, which is what makes very large spaces searchable at all.
Because different paths can reach the same state, the space is a graph, not a
tree, and algorithms need to handle repeated states.

## Worked example

The 8-puzzle: eight numbered tiles and a blank on a 3 by 3 board.

- State: the position of each tile and the blank.
- Initial state: any given configuration.
- Actions: move the blank up, down, left or right (where the edge allows).
- Transition model: swap the blank with the neighbouring tile.
- Goal test: tiles in order 1 to 8 with the blank last.
- Path cost: 1 per move.

There are 9!/2 = 181,440 reachable states from any start, small enough to
search exhaustively; the 15-puzzle's space is far larger.

## Failure modes

- **Too much detail in the state,** multiplying the space by irrelevant
  variations.
- **Too little detail,** so two situations that need different actions look the
  same.
- **Confusing the state space with the search tree:** the tree can repeat a state
  many times via different paths.
- **Forgetting the path cost,** so "a solution" is found when the best one was
  wanted.

## Checks

```check
q: Name the five components of a search problem formulation.
a: The initial state, the actions available in each state, the transition model (the result of each action), the goal test, and the path cost.
why: Checks recall of the formulation itself.
```

```check
q: What does abstraction mean when formulating a search problem, and what is the test for a good abstraction?
a: Choosing what a state includes and leaving the rest out. A good state keeps exactly what affects which actions are possible, their results and their costs, and nothing else.
why: Targets the design decision that matters most.
```

```check
q: Why is a state space usually treated as a graph rather than a tree during search?
a: Different action sequences can reach the same state, so without tracking repeated states an algorithm explores the same state many times or loops forever.
why: Prepares the learner for repeated-state handling in the algorithms.
```
