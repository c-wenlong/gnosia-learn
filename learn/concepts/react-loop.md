---
id: react-loop
title: ReAct loop
summary: ReAct interleaves reasoning traces with tool calls, so each observation can revise the plan mid-flight.
requires: [tool-calling]
tags: [agentic-ai]
sources: []
topics: [cp4284-m3-t1]
created: 2026-08-18T01:45:41.416Z
---

# ReAct loop

ReAct interleaves reasoning traces with tool calls, so each observation can
revise the plan mid-flight.

## Why it matters

It is the difference between an agent that commits to a plan and one that can
change its mind. Once observations can feed back into reasoning, the agent
handles a world it did not fully understand when it started, which is most
worlds.

## The idea

Thought, action, observation, repeat. The model writes its reasoning out as
tokens, emits an action, receives the result, and reasons again with that result
now in front of it.

The load-bearing detail is that the reasoning trace is *emitted*, not internal.
It goes into the context and conditions the next generation. It is not a log for
humans to read afterwards; it is part of the input the model sees next time.

Contrast with plan-then-execute, where the whole plan is fixed before anything
runs. There the plan cannot respond to what the first step revealed. In ReAct
nothing is committed up front, so an observation that contradicts the plan can
change it immediately.

## Worked example

A plan-then-execute agent books a flight, then checks the visa rules, and
discovers the booking was wrong. A ReAct agent sees the visa observation land in
context before it books, and re-plans on the spot.

## Failure modes

- **Context crowding.** As a run gets long, raw observations pile up and squeeze
  out both the reasoning and the original goal. This degrades first, before
  anything else does, which is why production harnesses summarise or prune
  observations.
- **Treating it as "an agent that uses tools".** Tool use alone is not ReAct.
  The explicit written trace is the addition.
- **Reasoning that does not touch the observation.** The loop only pays off if
  each thought actually reads the last result. A trace that ignores observations
  is decoration.

## Open questions

- At what point should observations be summarised rather than kept raw, and who
  decides: the harness on a token budget, or the model itself?

## Prerequisites

- [[tool-calling]]

## Checks

```check
q: A plain tool-using agent already calls tools in a loop. What does ReAct add on top?
a: An explicit reasoning trace emitted as tokens before each action, which stays in context and conditions the next choice.
why: Catches treating ReAct as just 'an agent that uses tools'.
```

```check
q: As a ReAct run gets long, what degrades first?
a: Raw observations pile up in context and crowd out the reasoning and the original goal.
why: Catches assuming the loop degrades on formatting or latency rather than context budget.
```

## Sessions

- [[2026-08-19-react-agents]] — 3/3 correct (voided: answer always in slot 1)
