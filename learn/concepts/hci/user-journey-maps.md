---
id: user-journey-maps
title: User journey maps
summary: A timeline of one persona in one scenario, showing stages, actions, thoughts, emotions, touchpoints and pain points, to find where the experience breaks down.
requires: []
assumes: [personas]
tags: [hci]
sources: []
created: 2026-09-28T15:31:23.095Z
---

# User journey maps

A user journey map is a visual timeline of one persona working through one scenario, told from their point of view. Stage by stage, it records what they do, think and feel, which touchpoints they meet, and where things go wrong. It turns a sprawling experience into one shared picture.

## Why it matters

Products are built in pieces (website, app, emails, support line) owned by different teams, but users experience one continuous journey. A map shows where the handoffs fail, which no single team sees from inside its own part.

## The idea

A map is scoped to one persona (see [[personas]]) and one scenario with a clear start and end. Mixing personas or scenarios averages the emotions and pain points into a journey nobody has.

The usual rows sit under stages laid out along the top:

- **Stages:** the phases of the scenario, in time order
- **Actions:** what the person does at each stage
- **Thoughts:** questions and expectations, in their own words
- **Emotions:** a line rising and falling with how they feel
- **Touchpoints:** where they meet the service, such as a screen, email, call or counter
- **Pain points:** where friction, confusion or failure happens

Many maps add an opportunities row. The content should come from research such as interviews and observation. A current-state map records the journey as it is today, to find problems; a future-state map describes the intended journey, to align the team on what to build.

CS2111 (Human-Centred Computing) places this under its Understanding Users module.

## Worked example

Persona: Arjun, a working parent. Scenario: renewing his daughter's passport online.

| Stage | Action | Emotion | Pain point |
| --- | --- | --- | --- |
| Discover | Searches for the renewal page | Neutral | Two official-looking sites; unsure which is real |
| Prepare | Photographs his daughter at home | Frustrated | Photo rules are in a separate PDF |
| Apply | Fills the form on his phone | Hopeful | Session times out while he finds an old passport number |
| Wait | Gets an acknowledgement email | Anxious | No status update for three weeks |
| Collect | Picks up the passport | Relieved | None |

The emotion line bottoms out at Prepare and Wait. Neither is the form itself, which is where the team had planned to spend its effort. Photo guidance inside the form and status emails become the first priorities.

## Failure modes

- **Several personas on one map.** Pain points average out and point nowhere.
- **Assumption-based maps.** Drawn in a workshop with no user data. Ask where each pain point came from.
- **Only the product's own screens.** The map starts at login and ignores what happens before and after, where much of the pain often sits.
- **A poster, not a tool.** The map is never linked to a backlog or decision.

## Prerequisites

- [[personas]] (background)

## Checks

```check
q: Why should a journey map cover one persona and one scenario instead of combining several?
a: Different people and scenarios have different actions, feelings and pain points. Combining them averages these into a journey no real user has, hiding the specific moments to fix.
why: Catches the instinct to make one map cover everyone for efficiency.
```

```check
q: A team's journey map shows the lowest emotions at stages outside their app, before sign-up and while waiting for delivery. What should they conclude?
a: The worst problems sit at touchpoints beyond the screens they planned to redesign, so fixing those stages (for example guidance before sign-up, status updates while waiting) may matter more than polishing the app.
why: Catches the assumption that the product's own interface is always where the pain is.
```

```check
q: What is the difference between a current-state and a future-state journey map?
a: A current-state map records the journey as it is today, from research, to find problems. A future-state map describes the intended journey, to align the team on what to build.
why: Catches mixing observed reality with the planned design on one map.
```
