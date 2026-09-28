---
id: fixed-time-variable-scope
title: Fixed time, variable scope
summary: "When the deadline is fixed, scope is the variable: set an appetite, rank the work, and cut whole features rather than quality to fit the time."
requires: []
assumes: [minimum-viable-product]
tags: [product]
sources: []
created: 2026-09-28T15:33:31.820Z
---

# Fixed time, variable scope

When a deadline cannot move, treat time as fixed and scope as the thing you adjust. You decide up front how much time the work deserves, then shape and cut it to fit, rather than estimating it and letting the date slip. Cuts remove whole features or edge cases, never the quality of what ships.

## Why it matters

Student and startup projects have hard dates. Forcing a fixed scope into a fixed date leaves one hidden variable, quality, and it gives way silently: untested code, missing error handling, a demo that crashes. Making scope the explicit variable turns a late crisis into small, deliberate choices.

## The idea

CS3216 (Software Product Engineering for Digital Markets) places this under its Rapid Iterative Development module.

Basecamp's Shape Up (Ryan Singer, 2019) calls the time budget an appetite. An estimate starts from a design and asks how long it will take. An appetite starts from a time box and asks which version of the idea is worth that much time. Shape Up works in fixed cycles (six weeks at Basecamp) and by default does not extend work that misses its cycle.

To cut well, rank before you build. MoSCoW is one common scheme: Must have, Should have, Could have, Won't have this time. Musts are what the product cannot work without; everything else can be cut.

Cut whole features, not quality: a half-built feature with no error states costs more in bugs and demo risk than no feature.

Shape Up calls the ongoing habit "scope hammering": repeatedly asking whether each piece is really needed, whether a simpler version would do, and what happens if it is left out.

## Worked example

A team of four has three weeks until a demo of a textbook swap app, in which an AI reads a photo of a book cover and fills in the listing. They rank:

- **Must:** create a listing, browse and search, contact the seller.
- **Should:** AI fills the listing from a cover photo.
- **Could:** in-app chat, seller ratings.
- **Won't:** payments.

After week one, the AI misreads worn covers. Instead of pushing the demo or shipping a flaky feature, they hammer: the AI now suggests title and author, and the user confirms before posting. Chat and ratings are cut, and buyers contact sellers by email. The demo runs on time with solid core features and an AI step with a clear fallback.

## Failure modes

- **Cutting quality instead of scope.** Tests and error handling vanish while the feature list stays.
- **Quietly moving the date.** Internal milestones slip one by one until no slack is left.
- **Everything is a Must.** If the Must list alone fills the time, nothing has been ranked.
- **Cutting the risky core.** Dropping the part that tests the key assumption because it is hard, so the demo proves nothing.

## Prerequisites

- [[minimum-viable-product]] (background)

## Checks

```check
q: A team has fixed scope and a fixed deadline, and is behind. If they change neither, what gives way, and how would you notice?
a: Quality gives way: tests, error handling and polish get skipped. You notice it as bugs, crashes and missing edge cases near the deadline.
why: Catches believing a team can hold both scope and date fixed without paying for it somewhere.
```

```check
q: How does an appetite differ from an estimate?
a: An estimate starts from a design and asks how long it will take. An appetite starts from how much time the work is worth and asks which version of the idea fits in that time.
why: Catches treating appetite as just another word for a time estimate.
```

```check
q: With a week left, a team can either ship five features each missing error handling, or three complete ones. Which does fixed time, variable scope favour, and why?
a: Three complete features. The approach cuts whole features, not quality, because half-finished features cost more in bugs and demo risk than leaving them out.
why: Catches thinking that cutting scope means trimming every feature a little.
```
