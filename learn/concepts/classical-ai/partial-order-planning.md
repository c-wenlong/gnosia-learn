---
id: partial-order-planning
title: Partial-order planning
summary: A partial-order planner commits only to the orderings between actions that it must, recording why each action is there with causal links and resolving any action that threatens a link by ordering it before or after, so one partial plan stands for many total orders.
requires: [strips-action-schemas]
tags: [classical-ai, planning]
sources: [https://planning.wiki/ref/pddl]
created: 2026-09-28T15:38:11.772Z
---

# Partial-order planning

A partial-order planner commits only to the orderings between actions that it
must, recording why each action is there with causal links and resolving any
action that threatens a link by ordering it before or after, so one partial plan
stands for many total orders.

CS4263 surveys partial-order plans alongside hierarchical planning
([[hierarchical-task-networks]]).

## Why it matters

A forward planner builds a plan as a fixed sequence, even when the order of many
steps does not matter. That over-commitment inflates the search and hides
structure. Partial-order plans show which steps are independent, which is what
you need for parallel execution, for explaining a plan, and for repairing it when
one step changes.

## The idea

A partial-order plan has four parts:

1. **Actions,** including a Start action whose effects are the initial state and
   a Finish action whose preconditions are the goal.
2. **Ordering constraints** A < B: A must happen before B (not necessarily
   immediately).
3. **Causal links** A to B labelled p: A achieves precondition p of B, and p
   must stay true between them.
4. **Open preconditions:** preconditions not yet achieved by any causal link.

The planner repeatedly picks an open precondition, chooses an action (new or
already in the plan) that achieves it, and adds the causal link and ordering.

A **threat** is an action C that could delete p between A and B. Resolve it by
**demotion** (C < A) or **promotion** (B < C). If neither is consistent,
backtrack.

The plan is complete when there are no open preconditions and no unresolved
threats. Any total order consistent with the constraints (a linearisation) is a
valid plan. This is the **least commitment** principle.

Partial-order planning was the dominant approach through the early 1990s; faster
forward-search planners with strong heuristics later overtook it for raw speed,
but its representation is still used where plan structure matters.

## Worked example

Goal: RightShoeOn ∧ LeftShoeOn. Actions: RightSock, RightShoe (needs
RightSockOn), LeftSock, LeftShoe (needs LeftSockOn).

The partial-order plan has just two constraints: RightSock < RightShoe and
LeftSock < LeftShoe. Nothing orders the left side relative to the right. This one
plan stands for 6 total orders (choose which 2 of the 4 positions go to the left
foot's actions), all valid.

## Failure modes

- **Ignoring threats,** so an action undoes a condition another step relies on.
- **Adding unnecessary orderings,** losing the flexibility the approach exists
  for.
- **Confusing ordering with adjacency:** A < B allows other actions in between.
- **Expecting it to be the fastest planner:** modern heuristic forward search
  usually is.

## Prerequisites

- [[strips-action-schemas]]

## Checks

```check
q: What are the four components of a partial-order plan?
a: A set of actions (including Start and Finish), ordering constraints, causal links recording which action achieves which precondition of which other action, and the open preconditions not yet achieved.
why: Checks the structure.
```

```check
q: What is a threat to a causal link, and how is it resolved?
a: An action that could delete the linked condition p while it must hold between the producer A and consumer B. It is resolved by demotion (ordering it before A) or promotion (ordering it after B); if neither is consistent, the planner backtracks.
why: Checks the central correctness mechanism.
```

```check
q: The shoes-and-socks plan has only the constraints RightSock < RightShoe and LeftSock < LeftShoe. How many valid total orders does it represent?
a: Six: choose which two of the four positions the left-foot actions take, each pair already internally ordered.
why: Tests the least-commitment idea with a count.
```
