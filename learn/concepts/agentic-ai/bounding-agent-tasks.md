---
id: bounding-agent-tasks
title: Bounding a task for an agent
summary: A task is safe to hand an agent when its scope is explicit, its result can be verified, its actions can be undone, and a human checkpoint sits before anything that cannot.
requires: []
assumes: [least-privilege-for-agents]
tags: [agentic-ai]
sources: []
created: 2026-09-28T15:22:47.049Z
---

# Bounding a task for an agent

A task is safe to hand an agent when its scope is explicit, its result can be
verified, its actions can be undone, and a human checkpoint sits before
anything that cannot.

CS3227 calls this "designing tasks agents can be trusted with": task boundaries
and human checkpoints.

## Why it matters

Permissions decide what an agent *could* do. The task definition decides what it
*tries* to do, and how you will know whether it succeeded. A vague task given to
a well-sandboxed agent still wastes time, produces changes nobody can judge, or
wanders into work nobody asked for. Trust is a property of the task as much as of
the agent.

## The idea

Four questions to ask about a task before delegating it:

1. **Is the scope explicit?** Which files, services or tickets are in, and
   which are out. "Fix the flaky test in `auth_test.py`" is bounded; "improve
   the auth module" is not.
2. **Is success verifiable?** There should be a check the agent and you can both
   run: a test goes green, a lint passes, an output matches. Without one, the
   agent decides for itself when it is done.
3. **Are the actions reversible?** Edits on a branch can be thrown away. A
   database migration on production, a sent email, a payment or a deleted bucket
   cannot.
4. **Where are the checkpoints?** Put a human approval exactly before the
   irreversible steps and at the points where the agent's plan could diverge
   from intent (for example after it proposes a plan, before it executes it).

A task that fails a question can often be reshaped rather than refused: split it
so the reversible part is delegated and the irreversible part waits for a person,
or add the missing test first so success becomes checkable.

## Worked example

Request: "Clean up unused feature flags."

- As given: unbounded scope, no success check, and deleting a flag that is still
  read in production is an outage.
- Reshaped: "List flags with no references in the repo and no evaluations in the
  last 90 days (read-only). Open one pull request removing them. Do not merge."
  The agent does the searching and editing; a person reviews the list and the
  diff and does the one irreversible step, the merge.

## Failure modes

- **Checkpoints everywhere.** Approving every file read trains people to click
  "yes" without reading. Place checkpoints where they change outcomes.
- **Letting the agent define done.** Without an external check it may stop early
  or declare success on a test it edited to pass.
- **Reversible in theory only.** A change that can be reverted but triggers a
  deploy, a notification or a data write on the way is not reversible.

## Prerequisites

Background: [[least-privilege-for-agents]] (permissions bound what an agent can
do; this note bounds what it is asked to do).

## Checks

```check
q: List the four questions that decide whether a task is safe to delegate to an agent.
a: Is the scope explicit; is success verifiable by a check both you and the agent can run; are the actions reversible; and where are the human checkpoints, especially before irreversible steps.
why: Checks recall of the whole bounding rule, not just "add a human in the loop".
```

```check
q: Why can too many human checkpoints make an agent workflow less safe?
a: Approving routine steps constantly leads people to approve without reading, so the checkpoint that matters (before an irreversible action) gets the same rubber stamp.
why: Catches the belief that more approvals always means more oversight.
```

```check
q: "Clean up unused feature flags" fails the bounding questions. Reshape it into a task an agent can be trusted with.
a: Make it read-only discovery plus a reviewable change: find flags with no references and no recent evaluations, open one pull request removing them, and do not merge. A person reviews and performs the irreversible merge.
why: Tests reshaping a task rather than just refusing it.
```
