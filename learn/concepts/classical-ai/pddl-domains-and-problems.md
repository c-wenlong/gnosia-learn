---
id: pddl-domains-and-problems
title: PDDL domains and problems
summary: PDDL, the Planning Domain Definition Language, splits a planning task into a domain file (types, predicates and action schemas, shared by every instance) and a problem file (the objects, initial state and goal of one instance), which any compliant planner can read.
requires: [strips-action-schemas]
tags: [classical-ai, planning]
sources: [https://planning.wiki/ref/pddl]
created: 2026-09-28T15:38:07.878Z
---

# PDDL domains and problems

PDDL, the Planning Domain Definition Language, splits a planning task into a
domain file (types, predicates and action schemas, shared by every instance) and
a problem file (the objects, initial state and goal of one instance), which any
compliant planner can read.

CS4263 covers PDDL basics: domains, problems and planner interfaces.
planning.wiki is the reference used.

## Why it matters

PDDL is the common input language of automated planning. It was introduced for
the first International Planning Competition in 1998, and planners such as Fast
Downward read it, so a domain written once can be run through many planners and
compared. Writing it well, and knowing what the planner can and cannot do with
it, is the practical skill of the module.

## The idea

**Domain file.** What the world is like, for every instance:

- `:requirements` declares the features used (`:strips`, `:typing`, and others
  such as negative preconditions or durative actions);
- `:types` and `:predicates` declare the vocabulary;
- each `:action` gives `:parameters`, a `:precondition` and an `:effect`, the
  [[strips-action-schemas]] written in Lisp-like syntax, with `(not ...)` for
  deleted facts.

**Problem file.** One instance:

- `:objects` names the things that exist, with their types;
- `:init` lists the true facts (closed world: anything not listed is false);
- `:goal` is the condition to reach.

The planner reads both and prints a plan: a sequence of ground actions.

```
(define (domain logistics)
  (:requirements :strips :typing)
  (:types plane airport)
  (:predicates (at ?p - plane ?a - airport))
  (:action fly
    :parameters (?p - plane ?from ?to - airport)
    :precondition (at ?p ?from)
    :effect (and (not (at ?p ?from)) (at ?p ?to))))

(define (problem fly-one)
  (:domain logistics)
  (:objects p1 - plane sin nrt - airport)
  (:init (at p1 sin))
  (:goal (at p1 nrt)))
```

A planner returns `(fly p1 sin nrt)`.

## Worked example

To add a second plane or ten more airports, only the problem file changes; the
domain is reused. To model fuel, the domain changes (a new predicate and a new
precondition on `fly`), and every problem file gets the benefit. That separation
is the point: the domain encodes how the world works, the problem encodes one
situation in it.

## Failure modes

- **Putting instance facts in the domain,** which then only fits one problem.
- **Using a feature the planner does not support,** often failing with an
  unhelpful parse error; declare `:requirements` honestly.
- **Missing delete effects,** giving plans that look valid and are physically
  impossible.
- **Under-constrained preconditions** that let the planner find "cheating" plans.

## Prerequisites

- [[strips-action-schemas]]

## Checks

```check
q: What goes in a PDDL domain file and what goes in a problem file?
a: The domain file holds requirements, types, predicates and action schemas, shared by all instances. The problem file holds one instance's objects, initial state and goal.
why: Checks the core separation.
```

```check
q: How does PDDL express that an action makes a fact false?
a: With (not ...) around the fact in the action's :effect, which acts as the delete list.
why: Checks the syntax for delete effects.
```

```check
q: You want to model a larger airport network without changing how flying works. Which file do you edit?
a: Only the problem file: add objects, initial facts and possibly a new goal. The domain stays the same.
why: Applies the separation to a practical change.
```
