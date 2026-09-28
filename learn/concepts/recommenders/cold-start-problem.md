---
id: cold-start-problem
title: The cold-start problem
summary: A collaborative recommender places users and items using their past interactions, so a new user or a new item with no interactions cannot be placed at all. Cold-start remedies supply some other signal (item metadata, context, a few onboarding answers, or deliberate exploration) until real interactions arrive.
requires: [matrix-factorization-recommender]
assumes: [content-based-filtering]
tags: [recommenders]
sources: []
created: 2026-09-28T15:38:43.316Z
---

# The cold-start problem

A collaborative recommender places users and items using their past interactions, so a new user or a new item with no interactions cannot be placed at all. Cold-start remedies supply some other signal (item metadata, context, a few onboarding answers, or deliberate exploration) until real interactions arrive.

## Why it matters

New items and users arrive daily, and a new film that is never shown never gets the clicks it would need to be shown. In CP4285 cold start is paired with online evaluation in Module 2, because handling it is partly modelling and partly how you test.

## The idea

In [[matrix-factorization-recommender]] a new item has no trained vector $q_i$, only its random initialisation. The cases are new user, new item, and a new system with little data overall.

Remedies:

- **Features and hybrids.** Describe the item by metadata (genre, cast, text, image) as in [[content-based-filtering]], and learn a mapping from features into the latent space, trained on existing items whose vectors are known. The new item then gets a sensible vector on day one.
- **Defaults.** Show popular or trending items, filtered by context such as country or time of day.
- **Onboarding.** Ask a new user to pick a few genres or items; each answer is a real interaction.
- **Exploration.** Bandit methods (epsilon-greedy, upper confidence bounds, Thompson sampling) reserve some impressions for uncertain items so they can collect evidence.
- **Transfer.** Borrow signals from another domain or product the user already uses.

**Evaluating it.** A random split of interactions almost never produces a truly new item, because most items keep some interactions in training. To measure cold-start performance, hold out whole items (or whole users) so the model has seen none of their interactions.

## Worked example

A new science-fiction film launches. It has zero plays, so the factor model cannot score it. The system has a small model that maps (genres, director, synopsis embedding) to a latent vector, trained on 50,000 older films whose vectors are known. For this film it outputs a vector close to other recent science-fiction films, so users whose $p_u$ points that way now score it highly.

The system also reserves a few home-page slots for new releases, so by the end of day one the film has a few thousand plays. As interactions accumulate, the learned ID vector can take over from the feature-based one.

## Failure modes

- **Popularity fallback forever.** Defaulting new users to the global top list gives them the same items as everyone and teaches the model nothing specific about them.
- **Weak metadata.** A feature mapping can only be as good as the features; two films with the same genre tags may have very different audiences.
- **Random-split evaluation.** It hides cold-start weakness, since nearly every test item was seen in training.
- **Exploration cost.** Showing uncertain items spends impressions that could have gone to known good ones, so the exploration rate is a real trade-off.

## Prerequisites

- [[matrix-factorization-recommender]]

Useful background: [[content-based-filtering]].

## Checks

```check
q: Why can a matrix factorisation model not score an item added this morning, even though it can score items with only a handful of ratings?
a: Item vectors are learned only from that item's observed interactions, and a brand-new item has none, so its vector is untrained (random or missing). Items with a few ratings have at least been nudged by those ratings.
why: Catches thinking the model can infer a new item's vector from nothing.
```

```check
q: Why does a random split of interactions underestimate the cold-start problem?
a: With a random split almost every test item and user also has interactions in the training set, so the model is rarely asked about anything truly unseen. Holding out whole items or users is what tests cold start.
why: Catches trusting a standard offline split to measure new-item performance.
```

```check
q: How does bandit-style exploration help a new item even though it adds no metadata?
a: It deliberately gives uncertain items some impressions, so they collect clicks or plays that the model can learn from. Without exploration a new item may never be shown and so never gather the evidence it needs.
why: Catches seeing cold start as purely a feature problem rather than also a data collection problem.
```
