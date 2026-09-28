---
id: viral-coefficient
title: Viral coefficient
summary: K = invitations per user times their conversion rate; above 1 each cohort recruits a bigger one until saturation, below 1 it still multiplies other acquisition by 1/(1-K).
requires: []
assumes: [growth-loops]
tags: [product]
sources: []
created: 2026-09-28T15:34:09.580Z
---

# Viral coefficient

The viral coefficient K measures how many new users each existing user brings in through invitations. It is K = i × c, where i is the number of invitations each user sends and c is the share of invitations that turn into a new user. Above 1, each group of new users recruits a larger group; below 1, invitations still add users but the chain dies out.

## Why it matters

"Viral" is used loosely. K makes it a number you can measure, shows which lever to pull (more invitations or better conversion), and shows that virality below 1 is still worth having.

## The idea

**K above 1.** Each cohort is larger than the last, so growth is exponential. It cannot last: as the product spreads, more invitations reach people who already use it or never will, so K drops. Sustained K above 1 is rare.

**K below 1.** Start with N users acquired some other way. They bring NK, who bring NK², and so on. The total is N / (1 - K). At K = 0.5 every user you acquire by other means becomes two in the end. So a K below 1 multiplies your other channels rather than replacing them.

**Cycle time.** The time from a user joining to their invitees joining matters as much as K. With the same K, a two-day cycle compounds thirty times in the time a two-month cycle compounds once.

CS3216 (Software Product Engineering for Digital Markets) places this under its Growth for Digital Markets module.

## Worked example

A group-study app launches at one university and gets 1,000 users from a launch event. Each user sends 4 invitations and 15% of invitations lead to a sign-up.

K = 4 × 0.15 = 0.6. The cohorts are 1,000, 600, 360, 216 and shrinking, totalling 1,000 / (1 - 0.6) = 2,500. Invitations add 1,500 users, then growth stops.

The team rewrites the invitation page and conversion rises to 30%. Now K = 4 × 0.30 = 1.2. The cohorts are 1,000, 1,200, 1,440, 1,728 and growing, and the running total passes 20,000 around the eighth cycle.

Cycle time sets the pace. At three days per cycle, eight cycles take under a month. At a month per cycle, they take most of a year.

But if the university has 20,000 students, K must fall well before then, as invitations increasingly reach people already using the app or not interested.

## Failure modes

- **Counting invitations, not sign-ups.** A high i with a tiny c looks busy and grows nothing.
- **Ignoring cycle time.** A good K with a slow cycle does not help within a deadline.
- **Assuming K is constant.** Projections that compound forever ignore saturation.
- **Misattributing sign-ups.** Counting organic or ad sign-ups as invited inflates K. Track which invitation each sign-up came from.
- **Spammy invitations.** Auto-messaging contacts raises i, lowers c, and damages trust.

## Prerequisites

- [[growth-loops]] (background)

## Checks

```check
q: Users send 5 invitations each and 10% of invitations convert. What is K, and starting from 2,000 users acquired through ads, roughly how many users do you have once the invitation chain dies out?
a: K = 5 × 0.1 = 0.5. The total is 2,000 / (1 - 0.5) = 4,000, so invitations add about 2,000 users.
why: Catches the belief that a K below 1 means virality adds nothing.
```

```check
q: Two products both have K = 1.1. One has a cycle time of 2 days, the other 20 days. After 60 days, how do their latest cohorts compare to their first?
a: The first has run 30 cycles, so its cohort is about 1.1 to the power 30, roughly 17 times the first. The second has run 3 cycles, about 1.33 times. Cycle time dominates.
why: Catches treating K as the only number that matters.
```

```check
q: Why does a K above 1 rarely stay above 1 for long?
a: As the product spreads, more invitations go to people who already use it or are not interested, so conversion falls. The pool of reachable people is finite.
why: Catches extrapolating exponential growth indefinitely.
```
