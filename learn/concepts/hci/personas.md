---
id: personas
title: Personas
summary: A persona is a research-based archetype of a user group, defined mainly by goals and behaviours, that gives a team one specific person to design for.
requires: []
assumes: [contextual-inquiry]
tags: [hci]
sources: []
created: 2026-09-28T15:31:19.144Z
---

# Personas

A persona is a fictional but realistic archetype of a group of users, synthesised from research data. It gives a team one specific person to design for, with a name, a situation and, above all, goals. Alan Cooper popularised personas in software design, most notably in his 1999 book The Inmates Are Running the Asylum.

## Why it matters

"The user" drifts into whatever each team member imagines, often themselves. A shared persona grounded in evidence settles arguments: "users want X" becomes "would this person, given her goals, need X?" It also helps a team say no to features that serve nobody in particular.

## The idea

Personas come from patterns across research, such as notes from [[contextual-inquiry]] sessions. Researchers look for clusters of people who share goals, behaviours and frustrations, then describe each cluster as one person. A persona is a summary of real data with a human face.

A useful persona puts goals and behaviours first:

- what the person is trying to achieve, in the short and long term
- how they currently go about it, and what gets in the way
- their context: devices, time pressure, skill level, who else is involved

Demographics appear only when they change a design decision. Age matters for a pension app; a favourite food almost never matters.

Teams usually choose one primary persona whose needs must be met. Secondary personas get their needs met where that does not compromise the primary one, which gives the team a rule for settling trade-offs.

CS2111 (Human-Centred Computing) places this under its Understanding Users module.

## Worked example

A university library interviews and observes twenty students. Two clusters appear. One group arrives late at night before deadlines, needs one specific book fast, and is frustrated when the catalogue says a book is available while it is actually on the reshelving trolley. The other group browses widely for research projects. The team writes the first cluster up as Wei Ling, a second-year engineering student. Her goal is to finish tonight's assignment; she searches by exact title on her phone while walking in; her pain point is stale availability data. When someone proposes a social reading-list feature, the team asks whether it helps Wei Ling at 11 pm. It does not, so it drops down the list.

## Failure modes

- **Invented personas.** Built in a workshop from assumptions with no research behind them. They look convincing and mirror the team's existing biases. Ask what data each attribute came from.
- **Demographics over goals.** Pages of age, income and hobbies with vague goals, which cannot help choose between two designs.
- **Too many personas.** Ten personas with equal weight means designing for everyone, which means no one.
- **Elastic personas.** The persona is stretched in meetings to justify whatever each person already wanted.
- **Stale personas.** Written once and never revisited as the product and its users change.

## Prerequisites

- [[contextual-inquiry]] (background)

## Checks

```check
q: A team runs a workshop and writes three personas from what they believe about their customers, with no user research. What is the core problem?
a: The personas are invented, not synthesised from data, so they encode the team's assumptions while looking like evidence. A persona is only as valid as the research behind it.
why: Catches the belief that writing personas by itself makes a design user-centred.
```

```check
q: Why does a good persona put goals and behaviours ahead of demographics such as age and income?
a: Design decisions depend on what someone is trying to achieve and how they go about it. Demographics rarely separate two design options unless they directly affect use.
why: Catches treating personas as marketing segments.
```

```check
q: Two personas' needs conflict over a feature. How does choosing a primary persona help?
a: The primary persona's needs must be met, and a secondary persona's needs are met only where that does not compromise the primary. It gives the team a rule for settling the trade-off.
why: Catches the idea that every persona should carry equal weight.
```
