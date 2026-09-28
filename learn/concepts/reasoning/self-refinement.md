---
id: self-refinement
title: Self-critique and refinement loops
summary: A refinement loop has a model generate an answer, critique it, and revise it, repeating until a stop condition. It pays off when the critique is grounded in an external signal such as failing tests, tool output or a verifier; asked only to "check your answer", models often fail to find their reasoning errors and can talk themselves out of right answers.
requires: [chain-of-thought-prompting]
tags: [agentic-ai, reasoning]
sources: []
created: 2026-09-28T15:42:32.944Z
---

# Self-critique and refinement loops

A refinement loop has a model generate an answer, critique it, and revise it, repeating until a stop condition. It pays off when the critique is grounded in an external signal such as failing tests, tool output or a verifier; asked only to "check your answer", models often fail to find their reasoning errors and can talk themselves out of right answers.

## Why it matters

In CP4284 this is module 4's self-critique topic and the "reflect" step of the capstone agent. The loop is cheap to build; whether it helps depends on where the feedback comes from.

## The idea

Self-Refine (Madaan et al. 2023) uses one model in three roles: produce an output, write feedback on it, rewrite it using the feedback. No training is involved; it improved tasks such as dialogue responses and code optimisation.

Reflexion (Shinn et al. 2023) adds memory and outside signal. An agent attempts a task, receives a result from the environment (unit test output, success or failure), writes a short verbal reflection on what went wrong, and stores it. The next attempt is conditioned on the stored reflections. It reported 91% pass@1 on HumanEval, against 80% for GPT-4 at the time.

Huang et al. ("Large Language Models Cannot Self-Correct Reasoning Yet", ICLR 2024) tested intrinsic self-correction: the model reviews its own reasoning with no external feedback. Models struggled to fix their own reasoning errors, and accuracy sometimes fell after self-correction as correct answers were changed to wrong ones. They also argued that some earlier reported gains relied on ground-truth labels to decide when to stop, which leaks the answer.

| Feedback source | Example | Tends to help? |
|---|---|---|
| Intrinsic | "Review your answer for errors" | often not, for reasoning |
| Grounded | test failures, a compiler error, a search result | yes, when the signal is reliable |

## Worked example

Task: write `is_leap(year)`. First draft: `return year % 4 == 0`.

**Ungrounded loop.** Prompt: "Check your answer." The model rereads a short, plausible function, finds nothing specific, and returns it unchanged or reworded.

**Grounded loop.** Run the tests. `is_leap(1900)` expected `False`, got `True`. That failure goes into the next prompt, and the model revises to

`return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)`.

Now 1900 gives `False` (divisible by 100, not by 400) and 2000 gives `True` (divisible by 400). The tests pass and the loop stops. The test gave the critique a specific fact to act on.

## Failure modes

- **Flipping right answers.** Without outside evidence, a critique step invites change for its own sake.
- **Agreeing with a wrong critique.** The reviser accepts a mistaken piece of feedback and breaks a correct answer.
- **No stop condition.** The loop oscillates between versions and burns tokens; cap the iterations.
- **Fixing the symptom.** The revision special-cases the failing test input instead of fixing the logic.

## Prerequisites

- [[chain-of-thought-prompting]]

## Checks

```check
q: Two refinement loops fix a buggy function: one prompts 'check your answer', the other feeds back a failing unit test. Which is more likely to fix the bug, and why?
a: The one fed the failing test, because it gives the model a specific external fact about what is wrong; an ungrounded critique relies on the model spotting an error it already missed when writing the code.
why: Catches assuming a model can reliably find its own reasoning errors without outside feedback.
```

```check
q: What does Reflexion store between attempts, and what signal triggers it?
a: It stores short verbal reflections on what went wrong, in a memory the next attempt is conditioned on, triggered by an external result such as failing unit tests or task failure.
why: Catches thinking Reflexion updates model weights or relies on pure self-review.
```

```check
q: Why can intrinsic self-correction lower accuracy on reasoning tasks instead of just failing to raise it?
a: A critique step invites the model to change answers, and without external evidence it changes some correct answers to wrong ones, which can outweigh the wrong answers it fixes.
why: Catches the assumption that an extra review pass can only help or do nothing.
```
