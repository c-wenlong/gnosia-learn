---
id: voice-pipeline-latency
title: The voice pipeline and its latency budget
summary: A voice interface chains speech recognition, understanding and speech synthesis, and because people expect replies within a fraction of a second and cannot skim audio, its design is dominated by latency, endpointing and how the spoken output sounds.
requires: []
assumes: [turn-taking-and-grounding]
tags: [hci, voice]
sources: [https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API]
created: 2026-09-28T15:29:26.767Z
---

# The voice pipeline and its latency budget

A voice interface chains speech recognition, understanding and speech synthesis,
and because people expect replies within a fraction of a second and cannot skim
audio, its design is dominated by latency, endpointing and how the spoken output
sounds.

CS3249 covers this as speech input and output: ASR and TTS latency, prosody and
clarity. In the browser, the Web Speech API exposes both halves.

## Why it matters

A text chatbot can take three seconds and feel fine; the user is reading. In a
spoken conversation three seconds of silence reads as "it didn't hear me", and
people repeat themselves or talk over the reply. Voice also removes the screen,
so everything the user needs must be heard once, in order, and remembered.

## The idea

**The pipeline.** Audio goes through automatic speech recognition (ASR) to text,
then understanding and a decision (an NLU pipeline or an LLM), then text-to-speech
(TTS) back to audio. Each stage adds delay, and so does deciding that the user
has finished.

**Endpointing.** The system must detect the end of the user's turn, usually by a
stretch of silence after speech. Too short and it cuts people off mid-thought;
too long and every reply starts late. Barge-in (letting the user interrupt the
system) needs the recogniser listening while the system speaks.

**Latency tactics.** Gaps between turns in human conversation are typically a few
hundred milliseconds, so voice systems fight for every stage:

- stream ASR so recognition runs while the user speaks;
- start generating before the full reply is decided, and stream TTS so audio
  begins with the first sentence;
- acknowledge quickly ("Let me check") when real work will take longer.

**Output for the ear.** Speech is linear and fleeting:

- Keep turns short and put the key information first.
- Offer few options at once (around three), not a long list.
- Use prosody (stress, pauses, intonation) so structure is audible; a TTS voice
  reading a table aloud is useless.
- Expect recognition errors on names, numbers and rare words, and confirm them.

## Worked example

A voice assistant for store hours. First version: 1.2 s endpoint silence, then a
full LLM reply generated before TTS starts, about 3.5 s to first sound, and it
reads out all seven days. Revised: shorter endpointing with barge-in, streamed
generation and TTS (first audio in under a second), and the answer "Today we're
open until 9. Want the rest of the week?"

## Failure modes

- **Screen-style output read aloud:** long lists, URLs, tables.
- **Dead air** while the system works, with no acknowledgement.
- **Endpointing tuned for one speaker,** cutting off slower or hesitant speakers.
- **Unconfirmed numbers and names** that ASR got wrong.

## Prerequisites

Background: [[turn-taking-and-grounding]] (endpointing and barge-in are
turn-taking decisions).

## Checks

```check
q: What are the stages of a voice interface pipeline, and which extra decision adds delay before any of them can finish?
a: Speech recognition, understanding and response decision, then speech synthesis. Endpointing, deciding that the user has finished speaking, adds delay before the turn can be processed.
why: Checks the full pipeline including the often-forgotten endpointing step.
```

```check
q: Name two ways to cut the time before a voice assistant starts speaking.
a: Any two of: streaming ASR while the user talks, streaming generation and TTS so audio starts with the first sentence, tighter endpointing, or an immediate short acknowledgement while slower work continues.
why: Checks practical latency tactics.
```

```check
q: Why should a voice reply offer only a few options and put the key information first?
a: Audio is linear and fleeting: the listener cannot scan or reread, so long lists exceed what they can hold in memory and buried information is missed.
why: Links design rules to a property of the medium.
```
