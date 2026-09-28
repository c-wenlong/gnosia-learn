---
id: resolution-with-unification
title: Resolution and unification
summary: Resolution proves a first-order query by adding its negation to the knowledge base in clause form and deriving the empty clause, using unification to find the variable substitution that makes two literals match.
requires: [first-order-logic]
tags: [classical-ai, logic]
sources: [https://plato.stanford.edu/entries/logic-classical/]
created: 2026-09-28T15:36:28.999Z
---

# Resolution and unification

Resolution proves a first-order query by adding its negation to the knowledge
base in clause form and deriving the empty clause, using unification to find the
variable substitution that makes two literals match.

CS4263 covers unification and resolution as the inference machinery for
[[first-order-logic]].

## Why it matters

Resolution is a single inference rule that is refutation-complete: if a set of
clauses is unsatisfiable, resolution will derive a contradiction. That is why it
underlies automated theorem provers, and unification, its matching step, is also
the core operation of Prolog and of type inference in programming languages.

## The idea

**Unification.** Two atomic sentences unify if a substitution of terms for
variables makes them identical. The **most general unifier** (MGU) commits to no
more than necessary.

- Knows(John, x) and Knows(y, Mother(y)) unify with {y/John, x/Mother(John)}.
- Knows(John, x) and Knows(x, Elizabeth) do not, unless the variables are first
  renamed apart (standardising apart); then they unify with
  {x/Elizabeth, x2/John}.
- x and F(x) do not unify: the **occurs check** prevents an infinite term.

**Clause form (CNF).** Convert the knowledge base: eliminate → and ↔, move ¬
inward, rename variables apart, replace existential variables with Skolem
constants or functions, drop the ∀, and distribute ∨ over ∧. The result is a set
of clauses, each a disjunction of literals.

**The resolution rule.** From two clauses containing literals that unify with
opposite signs, derive a new clause: all the remaining literals of both, with the
unifier applied.

**Refutation.** To prove KB ⊨ α, add ¬α to the clauses and resolve until the
**empty clause** appears (a contradiction). If KB ∧ ¬α is unsatisfiable, KB
entails α.

## Worked example

KB: ∀x Human(x) → Mortal(x), and Human(Socrates). Query: Mortal(Socrates).

Clauses:
1. ¬Human(x) ∨ Mortal(x)
2. Human(Socrates)
3. ¬Mortal(Socrates) (the negated query)

Resolve 1 and 3: Mortal(x) unifies with Mortal(Socrates) under {x/Socrates},
giving ¬Human(Socrates). Resolve that with 2: the empty clause. So the query is
entailed.

## Failure modes

- **Forgetting to negate the query** before adding it.
- **Skipping standardising apart,** so a unification fails that should succeed.
- **Omitting the occurs check,** accepting x = F(x).
- **Skolemising wrongly:** an existential inside a universal needs a Skolem
  function of that variable, not a constant.
- **Expecting termination** when the query is not entailed.

## Prerequisites

- [[first-order-logic]]

## Checks

```check
q: Find the most general unifier of Knows(John, x) and Knows(y, Mother(y)).
a: {y/John, x/Mother(John)}.
why: Tests unification with a function term.
```

```check
q: How does resolution refutation prove that KB entails α?
a: Convert KB and ¬α to clause form, then apply resolution until the empty clause is derived; that shows KB ∧ ¬α is unsatisfiable, so KB entails α.
why: Checks the proof strategy end to end.
```

```check
q: What does the occurs check prevent in unification?
a: Unifying a variable with a term that contains it, such as x with F(x), which would require an infinite term.
why: Checks a detail that is often dropped for speed and causes unsound results.
```
