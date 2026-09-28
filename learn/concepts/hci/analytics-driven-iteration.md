---
id: analytics-driven-iteration
title: Analytics-driven iteration
summary: "Changing a product from measured behaviour: named events tied to a question, a decision rule set before shipping, and qualitative research for the why."
requires: []
assumes: [ab-testing]
tags: [hci]
sources: []
created: 2026-09-28T15:34:27.114Z
---

# Analytics-driven iteration

Analytics-driven iteration is changing a product in response to measured behaviour, with the measurement planned before the change ships. You decide what question you are asking, log named events that answer it, and write down in advance what result will lead to what action. Analytics then tell you what happened; other research tells you why.

## Why it matters

Most products collect data; few teams use it to decide anything. Without a question and a rule set in advance, a dashboard becomes a place to find support for what the team already wanted.

A rule written before launch also stops the goalposts moving once the numbers arrive.

## The idea

The loop has four parts:

1. **Start with a question.** "Where do new users drop out of sign-up?" is a question. "Let's track everything" is not.
2. **Instrument named events.** Log specific, consistently named events tied to that question, such as `signup_started`, `email_verified`, `first_group_created`. A sequence of steps forms a funnel, and the drop between steps shows where people leave.
3. **Set a decision rule before shipping.** Name the metric, the threshold and the action. "If fewer than 60% of people who verify their email go on to create a group within a day, we simplify group creation next sprint."
4. **Find the why.** A funnel shows that people stop at a step, not whether they were confused, bored or interrupted. Interviews or a quick usability test answer that.

Beware **vanity metrics**, a term popularised by Eric Ries's Lean Startup writing. Cumulative sign-ups or page views rise whatever you do, so they feel good and decide nothing. Prefer rates that could fall if a change were bad.

To show that a change caused a shift, not just that numbers moved after it, a controlled comparison such as [[ab-testing]] is stronger. Before-and-after analytics can be confused by seasons, marketing and other launches.

CS3216 (Software Product Engineering for Digital Markets) places this under its UX Validation module.

## Worked example

A student team runs a study-group app. The dashboard shows 1,200 sign-ups, which looks healthy.

They instrument the sign-up events above. Of those 1,200, 900 verify their email, but only 270 create a group: a 30% rate, against the written rule that below 60% triggers a redesign.

Analytics cannot explain the drop, so they watch five new users. Four stall on a screen asking them to invite members before the group exists. The team lets people create an empty group first. Two weeks later the verify-to-group rate is 52%: better, still under the rule, so they keep iterating.

## Failure modes

- **Tracking everything, asking nothing.** Hundreds of events and no question produce unused charts.
- **Inconsistent event names.** `SignUp`, `sign_up` and `register` for the same step split the data silently.
- **Rules written after the data.** The threshold drifts to whatever the result was.
- **Reading why from what.** Guessing motives from a funnel instead of asking users.

## Prerequisites

- [[ab-testing]] (background)

## Checks

```check
q: A funnel shows 70% of users leave at the payment step. What can the analytics tell you here, and what can they not?
a: They show where and how many people leave, not why. Finding the reason needs qualitative research such as interviews or a usability test.
why: Catches reading user motives straight off a quantitative chart.
```

```check
q: Why should a decision rule (metric, threshold, action) be written before a change ships?
a: Once results arrive it is easy to move the threshold or pick a flattering metric. A rule fixed in advance makes the result decide the action, rather than the other way round.
why: Catches the belief that looking at the data first and deciding afterwards is just as rigorous.
```

```check
q: Why is total registered users a vanity metric for judging a new onboarding flow?
a: A cumulative total only goes up, whatever the flow does, so it cannot show whether the change helped or hurt. A rate such as the share of new users completing onboarding can.
why: Catches treating any number that grows as evidence of progress.
```
