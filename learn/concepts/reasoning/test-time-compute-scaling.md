---
id: test-time-compute-scaling
title: Test-time compute scaling
summary: "Test-time compute scaling means spending more computation at inference, per question, to get a better answer: longer reasoning chains, many samples chosen between by a vote or a verifier, or a search over partial solutions. It is an alternative, or a complement, to training a larger model."
requires: [chain-of-thought-prompting]
assumes: [self-consistency]
tags: [agentic-ai, reasoning]
sources: []
created: 2026-09-28T15:42:27.554Z
---

# Test-time compute scaling

Test-time compute scaling means spending more computation at inference, per question, to get a better answer: longer reasoning chains, many samples chosen between by a vote or a verifier, or a search over partial solutions. It is an alternative, or a complement, to training a larger model.

## Why it matters

Model size fixes the cost of one forward pass; how many passes a question gets is chosen at inference. In CP4284 this is module 4's "thinking-model" paradigm, and the capstone's plan, act, reflect loop is itself a way of spending more inference per task.

## The idea

| Strategy | How compute is spent | Example |
|---|---|---|
| Sequential | a longer chain, or revisions of an answer | [[chain-of-thought-prompting]], self-critique |
| Parallel | $N$ independent samples, then pick one | [[self-consistency]] voting, best-of-$N$ with a verifier |
| Search | expand and score partial solutions, prune the weak ones | Tree of Thoughts, beam search with a step-level verifier |

Tree of Thoughts (Yao et al. 2023) lets the model propose several candidate next steps, has it rate the partial states, and explores them with breadth- or depth-first search and backtracking. On the Game of 24, GPT-4 with chain-of-thought solved 4% of tasks; Tree of Thoughts solved 74%.

Reasoning models such as OpenAI's o1 are trained with reinforcement learning to produce long internal chains before answering. OpenAI's o1 announcement showed accuracy rising with both train-time compute (more RL) and test-time compute (more thinking), plotted against compute on a log scale. Snell et al. (2024) studied allocating a fixed inference budget: the best strategy depends on question difficulty, adapting it per question was over 4 times as efficient as best-of-$N$, and where a small model already had some success, extra test-time compute let it beat a 14 times larger model.

## Worked example

A model solves a problem with probability 0.3 per sample. Assume samples are independent. The chance that at least one of $N$ samples is right is $1 - 0.7^N$:

| $N$ | at least one correct |
|---|---|
| 1 | 0.30 |
| 4 | 0.76 |
| 16 | 0.997 |

That is a ceiling. Reaching it means picking the right sample out of 16, which needs a perfect verifier; a majority vote works only if the right answer is the most common one, which at a 0.3 success rate it may not be. Real samples are correlated, so true coverage is lower. The token cost is 16 times higher.

## Failure modes

- **Diminishing returns.** On a log-scale compute axis, each further gain costs a multiple of the compute before it.
- **No way to tell good from bad.** Without a vote on discrete answers or a reliable verifier, extra samples raise coverage but not the answer you return.
- **Overthinking.** Easy questions get long chains that only add cost and latency.
- **Verifier exploitation.** Searching hard against a learned scorer finds candidates it overrates.

## Prerequisites

- [[chain-of-thought-prompting]]

Useful background: [[self-consistency]].

## Checks

```check
q: A model is right 30% of the time per sample. With 4 independent samples, what is the chance at least one is right, and why might best-of-4 still not reach it?
a: 1 - 0.7^4 = 1 - 0.24, about 0.76. Reaching that needs something that picks the correct sample, and a vote or an imperfect verifier may pick a wrong one, so returned accuracy can be well below coverage.
why: Catches confusing coverage (some sample is right) with accuracy of the answer actually returned.
```

```check
q: Name the three broad ways to spend more compute at test time.
a: Sequential: longer reasoning or repeated revision. Parallel: many independent samples chosen between by a vote or verifier. Search: expanding and scoring partial solutions, as in Tree of Thoughts or verifier-guided beam search.
why: Catches thinking test-time scaling only means writing a longer chain of thought.
```

```check
q: If accuracy rises steadily when compute is plotted on a log scale, what does that say about the cost of each extra point of accuracy?
a: Each fixed gain needs the compute multiplied, for example doubled, so later gains cost far more than early ones: returns diminish.
why: Catches reading a straight line on a log axis as linear, cheap improvement.
```
