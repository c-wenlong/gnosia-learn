---
id: dialogue-state-tracking
title: Dialogue state tracking and flow design
summary: The dialogue state is the system's running belief about what the user wants so far, updated every turn from the NLU output, and the flow design is the policy that picks the next system action from that state, whether written as a state machine or a more flexible graph.
requires: [intent-classification-and-slot-filling]
tags: [hci, dialogue]
sources: [https://rasa.com/docs/]
created: 2026-09-28T15:28:00.883Z
---

# Dialogue state tracking and flow design

The dialogue state is the system's running belief about what the user wants so
far, updated every turn from the NLU output, and the flow design is the policy
that picks the next system action from that state, whether written as a state
machine or a more flexible graph.

CS3249 covers this as dialogue state tracking and flow design, with state
machines and conversation graphs as the two ways to write the flow.

## Why it matters

A single turn rarely contains everything. Users give information over several
turns, change their minds, and answer questions out of order. Without a state
that accumulates and revises what has been said, each turn is interpreted alone
and the system keeps asking for things it was already told.

## The idea

A classic task-oriented pipeline has four stages per turn:

1. **NLU:** intent and slot values from the user's words.
2. **State tracking:** merge them into the dialogue state.
3. **Policy:** choose the next system action from the state (ask for a slot,
   confirm, execute, clarify).
4. **Generation:** turn that action into words.

**The state** holds at least the active intent and each slot's value, often with
confidences, plus what the system last asked. Tracking is more than
overwriting: "Actually, make it Saturday" must replace the date, "and my wife
too" must add a passenger, and "no" must be read against what the system just
asked. Tracking across turns, including corrections, is a research problem in its
own right (MultiWOZ is a standard benchmark).

**Flow design** writes the policy.

- A **finite state machine** lists states ("ask date", "ask time", "confirm")
  and transitions between them. It is predictable and easy to test, but rigid:
  users must follow its order, and each new path multiplies states.
- A **frame- or graph-based flow** decides from the state rather than from a
  fixed position: ask for whichever required slot is empty, allow jumps and
  digressions, return to the task after. More flexible, and harder to test
  exhaustively.

Tools mix the two: Rasa, for example, combines rules and learned policies with
forms that fill slots.

## Worked example

Turn 1: "Table for 2 on Friday." State: intent reserve, party 2, date Friday.
Policy: ask time.
Turn 2: "Actually make it 4 people, at 7." Tracking replaces party with 4 and
fills time 19:00. A rigid state machine sitting in "ask time" might take 7 and
miss the correction to the party size; a state-based policy sees both updates and
moves to confirm.

## Failure modes

- **Overwrite-only tracking** that misses corrections and additions.
- **Reading "yes" or "no" without the question it answers.**
- **State machines that explode** as paths are added, or trap users on one path.
- **No way back:** once a slot is set, the user cannot change it.

## Prerequisites

- [[intent-classification-and-slot-filling]] (the per-turn input the tracker
  merges)

## Checks

```check
q: Name the four stages of a classic task-oriented dialogue pipeline, and which one this note is about.
a: NLU, dialogue state tracking, dialogue policy, and response generation. This note covers state tracking and the policy (flow design).
why: Places state tracking in the pipeline.
```

```check
q: Why is dialogue state tracking more than overwriting slots with the latest values?
a: Users correct earlier values, add to them, and give answers ("no", "the second one") that only make sense relative to what the system last asked, so the tracker must interpret updates against the existing state and the dialogue context.
why: Catches a naive view of state.
```

```check
q: Compare a finite state machine flow with a frame-based flow in one trade-off each.
a: A state machine is predictable and easy to test but rigid, forcing a fixed order and growing quickly with new paths. A frame-based flow decides from the state and lets users give information in any order, but is harder to test exhaustively.
why: Checks the core flow design trade-off.
```
