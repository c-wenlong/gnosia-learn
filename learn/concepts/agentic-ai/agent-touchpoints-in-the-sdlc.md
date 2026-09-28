---
id: agent-touchpoints-in-the-sdlc
title: Where agents sit in the software lifecycle
summary: Agents help most where the work is well specified and the result can be checked cheaply, which today means implementation, tests and maintenance more than open-ended design.
requires: [assisted-vs-agentic-coding]
tags: [agentic-ai]
sources: [https://github.blog/ai-and-ml/github-copilot/]
created: 2026-09-28T15:21:55.533Z
---

# Where agents sit in the software lifecycle

Agents help most where the work is well specified and the result can be checked
cheaply, which today means implementation, tests and maintenance more than
open-ended design.

CS3227 frames this as the touchpoints between an agent and each lifecycle
phase: design, implement, test, maintain.

## Why it matters

"Use AI for software engineering" is too vague to act on. Deciding where an
agent goes in a team's process needs a rule for which tasks it is suited to,
and the lifecycle phases give a map to hang that rule on.

## The idea

Two properties of a task predict how well an agent does it:

1. **How well the goal is specified.** "Make this failing test pass" is sharp.
   "Design the data model for our new product" depends on context the agent
   does not have: users, constraints, what the team argued about last month.
2. **How cheap it is to check the result.** Code that compiles and passes tests
   gives the agent (and you) a fast, automatic signal. A design document has no
   test suite; judging it takes an expert's time.

Mapped onto the phases:

| Phase | Typical agent touchpoint | Spec | Check |
| --- | --- | --- | --- |
| Design | drafting options, summarising trade-offs | vague | expensive |
| Implement | writing code against a clear ticket | sharp | cheap (build, tests) |
| Test | generating test cases, raising coverage | sharp | medium (tests can be wrong too) |
| Maintain | dependency bumps, migrations, bug fixes with a reproduction | sharp | cheap |

So the practical placement today leans toward the right-hand columns being
sharp and cheap. Design still benefits from an agent as a drafting partner, but
with a person deciding.

This is a snapshot, not a law. As tools gain better context (repository
search, issue history) the "spec" column improves, and the placement moves.

## Worked example

A team adopts an agent. Good first uses: upgrading a library across the repo
(sharp goal, the build and tests say whether it worked), or turning bug reports
that include a reproduction into fixes. A poor first use: "rearchitect the
payment service", where the goal is contested and the only check is a senior
engineer's judgement.

## Failure modes

- **Placing agents by excitement rather than by checkability.** The flashiest
  demo is often in the phase that is hardest to verify.
- **Forgetting that generated tests can be wrong.** An agent that writes both
  the code and the tests can make them agree with each other and with the bug.
- **Treating the map as fixed.** Revisit it as tooling and context change.

## Prerequisites

- [[assisted-vs-agentic-coding]]

## Checks

```check
q: Name the two properties of a task that best predict whether an agent will do it well.
a: How sharply the goal is specified, and how cheaply the result can be checked (for example by a build and a test suite).
why: Checks the learner has a rule for placement rather than a list of phases.
```

```check
q: Why is a dependency upgrade across a repository a better first task for an agent than designing a new service?
a: The upgrade has a sharp goal and an automatic check (it builds and the tests pass or they do not). The design has a contested goal that depends on context the agent lacks, and judging it needs an expert's time.
why: Applies both properties to a concrete choice.
```

```check
q: What goes wrong when the same agent writes both the implementation and its tests?
a: The two can agree with each other while both encode the same misunderstanding, so passing tests stop being independent evidence the code is right.
why: Catches the assumption that "tests pass" is always a cheap, trustworthy check.
```
