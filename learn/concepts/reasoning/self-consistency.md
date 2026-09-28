---
id: self-consistency
title: "Self-consistency: sample and vote"
summary: Self-consistency (Wang et al. 2022, published at ICLR 2023) samples several chain-of-thought reasoning paths at non-zero temperature, extracts the final answer from each, and returns the answer that appears most often. It replaces trusting one greedy chain with a majority vote over many.
requires: [chain-of-thought-prompting]
tags: [agentic-ai, reasoning]
sources: []
created: 2026-09-28T15:42:11.258Z
---

# Self-consistency: sample and vote

Self-consistency (Wang et al. 2022, published at ICLR 2023) samples several chain-of-thought reasoning paths at non-zero temperature, extracts the final answer from each, and returns the answer that appears most often. It replaces trusting one greedy chain with a majority vote over many.

## Why it matters

A single chain of thought is fragile: one arithmetic slip anywhere and the answer is wrong. Self-consistency is the simplest way to turn extra inference compute into accuracy, and it needs no training, no verifier and no change to the prompt. In CP4284 it is the "sample-and-vote" half of module 2, and the first example of the test-time compute idea in module 4.

## The idea

Greedy decoding picks the most likely token at every step and yields one reasoning path. Self-consistency instead samples $m$ paths $r_1, \dots, r_m$ with temperature above zero, so they differ. Each path ends in an answer $a_i$, and the method returns

$$\hat{a} = \arg\max_{a} \sum_{i=1}^{m} \mathbb{1}[a_i = a].$$

The paper frames this as marginalising over reasoning paths: the question is which answer is most probable across all the ways of reasoning to it, not which single path is most probable. The intuition is that there are many different correct routes to the right answer, and they agree at the end, while wrong routes tend to scatter across different wrong answers.

Two conditions make it work. Answers must be discrete and comparable (a number, a multiple-choice letter, a yes or no), so that "the same answer" is well defined. And the samples must be diverse: at temperature zero every sample is the greedy chain and the vote is pointless. Accuracy rises with the number of samples and then flattens, while cost rises linearly.

## Worked example

A word problem is sampled five times. The extracted answers are 18, 18, 26, 18, 20.

| Answer | Votes |
|---|---|
| 18 | 3 |
| 26 | 1 |
| 20 | 1 |

The method returns 18. If greedy decoding had produced the chain ending in 26, it would have been wrong, and nothing in that single chain would have said so. The agreement rate, 3 of 5 here, is also a rough confidence signal: a 2, 1, 1, 1 split tells you the model is unsure. The price is five full chains of tokens instead of one.

## Failure modes

- **Free-form outputs.** Summaries, essays or programs rarely match exactly, so they cannot be voted on without a way to group equivalent answers (for code, running it and comparing behaviour).
- **Systematic error.** If the model misreads the question the same way every time, all samples agree on the wrong answer. Voting reduces variance, not bias.
- **Wrong temperature.** Too low and the samples are near-copies; too high and the chains become incoherent.
- **Answer extraction.** A parser that misreads "the answer is 18 apples" as something else miscounts votes.

## Prerequisites

- [[chain-of-thought-prompting]]

## Checks

```check
q: Ten sampled chains give the answers 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, but the true answer is 9. What went wrong, and would more samples help?
a: The model makes a systematic error, such as misreading the question, so every path lands on the same wrong answer. More samples would not help, because voting only averages away random slips, not a consistent bias.
why: Catches the belief that high agreement guarantees correctness, since voting reduces variance but not bias.
```

```check
q: Why does self-consistency sample at a non-zero temperature instead of running greedy decoding several times?
a: Greedy decoding is deterministic, so every run gives the identical chain and the vote contains one answer repeated. Sampling produces diverse reasoning paths whose answers can be compared.
why: Catches not understanding that the method depends on diversity between samples.
```

```check
q: Why is self-consistency hard to apply directly to a task like writing a paragraph summary?
a: Majority voting needs discrete answers that can be checked for equality, and two summaries almost never match exactly, so there is no clear answer to count votes for without an extra way to group equivalent outputs.
why: Catches assuming sample-and-vote works for any output type.
```
