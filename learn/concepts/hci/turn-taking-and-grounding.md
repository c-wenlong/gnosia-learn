---
id: turn-taking-and-grounding
title: Turn-taking and conversational grounding
summary: Conversation runs on turns that signal when each side may speak, and on grounding, the continual exchange of evidence that each utterance was understood well enough to build on.
requires: []
tags: [hci, dialogue]
sources: [https://developers.google.com/assistant/conversation-design/welcome]
created: 2026-09-28T15:27:18.765Z
---

# Turn-taking and conversational grounding

Conversation runs on turns that signal when each side may speak, and on
grounding, the continual exchange of evidence that each utterance was understood
well enough to build on.

CS3249 treats these as the first two dialogue design principles. Both come from
the study of human conversation (conversation analysis, and Clark and Brennan's
work on grounding) and carry over to designing systems.

## Why it matters

People bring decades of conversational habits to any system that talks. When a
system interrupts, leaves long silences, or carries on as if it understood when
it did not, users feel it immediately, even if they cannot say why. Designing
turns and grounding on purpose is what makes a conversational interface feel
cooperative rather than broken.

## The idea

**Turn-taking.** Speakers alternate, and each turn signals where it can end: a
question hands the floor over; a trailing "and..." keeps it. Many turns come in
*adjacency pairs*: a question expects an answer, an offer expects acceptance or
refusal, a greeting expects a greeting. For a system this means:

- End each turn so the user knows it is their move (usually with a question or
  a clear prompt).
- Do not ask two questions in one turn; the user will answer only one.
- In voice, decide when the user has finished speaking (endpointing) and whether
  they may interrupt the system (barge-in).

**Grounding.** Speakers do not just send messages; they work to establish
*common ground*, the shared belief that something has been understood. Each side
gives evidence of understanding: an acknowledgement ("ok"), a relevant next turn,
or repeating back the key part. When evidence is missing or wrong, the other
side repairs ("No, I said Tuesday").

For a system, grounding means showing what it understood so the user can catch
errors early, at a level of effort matched to the cost of a misunderstanding.

Note a clash of terms: in LLM work "grounding" often means tying an answer to
sources or facts. This note is the conversational sense: mutual understanding
between the two parties.

## Worked example

User: "Book a table for four tomorrow."
Poor: "What time? And do you want indoor or outdoor seating?" (two questions,
one will be lost; no evidence the first part was understood).
Better: "A table for four tomorrow. What time would you like?" The echo grounds
the understood parts, the single question hands over the turn cleanly.

## Failure modes

- **Stacked questions** in one turn.
- **No evidence of understanding,** so misunderstandings surface late and cost
  more to fix.
- **Over-grounding:** repeating everything back on every turn, which is slow,
  especially by voice.
- **Ambiguous turn ends,** leaving the user unsure whether to speak.

## Checks

```check
q: What is conversational grounding, in the sense used in dialogue design?
a: The process by which both parties establish that an utterance was understood well enough for current purposes, by giving and receiving evidence of understanding such as acknowledgements, relevant next turns or repeating back key content.
why: Checks the definition, and that it is about mutual understanding rather than fact-checking.
```

```check
q: Why should a conversational system usually ask one question per turn?
a: A question hands the turn over and forms an adjacency pair with its answer; with two questions the user tends to answer only one, and the other is silently lost.
why: Applies turn-taking structure to a design rule.
```

```check
q: How does a system give grounding evidence cheaply, without asking "did I get that right?" every time?
a: By echoing the understood values inside its next turn (for example "A table for four tomorrow. What time?"), which lets the user correct it without an extra confirmation step.
why: Links grounding to implicit confirmation.
```
