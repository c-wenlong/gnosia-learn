---
id: content-based-filtering
title: Content-based filtering
summary: Content-based filtering recommends items whose features resemble the features of items a user already liked. It builds a profile vector from the user's own history and scores each candidate item by its similarity to that profile, so it needs no other users at all.
requires: [dot-product]
tags: [recommenders]
sources: []
created: 2026-09-28T15:38:26.505Z
---

# Content-based filtering

Content-based filtering recommends items whose features resemble the features of items a user already liked. It builds a profile vector from the user's own history and scores each candidate item by its similarity to that profile, so it needs no other users at all.

## Why it matters

Collaborative filtering cannot recommend an item nobody has interacted with yet. Content-based filtering can, if the item has a description, so it is the usual partner to collaborative methods in hybrids. It also gives honest reasons ("this shares the tags you liked"). In CP4285 it sits beside matrix factorisation in Module 1, as the item-features half of the classical toolkit.

## The idea

First, turn every item into a feature vector. Options include genre and tag indicators, TF-IDF weights over the words in a description (words frequent in this item but rare across the catalogue get high weight), or an embedding from a text or image model.

Second, build a user profile in the same space. A common choice is a weighted average of the vectors of items the user liked, with weights from ratings or engagement.

Third, score each unseen item by cosine similarity with the profile, the [[dot-product]] of the two vectors divided by their lengths, and recommend the highest scorers.

| | Content-based | Collaborative |
|---|---|---|
| Needs other users | No | Yes |
| New item | Works if it has features | No interactions, no signal |
| New user | Still cold | Still cold |
| Can surprise you | Rarely | Yes |

Hybrids combine the two: blend their scores, switch between them by how much data exists, or feed item features into a collaborative model.

## Worked example

Features are (space, robots, romance, comedy), each vector already unit length. The user liked Film A $= (0.8, 0.6, 0, 0)$ and Film B $= (0.6, 0, 0, 0.8)$. The profile is their mean, $u = (0.7, 0.3, 0, 0.4)$, with length $\sqrt{0.74} \approx 0.86$.

Candidates:

- Film C, a space romance, $(0.6, 0, 0.8, 0)$: dot product $0.42$, cosine $0.42/0.86 \approx 0.49$.
- Film D, a robot comedy, $(0, 0.6, 0, 0.8)$: dot product $0.18 + 0.32 = 0.50$, cosine $\approx 0.58$.
- Film E, a pure romance, $(0, 0, 1, 0)$: cosine $0$.

The ranking is D, C, E, and the reason is readable: D shares robots with A and comedy with B. Film E scores zero and always will.

## Failure modes

- **Over-specialisation.** The system only finds more of what the user already has; Film E above can never surface, so tastes cannot widen through the recommender.
- **Weak features.** If the features miss what people care about (tone, quality, pacing), two items that look alike on paper get the same score even when one is much better.
- **New users are still cold.** With no history there is no profile, so content features solve item cold start but not user cold start.

## Prerequisites

- [[dot-product]]

## Checks

```check
q: A film was added to the catalogue an hour ago and has no ratings. Can a content-based recommender show it to anyone, and why can a pure collaborative one not?
a: Yes, content-based scoring only needs the film's feature vector and a user profile, so it can rank the film immediately. Collaborative filtering has no interactions for it, so it has no neighbours or latent vector to score with.
why: Catches thinking every recommender suffers item cold start equally.
```

```check
q: Does content-based filtering solve the cold-start problem for a brand-new user? Explain.
a: No. The user profile is built from the user's own liked items, so a user with no history has no profile to compare against. It only solves the new-item side.
why: Catches overgeneralising content-based filtering as a full cold-start fix.
```

```check
q: Why does a purely content-based recommender tend to narrow what a user sees over time?
a: It scores items by similarity to what the user already liked, so items with features outside that profile score near zero and are never shown. Without other users' signals there is no route to something different that the user might enjoy.
why: Catches missing the over-specialisation limit of content similarity.
```
