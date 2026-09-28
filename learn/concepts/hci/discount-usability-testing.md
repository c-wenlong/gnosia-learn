---
id: discount-usability-testing
title: Discount usability testing
summary: Small usability tests with about five users, run often and repeated after each fix, rather than one large study.
requires: [think-aloud-usability-testing]
tags: [hci]
sources: []
created: 2026-09-28T15:34:23.287Z
---

# Discount usability testing

Discount usability testing means running small, cheap usability tests often, instead of one large, expensive study. The usual shape is a think-aloud test with about five users, a round of fixes, then another test. Jakob Nielsen promoted the approach from the late 1980s as "discount usability engineering", arguing that some testing done early beats thorough testing that never happens.

## Why it matters

Teams that ship every week or two cannot wait a month for a formal study, and expensive testing gets skipped. Small, routine testing stays in the schedule.

A fix can also fail or create new problems, and only another round shows it.

## The idea

The method builds on [[think-aloud-usability-testing]]: realistic tasks, a neutral moderator, attention to behaviour. What changes is the scale and rhythm.

The case for about five users comes from a model by Nielsen and Thomas Landauer (1993). If each user has a chance L of revealing any given problem, then n users together find a share of 1 − (1 − L)ⁿ of the problems. Averaged across the projects in their data, L was about 0.31. With that value, the model predicts one user finds 31% of problems, three find 67%, five about 85%, and ten about 98%.

Each extra user mostly re-finds known problems, so returns fall quickly after five. Nielsen advised spending a budget of 15 users as three rounds of five, fixing in between.

The caveats matter as much as the number. L is an average that varies with the product, tasks and users, and a given group of five can find far fewer problems than predicted. The model also assumes one kind of user; distinct groups need testing separately. And "85%" means 85% of what those tasks can reveal in this version. Five users is enough for one iteration, not for a whole product.

CS3216 (Software Product Engineering for Digital Markets) places this under its UX Validation module.

## Worked example

A student team building a group-expense app has a Friday deadline each week.

Monday, they run 20-minute think-aloud sessions with five classmates outside the team, on one task: "Split last night's dinner between four friends." Three of five cannot find how to exclude one person from an item. Two misread "You are owed" as a debt.

Tuesday and Wednesday, they add an obvious "who shared this?" step and reword the balance line. Thursday, five new people try the same task. All five split the bill; one still hesitates over the balance. That becomes next week's first test.

## Failure modes

- **Treating five as a law.** Quoting "five users find 85%" as if it holds for any product or task set.
- **Testing once.** Five users with no retest loses the point, which is repetition.
- **Mixing user groups.** Five users from very different groups leave each group under-tested.
- **Reusing participants.** People who saw the last version learn it, and stop finding what newcomers would.

## Prerequisites

- [[think-aloud-usability-testing]] (required)

## Checks

```check
q: In the Nielsen and Landauer model, what share of problems do n users find, and roughly what does 5 users give when L is 0.31?
a: The share is 1 minus (1 minus L) to the power n. With L at 0.31, five users find about 85% of the problems.
why: Catches knowing the slogan 'five users' without the model and the assumed L behind it.
```

```check
q: You have budget for 15 test participants. Why run three rounds of five rather than one round of 15?
a: After about five users, most problems found are repeats. Fixing between rounds lets later rounds check the fixes and find problems the earlier ones were hiding.
why: Catches treating the five-user figure as a way to spend less, rather than a way to iterate more.
```

```check
q: A team tested five users once, fixed what they saw, and now claims 85% of the product's usability problems are solved. What is wrong with that claim?
a: L varies by study, so 85% is not guaranteed, and it only covers problems those tasks and that user group can reveal in that version. The fixes themselves also need retesting.
why: Catches over-reading the 85% figure as coverage of a whole product.
```
