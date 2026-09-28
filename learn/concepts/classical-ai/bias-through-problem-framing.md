---
id: bias-through-problem-framing
title: Bias enters through problem framing
summary: Much of an AI system's bias is decided before any model is trained, by what target is predicted, which proxy stands in for it, which data are used and which fairness criterion is chosen, and those choices should be stated openly because common fairness criteria cannot all hold at once.
requires: []
assumes: [behavioral-testing-of-ai-systems]
tags: [classical-ai, responsible-ai]
sources: [https://ai.google/responsibility/responsible-ai-practices/]
created: 2026-09-28T15:40:23.909Z
---

# Bias enters through problem framing

Much of an AI system's bias is decided before any model is trained, by what target
is predicted, which proxy stands in for it, which data are used and which fairness
criterion is chosen, and those choices should be stated openly because common
fairness criteria cannot all hold at once.

CS4263 covers this as bias, transparency and careful specification of open
problems, under responsible AI design.

## Why it matters

It is tempting to treat bias as a property of a model that a better algorithm can
remove. Often the model faithfully learns exactly what it was asked to learn, and
the problem is the question. The course capstone asks students to frame an
open-ended problem themselves, which is exactly where these choices get made.

## The idea

**Framing choices that carry values.**

1. **Target and proxy.** The thing you care about (health need, job performance,
   risk) is often not measurable, so a proxy is predicted instead (health costs,
   past promotions, re-arrests). If the proxy relates differently to the target
   across groups, the model inherits that gap.
2. **Data.** Who is in the data, who is missing, and whose past decisions
   produced the labels.
3. **Objective and threshold.** What error is costlier, and for whom.

**Fairness criteria** formalise different intuitions:

- *demographic parity:* equal rates of positive predictions across groups;
- *equalised odds:* equal true positive and false positive rates across groups;
- *calibration:* among people given the same score, the same fraction are truly
  positive in every group.

When the true base rates differ between groups, calibration and equal error rates
cannot in general all hold together (results by Kleinberg and colleagues, and by
Chouldechova, 2016 to 2017). So "make it fair" requires choosing which criterion,
and that is a value judgement, not a technical detail.

**Transparency** makes the choices reviewable: document the target, proxy, data,
criterion and known limits, for example as a model card (Mitchell and colleagues,
2019).

## Worked example

A widely used US healthcare algorithm, studied by Obermeyer and colleagues (2019),
predicted patients' future health costs as a proxy for health needs, to decide
who got extra care. Because less money had historically been spent on Black
patients with the same level of illness, the model rated them as healthier than
equally sick white patients, and fewer were referred. The model predicted costs
accurately; the bias came from choosing cost as the target. Re-framing the
target toward direct measures of health reduced the disparity substantially.

## Failure modes

- **Treating the proxy as the goal** without asking how it differs across groups.
- **Declaring a model fair** without saying by which criterion.
- **Removing the protected attribute and stopping there:** other features can
  encode it.
- **Leaving framing decisions undocumented,** so nobody can review them.

## Prerequisites

Background: [[behavioral-testing-of-ai-systems]] (how disparities are measured
once a system exists).

## Checks

```check
q: In the healthcare algorithm studied by Obermeyer and colleagues, where did the bias come from?
a: From the framing: it predicted future health costs as a proxy for health need, and because less had historically been spent on equally sick Black patients, the accurate cost predictions under-rated their need.
why: Checks the core example of proxy bias.
```

```check
q: Define demographic parity, equalised odds and calibration.
a: Demographic parity: equal positive prediction rates across groups. Equalised odds: equal true positive and false positive rates across groups. Calibration: among people with the same score, the same fraction are truly positive in every group.
why: Checks the vocabulary of fairness criteria.
```

```check
q: Why is choosing a fairness criterion a value judgement rather than a purely technical step?
a: When base rates differ between groups, common criteria such as calibration and equal error rates cannot all be satisfied at once, so one must decide which notion of fairness matters for the application.
why: Checks understanding of the impossibility results and their consequence.
```
