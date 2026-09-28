---
id: privacy-by-design
title: Privacy by design
summary: "Build privacy in from the start (Cavoukian's seven principles): protection is the default, data is minimised, and GDPR Article 25 makes this a legal duty."
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:32:46.819Z
---

# Privacy by design

Privacy by design means building privacy protection into a system from the start, as a default and a design requirement, rather than bolting it on after a breach or a complaint. Ann Cavoukian, of the Information and Privacy Commissioner's office in Ontario, Canada, developed the idea in the 1990s and published it as seven foundational principles in 2009. The EU's GDPR later turned a version of it into a legal duty.

## Why it matters

Defaults decide what most people get, because most people never change their settings. If sharing is on by default, most users share. Privacy that depends on finding a setting protects only the few who look.

Data never collected cannot leak, be misused or be demanded later, which makes minimisation the cheapest protection there is.

## The idea

Cavoukian's seven principles:

1. Proactive, not reactive; preventative, not remedial
2. Privacy as the default setting
3. Privacy embedded into design
4. Full functionality: positive-sum, not zero-sum
5. End-to-end security: full lifecycle protection
6. Visibility and transparency
7. Respect for user privacy: keep it user-centric

Two do most of the everyday work. Privacy as the default means the user is protected without doing anything; sharing is something they choose to turn on. Data minimisation, which Cavoukian's text ties to that principle, means collecting only what the purpose needs, keeping it only as long as needed, and limiting who can see it.

GDPR Article 25, "data protection by design and by default", makes this a duty for controllers (the organisations deciding how personal data is used). They must build in measures such as pseudonymisation and, by default, process only the personal data needed for each specific purpose: how much is collected, how far it is processed, how long it is kept and who can reach it.

CS2111 (Human-Centred Computing) places this under its Ethics in System Design module.

## Worked example

A running app records routes. Defaults: new activities are visible to "Only me", not "Everyone". A privacy zone hides the start and end of any route near the user's home, switched on at sign-up with a plain explanation. Location is recorded only during a run.

Minimisation: sign-up asks for email and a display name. Date of birth was proposed "for analytics", but nobody could name a feature that needed it, so it was cut. Server logs holding IP addresses are deleted after 30 days.

A user who never opens Settings is still protected.

## Failure modes

- **Privacy as a settings page.** Protection exists but is off by default. Notice: the protective option needs the user to act.
- **Collecting "just in case".** Fields and events with no named purpose. Ask of each one: which feature breaks without it?
- **Compliance at the end.** A post-launch legal review finds problems that are now expensive to fix.
- **Consent as cover.** Long notices or bundled consent used to justify collecting everything.
- **Forgetting retention.** Data minimised at collection but kept forever.

## Checks

```check
q: An app offers a 'Hide my location' switch that is off by default and buried in settings. Which of Cavoukian's principles does it break, and why?
a: Privacy as the default setting: users should be protected without having to act, so the protective option should be on unless they choose otherwise.
why: Catches the idea that offering a privacy option is enough, whatever its default.
```

```check
q: Why does a product's default setting shape privacy outcomes more than the range of options it offers?
a: Most people never change defaults, so the default is what most users actually live with; a protective option that starts off protects few people.
why: Catches overestimating how often users adjust their settings.
```

```check
q: A product manager wants to collect users' birth dates because 'it might be useful later'. What principle and legal rule argue against it?
a: Data minimisation, part of privacy as the default, and GDPR Article 25, which requires processing by default only the personal data needed for each specific purpose.
why: Catches treating unused data as harmless rather than as risk with no benefit.
```
