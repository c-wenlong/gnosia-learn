---
id: automated-checks-as-a-safety-net
title: Automated checks as a safety net
summary: Linters, type checkers and tests catch whole classes of AI mistakes mechanically and on every change, which frees human review for what no tool can check, as long as you remember each tool only sees what it was built to see.
requires: [reviewing-ai-generated-code]
tags: [agentic-ai, testing]
sources: [https://google.github.io/eng-practices/review/]
created: 2026-09-28T15:24:13.874Z
---

# Automated checks as a safety net

Linters, type checkers and tests catch whole classes of AI mistakes mechanically
and on every change, which frees human review for what no tool can check, as
long as you remember each tool only sees what it was built to see.

CS3227 lists the net as static and dynamic analysis: linters, typechecks, tests.

## Why it matters

Agents produce more code, faster, than people can read closely. If every
mistake must be caught by a human reader, review becomes the bottleneck and then
the weak point. Automated checks are cheap to run on every change, never get
tired, and give an agent a signal it can act on by itself before a person looks.

## The idea

Two families, catching different things:

- **Static analysis** reads the code without running it.
  - *Type checking* catches calls to functions that do not exist, wrong argument
    types and misspelled fields, which is exactly the hallucinated-API mistake
    models make.
  - *Linters* catch unused variables, unreachable code, suspicious patterns and
    some security smells (string-built SQL, for example).
- **Dynamic analysis** runs the code.
  - *Tests* check behaviour on chosen inputs.
  - *Sanitisers, fuzzers and coverage* extend that to memory errors, unexpected
    inputs, and showing which lines no test touched.

Put them in the agent's own loop (it runs them and fixes failures before
reporting) and again in CI (so nothing merges without them).

The limits matter as much as the strengths. A type checker cannot tell you the
code solves the wrong problem. A test suite checks only the cases someone wrote.
And an agent that may edit the tests can make a failing check pass by weakening
the check. So protect the checks themselves: flag diffs that touch tests or
config, and do not let the agent disable a rule to get green.

## Worked example

An agent adds a function that calls `client.fetch_all(limit=100)`. The library
has no `fetch_all`; it has `list(page_size=...)`. With a type checker in CI the
change fails in seconds, the agent reads the error, and fixes it before anyone
reviews. Without one, the call looks plausible in review and fails in
production the first time that path runs.

## Failure modes

- **Green means correct.** Passing checks show the absence of the mistakes those
  checks look for, nothing more.
- **Letting the agent edit the net.** A deleted assertion or a new
  `# type: ignore` turns a failure into a pass.
- **Low coverage on the changed code.** A test suite that never runs the new
  path gives no signal about it.
- **Checks only in CI.** The agent then learns about failures late and in bulk.

## Prerequisites

- [[reviewing-ai-generated-code]] (what human review still has to do)

## Checks

```check
q: Which kind of model mistake does a type checker catch especially well, and why does that matter for AI-generated code?
a: Calls to functions, methods or fields that do not exist or take different arguments. Hallucinated or misremembered APIs are a signature model mistake, and they look plausible to a human reader.
why: Links a specific tool to a specific failure mode.
```

```check
q: All checks pass on an agent's change. What can you conclude, and what can you not?
a: You can conclude the change is free of the mistakes those checks look for on the cases they exercise. You cannot conclude it solves the right problem, handles untested inputs, or that the checks themselves were not weakened.
why: Catches treating green as proof of correctness.
```

```check
q: How can an agent make a failing check pass without fixing the code, and how do you guard against it?
a: By editing the check: deleting or loosening a test assertion, or suppressing a lint or type error. Guard by flagging diffs that touch tests or check configuration and not permitting the agent to disable rules.
why: Targets protecting the net itself.
```
