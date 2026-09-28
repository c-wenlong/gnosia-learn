---
id: value-and-policy-iteration
title: Value iteration and policy iteration
summary: Value iteration repeatedly applies the Bellman update to all states until values converge and then acts greedily; policy iteration alternates between evaluating a fixed policy exactly and improving it greedily, and stops when the policy no longer changes.
requires: [markov-decision-process]
tags: [classical-ai, decision-making]
sources: [http://incompleteideas.net/book/the-book-2nd.html]
created: 2026-09-28T15:39:28.265Z
---

# Value iteration and policy iteration

Value iteration repeatedly applies the Bellman update to all states until values
converge and then acts greedily; policy iteration alternates between evaluating a
fixed policy exactly and improving it greedily, and stops when the policy no
longer changes.

CS4263 covers both as the standard ways to solve a known
[[markov-decision-process]].

## Why it matters

The Bellman equation defines the optimal values but does not say how to compute
them: it is a system of nonlinear equations, one per state, because of the max.
These two algorithms are the basic solution methods, and their ideas (repeated
backups, evaluate then improve) run through all of reinforcement learning.

## The idea

**Value iteration.**

1. Start with V(s) = 0 for all states.
2. Update every state with the Bellman backup:
   V(s) ← max over a of Σ P(s' | s, a) [ R(s, a, s') + γ V(s') ].
3. Repeat until the largest change is below a threshold.
4. Output the greedy policy: in each state, the action achieving the max.

With γ below 1 the update is a contraction, so the values converge to the unique
optimal values from any start. After k iterations, V holds the best expected
reward over a k-step horizon (plus the discounted starting guess).

**Policy iteration.**

1. Start with any policy π.
2. **Evaluate:** compute V^π, the value of following π, by solving the linear
   equations V(s) = Σ P(s' | s, π(s)) [ R + γ V(s') ] (no max, so they are
   linear), or by iterating them.
3. **Improve:** set π(s) to the action that is greedy with respect to V^π.
4. Repeat until π does not change. It then is optimal.

Policy iteration usually needs few iterations, each more expensive; value
iteration needs many cheap ones. Both require knowing P and R; when they are
unknown, reinforcement learning estimates them or learns values from experience.

## Worked example

Two states, γ = 0.9, deterministic moves. In A: Stay gives reward 1 and stays in
A; Go gives reward 0 and moves to B. In B: Stay gives reward 2 and stays.

Value iteration from zero:

| Iteration | V(A) | V(B) | Best action in A |
| --- | --- | --- | --- |
| 1 | max(1, 0) = 1 | 2 | Stay |
| 2 | max(1 + 0.9, 0.9 × 2) = 1.9 | 3.8 | Stay |
| 3 | max(1 + 1.71, 0.9 × 3.8) = 3.42 | 5.42 | Go |

The values converge to V(B) = 2 / (1 - 0.9) = 20 and V(A) = 0.9 × 20 = 18 (Go),
beating 1 / (1 - 0.9) = 10 for staying in A forever. Early iterations favour the
immediate reward; the greedy action flips once the longer horizon is counted.

## Failure modes

- **Reading the greedy action from early iterations** as the optimal policy.
- **Stopping value iteration too soon** on a large γ, where convergence is slow.
- **Using the max in policy evaluation,** which turns it back into value
  iteration.
- **Applying either method without a known model.**

## Prerequisites

- [[markov-decision-process]]

## Checks

```check
q: Describe one iteration of value iteration.
a: For every state, set its value to the maximum over actions of the expected immediate reward plus γ times the current value of the next state (a Bellman backup); repeat until the values stop changing much, then act greedily.
why: Checks the algorithm.
```

```check
q: What are the two alternating steps of policy iteration, and why is the first one linear?
a: Policy evaluation (compute the value of the current policy) and policy improvement (make the policy greedy with respect to those values). Evaluation is linear because the policy fixes the action in each state, so there is no max.
why: Checks structure and the reason evaluation is easier.
```

```check
q: In the two-state example (Stay in A earns 1 forever, Go to B then earn 2 forever, γ = 0.9), what is the optimal value of A and the optimal action?
a: Go: V(A) = 0.9 × 20 = 18, since V(B) = 2 / 0.1 = 20, versus 1 / 0.1 = 10 for staying.
why: Tests applying discounted sums to choose an action.
```
