---
id: limits-of-logical-representation
title: Where logical representation breaks
summary: Pure logic struggles with uncertain knowledge, with rules that have endless exceptions, with stating what does not change, and with the cost of reasoning at scale, which is why AI moved toward probability and learning for much of what it represents.
requires: []
assumes: [first-order-logic]
tags: [classical-ai, logic]
sources: [https://plato.stanford.edu/entries/logic-classical/]
created: 2026-09-28T15:36:33.037Z
---

# Where logical representation breaks

Pure logic struggles with uncertain knowledge, with rules that have endless
exceptions, with stating what does not change, and with the cost of reasoning at
scale, which is why AI moved toward probability and learning for much of what it
represents.

CS4263 covers these limits under uncertainty, scale and brittleness.

## Why it matters

Logic-based expert systems had real successes in narrow domains and then hit a
wall when extended. Knowing why is what lets you choose the right representation
for a new problem, and why logic is still the right tool for some parts of a
system (constraints, verification, rules that genuinely have no exceptions).

## The idea

1. **Uncertainty.** Logic says true or false. Real knowledge is often "usually"
   or "with probability 0.8": a symptom suggests but does not prove a disease.
   Writing the rule as certain makes the system confidently wrong; leaving it out
   makes it useless. Probability theory represents degrees of belief directly.
2. **The qualification problem.** "Birds fly" has endless exceptions: penguins,
   ostriches, injured birds, birds in cages, dead birds. Listing every
   qualification in advance is impossible.
3. **Monotonicity.** In classical logic, adding knowledge never removes a
   conclusion. But people reason by default ("Tweety is a bird, so Tweety flies")
   and retract when told more ("Tweety is a penguin"). Non-monotonic logics were
   developed for this and are hard to use well.
4. **The frame problem.** When an action happens, stating what it does not change
   (moving a cup does not change the colour of the walls) naively needs a huge
   number of axioms.
5. **Scale and knowledge acquisition.** First-order entailment is semidecidable,
   and practical inference over large knowledge bases is expensive. Worse, the
   knowledge has to be written by hand, which is slow, and the result is
   **brittle**: it fails abruptly on inputs just outside what its authors
   anticipated, rather than degrading gracefully.

These pressures pushed AI toward probabilistic models (Bayesian networks, MDPs)
and toward learning knowledge from data. Logic did not disappear: planning
languages, databases, verification and constraint solvers still rely on it, and
current work combines logical structure with learned components.

## Worked example

A medical rule base says Fever ∧ Cough → Flu. A patient with fever and cough
from a different infection is diagnosed with flu, with full confidence, and there
is no way to express "flu is the most likely cause, at about 60%". Adding
¬OtherInfection to the rule requires knowing in advance every other infection,
which is the qualification problem again. A probabilistic model instead
represents P(Flu | Fever, Cough) and updates it as test results come in.

## Failure modes

- **Encoding "usually" as "always,"** producing confident errors.
- **Patching exceptions one at a time,** a list that never ends.
- **Concluding logic is obsolete,** when it remains the right tool for hard
  constraints and verification.
- **Underestimating the cost of hand-built knowledge** and its maintenance.

## Prerequisites

Background: [[first-order-logic]] (the representation whose limits these are).

## Checks

```check
q: What is the qualification problem?
a: The impossibility of listing in advance all the conditions under which a general rule holds, such as every exception to "birds fly".
why: Checks one of the named limits precisely.
```

```check
q: Why is classical logic called monotonic, and why is that a problem for common-sense reasoning?
a: Adding knowledge never removes a conclusion. Common-sense reasoning draws default conclusions and retracts them when new facts arrive (Tweety flies, until we learn Tweety is a penguin), which classical logic cannot do.
why: Checks understanding of default reasoning.
```

```check
q: What does it mean that a hand-built logical knowledge base is brittle, and what alternative approaches address it?
a: It works inside the cases its authors anticipated and fails abruptly just outside them, rather than degrading gracefully. Probabilistic models represent uncertainty directly, and learning from data reduces reliance on hand-written rules.
why: Links the limit to the field's response.
```
