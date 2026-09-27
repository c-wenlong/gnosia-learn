---
id: vector-as-a-list-of-numbers
title: Vector as a list of numbers
summary: A vector is an element of a vector space; coordinates are a choice, not the object.
requires: []
tags: []
sources: []
created: 2026-08-18T01:45:40.923Z
---

# Vector as a list of numbers

A vector is an element of a vector space; coordinates are a choice, not the object.

## Why it matters

## The idea

## Worked example

## Failure modes

## Checks

```check
q: Rotate your axes 45 degrees without touching the arrow. The coordinates change. Does that mean the list was an approximation?
a: No. Each list is exact in its own basis. Coordinates describe the vector relative to a chosen frame, so changing the frame changes the description without changing the object.
why: Catches the belief that a coordinate list is a lossy stand-in for the vector.
```

## Sessions

- [[2026-08-20-transformer-block]] — 1/2 correct, 38%
