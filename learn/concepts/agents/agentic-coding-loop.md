---
id: agentic-coding-loop
title: The agentic coding loop
summary: "An agentic coding system edits a real repository through tools: it searches and reads files, applies targeted edits, runs tests and commands, reads the output, and repeats until the tests pass. It is a ReAct loop specialised to code, with the test suite as the reward signal."
requires: [react-loop, execution-guided-code-generation]
tags: [agentic-ai]
sources: []
created: 2026-09-28T15:42:48.785Z
---

# The agentic coding loop

An agentic coding system edits a real repository through tools: it searches and reads files, applies targeted edits, runs tests and commands, reads the output, and repeats until the tests pass. It is a ReAct loop specialised to code, with the test suite as the reward signal.

## Why it matters

Real coding tasks mean finding the right file among thousands, changing a few lines without breaking the rest, and proving it with the project's tests. In CP4284 this is module 5's agent-driven coding workflows, and it is the most common real instance of the capstone's plan, act, reflect agent.

## The idea

The loop is the [[react-loop]] with a code toolset exposed through [[tool-calling]]:

| Tool | Purpose |
|---|---|
| search | find where the relevant code lives |
| read (line ranges) | load only the part needed |
| edit | change specific lines |
| run (tests, linters) | get execution feedback |

Feedback works as in [[execution-guided-code-generation]], across many turns: a failing traceback becomes the next observation.

**Edit formats.** Rewriting a whole file costs tokens in proportion to its length and risks silently dropping unrelated lines. Search-and-replace edits give the exact old text and its replacement; the harness rejects the edit if the old text is not found or is not unique. Unified diffs need the context lines to match the file exactly. Either way the model must reproduce existing code exactly, or the patch does not apply.

**Benchmarks.** SWE-bench (Jimenez et al. 2023) has 2,294 tasks from real GitHub issues in 12 Python repositories. Given the repository and issue text, a system succeeds if tests written for the real fix pass and existing tests still pass. The best model in the original paper, Claude 2, resolved 1.96%. SWE-agent (Yang et al. 2024) showed the interface matters too, such as an edit command whose linter rejects broken syntax.

**Orchestration.** Larger systems plan first, hand searches to subagents to keep the main context small, and gate commands with permissions and a sandbox.

## Worked example

Issue: "`parse_date('2024-02-30')` returns 1 March instead of raising an error."

1. Search for `def parse_date`: found in `utils/dates.py`, line 42.
2. Read lines 30 to 60: it adds `day - 1` days to the first of the month, so an invalid day rolls over.
3. Add a test expecting `ValueError` for 30 February; run it: 1 failed.
4. Search-and-replace the rollover line with `return date(year, month, day)`, which raises `ValueError` on an invalid day.
5. The new test passes; the full suite shows no regressions. Stop.

## Failure modes

- **Patches that do not apply.** A context line misremembered by one space fails to match.
- **Overfitting to visible tests.** The agent special-cases the test input, or edits the test, instead of fixing the logic.
- **Stale context.** The agent works from an old view of a file it has since edited.
- **Destructive commands.** A `rm -rf` or `git reset --hard` destroys work; hence permissions and sandboxes.

## Prerequisites

- [[react-loop]]
- [[execution-guided-code-generation]]

## Checks

```check
q: Why do coding agents usually edit with search-and-replace blocks or diffs rather than rewriting whole files?
a: Rewriting a whole file costs output tokens in proportion to its length and risks silently dropping or altering unrelated lines; a targeted edit changes only the intended lines and fails loudly if the old text does not match.
why: Catches thinking the edit format is a cosmetic choice with no effect on cost or safety.
```

```check
q: A coding agent's search-and-replace edit is rejected with 'old text not found'. What is the most likely cause?
a: The model did not reproduce the existing code exactly, for example a misremembered line or different whitespace, often because it is working from a stale or partial view of the file.
why: Catches not realising that targeted edits require the model to copy existing context character for character.
```

```check
q: An agent makes a failing test pass by adding a special case for that test's exact input. Why does this count as a failure even though the suite is green?
a: It overfits to the visible test instead of fixing the underlying logic, so other inputs still fail; benchmarks like SWE-bench guard against this with tests the agent did not see.
why: Catches treating a passing test suite as proof the bug is fixed.
```
