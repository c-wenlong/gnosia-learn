---
id: hierarchical-task-analysis
title: Hierarchical task analysis
summary: HTA breaks a goal into numbered subtasks, with plans giving their order and conditions, and a stopping rule for when to stop decomposing.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:31:26.961Z
---

# Hierarchical task analysis

Hierarchical task analysis (HTA) breaks a user's goal into subtasks, and those into smaller subtasks, until each step is simple enough to reason about. Each level carries a plan saying in what order and under what conditions its subtasks are done. The result shows exactly what a person must do to reach a goal with a given design.

## Why it matters

Designers think in features; users think in goals. Writing out every step between a goal and its completion exposes steps that add nothing for the user, places where users must remember or decide something, and points where errors are likely.

## The idea

HTA was developed by John Annett and Keith Duncan in the late 1960s, originally for designing training. The notation is simple:

- the top goal is numbered 0
- its subtasks are numbered 1, 2, 3, and their children 1.1, 1.2 and so on
- each parent has a plan, such as "Plan 0: do 1, then 2; if the card is rejected, do 3; then 4"

The plans carry the real logic. A plan can be a fixed sequence, a choice, a repeat until some condition holds, or "in any order".

A stopping rule decides when to stop breaking steps down. A practical rule is to stop when a step is routine for the user, or when splitting it further would change no design decision. The classic HTA literature also weighs how likely a step is to fail against the cost of that failure, and leaves unlikely, cheap failures alone.

Counting the bottom-level steps for the same goal gives a rough way to compare two designs.

CS2111 (Human-Centred Computing) places this under its Understanding Users module.

## Worked example

Goal: withdraw cash from an ATM.

- 0 Withdraw cash
  - 1 Insert card
  - 2 Enter PIN
  - 3 Select withdrawal
    - 3.1 Choose account
    - 3.2 Choose amount
  - 4 Take card
  - 5 Take cash

Plan 0: do 1 to 5 in order. Plan 3: do 3.1, then 3.2.

The plan's order is a design decision. If the machine gave out cash before the card, users who had reached their goal could walk away and leave the card behind. Returning the card first puts the goal step last. The analysis also shows that 3.1 is pointless for a customer with only one account, so a design could skip it for them.

## Failure modes

- **Decomposing forever.** With no stopping rule, the tree grows to hundreds of trivial steps that bury the interesting ones.
- **Missing plans.** Subtasks listed with no order or conditions, which drops the error-prone branches such as a rejected card or wrong PIN.
- **Only the happy path.** Recording what an ideal expert does. Base the analysis on observed users where possible.
- **Features posing as goals.** Starting from "use the filter panel" instead of the user's real goal, which bakes the current design into the analysis.

## Checks

```check
q: In an HTA of using an ATM, why does it matter whether 'take cash' comes before or after 'take card'?
a: If cash comes first, users reach their goal and may leave before the card is returned. Returning the card first puts the goal step last and prevents that error.
why: Catches treating the plan as bookkeeping instead of the part that reveals error risks.
```

```check
q: What does a plan in hierarchical task analysis specify that the list of subtasks does not?
a: The order and conditions under which subtasks are done, such as sequences, choices, repeats and branches like 'if the card is rejected, do 3'. Without plans the hierarchy lists steps but not how they fit together.
why: Catches confusing HTA with a plain bulleted breakdown of steps.
```

```check
q: Why does hierarchical task analysis need a stopping rule?
a: Any step can be broken down further, so without a rule the analysis grows endlessly. Stopping when a step is routine for the user, or when failure there is unlikely and cheap, keeps attention on steps that affect design.
why: Catches the belief that a more detailed analysis is always a better one.
```
