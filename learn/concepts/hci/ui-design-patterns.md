---
id: ui-design-patterns
title: UI design patterns
summary: A named, reusable solution to a recurring interaction problem in a given context, which lowers learning cost because users already know it.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:31:44.555Z
---

# UI design patterns

A UI design pattern is a named, reusable solution to an interaction problem that keeps coming up in a particular context. Undo, the step-by-step wizard, and pagination are patterns: each solves a known problem in a known way. A pattern describes the shape of a solution, not a finished component, so it is adapted each time it is used.

## Why it matters

Users arrive with expectations built from every other product they have used. When a checkout looks like a checkout and undo sits where undo usually sits, people spend no effort learning it. Patterns lower the learning cost because the learning already happened elsewhere.

For designers, a pattern name is shorthand: "use a wizard here" brings its known trade-offs into the conversation.

## The idea

The idea comes from architecture. Christopher Alexander and colleagues published *A Pattern Language* in 1977, describing recurring building and town problems with a named solution for each. Software and interaction designers later borrowed the format.

A pattern has four parts:

| Part | Question it answers |
| --- | --- |
| Name | What do we call it? |
| Context | When does this situation arise? |
| Problem | What tension needs resolving? |
| Solution | What arrangement resolves it, and at what cost? |

Context matters most. A wizard suits a long task that novices do once, such as setting up a router. It irritates an expert who does the task daily and wants every field on one screen.

Patterns have a shadow side. A dark pattern (see [[dark-patterns]]) is a recurring design that works against the user, such as a hidden cancel button. It uses the same familiarity, but to mislead rather than to help.

CS2111 (Human-Centred Computing) places this under its Designing Interactions module.

## Worked example

A team must choose between infinite scroll and pagination for two screens.

The first is a social feed. People browse with no target, so infinite scroll fits: content keeps flowing without interruption.

The second is a product search with 600 results. Here people compare items, leave to view one, and come back. Infinite scroll causes three problems: the scroll position is often lost on return, the footer is unreachable, and there is no way to say "it was on page 3". Pagination fits better, because it gives each position a stable address.

Same problem name ("show many items"), different contexts, different pattern.

## Failure modes

- **Ignoring context.** Copying a pattern because a famous product uses it, without checking the situation matches. Notice it when users fight the pattern.
- **Breaking the expected behaviour.** A familiar-looking control that acts differently is worse than an unfamiliar one, because it triggers the wrong expectation.
- **Pattern as template.** Using it as a fixed component and skipping the adaptation.
- **Mixing patterns.** Two navigation patterns for the same job on one screen leave users unsure which to trust.

## Checks

```check
q: Why is infinite scroll a good fit for a social feed but a poor fit for a product search results page?
a: A feed is aimless browsing, so uninterrupted loading matches the goal. Search results are compared and revisited, and infinite scroll loses position, hides the footer and gives no stable address such as a page number.
why: Catches treating a pattern as universally good or bad instead of right or wrong for a context.
```

```check
q: What makes a UI pattern reduce learning cost for users who have never seen your product?
a: Users bring expectations from other products that use the same pattern, so they already know how it behaves. The learning happened elsewhere and transfers.
why: Catches the idea that patterns help mainly because they are well designed, rather than because they are familiar.
```

```check
q: How does a dark pattern relate to an ordinary design pattern?
a: Both are recurring, reusable designs that rely on familiarity. A dark pattern uses that familiarity to steer users against their own interests, such as a hidden cancel button.
why: Catches the confusion that dark patterns are simply badly made patterns, rather than deliberate designs that work against the user.
```
