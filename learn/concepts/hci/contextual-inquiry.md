---
id: contextual-inquiry
title: Contextual inquiry
summary: "Beyer and Holtzblatt's field method: observe and interview people during their real work, in their own setting, as an apprentice learning from a master."
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:31:15.377Z
---

# Contextual inquiry

Contextual inquiry is a field research method in which a researcher watches and talks with people while they do their real work, where they normally do it. Hugh Beyer and Karen Holtzblatt developed it as the core of their Contextual Design process. It exists because what people say about their work often differs from what they actually do.

## Why it matters

People are poor reporters of their own routines: habits and workarounds are invisible to them, so interviews yield the official process. Watching the work as it happens surfaces the sticky notes, side spreadsheets and shortcuts that reveal real needs, which is where design opportunities usually lie.

## The idea

The researcher takes the role of an apprentice learning from a master craftsperson. The user is the expert; the researcher watches and asks questions as the work unfolds, instead of running through a fixed questionnaire. People who struggle to describe their work in the abstract can easily show and explain it while doing it.

Beyer and Holtzblatt describe four principles:

| Principle | Meaning |
| --- | --- |
| Context | Go to the workplace and watch real, ongoing work, not summaries of it |
| Partnership | Share control of the session; follow the user's lead and explore together |
| Interpretation | Offer your interpretations to the user on the spot so they can confirm or correct them |
| Focus | Enter with a clear project focus that guides what to notice, while staying open to surprises |

A session commonly lasts a couple of hours: a short conventional interview, then observation with questions, then a wrap-up where the researcher summarises what they learned and checks it with the user. Findings are later consolidated across several users.

CS2111 (Human-Centred Computing) places this under its Understanding Users module.

## Worked example

A team designing a warehouse picking app first interviews pickers in a break room. Pickers say they follow the handheld scanner's route. The team then shadows three pickers on shift and sees them ignore the suggested order and batch items by aisle, because the route doubles back. One picker keeps a folded printout of aisle numbers in a pocket. When the researcher asks "so the route is wrong?", the picker corrects her: it is fine for a single order and bad only when several orders are combined. That interpretation, checked in the moment, becomes a requirement no interview had raised.

## Failure modes

- **Interview in disguise.** The session happens in a meeting room with no work being done, so you hear the official process.
- **Interrogator mode.** The researcher runs a fixed script and the user just answers. Partnership collapses and surprises are missed.
- **Silent interpretation.** Conclusions are drawn afterwards and never checked with the user, so misreadings become findings.
- **No focus.** The researcher records everything and learns nothing in particular.
- **One expert as everyone.** Watching a single user and treating their habits as universal.

## Checks

```check
q: Pickers tell interviewers they follow the scanner's route, but on shift they batch items by aisle. Which principle of contextual inquiry is designed to catch this gap?
a: Context: observing real, ongoing work where it happens. Interviews away from the work capture what people believe they do, while observation shows what they actually do.
why: Catches the belief that careful questioning can substitute for watching people work.
```

```check
q: Why does a contextual inquiry researcher share interpretations with the user during the session instead of only analysing afterwards?
a: So the user can confirm or correct them on the spot. It turns guesses into checked findings and often draws out detail the user would not have volunteered.
why: Catches treating the user as a passive data source instead of a partner in interpretation.
```

```check
q: What does the master-apprentice relationship imply about who leads a contextual inquiry session?
a: The user, as the expert in their own work, largely leads, and the researcher learns by watching and asking as the work unfolds. It is not driven by a fixed questionnaire.
why: Catches confusing contextual inquiry with a structured interview that happens to be held on site.
```
