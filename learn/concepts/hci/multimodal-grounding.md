---
id: multimodal-grounding
title: Multimodal grounding
summary: In a multimodal interface, speech, text, gesture and on-screen elements are interpreted together, so "that one" is resolved against what is displayed or pointed at, and the system chooses which modality carries each part of its reply.
requires: []
assumes: [turn-taking-and-grounding, voice-pipeline-latency]
tags: [hci, voice]
sources: [https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API]
created: 2026-09-28T15:29:30.579Z
---

# Multimodal grounding

In a multimodal interface, speech, text, gesture and on-screen elements are
interpreted together, so "that one" is resolved against what is displayed or
pointed at, and the system chooses which modality carries each part of its reply.

CS3249 covers this as grounding across text, voice and UI elements. The classic
demonstration is Bolt's "Put-that-there" system (MIT, 1980): the user said "put
that there" while pointing, and the system combined speech and gesture.

## Why it matters

Real devices mix modalities: a smart display that talks, a phone assistant that
shows cards, a car that takes voice and touch. Users move between them freely and
refer across them ("the second one", "this"). An interface that treats each
channel separately cannot resolve those references, and one that sends
everything through the same channel wastes the strengths of each.

## The idea

**Input fusion.** Interpret signals from several modalities as one act. Each
modality fills gaps the others leave:

- speech carries intent ("move", "compare", "book");
- pointing, touch, gaze or the current screen carries reference ("that",
  "here", "the red one").

References like these are *deictic*: they only make sense relative to shared
context. Grounding them means keeping track of what the user can see and what
they last touched, and resolving "that one" against it.

Modalities can be **complementary** (each supplies a different part, as above)
or **redundant** (both say the same thing, which helps robustness: a spoken
"yes" plus a tap on Confirm).

**Output fission.** Split the reply across channels by what each does well:

- voice for short, time-sensitive messages and confirmations;
- screen for lists, comparisons, maps and anything the user needs to scan or come
  back to.

Keep the channels consistent: if the voice says "three options", the screen shows
the same three, in the same order and with the same names.

## Worked example

On a kitchen smart display, the user asks "Show me pasta recipes." The screen
lists six; the voice says "Here are six pasta recipes. Which one?" The user taps
the third and says "How long does this take?" "This" is resolved from the tap
(the selected recipe), not from the speech alone. The reply is spoken briefly
("About 25 minutes") while the screen shows the full steps.

## Failure modes

- **Treating channels separately,** so "this" or "the second one" cannot be
  resolved.
- **Reading screen content aloud** in full instead of pointing to it.
- **Voice and screen that disagree** in count, order or naming.
- **Assuming a screen exists:** the same assistant may be running on a speaker
  with no display.

## Prerequisites

Background: [[turn-taking-and-grounding]] (grounding as mutual understanding)
and [[voice-pipeline-latency]] (what voice output is good and bad at).

## Checks

```check
q: What is a deictic reference, and why does a multimodal system need more than speech recognition to resolve it?
a: A reference like "this", "that one" or "here" whose meaning depends on shared context. The system must combine the words with what is on screen, pointed at or recently touched, since the speech alone does not say what it refers to.
why: Checks the core problem multimodal grounding solves.
```

```check
q: How should a reply be split between voice and screen on a smart display?
a: Voice for short, time-sensitive messages and confirmations; screen for lists, comparisons and content the user needs to scan or revisit, with both channels kept consistent.
why: Checks output fission.
```

```check
q: What is the difference between complementary and redundant use of modalities? Give an example of each.
a: Complementary: each supplies a different part of the meaning (saying "move that there" while pointing). Redundant: both carry the same meaning for robustness (saying "yes" and tapping Confirm).
why: Checks the fusion vocabulary with examples.
```
