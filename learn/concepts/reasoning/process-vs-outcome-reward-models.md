---
id: process-vs-outcome-reward-models
title: Process vs outcome reward models
summary: A verifier (reward model) scores candidate solutions so the best can be chosen. An outcome reward model (ORM) is trained on whether the final answer was correct and scores the whole solution; a process reward model (PRM) is trained on labels for each reasoning step and scores the solution step by step.
requires: [test-time-compute-scaling]
assumes: [llm-training-stages]
tags: [agentic-ai, reasoning]
sources: []
created: 2026-09-28T15:42:38.164Z
---

# Process vs outcome reward models

A verifier (reward model) scores candidate solutions so the best can be chosen. An outcome reward model (ORM) is trained on whether the final answer was correct and scores the whole solution; a process reward model (PRM) is trained on labels for each reasoning step and scores the solution step by step.

## Why it matters

[[test-time-compute-scaling]] only pays off if something can tell good samples from bad, and a verifier does that. Outcome or process supervision decides what it notices: a right answer, or sound reasoning. In CP4284 this is module 4's verifier and reward modelling topic.

## The idea

**ORM.** Sample solutions to problems with known answers, label each by whether its final answer matches, and train a classifier to predict correctness from the full text. Labels are automatic, so data is cheap. Unlike the preference reward model in [[llm-training-stages]], it learns from correctness, not from human comparisons.

**PRM.** Label every step as correct, incorrect or neutral, and train a model to predict each step's label. Lightman et al. (2023, "Let's Verify Step by Step") collected PRM800K, 800,000 step-level human labels on MATH solutions. They scored a whole solution as the probability that every step is correct, the product of the per-step probabilities. Picking the best of many samples, their PRM beat an ORM and majority voting, solving 78% of a representative MATH test subset. Earlier, Uesato et al. (2022) found on GSM8K that outcome supervision matched final-answer error rates with less labelling, but process feedback was needed to cut reasoning errors.

| | ORM | PRM |
|---|---|---|
| Label | final answer right or wrong | each step right or wrong |
| Label cost | automatic given a reference answer | human or estimated per step |
| Can guide search mid-solution | weakly | yes, step by step |
| Rewards lucky wrong reasoning | yes | less |

Both serve three uses: reranking finished samples (best-of-$N$), guiding search over partial solutions, and supplying RL reward.

## Worked example

Two candidate solutions, four steps each. The PRM gives these step probabilities:

- Candidate A: 0.95, 0.90, 0.30, 0.90. Score $= 0.95 \times 0.90 \times 0.30 \times 0.90 \approx 0.23$.
- Candidate B: 0.90, 0.90, 0.90, 0.90. Score $= 0.9^4 \approx 0.66$.

Suppose A reaches the right number because two errors cancel. An ORM, trained only on final-answer correctness, may still score it high, say 0.8. The PRM ranks B first and points at A's step 3; a step-level search would have pruned A there.

## Failure modes

- **Right answer, wrong steps.** An ORM rewards reaching the answer by luck or cancelling errors, worst when answers are easy to guess.
- **Reward hacking.** A policy optimised or searched against either model finds text it overrates.
- **Labelling cost.** Step-level human labels are expensive; later work estimates them from rollouts.
- **Ambiguous steps.** What counts as a step (a line, a sentence) is a design choice, and scores shift with it.

## Prerequisites

- [[test-time-compute-scaling]]

Useful background: [[llm-training-stages]].

## Checks

```check
q: A solution reaches the correct final answer through two errors that cancel. How would an ORM and a PRM each tend to score it?
a: An ORM, trained only on whether final answers were right, tends to score it high. A PRM scores each step, so the faulty steps get low probabilities and the product drags the solution's score down.
why: Catches not seeing that outcome supervision rewards the answer, not the reasoning that produced it.
```

```check
q: A PRM gives a three-step solution step probabilities 0.9, 0.5 and 0.8. Using the product rule, what is the solution score?
a: 0.9 x 0.5 x 0.8 = 0.36.
why: Catches not knowing how step scores combine, for example averaging them, which would hide one bad step.
```

```check
q: Why are ORM training labels cheaper to get than PRM labels?
a: ORM labels come automatically by comparing each sampled solution's final answer with a known reference answer, while PRM labels need a judgement on every step, traditionally from human annotators.
why: Catches overlooking the labelling cost trade-off between the two kinds of supervision.
```
