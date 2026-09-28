---
id: strips-action-schemas
title: STRIPS action schemas
summary: Classical planning describes a state as a set of true facts and each action as a schema with a precondition and an effect that adds and deletes facts, so everything the action does not mention is assumed to stay the same.
requires: []
assumes: [search-problem-formulation]
tags: [classical-ai, planning]
sources: [https://planning.wiki/ref/pddl]
created: 2026-09-28T15:37:59.674Z
---

# STRIPS action schemas

Classical planning describes a state as a set of true facts and each action as a
schema with a precondition and an effect that adds and deletes facts, so
everything the action does not mention is assumed to stay the same.

CS4263 covers STRIPS-style planning with action schemas; the representation
comes from the STRIPS planner built for the Shakey robot around 1971.

## Why it matters

A search problem written as black-box functions (ACTIONS, RESULT) hides its
structure, so each new domain needs new code and a new heuristic. Writing actions
declaratively lets one general planner work across domains and compute
domain-independent heuristics from the action descriptions themselves. It also
sidesteps the frame problem: nothing has to be said about what an action leaves
unchanged.

## The idea

**States** are sets of ground atoms (facts with no variables), such as
At(P1, SFO). Under the closed-world assumption, any atom not listed is false.

**Action schemas** describe a family of actions with variables:

```
Action: Fly(p, from, to)
  Precondition: At(p, from) ∧ Plane(p) ∧ Airport(from) ∧ Airport(to)
  Effect:       ¬At(p, from) ∧ At(p, to)
```

- The **precondition** must hold in the current state for the action to apply.
- The **effect** splits into an add list (At(p, to)) and a delete list
  (At(p, from)).
- **Result:** new state = (old state minus delete list) plus add list.
  Everything else carries over untouched.

A ground action instantiates the variables with objects, for example
Fly(P1, SFO, JFK).

**Goals** are conjunctions of atoms, and any state containing them is a goal
state.

**Search.** Planning is then search in this space, forward from the initial state
(progression) or backward from the goal (regression, considering only actions
that achieve part of the goal). Both need good heuristics, which the declarative
form makes possible, for example by ignoring delete lists to get a relaxed
problem.

## Worked example

Initial state: At(C1, SFO), At(P1, SFO), Plane(P1), Cargo(C1), Airport(SFO),
Airport(JFK). Goal: At(C1, JFK).

With Load(c, p, a), Fly(p, from, to) and Unload(c, p, a) defined as schemas, the
plan is Load(C1, P1, SFO), Fly(P1, SFO, JFK), Unload(C1, P1, JFK). After
Load, In(C1, P1) is added and At(C1, SFO) deleted; after Fly, only the plane's
location changes; after Unload, At(C1, JFK) is added. Airport and Plane facts
were never mentioned and never needed restating.

## Failure modes

- **Forgetting the delete list,** so a plane is at two airports at once.
- **Preconditions that are too weak,** allowing impossible actions.
- **Assuming open-world semantics** when the representation is closed-world.
- **Expecting STRIPS to express everything:** time, resources and uncertainty
  need extensions.

## Prerequisites

Background: [[search-problem-formulation]] (planning is search with a structured
state and action description).

## Checks

```check
q: How does a STRIPS action change a state?
a: If its precondition holds, the new state is the old state with the delete list removed and the add list added; every other fact carries over unchanged.
why: Checks the state-update rule.
```

```check
q: How does the STRIPS representation avoid the frame problem?
a: Facts not mentioned in an action's effect are assumed unchanged, so no axioms are needed to state what each action leaves alone.
why: Links the representation to a limit of logic.
```

```check
q: What is gained by describing actions declaratively rather than as black-box successor functions?
a: One general planner can solve any domain written this way, and it can compute domain-independent heuristics (for example by relaxing the problem) from the action descriptions themselves.
why: Checks why planning uses its own representation.
```
