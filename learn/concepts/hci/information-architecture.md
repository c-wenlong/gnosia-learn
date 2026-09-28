---
id: information-architecture
title: Information architecture
summary: How content is organised, labelled, navigated and searched, studied with card sorting to design a structure and tree testing to check it.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:31:51.985Z
---

# Information architecture

Information architecture (IA) is the structure of the content in a product: how it is grouped, what each group is called, and how people move to it or find it. It is the part of design that decides where things live, separate from how any single screen looks. Louis Rosenfeld and Peter Morville's book on the subject, first published in 1998, breaks it into four connected systems.

## Why it matters

If people cannot find something, it may as well not exist. A good page under a menu label nobody would open fails as surely as a broken one.

IA problems are also expensive to fix late, once URLs, menus and help articles all depend on the structure.

## The idea

Rosenfeld and Morville split IA into four systems:

| System | Question it answers |
| --- | --- |
| Organisation | How is content grouped (by topic, task, audience, date)? |
| Labelling | What is each group and link called? |
| Navigation | How do people move between groups (menus, breadcrumbs, links)? |
| Search | How do people find things by typing instead of browsing? |

The central difficulty: builders tend to group things by how their organisation is structured, while visitors group things by what they are trying to do. Two methods expose that gap.

**Card sorting** is for designing the structure. Participants sort cards, each naming one piece of content, into groups. In an **open** sort they create and name the groups themselves, which reveals their mental categories and vocabulary (see [[mental-models]]). In a **closed** sort they place cards into groups you have already named, which checks whether your categories make sense.

**Tree testing** is for checking a structure. Participants see only a text version of the menu hierarchy and say where they would look for a specific item. You measure whether they end in the right place and whether they went straight there.

CS2111 (Human-Centred Computing) places this under its Designing Interactions module.

## Worked example

A university department's website has top-level menus named after its internal offices: "Undergraduate Office", "Graduate Division", "Academic Affairs".

An open card sort with 15 students produces groups like "Choosing modules", "Exams and grades" and "Money and scholarships": tasks, not offices. The team rebuilds the top level around them, keeping the students' words.

A tree test follows, with tasks such as "Where would you find the fee deadline?" Many participants open "Choosing modules" first, then backtrack to "Money and scholarships". The label is unclear, so the team renames it "Fees and scholarships" and tests again.

## Failure modes

- **Mirroring the org chart.** Structure follows internal departments rather than user tasks.
- **Clever or vague labels.** "Resources" or "Solutions" say little about what is inside.
- **Testing the tree with visuals.** Styling and search hide whether the structure itself works.
- **Using search to excuse a bad structure.** Not everyone searches, and search results still depend on clear labels and grouping.

## Checks

```check
q: You have a draft menu structure and want to know if people can find items in it. Should you run an open card sort or a tree test?
a: A tree test. It checks an existing hierarchy by asking people where they would look for items, while an open card sort is for discovering how people would group content in the first place.
why: Catches confusing the method for generating a structure with the method for validating one.
```

```check
q: What is the difference between an open and a closed card sort?
a: In an open sort participants create and name their own groups, revealing their categories and vocabulary. In a closed sort they place cards into groups you have already defined, checking whether those groups make sense.
why: Catches thinking card sorting is one method with one purpose.
```

```check
q: Why is a tree test run on a plain text hierarchy rather than on the styled website?
a: Removing visual design and search isolates the structure and labels, so success or failure reflects the IA itself rather than page layout or a search box that compensates for it.
why: Catches the assumption that testing on the real site is always more valid.
```
