---
id: task-success-and-dialogue-metrics
title: Task success and dialogue quality metrics
summary: A conversational system is evaluated by whether users complete their task and at what cost in turns, time and repairs, measured in user tests and in logs, because satisfaction depends on both.
requires: []
assumes: [intent-and-slot-model]
tags: [hci, evaluation]
sources: [https://www.nngroup.com/articles/voice-first/]
created: 2026-09-28T15:30:14.054Z
---

# Task success and dialogue quality metrics

A conversational system is evaluated by whether users complete their task and at
what cost in turns, time and repairs, measured in user tests and in logs, because
satisfaction depends on both.

CS3249 covers this as usability testing methods for conversational interfaces:
task success and conversation quality metrics.

## Why it matters

"Users liked it" and "the NLU scores 92% accuracy" are both weak evidence. A bot
can classify intents well and still frustrate people with long, repetitive
dialogues; users can be polite in a survey about a bot that failed them. You need
measures of what actually happened in the conversation, tied to what users came
to do.

## The idea

Two families of measure, plus how to collect them.

**Task success.** Did the user achieve the goal? In a test you give users
scenarios with a known correct outcome ("book a table for 4 on Friday at 7") and
check the result. In production you infer it: the booking was made, the user
did not ask for a human, did not come back with the same question. Report it as
a rate per task type.

**Dialogue cost and quality.** How much it took to get there:

- efficiency: number of turns, time to completion;
- quality: fallback or "didn't understand" rate, number of repairs and
  corrections, escalations to a human, abandonment.

The PARADISE framework (Walker and colleagues, 1997) made the link explicit: it
modelled user satisfaction as task success traded off against dialogue costs, so
improving one at the expense of the other can be judged.

**Methods.**

- *Moderated usability tests* with scenarios and think-aloud, for why things go
  wrong.
- *Wizard of Oz* tests, where a hidden person plays the system, to test a
  dialogue design before it is built.
- *Log analysis* at scale for the rates above.
- *Questionnaires* for satisfaction, which complement but do not replace
  behavioural measures.

## Worked example

A clinic's booking bot reports 90% intent accuracy. A scenario test with 12
users finds a 58% task success rate: users often gave two slots at once and the
bot asked for them again, doubling the turns, and five people gave up. Logs
confirm a high reprompt rate on the date slot. Fixing multi-slot filling raises
task success and cuts median turns from 11 to 6, a better result than any gain
in intent accuracy would have given.

## Failure modes

- **Evaluating components only** (NLU accuracy) instead of whole conversations.
- **Counting completion without cost:** a task finished in 20 turns is not a
  success users will repeat.
- **Scenarios written in the designer's words,** which users then copy, hiding
  real phrasing problems.
- **Relying on satisfaction surveys alone.**

## Prerequisites

Background: [[intent-and-slot-model]] (task success is often defined by the
slots filled correctly).

## Checks

```check
q: Why is high intent classification accuracy not enough evidence that a conversational system works?
a: It measures one component on single turns. Users can still fail their task or need far too many turns because of dialogue design problems, so task success and dialogue cost must be measured on whole conversations.
why: Catches component-level evaluation standing in for system evaluation.
```

```check
q: Name the two families of measures used to evaluate a task-oriented conversational system, with an example of each.
a: Task success (completion rate per task type) and dialogue cost or quality (turns or time to completion, fallback rate, repairs, escalations, abandonment).
why: Checks the core split the PARADISE framework formalised.
```

```check
q: What is a Wizard of Oz test, and when is it useful?
a: A test where a hidden person plays the system's role while users believe they are talking to it. It is useful for testing a dialogue design before the system is built.
why: Checks a method specific to conversational interfaces.
```
