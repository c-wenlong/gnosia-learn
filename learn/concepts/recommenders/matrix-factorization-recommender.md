---
id: matrix-factorization-recommender
title: Matrix factorisation with latent factors
summary: Matrix factorisation gives every user and every item a short vector of learned numbers, and predicts a rating as a global average plus a user bias plus an item bias plus the dot product of the two vectors. The vectors are fitted to the observed ratings only, with regularisation, and they let the model compare users who never rated the same item.
requires: [dot-product]
assumes: [neighborhood-collaborative-filtering]
tags: [recommenders]
sources: []
created: 2026-09-28T15:38:20.799Z
---

# Matrix factorisation with latent factors

Matrix factorisation gives every user and every item a short vector of learned numbers, and predicts a rating as a global average plus a user bias plus an item bias plus the dot product of the two vectors. The vectors are fitted to the observed ratings only, with regularisation, and they let the model compare users who never rated the same item.

## Why it matters

Neighbourhood methods compare users through the few items they share, which breaks down when the matrix is 99% empty. Factorisation lets information flow between users through shared factors. It was a central ingredient of the leading Netflix Prize entries, and Koren, Bell and Volinsky (2009) is the CP4285 Module 1 reading that describes it.

## The idea

Each user $u$ gets $p_u \in \mathbb{R}^k$ and each item $i$ gets $q_i \in \mathbb{R}^k$, with $k$ usually tens to hundreds. The prediction is

$$\hat r_{ui} = \mu + b_u + b_i + q_i^\top p_u$$

where $\mu$ is the mean rating, $b_u$ captures a user who rates everything high, and $b_i$ an item everyone rates high. The [[dot-product]] term carries the interaction: how well this user's tastes line up with this item's traits.

The parameters minimise squared error over the set $K$ of observed ratings only, plus an L2 penalty:

$$\min \sum_{(u,i) \in K} (r_{ui} - \hat r_{ui})^2 + \lambda \left(\lVert p_u\rVert^2 + \lVert q_i\rVert^2 + b_u^2 + b_i^2\right)$$

Stochastic gradient descent nudges the vectors along each observed rating's error. Alternating least squares fixes all $p_u$, solves each $q_i$ exactly by least squares, then swaps; each step parallelises.

The $k$ dimensions are learned, not labelled; one may happen to track "drama versus comedy", but nothing forces it.

For implicit feedback (plays, clicks) Hu, Koren and Volinsky (2008) treat every user-item pair as a binary preference with a confidence weight $c_{ui} = 1 + \alpha r_{ui}$, so unobserved pairs count as weak negatives and heavy use counts as strong positive evidence. Here $r_{ui}$ is a raw count such as plays. Because the loss now covers every pair, they solve it with ALS, which handles that sum efficiently.

## Worked example

Let $\mu = 3.6$, $b_u = +0.3$, $b_i = -0.2$, $p_u = (1.2, -0.5, 0.3)$, $q_i = (0.8, 0.4, -1.0)$.

The dot product is $0.96 - 0.20 - 0.30 = 0.46$. The prediction is $3.6 + 0.3 - 0.2 + 0.46 = 4.16$. Biases alone give 3.7; the factor match adds almost half a star.

## Failure modes

- **Cold start.** A user or item with no ratings has no trained vector, so the model has nothing to take a dot product with.
- **Treating missing as negative in explicit data.** Filling blanks with zero and factorising the full matrix teaches the model that unrated means disliked, pulling predictions down.
- **Overfitting.** Without $\lambda$, a user with three ratings gets a vector that fits them exactly and nothing else.
- **Reading meaning into factors.** Naming a latent dimension is a guess.

## Prerequisites

- [[dot-product]]

Useful background: [[neighborhood-collaborative-filtering]].

## Checks

```check
q: In explicit-rating matrix factorisation, why is the loss summed only over observed ratings instead of the whole matrix?
a: A missing rating means the user has not rated the item, not that they dislike it. Filling blanks with zeros and fitting them would teach the model that unrated items are bad, biasing every prediction downward.
why: Catches treating missing entries in explicit data as negative feedback.
```

```check
q: With mu = 3.5, b_u = 0.2, b_i = 0.1, p_u = (1, 2) and q_i = (0.5, -0.5), what is the predicted rating?
a: The dot product is 0.5 - 1.0 = -0.5, so the prediction is 3.5 + 0.2 + 0.1 - 0.5 = 3.3.
why: Catches forgetting the bias terms or mis-computing the dot product.
```

```check
q: How can matrix factorisation make a sensible prediction for two users who have never rated any item in common?
a: Each user's vector is fitted using all their ratings, and the item vectors are shared across all users, so the two users land in the same factor space through different items. Their similarity is then read off their vectors, not from co-rated items.
why: Catches thinking latent factor models, like neighbourhood methods, need direct overlap between users.
```
