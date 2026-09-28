---
id: user-feedback-iteration-loop
title: The user-feedback iteration loop
summary: A fixed cadence, often weekly, where real users try each build, findings are triaged, and they set the next cycle's priorities, with users told what changed.
requires: []
assumes: [minimum-viable-product]
tags: [product]
sources: []
created: 2026-09-28T15:33:35.757Z
---

# The user-feedback iteration loop

The user-feedback iteration loop is a fixed rhythm, often weekly, in which each cycle ends with real users using the current build, the team sorts what it learned, and the next cycle's priorities come from those findings. The cadence is fixed so that feedback arrives on schedule, not whenever someone remembers to ask. It is how a [[minimum-viable-product]] grows into a product without drifting on guesses.

## Why it matters

Without a cadence, teams build for weeks and then show users a finished feature that misses. Short cycles cap the drift: at most one cycle of work is at risk. Regular contact also builds a group of users who keep testing for you.

## The idea

CS3216 (Software Product Engineering for Digital Markets) places this under its Rapid Iterative Development module.

A weekly cycle has four parts:

1. **Build** the smallest change that addresses this week's priority.
2. **Put it in front of users.** Real users use the real build, not a description.
3. **Triage** the findings.
4. **Decide** next week's priorities from them.

Combine collection methods, since each answers a different question. Short observed sessions show why people struggle. In-app feedback catches problems in context. Analytics show what people do and how many, but not why.

Triage separates signal from loud requests. A request is usually a proposed solution; look for the problem underneath. Weigh each finding by how many users hit it, how badly it blocks their main task, and whether they are your target users. One person insisting on a feature is not a trend. Several testers failing at the same step is.

Close the loop: tell users what changed because of them, and what you chose not to do and why. People who see their feedback used keep giving it.

## Worked example

A team builds a group-project scheduler whose AI proposes meeting times. In week three, five students test it. Two ask for calendar sync. One insists on colour themes. Four of the five do not trust the suggested slot because it gives no reason, and analytics show most proposals being dismissed.

Triage: the trust problem is frequent, blocks the core task and comes from target users, so it becomes the priority. Calendar sync is real but large, so it is scheduled later. Themes are noted, not prioritised. The week-four build shows a short reason beside each slot. In week four, dismissals drop, and the team messages the week-three testers to tell them what changed.

## Failure modes

- **Feedback without decisions.** Findings pile up unused. Check that each cycle's priorities cite findings.
- **Loudest voice wins.** Priorities follow whoever complains most. Weigh by frequency and severity.
- **Testing with the wrong people.** Friends stand in for real users and are too kind or too expert.
- **Changing too much per cycle.** Many simultaneous changes make it impossible to tell which one helped.
- **Silent loop.** Users never hear what happened, and stop responding.

## Prerequisites

- [[minimum-viable-product]] (background)

## Checks

```check
q: One tester strongly demands dark mode, while three of five testers silently fail to find the save button. Which should drive next week's priority, and why?
a: The save button. It affects most testers and blocks a core task, while dark mode is one person's request. Weigh by frequency, severity and fit with target users, not volume.
why: Catches letting the loudest request set priorities instead of the most common and severe problem.
```

```check
q: Analytics show most users abandon a form at step three. What can analytics not tell you here, and which method fills that gap?
a: They show where and how many, not why people leave. A short observed session with a few users shows what confuses or blocks them at that step.
why: Catches treating quantitative data as an explanation rather than a pointer to where to look.
```

```check
q: Why fix the cadence (for example, weekly) instead of gathering feedback whenever a feature feels ready?
a: A fixed cadence caps how much work can go in the wrong direction before users correct it, and makes feedback routine rather than optional. Waiting until a feature feels ready tends to mean building for weeks on guesses.
why: Catches seeing user testing as a final check rather than a regular input to planning.
```
