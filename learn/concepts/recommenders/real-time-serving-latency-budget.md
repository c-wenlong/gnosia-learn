---
id: real-time-serving-latency-budget
title: Latency budgets in real-time recommendation serving
summary: A real-time recommendation request has a fixed end-to-end time budget, often on the order of 100 ms though it varies by product, which is split across feature lookup, retrieval, ranking, re-ranking and network. Engineers design against tail latency (such as the 99th percentile) rather than the mean, and use caching, precomputation, timeouts with fallbacks and smaller models to stay inside it.
requires: []
assumes: [multi-stage-retrieval-ranking]
tags: [recommenders]
sources: []
created: 2026-09-28T15:39:32.095Z
---

# Latency budgets in real-time recommendation serving

A real-time recommendation request has a fixed end-to-end time budget, often on the order of 100 ms though it varies by product, which is split across feature lookup, retrieval, ranking, re-ranking and network. Engineers design against tail latency (such as the 99th percentile) rather than the mean, and use caching, precomputation, timeouts with fallbacks and smaller models to stay inside it.

## Why it matters

A better model that misses its deadline shows nothing useful. The budget decides how many candidates [[multi-stage-retrieval-ranking]] can afford at each stage and how heavy the ranker may be. In CP4285 this is Module 6's real-time serving topic.

## The idea

**Split the budget.** Give each stage an allowance.

**Tail latency.** Users feel the slow requests, and one page request usually fans out to many services (feature store shards, several retrieval sources). If each call is slow 1% of the time, a request that waits for 50 independent calls hits at least one slow call with probability $1 - 0.99^{50} \approx 0.39$. Dean and Barroso's "The Tail at Scale" (2013) makes this argument for large services generally.

**Tools.**

- Precompute offline: batch-compute recommendations for users who rarely visit and store them; precompute item embeddings.
- Cache online: user and item features, embeddings, and whole result lists, accepting some staleness.
- Timeouts and fallbacks: if a stage misses its deadline, serve what exists, such as retrieval order or a cached popular list, instead of failing.
- Cheaper models: distillation trains a small model to mimic a large one; quantisation stores weights and embeddings at lower precision.

## Worked example

An illustrative 100 ms budget:

| Stage | Allowance (ms) |
|---|---|
| Network in and out, request parsing | 15 |
| Feature lookup | 15 |
| Retrieval (several sources in parallel) | 20 |
| Ranking | 40 |
| Re-ranking and response assembly | 10 |
| **Total** | **100** |

A new ranker is more accurate but takes 70 ms at p99. At the tail the request now takes 130 ms. With a 40 ms ranking timeout, those slow requests fall back to retrieval order, so users get a worse list exactly when the new model was meant to help. The options are to shrink the candidate set, distil the ranker, cache ranking scores for frequent users, or renegotiate the budget. An accuracy gain must be weighed against how often the fallback fires.

## Failure modes

- **Stale caches.** Cached lists keep recommending an item the user just bought or one that went out of stock.
- **Cache stampede.** When a heavily used cache entry expires, many requests recompute it at once and overload the backend; request coalescing or staggered expiry times help.
- **Training-serving skew.** A feature cached or approximated for speed online may differ from the version the model was trained on, silently degrading predictions.
- **Designing for the mean.** A 30 ms average hides a p99 that breaks the budget.

## Prerequisites

None beyond general background.

Useful background: [[multi-stage-retrieval-ranking]].

## Checks

```check
q: Each backend call is slow 1% of the time, and a request waits for 50 independent calls. Roughly what fraction of requests hit at least one slow call?
a: 1 minus 0.99 to the power 50, which is about 0.39, so roughly 39% of requests.
why: Catches assuming a rare per-call slowdown stays rare once a request fans out.
```

```check
q: Why do recommender teams set latency targets on p99 rather than on the mean?
a: The mean hides the slow tail that real users experience, and fan-out to many services makes tail events common per request. A p99 target bounds the experience of almost all requests.
why: Catches designing to average latency when the tail determines user experience.
```

```check
q: A ranking stage times out. What should the system do instead of returning an error, and what is the cost?
a: Fall back to something already available, such as the retrieval order or a cached popular list. The page still loads on time, but the list is less personalised or less accurate for those requests.
why: Catches treating a timeout as a failure rather than a designed degradation path.
```
