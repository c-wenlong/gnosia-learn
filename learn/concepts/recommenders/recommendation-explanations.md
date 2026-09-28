---
id: recommendation-explanations
title: Explaining recommendations
summary: An explanation tells a user, regulator or engineer why an item was recommended, such as "because you watched X". An explanation is faithful only if it reflects what actually drove the model's score, and many deployed explanations are plausible stories generated after the fact.
requires: []
assumes: [neighborhood-collaborative-filtering]
tags: [recommenders]
sources: []
created: 2026-09-28T15:39:20.443Z
---

# Explaining recommendations

An explanation tells a user, regulator or engineer why an item was recommended, such as "because you watched X". An explanation is faithful only if it reflects what actually drove the model's score, and many deployed explanations are plausible stories generated after the fact.

## Why it matters

Users can trust and correct a system whose reasons they see, engineers debug with them, and regulators ask for them. In CP4285 this is the transparency half of Module 5, next to [[data-minimization-in-recommenders]].

## The idea

**Styles.**

| Style | Example | Natural source |
|---|---|---|
| Item-based | "Similar to X, which you watched" | Item-item similarity |
| User-based | "People like you enjoyed this" | User neighbourhoods |
| Feature-based | "Because you like science fiction" | Content features |

Item-based explanations follow directly from [[neighborhood-collaborative-filtering]], where the prediction really is a weighted sum over the user's rated items, so the top contributors are a faithful reason.

**Faithfulness.** Latent-factor and deep models do not score by named reasons. A factor model's score is a dot product over unlabelled dimensions plus biases. An explanation for such a model is usually post hoc: a separate procedure finds something in the history that looks related. It can be convincing and still false.

**Goals differ.** Explanations are built for transparency (how does it work?), scrutability (letting users correct the profile, "I'm not interested in this"), trust, persuasiveness, effectiveness (helping the user decide well) and efficiency. Persuasiveness and effectiveness can conflict: an explanation that makes people click is not necessarily one that helps them choose.

**Regulation.** The EU Digital Services Act requires online platforms that use recommender systems to set out the main parameters of those systems, and any options users have to change them, in plain language in their terms and conditions (Article 27). Very large online platforms and search engines must also offer at least one recommender option not based on profiling (Article 38).

## Worked example

A matrix factorisation model recommends a nature documentary. The interface shows "Because you watched *Ocean Film*", chosen by searching the user's history for the item whose vector is most similar to the documentary's.

Test it counterfactually: remove *Ocean Film* from the history, retrain or refit the user vector, and rescore. Suppose the score barely moves, because it came mostly from the documentary's large item bias $b_i$ (everyone rates it well) and a latent dimension shaped by dozens of other items. The explanation was plausible and unfaithful. A faithful version would say something closer to "popular with viewers overall, and matches your recent viewing".

## Failure modes

- **Plausible but unfaithful.** Post-hoc reasons can mislead users and auditors about what the model uses.
- **Explanations as persuasion.** Optimising explanations for click-through can manipulate rather than inform.
- **Leaking private data.** "People like you" or "your friend liked this" can reveal other people's behaviour.
- **No way to act.** An explanation without a control to correct the profile gives transparency but not scrutability.

## Prerequisites

None beyond general background.

Useful background: [[neighborhood-collaborative-filtering]].

## Checks

```check
q: What makes an explanation of a recommendation faithful, and how can you test it?
a: It is faithful if the reason it gives actually drove the model's score. A test is counterfactual: remove or change the cited item or feature and check whether the score changes substantially.
why: Catches judging explanations by plausibility instead of by whether they reflect the model.
```

```check
q: Why are item-based explanations naturally faithful for item-based collaborative filtering but not for matrix factorisation?
a: In item-based CF the prediction is literally a weighted sum over the user's rated items, so the largest contributors are the real reason. In matrix factorisation the score is a dot product over unlabelled latent dimensions plus biases, so any named item is chosen after the fact.
why: Catches assuming any model can be explained with the same style at equal honesty.
```

```check
q: What does the EU Digital Services Act require of online platforms regarding recommender systems?
a: Platforms must explain the main parameters of their recommender systems, and any options users have to modify them, in plain language in their terms and conditions. Very large platforms must also offer at least one option not based on profiling.
why: Catches overstating the law as requiring per-item explanations for every recommendation.
```
