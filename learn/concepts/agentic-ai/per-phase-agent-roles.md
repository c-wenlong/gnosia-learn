---
id: per-phase-agent-roles
title: Per-phase agent roles
summary: An agent used in a lifecycle phase is defined by a role contract (its instructions, tools, permissions, inputs and outputs), and giving each phase its own role keeps the checks between phases independent.
requires: []
assumes: [agent-touchpoints-in-the-sdlc]
tags: [agentic-ai]
sources: [https://microsoft.github.io/autogen/]
created: 2026-09-28T15:23:28.569Z
---

# Per-phase agent roles

An agent used in a lifecycle phase is defined by a role contract (its
instructions, tools, permissions, inputs and outputs), and giving each phase its
own role keeps the checks between phases independent.

CS3227 covers this as agent-assisted design, implementation, testing and
maintenance, one role per phase.

## Why it matters

"Use an agent for testing" says nothing about what that agent sees, what it may
touch, or what it hands back. Writing the role down is what turns a general model
into a component you can reason about, and it is what lets several agents work on
one project without each one quietly redoing, or undoing, the others' work.

## The idea

A role is a contract with five parts:

| Part | Example for a test-writing role |
| --- | --- |
| Instructions | "Write tests for the behaviour in this spec." |
| Inputs | The spec and the public interface, not the implementation |
| Tools | Read files, create files under `tests/`, run the test runner |
| Permissions | No edits outside `tests/`; no network |
| Output | A set of test files and a short report of what they cover |

Typical roles by phase:

- **Design:** drafts options and trade-offs from requirements; outputs a document
  for a person to decide on.
- **Implement:** writes code against a ticket and its tests; outputs a diff.
- **Test:** writes or extends tests from the spec; outputs tests.
- **Maintain:** triages issues, reproduces bugs, bumps dependencies; outputs a
  reproduction or a small fix.

The design choice that matters most is the **inputs**. A test role that reads the
spec rather than the code produces tests that can disagree with the code, which
is the whole point of a test. A test role that reads the implementation tends to
write tests that confirm whatever the code already does, bugs included.

## Worked example

A team wires two roles into a ticket flow. The implementer gets the ticket and
the repository and outputs a branch. The tester gets the ticket and the module's
public interface only, and outputs tests. The CI run of the tester's tests against
the implementer's branch is now an independent check: when it fails, one of the
two misread the ticket, and a person looks at which.

## Failure modes

- **Roles that differ only in the prompt.** Same inputs and same tools means the
  "tester" shares every blind spot of the "implementer".
- **Unwritten outputs.** Without a defined output, the next phase cannot tell a
  finished handoff from a partial one.
- **Role creep.** An implementer allowed to edit tests can make failures go away
  by changing the test.

## Prerequisites

Background: [[agent-touchpoints-in-the-sdlc]] (which phases suit an agent at
all).

## Checks

```check
q: Name the parts of a role contract for an agent working in one lifecycle phase.
a: Its instructions, its inputs, its tools, its permissions, and the output it hands to the next phase.
why: Checks the learner can define a role concretely rather than as a job title.
```

```check
q: Why should a test-writing agent be given the spec rather than the implementation?
a: Tests written from the spec can disagree with the code and so catch bugs; tests written from the code tend to confirm what the code already does, bugs included, so they stop being an independent check.
why: Targets the single most consequential design choice in the role.
```

```check
q: Two agents have different prompts ("you are the implementer", "you are the tester") but the same inputs and tools. What is lost?
a: Independence. They share the same information and the same blind spots, so the tester is unlikely to catch what the implementer got wrong.
why: Catches the belief that a role is just a persona in the prompt.
```
