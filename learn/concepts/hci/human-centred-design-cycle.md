---
id: human-centred-design-cycle
title: The human-centred design cycle
summary: An iterative loop of understanding the context of use, specifying user requirements, producing designs and evaluating them against those requirements until the design works.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:30:44.879Z
---

# The human-centred design cycle

Human-centred design builds systems by starting from the people who will use them and returning to those people as the design takes shape. It runs as a loop: understand the context of use, specify what users need, produce a design, evaluate it against those needs, then go round again. The loop ends when the design meets the requirements.

## Why it matters

Designers are poor stand-ins for users: they know the system too well and rarely face the pressures of people in the field. A cycle that forces contact with real users at every turn catches wrong assumptions while they are still cheap to fix.

## The idea

The international standard ISO 9241-210 names four linked activities:

| Activity | Question it answers |
| --- | --- |
| Understand and specify the context of use | Who are the users, what are their tasks, and where and with what do they work? |
| Specify the user requirements | What must the design let those users achieve, and how well? |
| Produce design solutions | What could meet those requirements? |
| Evaluate the designs against the requirements | Does it actually work for them? |

Evaluation feeds back into any earlier activity. A failed test might mean the design is wrong, or that the team misread the context and the requirements themselves need to change.

Design thinking describes a similar loop in different words. The Stanford d.school's popular framing uses five modes: empathise, define, ideate, prototype, test. Empathise maps roughly to understanding context, define to specifying requirements, ideate and prototype to producing solutions, and test to evaluation. Both put human needs at the centre and revisit every step as evidence arrives.

CS2111 (Human-Centred Computing) places this under its Foundations of HCI module.

## Worked example

A hospital wants a tablet app for nurses to record medication rounds. The team first shadows nurses on a night shift and learns that they often wear gloves and are interrupted mid-task (context of use). They set requirements: a dose can be recorded in under ten seconds with gloved hands, and an interrupted entry is never lost. A first prototype uses small checkboxes. In testing, nurses mis-tap them through gloves, so the team enlarges the targets and adds an auto-saved draft. The second round meets both requirements. Without the observation, the glove problem would have surfaced only after launch.

## Failure modes

- **One lap only.** The team does research once at the start, then builds for months without testing. Notice it when no user has seen the design since kickoff.
- **Requirements with no measure.** "Easy to use" cannot fail a test, so evaluation proves nothing. Each requirement should name a user, a task and a threshold.
- **Evaluating with the wrong people.** Colleagues stand in for real users and miss field conditions.
- **Treating stages as a waterfall.** The team moves strictly forward and never revisits the context when tests reveal a misunderstanding.

## Checks

```check
q: A usability test shows nurses cannot use a new app because the team assumed they work seated at a desk, when they actually work on their feet. Which activity of the human-centred design cycle should the team return to, and why not just redesign the screen?
a: Return to understanding the context of use, because the failure comes from a wrong picture of the users' situation. Redesigning the screen without fixing that picture would build new solutions on the same wrong assumption.
why: Catches the belief that evaluation only ever feeds back into the design step, when it can show the context or requirements were wrong.
```

```check
q: Why is 'the app should be easy to use' a weak user requirement in a human-centred design cycle?
a: It names no user, task or threshold, so no evaluation can show it has failed. A usable requirement is testable, for example 'a nurse records a dose in under ten seconds while wearing gloves'.
why: Catches confusing a vague goal with a requirement the evaluate step can actually check.
```

```check
q: How do the Stanford d.school's five design thinking modes line up with the ISO 9241-210 activities?
a: Empathise corresponds to understanding the context of use, define to specifying requirements, ideate and prototype to producing design solutions, and test to evaluation. Both are iterative loops with users at the centre.
why: Catches treating design thinking and human-centred design as competing methods instead of two framings of the same loop.
```
