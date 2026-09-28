---
id: csp-backtracking-search
title: CSPs and backtracking search
summary: A constraint satisfaction problem is a set of variables, each with a domain, and constraints on which combinations are allowed; backtracking search assigns one variable at a time and undoes the last choice as soon as a constraint is violated.
requires: []
assumes: [uninformed-search]
tags: [classical-ai, csp]
sources: [https://aima.cs.berkeley.edu/]
created: 2026-09-28T15:33:32.508Z
---

# CSPs and backtracking search

A constraint satisfaction problem is a set of variables, each with a domain, and
constraints on which combinations are allowed; backtracking search assigns one
variable at a time and undoes the last choice as soon as a constraint is
violated.

CS4263 covers CSP formulation (variables, domains, constraints) and backtracking
search, following AIMA's CSP chapter.

## Why it matters

In ordinary search a state is a black box. In a CSP the state has visible
structure (which variables are set, to what), and the goal is a set of explicit
constraints. That structure lets the solver notice a dead end the moment a
partial assignment breaks a constraint, instead of only at a leaf. Scheduling,
timetabling, map colouring, Sudoku and configuration problems all fit.

## The idea

**Formulation.**

- Variables X1 ... Xn.
- A domain Di of allowed values for each.
- Constraints, each naming the variables it involves (its scope) and the
  combinations allowed. Binary constraints involve two variables.

A **consistent** assignment breaks no constraint; a **complete** one gives every
variable a value; a **solution** is both.

**Backtracking search** is depth-first search specialised to CSPs:

1. Pick an unassigned variable.
2. Try a value from its domain that is consistent with the assignment so far.
3. Recurse. If the recursion fails, try the next value; if none is left, return
   failure so the caller backtracks.

Assigning one variable per level is valid because the order of assignments does
not change the final solution; this shrinks the tree enormously compared with
treating every (variable, value) choice as a separate branch.

**Ordering heuristics** make a large difference:

- *Minimum remaining values (MRV):* choose the variable with the fewest legal
  values left. It fails fast on the hardest part.
- *Degree heuristic:* break ties by the variable in the most constraints with
  unassigned variables.
- *Least constraining value:* try first the value that rules out the fewest
  choices for neighbours.

## Worked example

Colour a map of Australia's seven regions (WA, NT, SA, Q, NSW, V, T) with red,
green and blue so that neighbours differ. Variables: the regions; domains: the
three colours; constraints: adjacent regions differ. MRV and degree start with
SA, which borders five others. SA = red; WA = green; NT must differ from both, so
blue; Q differs from NT and SA, so green; NSW differs from Q and SA, so blue; V
differs from SA and NSW, so green; T is unconstrained. With good ordering no
backtracking is needed.

## Failure modes

- **Checking constraints only at complete assignments,** which is plain
  generate-and-test.
- **Fixed variable order** on hard problems, discovering dead ends late.
- **Encoding constraints procedurally** so the solver cannot see their scope.
- **Treating assignment order as meaningful,** multiplying the search tree.

## Prerequisites

Background: [[uninformed-search]] (backtracking is depth-first search on
partial assignments).

## Checks

```check
q: What are the three parts of a CSP formulation, and what counts as a solution?
a: Variables, a domain of values for each, and constraints on allowed combinations. A solution is an assignment that is complete (every variable has a value) and consistent (no constraint is violated).
why: Checks the formulation vocabulary.
```

```check
q: What does the minimum-remaining-values heuristic do, and why does it help?
a: It picks next the unassigned variable with the fewest legal values left, so the search hits likely failures early and prunes large parts of the tree before investing in them.
why: Checks the most important ordering heuristic and its rationale.
```

```check
q: In what way does backtracking search exploit the structure of a CSP that generic search cannot?
a: It checks constraints on partial assignments, so a violated constraint prunes the branch immediately instead of being discovered only at a complete assignment.
why: Checks why CSPs are treated separately from black-box search.
```
