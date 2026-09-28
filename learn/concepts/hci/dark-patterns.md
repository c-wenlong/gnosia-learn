---
id: dark-patterns
title: Dark patterns
summary: Dark patterns are designs that trick or pressure users into choices against their interest; the test is whether users would still agree if they fully understood.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:32:42.971Z
---

# Dark patterns

A dark pattern is an interface design that tricks or pressures people into something they did not intend, such as buying, signing up or sharing data, for the business's benefit. Harry Brignull coined the term in 2010, and the same idea is now often called deceptive patterns. The question that matters is where legitimate persuasion turns into deception.

## Why it matters

A small nudge applied to millions of users adds up to a large transfer of money, time or data, and trust drops once people notice. Regulators, including in the EU and the US, have begun treating some patterns as unlawful, especially around consent and cancelling subscriptions; the rules differ by jurisdiction.

## The idea

Classic types from Brignull's catalogue (names have shifted over the years):

| Type | What it does |
|---|---|
| Roach motel | Easy to get in, hard to get out: one-click sign-up, cancellation by phone only |
| Confirmshaming | Guilt-trips the decline option: "No thanks, I prefer paying full price" |
| Sneak into basket | Adds an extra item, such as insurance, to the cart without asking |
| Forced continuity | A free trial silently becomes a paid subscription with no reminder |
| Disguised ads | Ads styled as content or navigation, such as a fake "Download" button |
| Trick questions | Confusing wording, such as double negatives on opt-out boxes |

Persuasion is not wrong in itself: reminders, true social proof and sensible defaults can help users reach their own goals. Two questions separate persuasion from deception:

1. Would the user still agree if they fully understood what was happening?
2. Whose interest does the design serve: the user's, or the business's at the user's expense?

A design that only works because users misunderstand is deceptive.

CS2111 (Human-Centred Computing) places this under its Ethics in System Design module.

## Worked example

A streaming service's "Start free trial" takes card details, and the trial becomes a monthly charge with no reminder. Many users would agree if they understood, but the business also profits from those who forget. That is forced continuity.

To cancel, users must find a chat window (the account page has no cancel button), and the final button reads "Cancel and lose all your favourites forever". That is a roach motel plus confirmshaming.

Redesign: an email three days before the trial ends, a visible "Cancel subscription" link, and a neutral confirmation stating when the plan ends. Revenue from forgetful users drops; what remains comes from people who chose to stay.

## Failure modes

- **Optimising one metric.** A/B tests reward whatever lifts conversion, deception included. Track complaints and refunds too.
- **Asymmetric effort.** Yes takes one click; no takes five. Compare the two paths step by step.
- **Fake urgency.** Countdown timers that reset, or "only 2 left" when stock is plentiful.
- **Banning all nudges.** The test is honesty and whose interest a nudge serves.

## Checks

```check
q: A travel site shows 'Only 2 rooms left!' on every hotel regardless of stock. Is this persuasion or a dark pattern, and by what test?
a: A dark pattern (fake scarcity). It works only because users believe a false claim; if they knew it was shown on every hotel, it would not move them.
why: Catches the view that any urgency message is fine as long as it lifts conversions.
```

```check
q: A cookie banner has a bright 'Accept all' button and a small grey 'Manage settings' link leading to five screens. What is wrong, given that users can still refuse?
a: Asymmetric effort: accepting takes one click while refusing takes many, which steers users into sharing data they may not want to share.
why: Catches thinking a design is fair because the choice technically exists.
```

```check
q: Is turning on two-factor authentication by default a dark pattern? Why or why not?
a: No. It is a nudge, but in the user's interest, and a user who fully understood it would generally agree; nothing depends on them misunderstanding.
why: Catches equating every nudge or default with manipulation.
```
