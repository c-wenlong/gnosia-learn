---
id: conversational-repair-and-fallback
title: Breakdown, repair and fallback
summary: Conversations with systems break down, either because nothing was understood or because the wrong thing was, and a good design detects each, repairs with prompts that add help rather than repeat, and falls back to another route after a set number of failures.
requires: []
assumes: [turn-taking-and-grounding, usability-heuristics-in-conversation]
tags: [hci, dialogue]
sources: [https://www.nngroup.com/articles/voice-first/]
created: 2026-09-28T15:30:18.143Z
---

# Breakdown, repair and fallback

Conversations with systems break down, either because nothing was understood or
because the wrong thing was, and a good design detects each, repairs with prompts
that add help rather than repeat, and falls back to another route after a set
number of failures.

CS3249 covers this as error recovery and breakdown handling: repair strategies
and fallback design. Its capstone asks for a prototype user-tested on at least
one breakdown and recovery.

## Why it matters

Breakdowns are not rare edge cases; recognition errors, out-of-scope requests
and unexpected phrasing happen in every real deployment. Users judge a
conversational system largely by what happens then. "Sorry, I didn't get that"
repeated three times is the most common reason people give up on a bot.

## The idea

**Two kinds of breakdown.**

- *Non-understanding:* the system has no interpretation (no intent above
  threshold, silence in voice). It knows it failed, so it can repair at once.
- *Misunderstanding:* the system is confident in the wrong interpretation. It
  does not know it failed; the error shows up later, when the user objects or
  gets the wrong result. Grounding (echoing what was understood) is the main
  defence, since it lets the user catch the error early.

**Repair strategies**, system-initiated:

1. *Escalating reprompts:* each retry adds help instead of repeating. First "What
   date?", then "What date would you like? For example, next Monday or 3 March."
2. *Offer choices* when free input keeps failing ("Is it about billing, delivery
   or returns?").
3. *Confirm the uncertain part* only ("Did you say fifteen or fifty?").

And user-initiated: let people correct at any time ("no, I meant Tuesday"),
start over, or ask for help, and handle those commands everywhere.

**Fallback.** After a fixed number of failed attempts (often two or three), stop
looping and change route: hand off to a human with the conversation so far,
switch to a form or menu, or give another channel. Also define what happens for
requests the system was never designed for: say so and point somewhere useful.

## Worked example

User: "I want to change my delivery thing."
Bot (no match): "I can help with delivery. Do you want to change the address, the
date, or track a parcel?"
User: "the day."
Bot: "Changing the delivery date for order 4471, currently Thursday. Which day
instead?"
If the user fails twice more, the bot says "Let me get someone to help" and hands
the transcript to an agent, so the user does not repeat themselves.

## Failure modes

- **Identical reprompts,** which teach the user nothing new.
- **No detection of misunderstanding,** because nothing is echoed back.
- **Infinite loops** with no fallback.
- **Handoffs that drop context,** making the user start again.

## Prerequisites

Background: [[turn-taking-and-grounding]] (grounding exposes misunderstandings)
and [[usability-heuristics-in-conversation]] (help users recognise and recover
from errors).

## Checks

```check
q: What is the difference between a non-understanding and a misunderstanding, and why is the second harder to handle?
a: In a non-understanding the system has no interpretation and knows it failed. In a misunderstanding it confidently holds the wrong interpretation, so it does not know it failed and the error surfaces later, after it may have acted.
why: Checks the key distinction in breakdown handling.
```

```check
q: What makes an escalating reprompt better than repeating "Sorry, I didn't get that"?
a: Each retry adds help, such as examples, the expected format or a short list of options, so the user has new information to succeed with instead of guessing again.
why: Checks the core repair principle.
```

```check
q: What should happen after several failed attempts at the same step, and what must the fallback carry with it?
a: Stop retrying and change route, for example a handoff to a human, a form or menu, or another channel, carrying the conversation so far so the user does not have to repeat it.
why: Checks fallback design, including context preservation.
```
