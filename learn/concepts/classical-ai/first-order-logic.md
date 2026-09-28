---
id: first-order-logic
title: First-order logic
summary: First-order logic describes a world of objects with properties, relations and functions, and quantifies over them with "for all" and "there exists", so one sentence can state a general rule that propositional logic would need a symbol for every case to express.
requires: [propositional-entailment-and-inference]
tags: [classical-ai, logic]
sources: [https://plato.stanford.edu/entries/logic-classical/]
created: 2026-09-28T15:36:24.773Z
---

# First-order logic

First-order logic describes a world of objects with properties, relations and
functions, and quantifies over them with "for all" and "there exists", so one
sentence can state a general rule that propositional logic would need a symbol
for every case to express.

CS4263 covers first-order logic with unification and resolution
([[resolution-with-unification]]) as its inference method.

## Why it matters

Propositional logic has no way to talk about "every student" or "some course".
To say that every student who passes all modules graduates, it needs a separate
symbol per student, and it cannot handle a student it has not heard of. First-order
logic is expressive enough for most of the knowledge a classical AI system
represents, and it is the language that knowledge bases, logic programming and
many planning formalisms borrow from.

## The idea

**Building blocks.**

- **Constants** name objects: Socrates, CS4263.
- **Predicates** state properties and relations: Human(Socrates),
  Takes(Ann, CS4263).
- **Functions** map objects to objects: Mother(Ann).
- **Variables** (x, y) and **quantifiers**: ∀x (for all x) and ∃x (there
  exists an x).

A model now contains a set of objects and says which relations hold among them.

**The two quantifier pitfalls.**

1. ∀ goes with →. "All humans are mortal" is ∀x Human(x) → Mortal(x). Writing
   ∀x Human(x) ∧ Mortal(x) says everything is a mortal human.
2. ∃ goes with ∧. "Some student takes CS4263" is
   ∃x Student(x) ∧ Takes(x, CS4263). Writing ∃x Student(x) → Takes(x, CS4263) is
   made true by anything that is not a student.

**Order matters.** ∀x ∃y Loves(x, y) says everyone loves someone (possibly
different people); ∃y ∀x Loves(x, y) says there is one person everyone loves.

**The price of expressiveness.** Entailment in first-order logic is
semidecidable: if KB entails α, a complete procedure will eventually prove it, but
if not, the procedure may run forever.

## Worked example

"Every module with a lab needs a lab room, and CS4263 has a lab."

- ∀m (Module(m) ∧ HasLab(m)) → NeedsRoom(m, Lab)
- Module(CS4263) ∧ HasLab(CS4263)

Substituting m = CS4263 in the rule (universal instantiation) and applying modus
ponens derives NeedsRoom(CS4263, Lab). The rule covers every module, including
ones added to the knowledge base later.

## Failure modes

- **∀ with ∧** or **∃ with →,** the two classic translation errors.
- **Swapping quantifier order,** changing the meaning completely.
- **Treating functions as relations:** Mother(Ann) denotes an object; it is not
  true or false.
- **Expecting a decision procedure:** non-entailment may never be reported.

## Prerequisites

- [[propositional-entailment-and-inference]]

## Checks

```check
q: Translate "All humans are mortal" and "Some student takes CS4263" into first-order logic.
a: ∀x Human(x) → Mortal(x), and ∃x Student(x) ∧ Takes(x, CS4263).
why: Checks the quantifier-connective pairing.
```

```check
q: What is wrong with writing "Some student takes CS4263" as ∃x Student(x) → Takes(x, CS4263)?
a: An implication with a false premise is true, so any object that is not a student makes the sentence true; it no longer says that a student takes the module.
why: Targets the most common existential mistake.
```

```check
q: What can first-order logic express that propositional logic cannot, and what does it cost?
a: General statements about objects and relations using variables and quantifiers, covering unseen objects in one sentence. The cost is that entailment becomes only semidecidable: a non-entailed query may run forever.
why: Checks both the gain and the price.
```
