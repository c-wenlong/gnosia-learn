---
id: neighborhood-collaborative-filtering
title: User-based and item-based collaborative filtering
summary: Collaborative filtering predicts what a user will like from the user-item interaction matrix alone, with no description of the items. User-based filtering finds users whose past ratings resemble yours and averages their opinions; item-based filtering finds items whose ratings resemble those of items you already rated.
requires: [dot-product]
tags: [recommenders]
sources: []
created: 2026-09-28T15:38:15.414Z
---

# User-based and item-based collaborative filtering

Collaborative filtering predicts what a user will like from the user-item interaction matrix alone, with no description of the items. User-based filtering finds users whose past ratings resemble yours and averages their opinions; item-based filtering finds items whose ratings resemble those of items you already rated.

## Why it matters

It learns from crowds rather than from rules or item metadata, and every later method in the course (latent factors, two towers, graph models) refines the same bet: people who agreed before will agree again. In CP4285 this opens Module 1, Classical Recommendation Foundations.

## The idea

Write the ratings as a matrix $R$ with users as rows and items as columns, mostly empty. To compare two users, take the items both rated and compute cosine similarity (the [[dot-product]] of the rating vectors divided by their lengths) or Pearson correlation (cosine after subtracting each user's mean).

To predict user $u$'s rating of item $i$, take the neighbours $v$ who rated $i$ and form a similarity-weighted average of how far each neighbour's rating sits from that neighbour's own mean:

$$\hat r_{ui} = \bar r_u + \frac{\sum_v \text{sim}(u,v)\,(r_{vi} - \bar r_v)}{\sum_v |\text{sim}(u,v)|}$$

Mean-centring matters because one person's 3 is another's 5.

Item-based filtering turns the matrix sideways: compute similarities between item columns, then predict $u$'s rating of $i$ from $u$'s own ratings of the items most similar to $i$. Sarwar et al. (2001) showed it works well, and Amazon's item-to-item system (Linden et al., 2003) used it at scale. Item similarities can be precomputed offline and change slowly, since an item's audience is larger and steadier than one user's history.

## Worked example

Three users, four items, ratings 1 to 5 (a dash means unrated):

| | I1 | I2 | I3 | I4 |
|---|---|---|---|---|
| Alice | 5 | 3 | - | 1 |
| Bob | 4 | 3 | 4 | 1 |
| Carol | 1 | - | 2 | 5 |

Predict Alice on I3. Alice and Bob share I1, I2, I4: cosine $= 30 / \sqrt{35 \cdot 26} \approx 0.99$. Alice and Carol share I1, I4: cosine $= 10/26 \approx 0.38$. Means: Alice 3, Bob 3, Carol about 2.67. Bob's I3 deviation is $+1$, Carol's is $-0.67$. Prediction: $3 + (0.99 \cdot 1 + 0.38 \cdot (-0.67)) / (0.99 + 0.38) \approx 3.5$.

Carol's tastes oppose Alice's, yet cosine on positive ratings cannot go negative. With Pearson her similarity is about $-1$, so her below-average I3 rating counts in Alice's favour and the prediction rises to about 3.8.

## Failure modes

- **Sparse overlap.** Two users may share only one or two co-rated items, so their similarity is noise.
- **Cold start.** A new user or item has no ratings, so no neighbours.
- **Popular items dominate.** Items everyone rated appear in every neighbourhood, pulling recommendations toward the head.
- **Scalability.** User-based search compares against every other user at request time; large systems precompute item similarities instead.

## Prerequisites

- [[dot-product]]

## Checks

```check
q: Why does neighbourhood CF subtract each neighbour's mean rating before averaging?
a: Users use the rating scale differently, so a 3 from a harsh rater and a 3 from a generous rater mean different things. Averaging deviations from each neighbour's own mean, then adding back the target user's mean, compares opinions rather than scale habits.
why: Catches averaging raw neighbour ratings and inheriting their rating-scale bias.
```

```check
q: Two users have exactly opposite tastes on the items they share, both rating on a 1 to 5 scale. What does raw cosine similarity report, and what does Pearson report?
a: Raw cosine stays positive because all ratings are positive numbers, so it wrongly suggests mild agreement. Pearson centres each user's ratings first and reports a negative correlation, so the neighbour's opinion counts in the opposite direction.
why: Catches assuming cosine on raw ratings can detect disagreement.
```

```check
q: Why can item-item similarities be precomputed and reused for longer than user-user similarities?
a: An item's similarity is estimated from its whole audience, which is large and changes slowly, while a single user's history is short and shifts with every new rating. So item similarities stay stable between offline recomputations.
why: Catches thinking item-based and user-based CF differ only in orientation, not in stability or cost.
```
