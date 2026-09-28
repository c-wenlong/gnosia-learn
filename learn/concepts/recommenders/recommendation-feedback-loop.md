---
id: recommendation-feedback-loop
title: "Feedback loops: popularity bias, exposure and filter bubbles"
summary: "A recommender is trained on interactions it caused: items it shows get clicked, and clicked items get shown more. This feedback loop concentrates exposure on already-popular items, starves long-tail items and new providers of the data they would need to compete, and may narrow what individual users see."
requires: [matrix-factorization-recommender]
tags: [recommenders]
sources: []
created: 2026-09-28T15:39:09.957Z
---

# Feedback loops: popularity bias, exposure and filter bubbles

A recommender is trained on interactions it caused: items it shows get clicked, and clicked items get shown more. This feedback loop concentrates exposure on already-popular items, starves long-tail items and new providers of the data they would need to compete, and may narrow what individual users see.

## Why it matters

Every model in the course learns from logs, which record what users did with what they were shown. In CP4285 this opens Module 5, Societal Impact and Responsible Deployment, and it is what the capstone's fairness and bias audit is looking for.

## The idea

**Popularity bias.** Popular items collect more interactions, so models score them higher, which yields more interactions. Long-tail items and new providers get little exposure regardless of quality.

**Exposure unfairness.** Providers (artists, sellers, writers) compete for exposure, and two of equal quality can end up far apart because of an early random difference.

**Position bias.** Users examine top slots more, so a click at rank 1 is weaker evidence than a click at rank 8.

**Filter bubbles.** The concern, named by Pariser (2011), is that personalisation narrows each user's diet. The empirical evidence is mixed: some studies find modest narrowing, others find little or even broader consumption among users who follow recommendations. Treat it as a risk to measure, not an established fact.

**Mitigations.**

- Exposure-aware re-ranking: constrain how exposure is shared across providers.
- Calibration (Steck, 2018): re-rank so the genre mix of the list matches the genre mix of the user's history, measured by KL divergence, so a 70% drama, 30% comedy viewer does not get 100% drama.
- Exploration: give uncertain items impressions.
- Inverse propensity weighting (IPW): weight each logged interaction by $1/P(\text{observed})$ so over-exposed items stop dominating training.

## Worked example

Two items, A and B, have the same true click probability: 10% whenever a user actually looks at them. The page has two slots; users always examine slot 1 and examine slot 2 only 30% of the time. On day 0, A happens to be ranked first.

Each day 1,000 users visit. A is examined 1,000 times and gets about 100 clicks. B is examined about 300 times and gets about 30. Per impression, A's click rate looks like 10% and B's like 3%. A naive model concludes A is three times better, keeps A on top, and the gap repeats every day. An accident of initial order became a permanent verdict.

IPW fixes the estimate: B's 30 clicks each get weight $1/0.3$, giving about 100 effective clicks, the same as A. (A toy simulation; real propensities must be estimated.)

## Failure modes

- **Clicks as ground truth.** Clicks reflect exposure and position as well as preference.
- **High-variance IPW.** Items with tiny propensities get huge weights, so estimates become noisy; weights are usually clipped.
- **Accuracy-only evaluation.** Metrics on biased logs reward reproducing the bias.
- **Overclaiming filter bubbles.** Asserting narrowing without measuring it misstates the evidence.

## Prerequisites

- [[matrix-factorization-recommender]]

## Checks

```check
q: Item B sits in a slot that users examine 30% of the time and receives 30 clicks from 1,000 impressions. What is its inverse-propensity-weighted click count, and why?
a: 30 divided by 0.3, which is 100. Each click is up-weighted by 1 over the probability the slot was examined, correcting for the fact that most users never looked at B.
why: Catches reading raw click rate as preference when position limits exposure.
```

```check
q: Why can two equally good items end up with very different exposure under a recommender trained on its own logs?
a: A small early difference (chance clicks or initial rank) gives one item more exposure, which yields more clicks, which the retrained model reads as higher quality, so it gets even more exposure. The loop amplifies noise into a lasting gap.
why: Catches assuming logged popularity reflects true quality.
```

```check
q: Is it established that recommenders trap users in filter bubbles?
a: No. The evidence is mixed: some studies find modest narrowing and others find little effect or broader consumption. It is a risk to measure in a given system rather than a proven general effect.
why: Catches overstating the filter-bubble evidence as settled.
```
