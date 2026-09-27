---
id: master-theorem
title: Master Theorem
summary: "For $T(n) = a\,T(n/b) + f(n)$, compare $f(n)$ against $n^{\log_b a}$: the larger one wins, and a tie costs an extra $\log n$ factor."
requires: [recurrence-for-recursive-running-time, comparing-growth-rates]
assumes: [recursion-tree-method]
tags: [asymptotics, recurrences]
sources: []
created: 2026-08-20T08:05:35.239Z
---

# Master Theorem

For $T(n) = a\,T(n/b) + f(n)$, compare $f(n)$ against $n^{\log_b a}$: the larger one wins, and a tie costs an extra $\log n$ factor.

## Why it matters

## The idea

## Worked example

## Failure modes

## Prerequisites

- [[recurrence-for-recursive-running-time]]
- [[comparing-growth-rates]]
