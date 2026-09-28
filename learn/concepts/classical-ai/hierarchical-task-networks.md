---
id: hierarchical-task-networks
title: Hierarchical task network planning
summary: HTN planning starts from high-level tasks and repeatedly refines them into subtasks using methods that encode known ways of doing things, until only primitive actions remain, which puts expert knowledge into the planner and keeps search manageable on large problems.
requires: []
assumes: [strips-action-schemas]
tags: [classical-ai, planning]
sources: [https://planning.wiki/ref/pddl]
created: 2026-09-28T15:38:15.668Z
---

# Hierarchical task network planning

HTN planning starts from high-level tasks and repeatedly refines them into
subtasks using methods that encode known ways of doing things, until only
primitive actions remain, which puts expert knowledge into the planner and keeps
search manageable on large problems.

CS4263 surveys HTN planning next to [[partial-order-planning]].

## Why it matters

Planning from primitive actions alone scales badly: a plan of hundreds of steps
is a needle in an enormous space. People plan top down ("travel to the
conference" before "book the taxi"), and HTN planning does the same. It is widely
used in practice, in logistics and game AI, because
it lets domain experts say how tasks are normally done.

## The idea

- **Primitive tasks** are ordinary actions with preconditions and effects, as in
  [[strips-action-schemas]].
- **Compound (high-level) tasks** name something to be done, such as
  Travel(home, conference).
- **Methods** describe ways to accomplish a compound task: a precondition saying
  when the method applies, and a network of subtasks (often ordered) that
  achieve it.

The planner starts with a task network (the goal tasks), picks a compound task,
chooses an applicable method, and replaces the task with the method's subtasks.
It repeats until every task is primitive and the resulting sequence is
executable. If a choice fails, it backtracks to another method.

What the planner searches is the space of **decompositions**, not the space of
states, and the methods rule out whole families of silly plans. The price is that
the planner only finds plans the methods allow: if no method describes a way of
doing something, the planner will not discover it.

HTN planning in its most general form is more expressive than classical
planning, and general HTN plan existence is undecidable; practical systems such
as SHOP2 restrict the form (for example, totally ordered subtasks) to stay
efficient.

## Worked example

Task: Travel(home, conference).

- Method by-plane (applies if the distance is large): subtasks
  Travel(home, airport), Fly(airport, destination-airport),
  Travel(destination-airport, conference).
- Method by-taxi (applies if the distance is short): subtask
  Taxi(home, conference).

The distance is large, so by-plane is chosen. Travel(home, airport) is itself
compound and decomposes by-taxi into Taxi(home, airport), which is primitive.
The final plan is taxi, fly, taxi, found without ever considering walking to
another city.

## Failure modes

- **Missing methods,** so valid plans exist that the planner cannot find.
- **Methods that encode a bad procedure,** which the planner then follows
  faithfully.
- **Treating HTN as domain-independent:** most of its power is the knowledge in
  the methods.
- **Unbounded recursive methods** that decompose forever.

## Prerequisites

Background: [[strips-action-schemas]] (the primitive actions HTN plans end in).

## Checks

```check
q: What is a method in HTN planning?
a: A known way to accomplish a compound task: a precondition for when it applies and a network of subtasks that achieve the task.
why: Checks the central construct.
```

```check
q: How does HTN planning trade completeness for efficiency?
a: It searches only decompositions allowed by the methods, which prunes huge numbers of useless plans, but it cannot find a plan that no method describes.
why: Checks the core trade-off.
```

```check
q: Why is HTN planning popular in practical systems such as logistics and game AI?
a: It lets domain experts encode how tasks are normally done, which keeps planning fast on large problems and produces plans that follow familiar procedures.
why: Checks the practical motivation.
```
