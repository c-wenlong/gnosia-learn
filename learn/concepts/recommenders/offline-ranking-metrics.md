---
id: offline-ranking-metrics
title: "Offline ranking metrics: precision, recall and NDCG at k"
summary: Offline evaluation hides some of each user's known interactions, asks the model for a ranked top-$k$ list, and scores how many hidden items appear and how high. Precision@k and Recall@k count hits; NDCG@k also rewards putting hits near the top.
requires: []
tags: [recommenders]
sources: []
created: 2026-09-28T15:38:32.019Z
---

# Offline ranking metrics: precision, recall and NDCG at k

Offline evaluation hides some of each user's known interactions, asks the model for a ranked top-$k$ list, and scores how many hidden items appear and how high. Precision@k and Recall@k count hits; NDCG@k also rewards putting hits near the top.

## Why it matters

Before a model reaches real users it has to be compared cheaply against alternatives, and logged data is the only thing available. These metrics are the common currency of recommender papers and of the CP4285 capstone. In CP4285 they open Module 2, Evaluation Methodology.

## The idea

**Splitting.** A random split hides random interactions, so the model may train on a user's March clicks and be tested on their January ones, which leaks the future. A time-based split trains on everything before a cut-off and tests on what came after, matching how the model will be used.

For one user with $R$ relevant held-out items and a ranked list:

- Precision@k $= \dfrac{\text{relevant items in the top } k}{k}$
- Recall@k $= \dfrac{\text{relevant items in the top } k}{R}$

Neither cares where in the top $k$ a hit sits. Discounted cumulative gain does:

$$\text{DCG@}k = \sum_{i=1}^{k} \frac{rel_i}{\log_2(i+1)}$$

so a hit at rank 1 is worth 1, at rank 3 is worth 0.5. Dividing by the DCG of the best possible ordering (IDCG) gives NDCG@k between 0 and 1, comparable across users. Some definitions use $2^{rel_i} - 1$ in the numerator for graded relevance; with 0/1 relevance the two agree.

Two related metrics: MRR averages $1/\text{rank}$ of the first hit, and MAP averages precision measured at each hit's rank. All of these are averaged over test users.

## Worked example

A user has 3 held-out relevant items. The model's top 5 has hits at ranks 2 and 4.

- Precision@5 $= 2/5 = 0.4$.
- Recall@5 $= 2/3 \approx 0.67$.
- DCG@5 $= 1/\log_2 3 + 1/\log_2 5 = 0.631 + 0.431 = 1.062$.
- IDCG@5 puts all 3 at ranks 1 to 3: $1 + 0.631 + 0.5 = 2.131$.
- NDCG@5 $= 1.062 / 2.131 \approx 0.50$.

Move the same two hits to ranks 1 and 2: precision and recall are unchanged, but NDCG rises to $1.631/2.131 \approx 0.77$. MRR for the original list is $1/2$.

## Failure modes

- **Missing is not negative.** An unobserved item may be one the user never saw, not one they dislike; the data is missing not at random, because the old system chose what to show.
- **Sampled metrics.** Ranking each held-out item against 100 random negatives instead of the full catalogue is cheap, but Krichene and Rendle (2020) showed such sampled metrics can disagree with full-ranking metrics about which model is better.
- **Offline gains that vanish online.** Logs reflect what the old policy exposed, and users react to a new list, so an offline win must still be confirmed with [[online-ab-testing]].

## Prerequisites

None beyond general background.

## Checks

```check
q: A user has 2 relevant held-out items. A model's top 4 has one hit at rank 1. Compute Precision@4 and Recall@4.
a: Precision@4 is 1/4 = 0.25 and Recall@4 is 1/2 = 0.5.
why: Catches swapping the denominators, k for precision and total relevant for recall.
```

```check
q: Two models place the same two relevant items in their top 5, one at ranks 1 and 2, the other at ranks 4 and 5. Which metrics tell them apart?
a: Precision@5 and Recall@5 are identical for both. NDCG@5 (and MRR) is higher for the first model because gains are discounted by log2 of rank plus one.
why: Catches thinking precision and recall reward good ordering within the top k.
```

```check
q: Why is a random split of interactions a weaker test than a time-based split?
a: A random split lets the model train on interactions that happened after the ones it is tested on, leaking future information it would never have in deployment. A time-based split trains on the past and tests on the future, matching real use.
why: Catches overlooking temporal leakage in offline evaluation.
```
