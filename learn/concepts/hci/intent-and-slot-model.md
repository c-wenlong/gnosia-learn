---
id: intent-and-slot-model
title: The intent-and-slot model of dialogue
summary: Classic task-oriented dialogue systems model each request as an intent (what the user wants to do) plus slots (the parameters it needs), and hold the conversation until every required slot is filled.
requires: []
tags: [hci, dialogue]
sources: [https://developers.google.com/assistant/conversation-design/welcome]
created: 2026-09-28T15:27:21.278Z
---

# The intent-and-slot model of dialogue

Classic task-oriented dialogue systems model each request as an intent (what the
user wants to do) plus slots (the parameters it needs), and hold the
conversation until every required slot is filled.

CS3249 presents this as the intent- and slot-based interaction model of classic
dialogue systems. It goes back to frame-based systems such as GUS in the 1970s
and is still the core of platforms like Rasa, Dialogflow and Alexa skills.

## Why it matters

It is the simplest model that turns free conversation into something a program
can execute. Once you see a request as "intent plus slots", you can design which
questions to ask, what to do with partial answers, and when the task can run.
Even LLM-based agents are often designed in these terms when they call a tool:
the tool is the intent, its arguments are the slots.

## The idea

- **Intent:** the task the user wants, from a fixed set the designer defined,
  such as `book_flight`, `check_balance`, `cancel_order`.
- **Slots:** the named values the intent needs, each with a type: for
  `book_flight`, `origin` (city), `destination` (city), `date` (date),
  `passengers` (number). Some are required, some optional, some have defaults.
- **Frame:** the intent's slots with their current values. The dialogue's job is
  to fill it.

The loop: understand the user's turn into an intent and any slot values it
contains; merge them into the frame; if a required slot is empty, ask for it; when
the frame is complete, confirm if the action is costly, then execute.

Because a user may give several slots at once ("Fly me to Tokyo on Friday"), the
system should accept whatever arrives in any order and ask only for what is
missing. That is *mixed initiative*: the user can lead, and the system steps in
for gaps.

The model's limits define its use. It works for bounded tasks with a known set
of intents. It struggles with requests outside the designed intents, with tasks
whose structure is open-ended, and with conversation that is not task-shaped at
all.

## Worked example

Intent `book_flight`, required slots origin, destination, date.
User: "I need to get to Tokyo on Friday."
Frame: destination = Tokyo, date = Friday, origin = empty.
System: "Flying to Tokyo on Friday. Where from?"
User: "Singapore." Frame complete; system confirms and books.

## Failure modes

- **Asking for slots already given** because the design only fills one per turn.
- **Rigid slot order** that forces the user to follow the system's script.
- **Out-of-scope requests** forced into the nearest intent instead of being
  recognised as unsupported.
- **Too many intents** with overlapping meanings, which the classifier then
  confuses.

## Checks

```check
q: In the intent-and-slot model, what is an intent, what is a slot, and what is a frame?
a: An intent is the task the user wants, from a designer-defined set; slots are the typed parameters that task needs; a frame is the intent's slots with their current values, which the dialogue works to fill.
why: Checks the core vocabulary.
```

```check
q: A user says "Fly me to Tokyo on Friday" to a flight bot needing origin, destination and date. What should the system do next, and why?
a: Fill destination and date from the turn and ask only for the origin, since a mixed-initiative design accepts whatever slots arrive and asks only for what is missing.
why: Applies frame filling to a realistic multi-slot turn.
```

```check
q: Name a kind of request the intent-and-slot model handles badly.
a: Anything outside the predefined intents, open-ended tasks without a fixed set of parameters, or conversation that is not task-shaped (chit-chat, exploration).
why: Checks the learner knows where the model stops working.
```
