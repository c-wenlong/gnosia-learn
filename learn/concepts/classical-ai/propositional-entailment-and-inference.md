---
id: propositional-entailment-and-inference
title: "Propositional logic: entailment and inference"
summary: A knowledge base entails a sentence when the sentence is true in every model (truth assignment) in which the knowledge base is true, and an inference procedure is judged by whether it derives only entailed sentences (sound) and all of them (complete).
requires: []
tags: [classical-ai, logic]
sources: [https://plato.stanford.edu/entries/logic-classical/]
created: 2026-09-28T15:36:20.757Z
---

# Propositional logic: entailment and inference

A knowledge base entails a sentence when the sentence is true in every model
(truth assignment) in which the knowledge base is true, and an inference
procedure is judged by whether it derives only entailed sentences (sound) and all
of them (complete).

CS4263 covers propositional syntax and semantics, and inference rules, as the
base of knowledge representation.

## Why it matters

A logical agent stores what it knows as sentences and derives new facts from
them. Whether those derived facts can be trusted depends entirely on the
difference between what follows (entailment, a semantic fact) and what a
procedure derives (inference, a mechanical one). Every later topic, first-order
logic and resolution included, rests on this distinction.

## The idea

**Syntax.** Proposition symbols (P, Q, Rain) combined with connectives: ¬ (not),
∧ (and), ∨ (or), → (implies), ↔ (if and only if).

**Semantics.** A **model** assigns true or false to every symbol; the connectives'
truth tables then fix the truth of every sentence. Note that P → Q is false only
when P is true and Q is false.

**Entailment.** KB ⊨ α means: in every model where KB is true, α is also true.
Equivalently, KB ∧ ¬α has no model (is unsatisfiable), which is the basis of
proof by contradiction.

**Inference.** KB ⊢ α means a procedure derives α from KB. Two properties:

- **Sound:** it derives only entailed sentences.
- **Complete:** it can derive every entailed sentence.

Two families of procedure:

1. **Model checking:** enumerate all 2^n models of n symbols and check. Sound and
   complete, and exponential.
2. **Theorem proving:** apply inference rules such as modus ponens (from α → β
   and α, derive β) and and-elimination (from α ∧ β, derive α). Resolution is a
   single rule that is complete for refutation.

Checking satisfiability of propositional sentences (SAT) is NP-complete, yet
modern SAT solvers handle millions of variables on many practical problems.

## Worked example

KB: "If it rains, the ground is wet" (Rain → Wet) and "It rains" (Rain).
Does KB ⊨ Wet? Models over {Rain, Wet}:

| Rain | Wet | Rain → Wet | KB true? |
| --- | --- | --- | --- |
| T | T | T | yes |
| T | F | F | no |
| F | T | T | no |
| F | F | T | no |

In the only model where KB is true, Wet is true, so KB ⊨ Wet. Modus ponens derives
it in one step. But KB does not entail anything about Wet if we drop Rain:
"the ground is wet, so it rained" is the fallacy of affirming the consequent.

## Failure modes

- **Confusing entailment with inference:** what is true in all models versus
  what a procedure produces.
- **Reading → as causation,** or thinking P → Q is false whenever P is false.
- **Affirming the consequent:** from P → Q and Q, concluding P.
- **Assuming model checking scales:** 2^n grows too fast beyond small n.

## Checks

```check
q: What does KB ⊨ α mean, and how can it be tested by satisfiability?
a: α is true in every model in which KB is true. Equivalently, KB ∧ ¬α is unsatisfiable (has no model).
why: Checks the semantic definition and its link to refutation.
```

```check
q: What do soundness and completeness mean for an inference procedure?
a: Sound: it only derives sentences that are entailed. Complete: it can derive every sentence that is entailed.
why: Checks the two properties used to judge any inference method.
```

```check
q: KB contains Rain → Wet and Wet. Does KB entail Rain? Justify with a model.
a: No. The model Rain = false, Wet = true makes both KB sentences true while Rain is false, so Rain is not entailed (concluding it would be affirming the consequent).
why: Tests entailment with a counter-model.
```
