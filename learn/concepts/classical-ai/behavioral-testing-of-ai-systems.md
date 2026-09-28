---
id: behavioral-testing-of-ai-systems
title: Behavioural testing of AI systems
summary: An aggregate score hides where an AI system fails, so test its behaviour directly with targeted cases (minimum capabilities, outputs that should not change, outputs that should change in a known direction) and look for known failure patterns such as shortcuts and distribution shift.
requires: []
tags: [classical-ai, evaluation, responsible-ai]
sources: [https://ai.google/responsibility/responsible-ai-practices/]
created: 2026-09-28T15:40:20.046Z
---

# Behavioural testing of AI systems

An aggregate score hides where an AI system fails, so test its behaviour directly
with targeted cases (minimum capabilities, outputs that should not change, outputs
that should change in a known direction) and look for known failure patterns such
as shortcuts and distribution shift.

CS4263 covers this as evaluating AI system behaviour and failure modes, under
responsible AI design.

## Why it matters

"94% accuracy on the test set" says nothing about which 6% fail, and those are
often concentrated in a group of users, a phrasing, or a situation that matters.
A test set also shares the biases of the training data, so a model can score well
while relying on the wrong cues. Behavioural testing, borrowed from software
testing, finds these failures before users do.

## The idea

**Test capabilities, not just accuracy.** The CheckList method (Ribeiro and
colleagues, 2020) organises tests by capability (negation, named entities,
robustness to typos, fairness across groups) and by test type:

1. **Minimum functionality tests:** simple cases the system must get right
   ("I did not like this film" is negative).
2. **Invariance tests:** changes that should not affect the output (swapping a
   person's name or a city, adding a typo).
3. **Directional expectation tests:** changes that should move the output one
   way (adding "the food was awful" should not make a review more positive).

**Slice the evaluation.** Report performance per subgroup, input type and
condition, not only overall.

**Know the common failure patterns.**

- *Shortcut learning:* the model uses a cue correlated with the label in training
  data (a hospital's scanner tag, a watermark) instead of the real signal.
- *Distribution shift:* inputs in deployment differ from training (new users, new
  season, new sensor), and performance quietly drops.
- *Specification gaming:* an agent optimises the stated objective in a way that
  misses its intent.
- *Overconfidence:* high confidence on inputs unlike anything seen in training.

**Keep testing after release.** Monitor slices and inputs in production, since
the world moves.

## Worked example

A sentiment model scores 92% on its test set. CheckList-style tests show: it
labels "not bad at all" as negative (negation failure); changing a reviewer's
name from "John" to "Jamal" changes the predicted score (an invariance failure
that is also a fairness problem); and adding "but the ending was terrible" to a
positive review does not lower the score (directional failure). None of this was
visible in the 92%.

## Failure modes

- **Trusting one aggregate metric.**
- **Test sets drawn from the same pipeline as training,** sharing its blind spots.
- **Testing only at launch,** missing later distribution shift.
- **Fixing individual failing examples** instead of the capability they reveal.

## Checks

```check
q: Name the three test types in the CheckList approach and give an example of each.
a: Minimum functionality tests (simple cases that must be right, such as a plain negation), invariance tests (changes that should not change the output, such as swapping a name), and directional expectation tests (changes that should move the output one way, such as adding a clearly negative clause).
why: Checks the core method.
```

```check
q: What is shortcut learning, and why can a high test accuracy fail to reveal it?
a: The model relies on a cue that happens to correlate with the label in the data rather than on the intended signal. If the test set comes from the same data, the shortcut works there too, so accuracy stays high until deployment breaks the correlation.
why: Checks a key failure pattern and why standard evaluation misses it.
```

```check
q: Why is evaluation not finished at release?
a: Deployment inputs drift away from the training distribution over time, so performance can drop silently; slices and inputs need monitoring in production.
why: Checks awareness of distribution shift.
```
