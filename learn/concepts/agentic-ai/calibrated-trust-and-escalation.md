---
id: calibrated-trust-and-escalation
title: Calibrated trust and escalation points
summary: Trust in an agent should match how reliable it actually is on this kind of task, and the agent should be designed to stop and hand control to a person at defined points rather than only when it happens to notice trouble.
requires: []
assumes: [bounding-agent-tasks]
tags: [agentic-ai, hci]
sources: [https://pair.withgoogle.com/guidebook/]
created: 2026-09-28T15:25:43.903Z
---

# Calibrated trust and escalation points

Trust in an agent should match how reliable it actually is on this kind of task,
and the agent should be designed to stop and hand control to a person at defined
points rather than only when it happens to notice trouble.

CS3227 groups this under pairing patterns, trust calibration and escalation
design. Google's People + AI Guidebook covers the same ground for AI products in
general.

## Why it matters

Human factors research on automation found two opposite failures long before
LLMs: people over-rely on automation that is usually right (and stop checking),
and abandon automation after a few visible errors (and lose its benefit). Both
come from trust that does not match reliability. With coding agents the first
failure is the dangerous one: the agent is right often enough that review
quietly stops.

## The idea

**Calibration** means your reliance tracks the agent's real accuracy, per kind
of task. An agent can be excellent at renaming symbols and poor at concurrency
fixes; one global level of trust is wrong for at least one of them. Calibrate
from evidence: track which kinds of change needed rework, and let that, not the
last impressive demo, set how closely you review.

**Pairing patterns** set who does what:

- *Person drives, agent suggests:* lowest autonomy, the person sees everything.
- *Agent drives, person navigates:* the agent acts, the person watches and
  steers in real time.
- *Delegated:* the agent works alone and returns a result for review.

Pick the pattern by task risk and by how well calibrated your trust is for that
task type.

**Escalation design** decides when the agent must stop and ask. Good triggers are
explicit and checkable:

1. The next action is irreversible or outside the agreed scope.
2. The request is ambiguous and the readings lead to different actions.
3. The same step has failed several times.
4. A budget (time, cost, steps) is exhausted.

An escalation should say what the agent was doing, what it is unsure about, and
what options it sees, so the person can decide quickly.

## Worked example

A team notices that the agent's database migration pull requests needed fixes
four times out of ten, while its test-writing pull requests almost never did.
They keep delegating tests, switch migrations to "agent drives, person
navigates", and add an escalation rule: any migration touching a table over a
size threshold stops for approval.

## Failure modes

- **Over-trust:** reviews shrink as the agent keeps being right, until the one
  miss ships.
- **Under-trust:** a few early errors lead to rejecting the tool for tasks it
  handles well.
- **Escalation by vibes:** relying on the agent to notice it is out of its depth,
  which is exactly when it is least able to.
- **Unhelpful escalations** ("I'm stuck") that make the person redo the analysis.

## Prerequisites

Background: [[bounding-agent-tasks]] (where the checkpoints go in a single
task).

## Checks

```check
q: What does it mean for trust in an agent to be calibrated, and why is one global level of trust usually wrong?
a: Your reliance matches the agent's actual accuracy for that kind of task. Accuracy differs by task type, so a single level over-trusts it on some tasks and under-trusts it on others.
why: Checks the per-task nature of calibration.
```

```check
q: Give three explicit triggers that should make an agent stop and escalate to a person.
a: Any three of: the next action is irreversible or out of scope; the request is ambiguous in a way that changes the action; the same step has failed repeatedly; a time, cost or step budget is exhausted.
why: Checks that escalation is designed as rules, not left to the agent's judgement.
```

```check
q: Why is over-trust the more dangerous failure with a coding agent that is usually right?
a: Being right most of the time leads people to stop reviewing closely, so the occasional serious mistake passes unchecked.
why: Connects the automation-misuse finding to agentic coding.
```
