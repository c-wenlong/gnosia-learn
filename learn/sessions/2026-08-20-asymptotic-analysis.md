---
title: asymptotic analysis
date: 2026-08-20T08:05:45.909Z
goal: asymptotic-running-time-analysis
type: learning-session
---

# asymptotic analysis

> Live log. The tutor appends here as the session runs.
## Setup

Goal: `asymptotic-running-time-analysis` — analysing an algorithm asymptotically end to end.

The knowledge base held nothing on this, so the concept graph was built from scratch: 21 concepts, anchored to the syllabus of NUS **CS3230 Design and Analysis of Algorithms**, which the learner is taking now. Scope was deliberately narrowed to the asymptotics machinery rather than the whole course, so no NP-completeness, no design paradigms.

Learner context, in their words: "Currently doing a course" (CS3230). Prerequisites already passed: CS2040-series data structures, CS1231-series discrete maths. So the probe uses hard questions rather than easy ones, per the rule that a single confident answer to a difficult question outweighs several to easy ones.

> [!question] Quiz
> Is this statement true? "The best-case running time of insertion sort is O(n^2)."
>
> 1. False, not tight: the best case is Theta(n), and asymptotic notation must state the tightest bound available.
> 2. False, O means worst case: big-O describes worst-case behaviour, so it cannot be attached to a claim about the best case.
> 3. True, O is an upper bound: the best case is Theta(n), and big-O is an upper bound that is not required to be tight.
> 4. True, some inputs cost n^2: certain inputs of size n really do take Theta(n^2) time, which is what the bound is recording.

> [!failure] Not quite
> **You answered:** True, some inputs cost n^2
> **Answer:** True, O is an upper bound
>
> Held for the teaching phase.

> [!question] Quiz
> Which of these recurrences does the Master Theorem leave unsolved?
>
> 1. T(n) = 4T(n/2) + n^2
> 2. T(n) = 2T(n/2) + n/log n
> 3. T(n) = 3T(n/4) + n
> 4. T(n) = T(n/2) + 1

> [!failure] Not quite
> **You answered:** Declined to guess
> **Answer:** T(n) = 2T(n/2) + n/log n
>
> **In your words:** you never mentioned the master theorem in this convo unless its something im supposed to know which then i dont.
>
> Held for the teaching phase.

The learner pushed back on the Master Theorem question, pointing out it had not been mentioned. That is by design during Probe: the phase measures rather than teaches, and an explicit "I don't know" is stronger evidence than a guess because it rules out a lucky hit. Explained this and carried on rather than re-asking.

> [!question] Quiz
> Suppose f(n) = O(g(n)) is FALSE. What must then be true?
>
> 1. Some c fails forever: there is some c > 0 and some n0 such that f(n) > c*g(n) for every n >= n0.
> 2. f overtakes g: f(n) > g(n) for every sufficiently large n.
> 3. The ratio diverges: the limit of f(n)/g(n), as n grows without bound, is infinity.
> 4. Every c fails sometimes: for every c > 0 and every n0, there is some n >= n0 with f(n) > c*g(n).

> [!failure] Not quite
> **You answered:** f overtakes g
> **Answer:** Every c fails sometimes
>
> Held for the teaching phase.

> [!question] Quiz
> A recursive procedure on an array of length n makes one call on the first two-thirds of the array, one call on the last two-thirds, and does Theta(n) work outside those calls. What recurrence describes its running time?
>
> 1. T(2n/3) + T(n/3) + Theta(n)
> 2. 2T(2n/3) + Theta(n)
> 3. 2T(n/3) + Theta(n)
> 4. 2T(2n/3) + Theta(1)

> [!failure] Not quite
> **You answered:** 2T(n/3) + Theta(n)
> **Answer:** 2T(2n/3) + Theta(n)
>
> Held for the teaching phase.

