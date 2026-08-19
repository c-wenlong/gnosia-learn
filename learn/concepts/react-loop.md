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

ReAct interleaves reasoning traces with tool calls, so each observation can revise the plan mid-flight.

## Why it matters

## The idea

## Worked example

## Failure modes

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
