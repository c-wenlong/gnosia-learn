---
id: specialist-agents-and-handoffs
title: Specialist agents and handoffs
summary: Multi-agent systems split work among specialist agents coordinated by a pattern (orchestrator and workers, a pipeline, or a reviewer loop), and most of their failures happen at the handoffs where context is passed on.
requires: []
assumes: [per-phase-agent-roles]
tags: [agentic-ai]
sources: [https://microsoft.github.io/autogen/]
created: 2026-09-28T15:23:31.075Z
---

# Specialist agents and handoffs

Multi-agent systems split work among specialist agents coordinated by a pattern
(orchestrator and workers, a pipeline, or a reviewer loop), and most of their
failures happen at the handoffs where context is passed on.

CS3227 names the two ingredients: specialist agents and handoffs. Frameworks
such as AutoGen provide the plumbing for them.

## Why it matters

One agent with every tool and a very long context gets confused and expensive.
Splitting the work can help, but it adds coordination costs and new ways to fail.
Knowing the common patterns, and where they break, is what lets you decide
whether a problem needs more than one agent at all.

## The idea

Three coordination patterns cover most designs:

1. **Orchestrator and workers.** A lead agent breaks the task into subtasks,
   dispatches each to a worker with a narrow role, and assembles the results.
   Good when subtasks are independent and can run in parallel.
2. **Pipeline.** Fixed stages in order (plan, implement, test), each consuming
   the previous one's output. Good when the steps are known in advance.
3. **Generator and reviewer.** One agent produces, another critiques against
   criteria, and the first revises until the reviewer passes it or a round limit
   is hit.

A **handoff** is the moment one agent's output becomes another's input. Whatever
the receiving agent does not get, it does not know: it has its own context
window and no memory of the sender's reasoning. So the handoff message is an
interface and deserves the care of one. It should state the goal, what was done,
what was decided and why, what is still open, and the artefacts (file paths,
branch names) needed to continue.

Multi-agent is not free. Every extra agent adds tokens, latency and another point
where an error can be passed along as fact. A single agent with good tools is
often the better design; reach for several when roles genuinely need different
tools, permissions or independence.

## Worked example

An orchestrator is asked to "add CSV export to the reports page". It sends a
backend worker "add an endpoint returning report rows as CSV" and a frontend
worker "add an export button". The backend worker names its route `/export.csv`;
the frontend worker, never told, calls `/reports/export`. Both report success.
The fix is at the handoff: the orchestrator should fix the contract (route,
columns) first and pass it to both.

## Failure modes

- **Lossy handoffs.** The receiver re-derives, or invents, what the sender knew.
- **Errors laundered into facts.** A worker's guess arrives at the orchestrator
  as a confident result, and nobody downstream checks it.
- **Reviewer loops that never converge,** or a reviewer too similar to the
  generator to catch anything.
- **Using many agents where one would do,** paying cost and latency for no gain.

## Prerequisites

Background: [[per-phase-agent-roles]] (what defines a single specialist).

## Checks

```check
q: Name three common coordination patterns for multiple agents and when each fits.
a: Orchestrator and workers, for independent subtasks that can run in parallel; a pipeline of fixed stages, when the steps are known in advance; a generator and reviewer loop, when output should be critiqued and revised against criteria.
why: Checks the learner can choose a pattern rather than name one.
```

```check
q: Why is the handoff message the most failure-prone part of a multi-agent system?
a: The receiving agent has its own context and none of the sender's reasoning, so anything the message leaves out (decisions, constraints, open questions, artefact names) is lost or re-invented.
why: Targets the idea that handoffs are interfaces and need to carry context explicitly.
```

```check
q: When is a single agent the better design than several specialists?
a: When the roles would not need different tools, permissions or independent views; then extra agents only add tokens, latency and handoff errors.
why: Catches the assumption that more agents means a better system.
```
