---
id: universal-design
title: Universal design
summary: Universal design aims for one design usable by the widest range of people without adaptation, guided by seven principles from NC State (1997); it often helps everyone.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:32:31.364Z
---

# Universal design

Universal design is the practice of designing products and environments to be usable by as many people as possible, to the greatest extent possible, without adaptation or a specialised version. The American architect Ron Mace coined the term. In 1997 a working group at the Center for Universal Design at North Carolina State University set out seven principles for it.

## Why it matters

Designing for the average user excludes everyone at the edges, and nearly everyone is at an edge sometimes. Features built for disabled people also tend to help far more people: the curb-cut effect. Curb cuts, the ramps at pavement edges, were fought for by wheelchair users and now serve people with prams, suitcases and bikes.

## The idea

The seven principles (1997):

1. Equitable use
2. Flexibility in use
3. Simple and intuitive use
4. Perceptible information
5. Tolerance for error
6. Low physical effort
7. Size and space for approach and use

Three neighbouring terms are easy to mix up:

| Term | Emphasis |
|---|---|
| Accessibility | Whether disabled people can use it, often measured against standards such as WCAG |
| Universal design | One design that works for the widest range of people from the start |
| Inclusive design | Designing with people who are excluded today, accepting that one size may not fit all, so several ways to do a task may be offered |

The phrase "solve for one, extend to many" is associated with Microsoft's inclusive design toolkit. That toolkit treats disability as a mismatch between a person and a design, and it can be permanent (one arm), temporary (an arm in a cast) or situational (holding a baby). One design change can serve all three.

CS2111 (Human-Centred Computing) places this under its Accessibility and Inclusive Design module.

## Worked example

A team designs the video player for a learning app. Captions start as an accessibility item for Deaf and hard-of-hearing learners, a permanent case. Applying the principles:

- Perceptible information: speech is also available as text.
- Flexibility in use: captions can be switched on or off and resized, and a transcript is offered for skimming.
- Equitable use: everyone uses the same player, with no separate "accessible version".

Then the team lists who else benefits: someone with an ear infection (temporary), a commuter on a loud train (situational), a second-language speaker checking a term. One decision, many beneficiaries.

## Failure modes

- **Designing for the average.** Personas and tests include only typical users. Notice: nobody in testing uses assistive technology, or a phone in bright sun.
- **Separate but unequal.** A stripped-down "accessible version" that lags behind the main one. It fails equitable use.
- **Reading "universal" literally.** No design suits every person. The aim is the widest reasonable range, plus flexibility and ways to adapt.
- **Ignoring situational limits.** Glare, noise, one busy hand and slow networks are design conditions, not rare edge cases.

## Checks

```check
q: A bank builds a separate simplified website for blind customers. Which universal design principle does this most directly conflict with, and why?
a: Equitable use: everyone should get the same means of use where possible, without singling out any group. A separate site also tends to fall behind the main one.
why: Catches treating a separate accessible version as the goal rather than a last resort.
```

```check
q: For one-handed phone use, give a permanent, a temporary and a situational example of the same limitation.
a: Permanent: someone with one arm. Temporary: someone with a wrist in a cast. Situational: a parent holding a baby or a commuter holding a rail.
why: Catches the belief that designing for disability only helps people with permanent disabilities.
```

```check
q: A team says 'we do universal design, so we meet WCAG and our job is done'. What does this mix up?
a: It treats accessibility (conformance to standards such as WCAG) as the same as universal design (one design that works for the widest range of people). A product can pass WCAG and still be hard for many people to use.
why: Catches treating accessibility, universal design and inclusive design as synonyms.
```
