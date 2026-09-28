---
id: minimum-viable-product
title: Minimum viable product
summary: "The version that yields the most validated learning for the least effort: an experiment planned backwards from what you need to learn, not a small v1."
requires: []
assumes: [problem-validation]
tags: [product]
sources: []
created: 2026-09-28T15:33:27.951Z
---

# Minimum viable product

A minimum viable product (MVP) is the version of a product that gives the most validated learning about customers for the least effort. Eric Ries popularised the idea in The Lean Startup (2011). An MVP is an experiment built to test a specific assumption, not a small first release with fewer features.

## Why it matters

Under time pressure, teams often read "minimum" as "cut features until it fits" and ship a thin version that answers no question. An MVP replaces a guess with evidence, early and cheaply. Once [[problem-validation]] suggests the problem is real, an MVP tests whether people will actually use or pay for your answer to it.

## The idea

CS3216 (Software Product Engineering for Digital Markets) places this under its Rapid Iterative Development module.

Ries describes a build-measure-learn loop: build, measure how people respond, learn whether the assumption held, then persevere or pivot. It runs in that order, but Ries recommends planning it in reverse:

1. **Learn.** What is the riskiest thing we need to find out?
2. **Measure.** What behaviour would tell us, and what result counts as success?
3. **Build.** What is the least we can build to get that measurement?

Common kinds of MVP:

- **Landing page or smoke test.** A page describes the product and asks for a sign-up or pre-order before anything exists. Tests whether people act.
- **Concierge.** You deliver the service by hand to a few customers who know a person is doing it. Tests whether the outcome is valued.
- **Wizard of Oz.** Users see what looks like a working product, but a person does the work behind it. Tests whether people use it as intended, before you automate.

"Viable" matters too: a broken prototype measures your bugs, not their demand.

## Worked example

A team plans an AI study planner that turns timetables and deadlines into weekly revision plans. Learn: will students follow a generated plan at all? Measure: the share completing at least half their planned sessions in week one, with 50% set in advance as the bar. Build: no model and no app.

They run a Wizard of Oz test. Fifteen students submit timetables through a form; a team member writes each plan by hand in the format the AI would produce, and checks in daily. Only four clear the bar. Interviews show plans broke as soon as the week changed, so adapting mid-week matters more than plan quality. The team learns this before building any model pipeline.

## Failure modes

- **The small first version.** A cut-down product with no named question. Notice it when nobody can say what the MVP tests.
- **No success bar set in advance.** Results get read generously afterwards.
- **Vanity metrics.** Page views or sign-ups nobody follows up on. Measure the behaviour the assumption predicts.
- **Too minimal to be viable.** People drop out for reasons unrelated to the idea.

## Prerequisites

- [[problem-validation]] (background)

## Checks

```check
q: A team cuts their planned app from ten features to four and calls it their MVP. What question should you ask to tell whether it really is one?
a: Which assumption is it testing, and what measurement would confirm or refute it? If they cannot name one, it is a small first release, not an MVP.
why: Catches equating MVP with a reduced feature set rather than an experiment.
```

```check
q: In what order does Ries recommend planning the build-measure-learn loop, and why that order?
a: In reverse: decide what you need to learn, then what to measure to learn it, then the least you must build to get that measurement. Starting from the build tends to produce things that answer no question.
why: Catches planning the loop in the order it runs, which starts with building.
```

```check
q: What is the difference between a concierge MVP and a Wizard of Oz MVP?
a: In both, people do the work by hand. In a concierge MVP the customer knows a person is delivering the service; in a Wizard of Oz MVP the customer sees what looks like an automated product.
why: Catches treating the two manual approaches as the same thing.
```
