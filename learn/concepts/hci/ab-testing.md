---
id: ab-testing
title: A/B testing
summary: A randomised experiment comparing variants on one metric fixed in advance, with sample size set beforehand and significance read correctly.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:32:09.853Z
---

# A/B testing

An A/B test is a randomised controlled experiment on a live product. Users are randomly split between the current version (A) and a variant (B), and the team compares one metric chosen in advance. Since the design is the only systematic difference between groups, a reliable gap in the metric can be credited to it.

## Why it matters

Opinions about designs are often wrong. An A/B test replaces "I think the green button is better" with measured behaviour at scale.

It is also easy to run badly: checking early, changing the metric afterwards, or using too little traffic all produce confident answers that are noise.

## The idea

A sound test is set up before any data arrives:

1. **Hypothesis.** A specific prediction with a reason: "Showing the delivery fee on the product page will raise completed checkouts, because fewer people will abandon at a surprise fee."
2. **One primary metric.** The number that decides the test, such as checkout completion rate. Others can be watched; only one decides.
3. **Sample size fixed in advance.** Worked out from the current rate, the smallest effect worth detecting, and the error rates you accept. Then wait until you have it.

**Statistical significance** is widely misread. "Significant at 5%" means: if there were truly no difference, a gap at least this large would appear less than 5% of the time. It does not mean a 95% chance that B is better.

**Peeking** is checking repeatedly and stopping once results look significant. Random data drifts in and out of significance, so stopping at a lucky moment makes false positives far more likely than the intended 5%.

**Traffic** is the practical limit. Small effects on low rates need many users per variant, so small products often cannot run meaningful tests.

CS2111 (Human-Centred Computing) places this under its Evaluating Usability module.

## Worked example

An online shop converts 4% of visitors who reach checkout. The team wants to detect a rise to 4.4% (a 10% relative lift). A common rule of thumb for standard settings (5% significance, 80% power) puts this at roughly 16 × 0.04 × 0.96 ÷ 0.004², or about 38,000 visitors per variant. With 2,000 checkout visitors a day split between versions, that takes over five weeks.

On day four, B shows 4.9% against A's 4.0%, and the dashboard says "significant". The team does not stop: they have a small fraction of the planned sample. By the planned end, B sits at 4.2% against 4.0%, not a significant difference. Stopping on day four would have shipped noise.

## Failure modes

- **Peeking and stopping early.** Tests "win" fast and the effect fades after launch.
- **Choosing the metric afterwards.** Scan twenty metrics and one will often move by chance.
- **Too little traffic.** A test that can only detect huge effects usually reports "no difference".
- **Broken randomisation.** If one group gets more returning users or one device type, the comparison is unfair.

## Checks

```check
q: A test result is 'significant at the 5% level'. Does that mean there is a 95% chance the variant is better? What does it mean?
a: No. It means that if there were truly no difference, a gap at least this large would occur less than 5% of the time. It says how surprising the data is under no difference, not the probability that B is better.
why: Catches the most common misreading of significance as the probability the variant wins.
```

```check
q: A team checks its A/B test daily and stops the first day it shows significance. What goes wrong?
a: Random data drifts in and out of significance, so stopping at the first significant moment inflates the false positive rate well above 5%. The sample size should be fixed in advance and the test run to it.
why: Catches the belief that checking more often only makes you faster, not less accurate.
```

```check
q: Why must the primary metric be chosen before the test starts?
a: If you pick it after seeing the data, you can scan many metrics until one moves by chance, which gives false wins. Fixing it in advance keeps the test honest.
why: Catches post-hoc metric selection disguised as analysis.
```
