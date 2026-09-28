---
id: self-attentive-sequential-recommendation
title: Self-attentive sequential recommendation (SASRec)
summary: SASRec predicts a user's next item by running stacked causal self-attention blocks over their interaction history, so each position can draw directly on any earlier item. Kang and McAuley (ICDM 2018) showed that this adapts between short-range patterns on sparse data and longer-range ones on dense data, and trains in parallel, unlike a recurrent network.
requires: [self-attention, session-based-recommendation]
tags: [recommenders, transformers]
sources: []
created: 2026-09-28T15:38:59.298Z
---

# Self-attentive sequential recommendation (SASRec)

SASRec predicts a user's next item by running stacked causal self-attention blocks over their interaction history, so each position can draw directly on any earlier item. Kang and McAuley (ICDM 2018) showed that this adapts between short-range patterns on sparse data and longer-range ones on dense data, and trains in parallel, unlike a recurrent network.

## Why it matters

Recurrent models such as GRU4Rec ([[session-based-recommendation]]) squeeze the past into one hidden state and train step by step; attention removes both limits. SASRec is the CP4285 Module 4 reading.

## The idea

Take a user's last $n$ items $s_1, \dots, s_n$ (truncated or padded). Each position's input is the item's embedding plus a learned positional embedding for that position.

Stack a few blocks of [[self-attention]] followed by a point-wise feed-forward layer, with residual connections, layer normalisation and dropout. The attention is causal: position $t$ may attend only to positions $1$ to $t$, never to later ones, because in use the future is not known.

The output at position $t$ is trained to predict $s_{t+1}$. Its relevance score for item $j$ is the dot product of the output vector with $j$'s embedding (SASRec shares the input item embeddings for this). Training uses binary cross-entropy: the true next item against one randomly sampled negative, at every position. One sequence yields $n$ training signals in one parallel pass. At inference the last position's output scores all items.

Kang and McAuley's attention visualisations show that on sparse datasets the model attends mostly to the last few items, behaving like a Markov chain, while on dense ones it spreads attention further back.

**BERT4Rec** (Sun et al., 2019) drops the causal mask. It hides random items in the sequence and predicts them from both sides (a cloze objective), then at inference appends a mask token at the end and predicts it.

## Worked example

A history of five items $s_1, \dots, s_5$. The causal mask is lower triangular:

| query position | may attend to |
|---|---|
| 1 | 1 |
| 2 | 1, 2 |
| 3 | 1, 2, 3 |
| 4 | 1 to 4 |
| 5 | 1 to 5 |

Position 3 sees $s_1, s_2, s_3$ and is trained to predict $s_4$. If position 3 could see $s_4$, the model would copy the answer and learn nothing usable at inference. BERT4Rec avoids the leak by masking the item it must predict.

## Failure modes

- **Quadratic cost.** Attention compares every pair of positions, costing $O(n^2 d)$ per layer, so long histories are truncated to the most recent $n$ items.
- **Popularity bias.** A single random negative per position is rarely a hard negative, and popular next items dominate the targets, so predictions lean toward the head.
- **Inflated evaluation.** SASRec, like many papers of its time, ranked each test item against 100 sampled negatives; sampled metrics can mis-order models relative to full ranking (Krichene and Rendle, 2020), so compare on the full catalogue.

## Prerequisites

- [[self-attention]]
- [[session-based-recommendation]]

## Checks

```check
q: In SASRec, why must position 3 be blocked from attending to position 4 during training?
a: Position 3 is trained to predict the item at position 4. If it could attend to that item it would simply copy it, and at inference, where the next item is unknown, the model would have learned nothing useful.
why: Catches missing the purpose of the causal mask as preventing target leakage.
```

```check
q: How does SASRec get many training signals from one user's sequence in a single pass, unlike an RNN?
a: With the causal mask, every position predicts its own next item at the same time, and attention computes all positions in parallel. An RNN must process positions one after another because each hidden state depends on the previous one.
why: Catches thinking a sequence model yields only one training example per sequence or must be trained step by step.
```

```check
q: What is the main training difference between SASRec and BERT4Rec?
a: SASRec is unidirectional: each position attends only to earlier items and predicts the next one. BERT4Rec is bidirectional: it masks random items and predicts them from items on both sides, then appends a mask token at the end to predict the next item at inference.
why: Catches conflating left-to-right next-item training with cloze-style masked training.
```
