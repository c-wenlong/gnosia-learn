---
id: markov-decision-process
title: Markov decision process
summary: "An MDP models acting over time when outcomes are uncertain: states, actions, probabilistic transitions that depend only on the current state and action, rewards, and a discount factor, and its solution is a policy that maximises expected discounted reward."
requires: []
assumes: [search-problem-formulation]
tags: [classical-ai, decision-making]
sources: [http://incompleteideas.net/book/the-book-2nd.html]
created: 2026-09-28T15:39:23.971Z
---

# Markov decision process

An MDP models acting over time when outcomes are uncertain: states, actions,
probabilistic transitions that depend only on the current state and action,
rewards, and a discount factor, and its solution is a policy that maximises
expected discounted reward.

CS4263 introduces MDPs for sequential decision-making; Sutton and Barto's
textbook is the reference.

## Why it matters

Search assumes actions do exactly what they say. Real actions slip: a robot's
wheel skids, a delivery is delayed, a treatment works only sometimes. When
outcomes are uncertain, a fixed sequence of actions is the wrong kind of answer,
because you do not know which state you will be in. The MDP is the standard model
for this, and it is also the foundation of reinforcement learning.

## The idea

An MDP has:

- **states** S and **actions** A(s);
- a **transition model** P(s' | s, a): the probability of landing in s' after
  doing a in s;
- a **reward** R(s, a, s') for each transition;
- a **discount factor** γ between 0 and 1, which makes rewards sooner worth more
  than rewards later and keeps infinite sums finite.

**The Markov property:** the next state depends only on the current state and
action, not on the history. If history matters, it has to be folded into the
state.

**A policy** π maps each state to an action. Because outcomes are random, the
answer is a policy (what to do wherever you end up), not a plan.

The **value** of a state under the optimal policy satisfies the **Bellman
equation**:

V*(s) = max over a of Σ over s' of P(s' | s, a) [ R(s, a, s') + γ V*(s') ]

In words: the best value of a state is the best action's expected immediate
reward plus the discounted value of where you land. The optimal policy picks
that maximising action in every state.

## Worked example

A grid world robot: moving in a chosen direction succeeds with probability 0.8,
and with probability 0.1 each it slips to the left or right of the intended
direction. One cell is +1 (exit), one is -1 (a pit), each other step costs a
little. Near the pit, the optimal policy may move away from the goal to avoid a
10% chance of slipping into the pit. A shortest-path planner would walk along the
pit's edge; the MDP policy weighs the risk.

## Failure modes

- **Returning a plan instead of a policy,** with no answer for the states you
  slip into.
- **Non-Markov states** that leave out information the future depends on.
- **Reward design mistakes:** a large step cost can make ending in the pit look
  better than wandering.
- **Choosing γ carelessly:** near 0 is short-sighted, near 1 makes long horizons
  matter and slows convergence.

## Prerequisites

Background: [[search-problem-formulation]] (an MDP extends a search problem
with uncertain transitions and rewards).

## Checks

```check
q: List the components of a Markov decision process.
a: A set of states, the actions available in each, a transition model P(s' | s, a), a reward function, and a discount factor γ.
why: Checks the formal definition.
```

```check
q: Why is the solution to an MDP a policy rather than a sequence of actions?
a: Outcomes are uncertain, so you cannot know in advance which state each action will lead to; a policy says what to do in every state you might end up in.
why: Checks the key shift from planning to policies.
```

```check
q: State the Bellman optimality equation in words.
a: The optimal value of a state equals the maximum, over actions, of the expected immediate reward plus the discounted optimal value of the next state, with the expectation taken over the transition probabilities.
why: Checks understanding of the recursive structure used by value iteration.
```
