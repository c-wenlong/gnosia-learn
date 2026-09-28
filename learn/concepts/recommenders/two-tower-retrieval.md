---
id: two-tower-retrieval
title: Two-tower retrieval models
summary: A two-tower model runs one neural network over the user (IDs, history, context) and a separate one over the item (ID, features), and scores a pair by the dot product of the two output embeddings. Because the item side never sees the user, every item embedding can be computed ahead of time and put in a nearest-neighbour index, so the best few hundred items out of millions can be found in milliseconds.
requires: [matrix-factorization-recommender]
tags: [recommenders]
sources: []
created: 2026-09-28T15:38:48.618Z
---

# Two-tower retrieval models

A two-tower model runs one neural network over the user (IDs, history, context) and a separate one over the item (ID, features), and scores a pair by the dot product of the two output embeddings. Because the item side never sees the user, every item embedding can be computed ahead of time and put in a nearest-neighbour index, so the best few hundred items out of millions can be found in milliseconds.

## Why it matters

Scoring every item with a heavy model per request is impossible at catalogue scale; two towers make searching everything cheap. In CP4285 this opens Module 3, Neural Recommendation Architectures, and it is the retrieval half of [[multi-stage-retrieval-ranking]].

## The idea

The user tower maps user features to $u \in \mathbb{R}^d$; the item tower maps item features to $v_i \in \mathbb{R}^d$; the score is $s(u, i) = u^\top v_i$ (see [[dot-product]]). [[matrix-factorization-recommender]] is the case where each tower is only an ID lookup. Features let the item tower embed a new item from metadata.

**Serving.** Item embeddings are computed offline into an approximate nearest neighbour (ANN) index. Per request, only the user tower runs, and the index returns top-scoring items without visiting every item.

**Training.** Treat it as classification over items: a [[softmax]] over all items is too expensive, so use sampled softmax, often with in-batch negatives (the other positives in the mini-batch serve as negatives). Popular items appear in batches more often, so they are over-penalised as negatives. Yi et al. (2019) correct each logit by subtracting the log of the item's sampling probability, $s - \log p_i$.

Covington et al. (2016), the course reading, describe YouTube's version: candidate generation as extreme multiclass classification, where a network over watch and search history gives the user vector, each video has an output embedding, and serving uses nearest-neighbour search. A separate, richer ranking network then scores the few hundred candidates.

**Limitation.** User and item features never interact before the final dot product, so the model cannot take as input a feature that describes the pair, such as how many videos from this item's channel this user has already watched. So it retrieves, and a heavier model ranks.

## Worked example

The user tower outputs $u = (0.5, 0.1, 0.8)$. Precomputed item vectors:

- $v_1 = (0.6, 0.0, 0.7)$: score $0.30 + 0 + 0.56 = 0.86$
- $v_2 = (0.9, 0.4, -0.2)$: score $0.45 + 0.04 - 0.16 = 0.33$
- $v_3 = (-0.3, 0.8, 0.1)$: score $-0.15 + 0.08 + 0.08 = 0.01$

Item 1 ranks first. With 10 million items, exact search means 10 million dot products per request; the ANN index examines a small fraction and returns nearly the same top list.

## Failure modes

- **Popularity skew from sampling.** Without the correction, in-batch training pushes popular items down.
- **No feature crosses.** Signals about a user-item combination are invisible.
- **Stale item index.** Item embeddings refreshed less often than the user tower drift out of step with it.

## Prerequisites

- [[matrix-factorization-recommender]]

## Checks

```check
q: Why can item embeddings in a two-tower model be computed before any request arrives?
a: The item tower takes only item inputs and never sees the user, so its output does not depend on who is asking. The embeddings can be computed offline and indexed, and only the user tower runs at request time.
why: Catches missing that the lack of user-item interaction inside the towers is what makes precomputation possible.
```

```check
q: How is plain matrix factorisation a special case of a two-tower model?
a: If each tower is just an embedding lookup by ID with no other features or layers, the user and item outputs are the latent vectors p_u and q_i, and the score is their dot product, which is matrix factorisation without bias terms.
why: Catches seeing two-tower models as unrelated to classical latent factor models.
```

```check
q: With in-batch negatives, what happens to popular items if no correction is applied, and what is the fix?
a: Popular items appear in batches more often, so they are used as negatives far more than their share, and the model learns to score them too low. Yi et al. subtract the log of each item's sampling probability from its logit during training to cancel this.
why: Catches assuming in-batch negatives are an unbiased sample of the catalogue.
```
