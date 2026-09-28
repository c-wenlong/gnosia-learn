---
id: usability-heuristics-in-conversation
title: Usability heuristics applied to conversation
summary: The classic usability heuristics (visible feedback, consistency, error prevention, recognition over recall) still hold in a conversational interface, but with no screen of options they have to be delivered in words and turn design.
requires: []
assumes: [heuristic-evaluation]
tags: [hci]
sources: [https://www.nngroup.com/articles/ten-usability-heuristics/]
created: 2026-09-28T15:26:38.084Z
---

# Usability heuristics applied to conversation

The classic usability heuristics (visible feedback, consistency, error
prevention, recognition over recall) still hold in a conversational interface,
but with no screen of options they have to be delivered in words and turn
design.

CS3249 revisits Nielsen's ten heuristics with this lens, focusing on feedback,
consistency and error prevention.

## Why it matters

A graphical interface gets several heuristics almost for free: buttons show what
is possible, a spinner shows the system is busy, a greyed-out option prevents an
invalid choice. A conversation has none of that. The user sees a blank text box
or hears silence, and has to guess what the system can do and whether it
understood. Applying the heuristics deliberately is how a conversational design
avoids feeling like talking to a wall.

## The idea

Four of Nielsen's heuristics carry most of the weight in conversation:

1. **Visibility of system status (feedback).** Acknowledge every turn. Confirm
   what was understood ("Booking a table for 4 at 7 pm") so a misunderstanding
   is visible before it matters. Signal when the system is working.
2. **Consistency and standards.** Keep one persona, one vocabulary and one way of
   doing the same thing. If "cancel" works in one part of the dialogue, it
   should work everywhere.
3. **Error prevention.** Confirm before irreversible actions. Offer choices when
   input is likely to be ambiguous ("Do you mean the 7 am or 7 pm flight?").
   Constrain inputs where you can, for example with quick-reply suggestions.
4. **Recognition rather than recall.** Users cannot see a menu, so tell them
   what they can do, briefly, at the point they need it, rather than expecting
   them to remember commands.

The others still apply: user control (a way to go back or start over), help
users recover from errors (say what went wrong and how to fix it), and
minimalist design (short turns, especially in voice).

A useful tension: **explicit confirmation** of everything is safe but slow and
irritating; **implicit confirmation** (echoing the understood values inside the
next question) keeps feedback visible at lower cost. Reserve explicit "Is that
right?" questions for costly actions.

## Worked example

A bank bot. Bad: user types "send 50 to Sam"; bot replies "Done." Improved:
"Sending $50 to Sam Lee (account ending 1234). Confirm or change?" This gives
feedback on what was understood, prevents the error of the wrong Sam, and offers
control before the irreversible step.

## Failure modes

- **Silent success,** so users cannot tell whether they were understood.
- **Hidden capabilities:** an open prompt with no hint of what is possible.
- **Confirming everything,** which trains users to say yes without listening.
- **Inconsistent commands** across parts of the conversation.

## Prerequisites

Background: the general heuristics themselves are taught as heuristic
evaluation in CS2111 ([[heuristic-evaluation]]).

## Checks

```check
q: Which usability heuristics does a graphical interface get almost for free that a conversational interface must deliver deliberately, and why?
a: Visibility of status and recognition rather than recall (and some error prevention): a GUI shows available options, busy states and disabled choices on screen, while a conversation shows nothing, so feedback and options must be put into words.
why: Checks the learner understands why conversation makes heuristics harder.
```

```check
q: What is the difference between explicit and implicit confirmation, and when is each appropriate?
a: Explicit confirmation asks the user to confirm ("Is that right?"); implicit confirmation echoes the understood values inside the next turn. Use explicit for costly or irreversible actions, implicit elsewhere to keep feedback visible without slowing the dialogue.
why: Targets the main design trade-off in conversational feedback.
```

```check
q: A bot replies "Done." after "send 50 to Sam". Which heuristics does that break?
a: Visibility of system status (no feedback on what was understood) and error prevention (no chance to catch the wrong recipient or amount before an irreversible action), and it gives the user no control to correct it.
why: Applies the heuristics to a concrete turn.
```
