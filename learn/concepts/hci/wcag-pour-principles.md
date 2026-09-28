---
id: wcag-pour-principles
title: WCAG's four principles (POUR)
summary: WCAG organises web accessibility under four principles (perceivable, operable, understandable, robust), each broken into testable success criteria at levels A, AA and AAA.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:32:20.126Z
---

# WCAG's four principles (POUR)

The Web Content Accessibility Guidelines (WCAG), published by the W3C, organise accessibility under four principles: content must be perceivable, operable, understandable and robust (POUR). Each principle holds guidelines, and each guideline holds testable success criteria graded at level A, AA or AAA. The current version is WCAG 2.2, which became a W3C Recommendation in October 2023.

## Why it matters

WCAG is the shared yardstick. Accessibility laws and procurement policies in many countries point to it, and most ask for level AA, often of an earlier version such as 2.0 or 2.1. Claim a product is accessible and the next question is "to which version and level?"

## The idea

| Principle | Question | Example success criterion |
|---|---|---|
| Perceivable | Can every user sense the content? | 1.1.1 Non-text Content (A): images need a text alternative |
| Operable | Can every user work every control? | 2.1.1 Keyboard (A): every function works from a keyboard |
| Understandable | Can users make sense of content and operation? | 3.3.2 Labels or Instructions (A): inputs have labels or instructions |
| Robust | Does it work with browsers and assistive technology? | 4.1.2 Name, Role, Value (A): controls expose what they are and their state |

Only success criteria are testable; principles and guidelines organise and explain.

Levels are cumulative: meeting AA means meeting every A and every AA criterion. AA adds criteria such as 1.4.3 Contrast (Minimum), a contrast ratio of at least 4.5:1 for normal text. The W3C does not recommend AAA as a blanket requirement for whole sites, because some content cannot meet every AAA criterion.

CS2111 (Human-Centred Computing) places this under its Accessibility and Inclusive Design module.

## Worked example

A university event sign-up form is audited.

- The banner image carrying the event date has no alt text, so a blind user never learns the date. Perceivable fails (1.1.1).
- The "Choose session" dropdown opens only on a mouse click. Operable fails (2.1.1).
- The email field has no visible label, only placeholder text that vanishes once typing starts. That is a poor stand-in for the label 3.3.2 expects, so Understandable is weak.
- The Submit control is a styled div, so a screen reader announces plain text rather than a button. Robust fails (4.1.2).

Fixing these brings the form to level A on these points; AA checks such as contrast come next.

## Failure modes

- **Treating an automated checker as an audit.** Tools catch missing alt attributes and low contrast, but cannot judge whether alt text is meaningful. Notice it when a page with a perfect tool score is unusable with a screen reader.
- **Confusing principles with criteria.** "Our site is perceivable" is not a test result. Cite the criterion and its level.
- **Quoting the wrong version.** A law may cite 2.0 or 2.1 while the current Recommendation is 2.2. Check which version a requirement names.

## Checks

```check
q: A dialog opens and a keyboard user can Tab around inside it but no key lets them leave it. Which POUR principle does this violate, and why that one?
a: Operable. The content can be sensed and understood; the problem is that the user cannot operate the interface to get out (the No Keyboard Trap criterion, 2.1.2).
why: Catches filing every keyboard or screen reader problem under Perceivable or Robust by reflex.
```

```check
q: A site meets every AA success criterion but misses two level A criteria. Can it claim AA conformance?
a: No. Levels are cumulative, so AA conformance requires meeting all level A and all level AA criteria.
why: Catches the idea that the levels are independent tracks rather than stacked tiers.
```

```check
q: Custom checkboxes look right and work with a mouse, but a screen reader announces them as 'clickable' with no checked state. Which principle and criterion is this closest to?
a: Robust, specifically 4.1.2 Name, Role, Value: the control does not expose its role (checkbox) or its state (checked) to assistive technology.
why: Catches reading Robust as browser compatibility or uptime rather than exposing information to assistive technology.
```
