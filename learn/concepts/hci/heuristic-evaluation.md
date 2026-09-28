---
id: heuristic-evaluation
title: Heuristic evaluation
summary: An expert review where 3 to 5 evaluators independently check an interface against usability heuristics, then merge and rate the problems by severity.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:32:01.948Z
---

# Heuristic evaluation

Heuristic evaluation is an expert review method: a small group of evaluators inspect an interface and list the places where it breaks a set of recognised usability principles, called heuristics. It needs no users, so it is quick and cheap. Jakob Nielsen and Rolf Molich introduced it in 1990, and Nielsen's list of ten heuristics is the one most people use.

## Why it matters

Testing with users takes recruiting and time. Heuristic evaluation can run in an afternoon on a sketch, prototype or live product, catching obvious problems before users trip over them.

Its limit: evaluators predict problems rather than observe them, so it misses issues that only appear when real people with real goals use the product.

## The idea

The process has four steps:

1. **Evaluate independently.** Each evaluator inspects the interface alone and notes every problem, with the heuristic it breaks. Working alone stops one person's view from steering the rest.
2. **Merge.** The findings are combined into one list, removing duplicates.
3. **Rate severity.** Each problem gets a severity rating. Nielsen's common scale runs from 0 (not a problem) through cosmetic, minor and major to 4 (catastrophe), judged on how often it occurs, how badly it hurts, and whether users can work around it.
4. **Report and fix** the most severe first.

Nielsen recommends three to five evaluators. One evaluator misses many problems that others would spot; beyond about five, each extra person adds little new.

Nielsen's ten heuristics, in brief: visibility of system status; match between the system and the real world; user control and freedom; consistency and standards; error prevention; [[recognition-over-recall]]; flexibility and efficiency of use; aesthetic and minimalist design; helping users recognise, diagnose and recover from errors; help and documentation.

CS2111 (Human-Centred Computing) places this under its Evaluating Usability module.

## Worked example

Three evaluators review a clinic's appointment booking page.

A notes that after pressing "Book", nothing changes for several seconds, so people press again (visibility of system status). B notes the date field accepts past dates and rejects them only at the end (error prevention). C notes the same action is called "Book" on one screen and "Reserve" on another (consistency and standards), and also spots the silent button.

Merged, the list has three problems. The team rates the silent button major (3), because double bookings follow; the past-date field minor (2); the naming cosmetic (1). They fix the silent button first.

## Failure modes

- **Evaluating as a group from the start.** Evaluators converge on the loudest opinion and find fewer problems.
- **Treating it as a replacement for user testing.** It misses problems rooted in users' goals, vocabulary and context.
- **False positives.** Evaluators flag things real users would never notice; severity ratings help filter them.
- **Unrated lists.** Fifty unranked findings do not say what to fix first.
- **Novice evaluators.** People who know neither the heuristics nor the domain find fewer real problems.

## Checks

```check
q: Why do evaluators in a heuristic evaluation work alone before their findings are merged?
a: Working independently stops one person's view from steering the others, so the group finds more distinct problems. Discussion comes after, when merging and rating.
why: Catches the assumption that a group walkthrough is equivalent to independent evaluation.
```

```check
q: A heuristic evaluation found no serious problems. Can the team skip usability testing with real users? Why?
a: No. Evaluators predict problems from principles, so they miss issues that only appear with real users' goals, vocabulary and context. The two methods find different problems.
why: Catches treating expert review as a substitute for observing users.
```

```check
q: A confirmation screen shows no progress for several seconds after a payment button is pressed. Which heuristic does this break?
a: Visibility of system status: the system should keep users informed about what is happening through timely feedback.
why: Catches filing a missing-feedback problem under error prevention just because its symptom is a user error.
```
