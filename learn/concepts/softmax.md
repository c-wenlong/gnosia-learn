---
id: softmax
title: Softmax
summary: Softmax exponentiates a score vector and normalises it, producing a peaked probability distribution.
requires: [vector-as-a-list-of-numbers]
tags: [transformers]
sources: []
topics: []
created: 2026-08-18T01:45:41.024Z
---

# Softmax

Softmax exponentiates a score vector and normalises it, producing a peaked probability distribution.

## Why it matters

## The idea

## Worked example

## Failure modes

## Prerequisites

- [[vector-as-a-list-of-numbers]]

## Checks

```check
q: Why exponentiate the scores before normalising, instead of dividing by the sum directly?
a: Exponentiation forces every term positive and widens gaps, so the result is a valid, peaked distribution; raw division breaks on negative scores.
why: Catches the belief that softmax is just normalisation.
```

## Sessions

- [[2026-08-20-transformer-block]] — 1/1 correct, 61%
