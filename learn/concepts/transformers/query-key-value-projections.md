---
id: query-key-value-projections
title: Query key value projections
summary: "Each token is projected into three roles: what it seeks, what it offers, and what it passes on."
requires: [vector-as-a-list-of-numbers]
tags: [transformers]
sources: []
created: 2026-08-18T01:45:41.075Z
---

# Query key value projections

Each token is projected into three roles: what it seeks, what it offers, and what it passes on.

## Why it matters

## The idea

## Worked example

## Failure modes

## Prerequisites

- [[vector-as-a-list-of-numbers]]

## Checks

```check
q: What distinct role does the value vector play, versus query and key?
a: Query and key decide how much attention a pair gets; the value is what actually gets mixed into the output.
```

## Sessions

- [[2026-08-20-transformer-block]] — 0/1 correct, 4%
