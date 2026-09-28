---
id: affordances-and-signifiers
title: Affordances and signifiers
summary: An affordance is a possible action arising between an object and an agent; a signifier is the perceivable cue that shows people where and how to act.
requires: []
assumes: [mental-models]
tags: [hci]
sources: []
created: 2026-09-28T15:30:52.530Z
---

# Affordances and signifiers

An affordance is a possible action that exists between an object and an agent: a chair affords sitting to an adult, a flat metal plate on a door affords pushing. A signifier is a perceivable cue that tells people where and how to act. Affordances are what can be done; signifiers are how people find out.

## Why it matters

With physical objects, shape often shows the affordance. On a screen almost any region could be tappable, so users depend on signifiers, and when designers remove them for neatness, users stop discovering what they can do.

## The idea

The psychologist James J. Gibson coined "affordance" to describe what an environment offers an animal. The key point is that it is a relationship, not a property of the object alone: a high shelf affords reaching to an adult but not to a small child. Don Norman brought the term into design in The Design of Everyday Things (first published in 1988). Designers then started using "affordance" loosely to mean any visual hint, so in the 2013 revised edition Norman added the separate term signifier for the perceivable signal itself.

| | Affordance | Signifier |
| --- | --- | --- |
| What it is | A relationship: what the agent can do with the object | A signal the agent can perceive |
| Can it exist unseen? | Yes | No, it must be perceivable |
| Screen example | A list row can be swiped to delete | A red edge peeking from the row, or a short hint animation |

Signifiers can be deliberate (a button border, a "Pull" label) or accidental (a worn patch showing where people push). Flat design, which strips borders, shadows and underlines, often removes signifiers while keeping the affordances, so the actions still exist but nobody can tell.

Signifiers are much of the system image described in [[mental-models]].

CS2111 (Human-Centred Computing) places this under its Foundations of HCI module.

## Worked example

A banking app lists accounts as plain grey text. Tapping a name opens its transactions, so the affordance is there. In testing, users hunt for a "View" button. The team adds a chevron to each row and thin dividers between rows. Nothing about what the rows can do has changed, only the signifiers, and users now tap straight in.

## Failure modes

- **Calling a hint an affordance.** Saying "add an affordance" when you mean a signifier blurs whether the action is missing or only unsignalled.
- **Flat, cue-free controls.** Links with no underline or colour, buttons with no border. Notice it when users hover around searching for what is clickable.
- **False signifiers.** Underlined text that is not a link, or a card with a shadow that does nothing. Users try the action, fail and lose trust.
- **Hidden gestures.** Swipe or long-press actions with no visible cue, found only by accident.

## Prerequisites

- [[mental-models]] (background)

## Checks

```check
q: A list row can be swiped to delete it, but nothing on screen hints at this. Is the problem a missing affordance or a missing signifier?
a: A missing signifier. The affordance (the row can be swiped to delete) exists; what is missing is a perceivable cue telling the user it is there.
why: Catches the common habit of using 'affordance' to mean a visual hint.
```

```check
q: Why is an affordance described as a relationship rather than a property of the object alone?
a: What an object affords depends on the agent: a high shelf affords reaching to an adult but not to a small child. The same object offers different actions to different agents.
why: Catches the idea that affordances are fixed features you can list by inspecting the object.
```

```check
q: Why did Norman add the term 'signifier' in the 2013 revised edition of The Design of Everyday Things?
a: Designers had stretched 'affordance' to mean any perceivable cue. He added 'signifier' to name the signal itself and kept 'affordance' for the possible action.
why: Catches treating the two words as synonyms, or thinking signifier replaced affordance.
```
