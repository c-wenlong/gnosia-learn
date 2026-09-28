---
id: think-aloud-usability-testing
title: Think-aloud usability testing
summary: Participants do realistic tasks while voicing their thoughts, a neutral moderator does not help, and the team records success, time and errors.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:32:05.928Z
---

# Think-aloud usability testing

Think-aloud usability testing is a session where a participant works through realistic tasks with a product while saying out loud what they are thinking, looking for and expecting. A moderator watches, keeps them talking, and does not help. The result is a record of where people struggle and, from their words, why.

## Why it matters

Watching someone fail tells you there is a problem. Hearing them say "I'm looking for a Pay button, I guess it's under Account?" tells you what they expected, which points at the fix.

It also corrects the team's view. Designers know where everything is, so they cannot see the product as a newcomer does.

## The idea

A session has a few fixed parts:

1. **Realistic tasks.** Give a goal in the user's terms, such as "You want to get to the airport by 9 am tomorrow. Buy a ticket." Avoid naming the button or menu, or the task gives away the answer.
2. **Verbalising.** The participant narrates as they go. A short practice task helps, since this feels odd at first.
3. **A neutral moderator.** When the participant goes quiet, the moderator prompts with something neutral like "What are you thinking now?" They do not hint, rescue, or explain the design. When asked "Is this right?", they turn it back: "What would you expect?"
4. **Observe behaviour over opinions.** "It looks nice" means little if they could not finish the task.
5. **Simple measures.** For each task, record success, time taken, and errors or wrong turns.

One caution: talking aloud can slow people down, so task times from a think-aloud session are rough indicators, not precise benchmarks.

CS2111 (Human-Centred Computing) places this under its Evaluating Usability module.

## Worked example

A team tests a new bus ticket app with five participants. Task: "Buy a single ticket from the city centre to the airport for tomorrow morning."

Participant 3 taps "Tickets", then "Passes", then goes back. "I thought single tickets would be here. Is it under Journeys?" She stalls for 40 seconds. The moderator only says "Keep telling me what you're looking for." She eventually finds single tickets inside the journey planner.

Four of the five participants look in "Tickets" first. The team records the task as a success for four of five, with a median time well above what they expected, and one clear cause in the participants' own words: single tickets live where people do not look. They add single tickets to the "Tickets" screen and test again.

## Failure modes

- **Leading tasks.** Wording that names the interface ("Use the Journey Planner to...") hides the navigation problem you wanted to find.
- **The helpful moderator.** Hints and rescues make tasks pass that real users would fail.
- **Trusting opinions over actions.** Participants sometimes call a design easy right after struggling with it.
- **Silence.** Without prompts, participants stop talking and the reasons are lost.

## Checks

```check
q: A participant asks the moderator, 'Should I press Continue?' What should the moderator do, and why?
a: Turn it back without answering, for example 'What would you expect to happen?' Answering would rescue a task that a real user, alone, might fail, hiding the problem.
why: Catches the instinct to help, which makes the product look more usable than it is.
```

```check
q: What is wrong with the task wording 'Use the Journey Planner to buy a single ticket'?
a: It names the part of the interface to use, so it tells the participant where to go and hides any problem finding it. The task should state the goal in user terms only.
why: Catches leading tasks that give away the navigation being tested.
```

```check
q: A participant struggles for two minutes to finish a task, then says the app was easy. Which should the team weigh more, and why?
a: The behaviour. What people do is more reliable than what they report afterwards, and what people say afterwards does not always match how they actually performed.
why: Catches treating participants' opinions as the main finding of a usability test.
```
