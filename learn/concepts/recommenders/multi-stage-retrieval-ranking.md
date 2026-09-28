---
id: multi-stage-retrieval-ranking
title: "Multi-stage recommendation: retrieval then ranking"
summary: "Large recommenders work as a funnel: a cheap retrieval stage narrows millions of items to hundreds or thousands of candidates, an expensive ranking model scores those candidates with rich features, and a re-ranking stage applies diversity, freshness and business rules. Each stage trades some recall for a large cut in cost, and an item dropped early can never come back."
requires: [two-tower-retrieval]
tags: [recommenders]
sources: []
created: 2026-09-28T15:39:26.309Z
---

# Multi-stage recommendation: retrieval then ranking

Large recommenders work as a funnel: a cheap retrieval stage narrows millions of items to hundreds or thousands of candidates, an expensive ranking model scores those candidates with rich features, and a re-ranking stage applies diversity, freshness and business rules. Each stage trades some recall for a large cut in cost, and an item dropped early can never come back.

## Why it matters

No single model is both cheap enough to score the whole catalogue in real time and expressive enough to rank well. In CP4285 this is Module 6's scalability topic, and it ties together [[two-tower-retrieval]] from Module 3 with the deployment concerns of Module 6.

## The idea

**Retrieval (millions to thousands).** Several cheap candidate sources run in parallel: a two-tower model with approximate nearest neighbour search, co-occurrence lists ("people who watched X watched Y"), subscriptions, trending items. Their outputs are merged and deduplicated. The goal is recall: the good items must be somewhere in the set.

**Ranking (thousands or hundreds to an ordered list).** A heavier model, often a deep network predicting click, watch time or several engagement signals, scores each candidate. It can use cross features that describe the user-item pair, such as how often this user has engaged with this item's creator, which two-tower retrieval cannot use. Here precision at the top matters.

**Re-ranking (final list).** Rules and light models adjust the order: remove near-duplicates, enforce diversity across topics or providers, boost fresh items, respect policy and business constraints.

Covington et al. (2016) describe the canonical two-stage version for YouTube: a candidate generation network selects hundreds of videos from millions, and a separate ranking network scores them.

## Worked example

Catalogue: 10 million items. The ranking model costs 1 ms of compute per item.

Scoring everything with the ranker: $10^7 \times 1\,\text{ms} = 10^4$ seconds, about 2.8 hours of compute for one request. Even spread over 1,000 cores that is 10 seconds, far over any interactive budget.

The funnel: retrieval uses a nearest-neighbour index over precomputed embeddings to return 500 candidates in a few milliseconds. Ranking 500 items is $500 \times 1\,\text{ms} = 0.5$ seconds of compute, which batched on parallel hardware fits in tens of milliseconds. The expensive model touches 1 in 20,000 items.

The price: if the right item was not among the 500, the ranker never sees it.

## Failure modes

- **Unrecoverable retrieval misses.** Ranking can only reorder what retrieval supplies, so weak recall caps the whole system.
- **Stage mismatch.** Retrieval trained for clicks and ranking trained for watch time may disagree about what "good" means, so retrieval feeds candidates the ranker does not want.
- **Feedback loops.** Each stage is trained on logs produced by the whole funnel, so items that retrieval rarely surfaces stay under-represented in training data, as in [[recommendation-feedback-loop]].
- **Training-serving skew.** A feature computed one way in the offline training pipeline and another way in the online service gives the ranker inputs it never saw in training.

## Prerequisites

- [[two-tower-retrieval]]

## Checks

```check
q: A ranking model costs 1 ms per item and the catalogue has 1 million items. How much compute would scoring every item take for one request, and how much if retrieval first cuts it to 200 candidates?
a: 1 million times 1 ms is 1,000 seconds, about 17 minutes. With 200 candidates it is 200 ms of compute, which can be parallelised to fit a real-time budget.
why: Catches underestimating why full-catalogue scoring with a heavy model is infeasible.
```

```check
q: Why is a relevant item that retrieval fails to return lost, even if the ranking model would have scored it first?
a: The ranking model only scores the candidates retrieval passes to it, so it never sees the missing item. Later stages can reorder but cannot add items back.
why: Catches thinking a strong ranker compensates for weak retrieval recall.
```

```check
q: Why can the ranking stage use features that a two-tower retrieval model cannot?
a: The ranker scores a small set of specific user-item pairs, so it can compute features of the pair itself, such as past engagement with the item's creator. Two-tower retrieval must encode user and item separately so items can be precomputed and searched with a nearest-neighbour index.
why: Catches missing the reason for splitting cheap retrieval from expressive ranking.
```
