---
id: tool-calling
title: Tool calling
summary: A model emits a structured call against a declared schema; the harness executes it and returns the result into context.
requires: []
tags: [agentic-ai]
sources: []
topics: [cp4284-m3-t2]
created: 2026-08-18T01:45:41.367Z
---

# Tool calling

A model emits a structured call against a declared schema; the harness executes it and returns the result into context.

## Why it matters

## The idea

## Worked example

## Failure modes

## Checks

```check
q: What does the model itself produce on a tool call, and where does the result go?
a: Structured text naming the tool and its arguments. The harness executes it and appends the result back into context.
why: Catches the belief that the model executes the function or makes the network call itself.
```
