---
id: bias-in-interface-design
title: Bias in interface design
summary: Interfaces encode assumptions about users; forms, defaults, imagery and data that fit one group exclude others, so test with diverse people and check results per group.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:32:50.613Z
---

# Bias in interface design

Every interface carries assumptions about who its users are. When those assumptions fit one group and not others, the interface is biased: forms that reject real names, imagery that shows one kind of person, systems whose accuracy depends on who uses them. It is usually unintended, so it has to be looked for on purpose.

## Why it matters

A biased form or default can lock people out, record wrong data about them, or signal that the product is not for them. Automated systems make the harm larger and harder to see, because one group's poor results hide inside a good average.

## The idea

Three sources:

- **Assumed structure.** A required first name and last name assumes a Western naming pattern. Chinese names often put the family name first; many Malay names have no family name, using "bin" or "binti" with the father's name; some people have one name. Validation that rejects apostrophes or hyphens turns a mismatch into a hard block. A required two-option gender field excludes people who are neither, often in a service that never needed gender.
- **Defaults and imagery.** Default avatars, example names and stock photos signal who the "normal" user is. Defaults are also chosen more often, so a skewed default skews the data.
- **Unrepresentative data.** Systems trained or tuned mostly on one group can work worse for others. In the Gender Shades study (2018), Joy Buolamwini and Timnit Gebru tested commercial gender classifiers on face images and found much higher error rates for darker-skinned women than for lighter-skinned men. Breaking results down by subgroup exposed what overall accuracy hid.

How to catch it: recruit test participants who differ in language, culture, age, gender and ability; ask of every default and required field "who does this not fit?"; and report error rates per group.

CS2111 (Human-Centred Computing) places this under its Ethics in System Design module.

## Worked example

A Singapore clinic's booking form requires First name, Last name and Gender (Male or Female). Testing with a varied group finds:

- Tan Wei Ming enters "Tan" as his last name; the reminder SMS greets him as "Wei Ming Tan", the wrong order.
- Nur Aisyah binti Rahman has no surname. She types "binti Rahman" as her last name, and the records later address her as "Ms Binti".
- One participant is neither male nor female and abandons the form.

Fixes: one "Full name" field plus "What should we call you?"; drop gender unless a clinical need is named, and then offer more options and "Prefer not to say".

## Failure modes

- **Testing on yourselves.** Participants all share the team's language, age and naming pattern, so nothing is found.
- **Average-only metrics.** High overall accuracy while one group fails badly. Ask for per-group results.
- **Token diversity.** Varied stock photos while the form still rejects real names.
- **Guessing identity.** Inferring gender or ethnicity from names or photos repeats the bias. Ask, and allow people to decline.

## Checks

```check
q: A face-analysis system reports high overall accuracy. What analysis would show whether it is biased, as the Gender Shades study did?
a: Break the error rate down by subgroup, for example by skin type and gender together. An overall average can hide much higher error for a smaller group.
why: Catches trusting aggregate accuracy as evidence of fairness.
```

```check
q: Why is a required 'Last name' field a bias problem rather than a minor annoyance?
a: It assumes a naming structure many people do not have, such as single names or Malay patronymic names, so they must enter false data or cannot continue, and the wrong data then flows into records and messages.
why: Catches seeing form fields as neutral plumbing rather than assumptions about users.
```

```check
q: Your usability tests found no problems with a sign-up form. What should you check about the tests before believing that?
a: Who took part. If participants all share the team's language, culture, age range and naming patterns, the tests could not reveal problems for anyone else.
why: Catches treating a clean result from a narrow sample as evidence of no bias.
```
