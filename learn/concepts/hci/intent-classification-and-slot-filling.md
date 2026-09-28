---
id: intent-classification-and-slot-filling
title: Intent classification and slot filling
summary: Natural language understanding for a task bot is two learning problems on each user turn, classifying the whole utterance into an intent and labelling individual words as slot values, each with a confidence the dialogue can act on.
requires: [intent-and-slot-model]
tags: [hci, dialogue, nlp]
sources: [https://rasa.com/docs/]
created: 2026-09-28T15:27:58.486Z
---

# Intent classification and slot filling

Natural language understanding for a task bot is two learning problems on each
user turn, classifying the whole utterance into an intent and labelling
individual words as slot values, each with a confidence the dialogue can act on.

CS3249 covers this as intent recognition (classification) and slot filling
(entity extraction), the NLU half of a classic pipeline such as Rasa's.

## Why it matters

The intent-and-slot model says what to extract; this is how it is extracted, and
therefore where it goes wrong. Most "the bot misunderstood me" moments are an
intent misclassified or a slot value missed or mangled. Knowing the two tasks
separately tells you which one failed and what to fix: more training examples,
a new entity type, or a better fallback.

## The idea

**Intent classification** is text classification. The input is the whole
utterance; the output is one intent label from the designed set, with a
probability. It is trained on example utterances per intent ("book me a
flight", "I need to fly to Osaka"). Modern systems use a sentence encoder or a
fine-tuned transformer; older ones used bag-of-words features.

**Slot filling** is *sequence labelling*: every token gets a tag. The common
scheme is BIO: B for the beginning of a slot value, I for inside it, O for
outside any slot.

```
fly   to  new           york          on  friday
O     O   B-destination I-destination O   B-date
```

Recognised spans are then normalised: "friday" to a calendar date, "new york" to
a city code. Some values come from lookup tables or regular expressions rather
than a model (order numbers, email addresses).

The two tasks are often trained jointly, since the intent helps predict slots and
the reverse.

**Confidence matters as much as the label.** Below a threshold the right
response is not to act but to confirm or ask ("Did you want to book a flight or
change one?"), or to route to a fallback. A system that always acts on its top
guess turns every classification error into a wrong action.

## Worked example

"Change my Friday flight to Saturday." The classifier returns `change_flight`
at 0.62 and `book_flight` at 0.31. The slot tagger marks "Friday" and "Saturday"
both as dates. Two problems show: the intent is uncertain, and the slots need
roles (old date, new date) that a single `date` slot cannot hold. Fixes: more
training examples for `change_flight`, and separate `original_date` and
`new_date` slots.

## Failure modes

- **Acting on low-confidence intents** instead of clarifying.
- **Overlapping intents** with similar examples, so the classifier cannot tell
  them apart.
- **Unnormalised values:** "next Fri" extracted but not turned into a date.
- **Training examples written by designers,** which rarely match how real users
  phrase things.

## Prerequisites

- [[intent-and-slot-model]]

## Checks

```check
q: Intent classification and slot filling are two different kinds of learning problem. What kind is each?
a: Intent classification is text classification: one label for the whole utterance. Slot filling is sequence labelling: a tag for each token, commonly in the BIO scheme, marking which words are slot values.
why: Checks the learner can separate the two tasks.
```

```check
q: Tag "fly to new york on friday" with BIO labels for destination and date slots.
a: fly O, to O, new B-destination, york I-destination, on O, friday B-date.
why: Tests the BIO scheme concretely, including a multi-word value.
```

```check
q: The classifier returns its top intent with probability 0.55. What should the dialogue do, and why?
a: Not act on it directly; confirm or ask a clarifying question, or fall back, because acting on uncertain labels turns classification errors into wrong actions.
why: Links NLU confidence to dialogue behaviour.
```
