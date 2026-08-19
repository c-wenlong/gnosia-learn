---
title: ReAct agents
date: 2026-08-19T17:37:07.000Z
goal: react-loop
type: learning-session
---

# ReAct agents

> Live log. The tutor appends here as the session runs.
## What happened

Five probe questions, five correct. Nothing was taught: the probe found no
gap to teach into, so the session stopped rather than manufacturing a lesson.

## Defects this run found

1. Over-declared prerequisite. `tool-calling` required `transformer-block`,
   which forced a nine-concept march through transformer internals before
   ReAct could be taught. The learner caught it before the system did.
   Fixed: that edge is removed, and the plan went from 11 steps to 2.

2. No downward propagation of mastery. Answering a dependent correctly does
   not raise belief in its prerequisites, so `react-loop` reached 97%
   mastered while `tool-calling` still read 60% shaky. The skill instructs
   this inference; the code does not implement it.

3. Cold-start probe ranking is uninformative. With nothing observed, every
   concept has identical information gain (0.296 bits) and the tiebreak is
   fewest-prerequisites-first, which points at the bottom of the graph.
   The skill says start near the goal, so the CLI ordering had to be
   overridden by hand.

4. No `concept edit` command. Changing a prerequisite meant editing
   frontmatter directly, since `concept add --force` would discard the body.

## Self-assessment

Coverage: the goal concept was reached, but only because there was no gap.
Restraint: held. No answers were revealed during probing, and no lesson was
invented once the probe came back clean.
Understanding: demonstrated, not assumed. Five questions across three angles
(contrastive, mechanical, failure-mode), all answered without hints.

## Close

- Questions answered: 5 (5 correct)
- Concepts touched: 2
  - [[react-loop]] →  97% mastered
  - [[tool-calling]] →  87% solid

Closed 2026-08-19T17:44:39.897Z

## Defect 5, found by the learner after the session closed

Every one of the seven questions put the correct answer in option 1. Position
alone predicted it, so "always pick the first option" would have scored the
same five out of five. The session measured pattern-matching, not understanding.

SKILL.md had no rule about answer position at all, which is the root cause.

Actions taken:
- SKILL.md now requires varying the slot deliberately and forbids the correct
  option being the longest or most technical.
- Added `learn void`, which retracts a session's evidence without deleting it:
  the observations stay in events.jsonl, and `model --rebuild` skips them.
- This session's five observations are voided. react-loop and tool-calling are
  back to 25% with zero observations.

The checks written during the session are kept. The questions themselves were
sound; only the option ordering was broken.

