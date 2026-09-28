---
id: online-ab-testing
title: Online A/B testing for recommenders
summary: An online A/B test randomly assigns live users to the current recommender (control) or a new one (treatment) and compares a primary metric chosen in advance, while guardrail metrics watch for harm. It measures what the new model actually does to behaviour, which offline replay of old logs cannot.
requires: []
assumes: [offline-ranking-metrics]
tags: [recommenders]
sources: []
created: 2026-09-28T15:38:37.449Z
---

# Online A/B testing for recommenders

An online A/B test randomly assigns live users to the current recommender (control) or a new one (treatment) and compares a primary metric chosen in advance, while guardrail metrics watch for harm. It measures what the new model actually does to behaviour, which offline replay of old logs cannot.

## Why it matters

[[offline-ranking-metrics]] score a model against interactions the old system caused: users could only click what they were shown. A new model shows different items, and users respond to the list itself, so offline wins often shrink or reverse. In CP4285 it is the online half of Module 2.

## The idea

**Design.** Randomise at the user level so each person sees one consistent experience. Fix a primary metric (click-through rate, watch time, retention, revenue) and guardrails (latency, complaints, unsubscribes) before starting, so the result cannot be chosen after the fact.

**Sample size.** Decide the smallest lift worth detecting, the false-positive rate $\alpha$ (often 0.05) and the power (often 80%), and compute how many users each arm needs. Small relative lifts on small base rates need large samples.

**Duration.** Run for whole weeks, since behaviour differs by weekday, and long enough for the novelty effect to fade: users click on anything new at first.

**Interleaving.** For comparing two rankers, merge their lists into one list shown to the same user and credit each click to the ranker that contributed that item. Every user compares both, so interleaving usually detects a preference with far fewer users than an A/B test. It measures relative click preference, not downstream outcomes such as retention.

## Worked example

Control CTR is 4.0%; the team wants to detect a lift to 4.2% (5% relative). With $\alpha = 0.05$ two-sided and 80% power, the normal approximation gives

$$n \approx \frac{(1.96 + 0.84)^2\,[0.04 \cdot 0.96 + 0.042 \cdot 0.958]}{0.002^2} \approx 154{,}000$$

users per arm, treating each user's click as one independent trial.

Suppose a one-day test shows treatment at 4.4%, a 10% lift. Two things make that misleading. One day of traffic is well under the required sample, so the estimate is noisy. And a new layout attracts curiosity clicks that fade; if the lift is 10% on day 1 and 1% by week 2, only the second number describes the long run. (These lift figures are illustrative.)

## Failure modes

- **Peeking.** Checking the p-value daily and stopping at the first value below 0.05 inflates the false-positive rate well above 5%. Fix the sample size, or use sequential methods built for repeated looks.
- **Multiple testing.** Twenty metrics or user segments at $\alpha = 0.05$ will produce about one "significant" result by chance.
- **Interference.** Treatment and control users share inventory, sellers or social feeds, so one arm's behaviour leaks into the other and the independence assumption fails.
- **Short-term proxy.** A model that maximises clicks this week can lower satisfaction or retention later, which a short test never sees.

## Prerequisites

None beyond general background.

Useful background: [[offline-ranking-metrics]].

## Checks

```check
q: Why can a model that wins clearly on offline NDCG lose in an A/B test?
a: Offline logs only contain reactions to items the old system chose to show, so the new model is judged on the old policy's exposure. Live users react to the new list itself, including items never logged, so the offline estimate can be biased.
why: Catches treating logged interactions as an unbiased picture of what users would do under any policy.
```

```check
q: An analyst checks an A/B test every morning and stops the first day p is below 0.05. What goes wrong?
a: Each look is another chance for noise to cross the threshold, so the overall false-positive rate ends up well above 5%. The sample size should be fixed in advance or a sequential test designed for repeated looks should be used.
why: Catches believing a p-value stays valid under optional stopping.
```

```check
q: A new recommender shows a 10% CTR lift on its first day. Give two reasons not to ship on that result.
a: One day is usually far below the sample size needed, so the estimate is noisy, and it misses weekly cycles. The novelty effect inflates early engagement with anything new, so the lift may shrink as users get used to it.
why: Catches ignoring novelty effects and weekly seasonality in test duration.
```
