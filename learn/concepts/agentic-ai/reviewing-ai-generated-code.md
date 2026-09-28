---
id: reviewing-ai-generated-code
title: Reviewing AI-generated code
summary: AI-generated code is fluent and plausible whether or not it is right, so review it by checking claims against the codebase and the requirement, spending attention where a plausible mistake would be costly.
requires: []
assumes: [assisted-vs-agentic-coding]
tags: [agentic-ai]
sources: [https://google.github.io/eng-practices/review/]
created: 2026-09-28T15:24:11.510Z
---

# Reviewing AI-generated code

AI-generated code is fluent and plausible whether or not it is right, so review
it by checking claims against the codebase and the requirement, spending
attention where a plausible mistake would be costly.

CS3227 frames this as "what to trust, what to re-check". Google's engineering
practices guide covers review in general; this note is about what changes when
the author is a model.

## Why it matters

Human code review evolved around human mistakes: a typo, a missed edge case, an
author who clearly did not understand the module. Those leave visible traces. A
model's mistakes often do not. Its code is well formatted, well named and
confidently commented even when it calls a function that does not exist or
solves a slightly different problem. Reviewing it with the usual cues ("this
looks careful, so it probably is") lets exactly those mistakes through.

## The idea

Separate what is cheap to trust from what must be re-checked.

**Usually safe to trust (and to leave to tools):** formatting, naming style,
boilerplate that compiles, code that tests and type checks already exercise.

**Re-check every time:**

1. **Does it solve the stated problem?** Read the requirement again, then the
   diff. Models often solve a nearby, easier problem.
2. **Do the things it references exist and behave as assumed?** APIs, config
   keys, library functions and versions. A hallucinated or misremembered API is
   the signature model mistake.
3. **Edge cases and error paths.** Empty input, concurrency, failure of the call
   it makes. Happy paths are usually fine; the rest is where gaps hide.
4. **Security-relevant code.** Input handling, auth checks, queries built from
   strings, secrets.
5. **Unrequested changes.** Deleted tests, loosened assertions, edits outside the
   task's scope.

Size the review to the risk and to how the code was produced. An agent's diff
over many files, made in many unreviewed steps, needs a slower review than a
three-line suggestion you watched appear.

## Worked example

An agent adds retry logic around a payment call. The code is tidy, has a
docstring, and the tests pass. On review: the retry wraps a call that is not
idempotent, so a timeout after the charge succeeded charges the customer twice.
The tests only mocked success and immediate failure. Nothing looked wrong; the
mistake was in an assumption, and it surfaced only by asking "what happens if
this call partly succeeds?"

## Failure modes

- **Trusting polish.** Clean style is not evidence of correctness in model
  output.
- **Reviewing only the diff.** Checking that referenced functions exist and do
  what the code assumes means opening the code around it.
- **Rubber-stamping large agent diffs,** because reading 40 files is tiring.
  Ask for smaller changes instead.
- **Missing weakened tests** that were edited to pass.

## Prerequisites

Background: [[assisted-vs-agentic-coding]] (why an agent's diff carries more
unreviewed steps than a suggestion).

## Checks

```check
q: Why are the usual human-review cues unreliable for AI-generated code?
a: Human mistakes leave visible traces like messy style or confusion, but model output is fluent and well formatted whether or not it is correct, so polish is no evidence of correctness.
why: Catches trusting code because it looks careful.
```

```check
q: Name three things to re-check in every AI-generated change, beyond what tests and linters cover.
a: Any three of: that it solves the stated problem rather than a nearby one; that referenced APIs, functions and config exist and behave as assumed; edge cases and error paths; security-relevant handling; unrequested changes such as deleted or loosened tests.
why: Checks recall of where model mistakes concentrate.
```

```check
q: An agent's retry wrapper around a payment call passes all tests. What question would expose the bug described in this note?
a: What happens if the call partly succeeds, for example times out after charging? Retrying a non-idempotent call can charge twice.
why: Tests reasoning about assumptions the tests did not exercise.
```
