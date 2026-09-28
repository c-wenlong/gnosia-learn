---
id: next-token-prediction
title: Language modelling as next-token prediction
summary: A language model splits text into tokens and applies the [[chain-rule-factorization]] left to right, so the whole job is predicting a [[softmax]] distribution over the vocabulary for the next token given the ones before it. Training minimises cross-entropy, which is the negative log-likelihood, and generation samples one token at a time from those predictions.
requires: [chain-rule-factorization]
assumes: [softmax]
tags: [generative-models, transformers]
sources: []
created: 2026-09-28T15:40:31.606Z
---

# Language modelling as next-token prediction

A language model splits text into tokens and applies the [[chain-rule-factorization]] left to right, so the whole job is predicting a [[softmax]] distribution over the vocabulary for the next token given the ones before it. Training minimises cross-entropy, which is the negative log-likelihood, and generation samples one token at a time from those predictions.

## Why it matters

This is the same autoregressive recipe as PixelCNN, applied to text, and it is how GPT-style models are pretrained. In CP4283 it closes the autoregressive module and sets up the transformer module, which changes the network but keeps this objective.

## The idea

A tokeniser turns text into a sequence $w_1, \dots, w_T$ drawn from a fixed vocabulary of size $V$. The model reads the prefix $w_{<t}$ and outputs logits, which a softmax turns into $p_\theta(w_t \mid w_{<t})$. The loss is

$$\mathcal{L} = -\sum_{t=1}^{T} \log p_\theta(w_t \mid w_{<t}),$$

the cross-entropy between the one-hot true token and the prediction, summed over positions. Perplexity is $\exp(\mathcal{L}/T)$, the exponential of the mean loss per token. A model that is uniform over $V$ tokens has perplexity $V$, so perplexity reads as an effective number of choices per step.

In training, each prediction conditions on the true prefix from the data. This is teacher forcing, and it lets every position be scored at once. At generation the model conditions on its own samples instead. The mismatch is called exposure bias: the model never practised recovering from its own mistakes.

Decoding turns the predicted distribution into a token:

| Method | Rule |
| --- | --- |
| Greedy | take the most probable token |
| Temperature $\tau$ | sample from $\mathrm{softmax}(\text{logits}/\tau)$; $\tau<1$ sharpens, $\tau>1$ flattens |
| Top-$k$ | keep the $k$ most probable tokens, renormalise, sample |
| Nucleus (top-$p$) | keep the smallest set whose probabilities sum to at least $p$, renormalise, sample |

## Worked example

Vocabulary: {the, cat, sat, EOS}. Score the sentence "the cat sat EOS". Suppose the model assigns the true token these probabilities: 0.5, 0.25, 0.5, 0.8. The per-token losses are

$$-\ln 0.5 = 0.693,\; -\ln 0.25 = 1.386,\; -\ln 0.5 = 0.693,\; -\ln 0.8 = 0.223.$$

The total is 2.996 nats, the mean 0.749, and perplexity $e^{0.749} \approx 2.11$, about as unsure as a fair choice between two tokens.

For temperature, take logits (2, 1, 0). At $\tau = 1$ the probabilities are (0.67, 0.24, 0.09); at $\tau = 0.5$ they become (0.87, 0.12, 0.02).

## Failure modes

- **Treating the loss as accuracy.** Cross-entropy scores the probability given to the true token, so a model can lower it without changing a single argmax.
- **Comparing perplexity across tokenisers.** Per-token perplexity depends on how text is split, so two models with different vocabularies are not directly comparable.
- **Assuming greedy decoding finds the most likely sentence.** Greedy picks the best next token each step, which need not give the highest-probability sequence, and it often falls into repetition.

## Prerequisites

- [[chain-rule-factorization]]

Useful background: [[softmax]].

## Checks

```check
q: A model assigns probabilities 0.5 and 0.125 to the two true tokens of a two-token sequence. What are the mean loss per token and the perplexity?
a: The losses are ln 2 = 0.693 and ln 8 = 2.079 nats, mean 1.386 = ln 4, so perplexity is exp(1.386) = 4.
why: Catches not knowing that perplexity is the exponential of the mean per-token negative log-likelihood.
```

```check
q: What is teacher forcing, and what problem does it create at generation time?
a: During training each position conditions on the true previous tokens rather than the model's own outputs. At generation the model conditions on its own samples, a distribution it never trained on, so early mistakes can compound; this mismatch is exposure bias.
why: Catches assuming training and generation feed the model the same kind of prefix.
```

```check
q: What does lowering the sampling temperature below 1 do to the next-token distribution, and what happens as it approaches 0?
a: Dividing the logits by a temperature below 1 sharpens the softmax, moving probability onto the most likely tokens; as the temperature approaches 0 sampling becomes greedy decoding.
why: Catches confusing temperature with top-k truncation, or getting the direction of its effect backwards.
```
