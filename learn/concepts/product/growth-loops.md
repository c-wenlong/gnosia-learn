---
id: growth-loops
title: Growth loops
summary: A growth loop turns what existing users do into the input that acquires new ones, compounding where a linear funnel stops when spending stops; channels are the paths it runs through.
requires: []
tags: [product]
sources: []
created: 2026-09-28T15:34:05.796Z
---

# Growth loops

A growth loop is a system in which what one group of users does becomes the input that brings in the next group. A linear funnel, by contrast, needs attention poured in at the top (ads, a launch post) and stops when you stop pouring. The growth education company Reforge popularised describing growth as loops rather than funnels.

## Why it matters

A new product rarely has a marketing budget. A funnel needs constant spending; a working loop feeds itself and compounds. It also forces the question: what does a user do here that reaches someone new?

## The idea

A loop is a chain that ends where it began: a new user acts, the action produces an output, the output reaches people outside the product, and some become new users.

- **Content loop.** Users create public content, search engines index it, searchers land on it, and some join and create more. Question and answer sites grow this way.
- **Referral loop.** Users invite others, often for a reward. Dropbox's extra storage for referrals is the well-known case.

Every step must connect: if the output never leaves the product, there is no loop.

**Channels** are the paths a loop runs through: search, social feeds, word of mouth, app stores, email. Gabriel Weinberg and Justin Mares's book Traction lists 19 channels and proposes the Bullseye framework: brainstorm every channel, rank them, cheaply test the most promising few (three in the book's version), then focus on the one that works.

**Speed and compounding.** A loop has two numbers: new users per user each cycle, and cycle length. A search loop is slow, since pages take weeks to rank, but lasts; an invite loop can cycle in a day. The [[viral-coefficient]] measures the invite case.

CS3216 (Software Product Engineering for Digital Markets) places this under its Growth for Digital Markets module.

## Worked example

A site where students share worked solutions to past exam papers. The funnel plan: buy ads, get a few hundred sign-ups, stop when the budget ends.

The loop plan: each solution gets a public page titled with the paper's module code and year. A student searching that code finds the page and is invited to upload one. Suppose, for illustration, every 100 new users post 40 solutions and each solution brings 5 new users over a semester. Each 100 users then bring 200, but only after weeks, and only until most students in those modules have found it. The team's job becomes fixing the weakest step, such as the share of readers who upload.

## Failure modes

- **A funnel called a loop.** The output never reaches anyone new, such as content behind a login that search cannot see.
- **Ignoring cycle time.** A six-month loop cannot rescue a product that needs traction in weeks.
- **Wrong users.** The loop brings people who never return. Watch retention by source.
- **Unmeasured steps.** Without a number per step, you cannot find the leak.

## Checks

```check
q: In terms of where new users come from, how does a growth loop differ from a linear funnel?
a: In a funnel, new users come from input you keep supplying, such as ads or launches, and they stop when you stop. In a loop, the actions of existing users produce the input that reaches new users, so growth feeds itself.
why: Catches thinking a loop is just a funnel with more stages.
```

```check
q: A study app lets users write notes, but every note is private behind login. Can a user-generated content loop driven by search engines work for it as built?
a: No. The output never reaches anyone outside the product, because search engines cannot index private pages. Some content would have to become public and indexable, for example opt-in shared notes.
why: Catches naming a loop without checking that every step connects.
```

```check
q: Two loops return the same number of new users per cycle, but one cycles in two days and the other in two months. Which grows faster, and why does it matter for a new product?
a: The two-day loop, because it compounds about thirty times in the time the other compounds once. A product that needs traction within weeks cannot rely on a slow loop alone.
why: Catches judging a loop by its per-cycle return while ignoring cycle time.
```
