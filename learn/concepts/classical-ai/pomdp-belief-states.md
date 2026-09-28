---
id: pomdp-belief-states
title: POMDPs and belief states
summary: In a partially observable MDP the agent cannot see the state, only noisy observations of it, so it acts on a belief state (a probability distribution over states) updated after each action and observation, which turns the problem into an MDP over a continuous space of beliefs.
requires: [markov-decision-process]
tags: [classical-ai, decision-making]
sources: [http://incompleteideas.net/book/the-book-2nd.html]
created: 2026-09-28T15:39:36.336Z
---

# POMDPs and belief states

In a partially observable MDP the agent cannot see the state, only noisy
observations of it, so it acts on a belief state (a probability distribution over
states) updated after each action and observation, which turns the problem into
an MDP over a continuous space of beliefs.

CS4263 gives a brief introduction: belief states, and why partial observability
is hard.

## Why it matters

Most real agents do not know their exact state: a robot has noisy sensors, a
doctor sees symptoms rather than the disease, a dialogue system hears a noisy
transcript. An MDP policy maps states to actions, which is useless when the state
is unknown. POMDPs are the principled model for this, and they explain why
information-gathering actions (look, test, ask) have value of their own.

## The idea

A POMDP is an MDP plus an **observation model** O(o | s'): the probability of
observing o when the true state is s'.

The agent keeps a **belief state** b, a probability for each state. After doing
action a and observing o, it updates by Bayes' rule:

b'(s') ∝ O(o | s') × Σ over s of P(s' | s, a) b(s)

then normalises so the beliefs sum to 1.

The key result: the belief state summarises everything relevant in the history,
so a POMDP is equivalent to an MDP whose states are beliefs. A policy maps
beliefs to actions.

**Why it is hard.** The belief space is continuous (a probability simplex), so
exact solution methods are intractable except for tiny problems; finite-horizon
POMDPs are PSPACE-hard in general. Practical methods approximate: point-based
value iteration, online search from the current belief, or heuristics such as
acting as if the most likely state were true.

**Information has value.** In a POMDP an action that changes nothing in the world
but sharpens the belief (a sensor reading, a medical test, a clarifying question)
can be the optimal choice. A plain MDP has no way to value it.

## Worked example

The tiger problem: a tiger is behind one of two doors, 50/50. Listening costs a
little and reports the correct side with probability 0.85. After hearing "left"
once: b(tiger left) = 0.5 × 0.85 / (0.5 × 0.85 + 0.5 × 0.15) = 0.85. After a
second "left": 0.85 × 0.85 / (0.85 × 0.85 + 0.15 × 0.15), about 0.97. The optimal
policy listens until the belief is confident enough, then opens the other door.
Its decision depends on the belief, not on a state it can never see.

## Failure modes

- **Treating the most likely state as the true state** when being wrong is
  costly.
- **Forgetting to fold in the transition model** before the observation update.
- **Expecting exact solutions** beyond toy problems.
- **Ignoring the value of information-gathering actions.**

## Prerequisites

- [[markov-decision-process]]

## Checks

```check
q: What is a belief state in a POMDP, and how is it updated?
a: A probability distribution over the possible states. After an action and an observation, predict with the transition model, weight each state by the probability of the observation there (Bayes' rule), and normalise.
why: Checks the definition and the update.
```

```check
q: In the tiger problem (prior 0.5, listening correct with probability 0.85), what is the belief that the tiger is on the left after hearing "left" once?
a: 0.85: (0.5 × 0.85) / (0.5 × 0.85 + 0.5 × 0.15).
why: Tests a concrete Bayesian update.
```

```check
q: Why are POMDPs much harder to solve than MDPs of the same size?
a: A POMDP is an MDP over belief states, which form a continuous space, so exact solutions are intractable except for tiny problems and practical methods must approximate.
why: Checks the source of the difficulty.
```
