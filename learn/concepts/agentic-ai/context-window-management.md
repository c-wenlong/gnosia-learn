---
id: context-window-management
title: Managing a conversation's context window
summary: An LLM remembers nothing between calls, so a chat application resends the system prompt and the conversation on every turn, and must decide what to keep, summarise or drop once the conversation outgrows the model's context window.
requires: []
assumes: [transformer-block]
tags: [agentic-ai, dialogue]
sources: [https://platform.openai.com/docs/guides/prompt-engineering]
created: 2026-09-28T15:28:40.997Z
---

# Managing a conversation's context window

An LLM remembers nothing between calls, so a chat application resends the system
prompt and the conversation on every turn, and must decide what to keep,
summarise or drop once the conversation outgrows the model's context window.

CS3249 covers this as prompting for dialogue: system prompts and window
management.

## Why it matters

The "memory" of a chatbot is entirely a design decision in the application.
Get it wrong and the bot forgets the user's name after twenty turns, loses the
constraint stated at the start, or becomes slow and expensive as every turn
carries the whole history. Every behaviour a user reads as the bot's personality
or attention comes from what is in the window.

## The idea

**The model is stateless.** Each API call takes a list of messages and returns
one reply. To continue a conversation, the application sends the whole relevant
history again. Nothing persists inside the model between calls.

**The system prompt** sits at the start of that list and sets the role, the
rules, the tone and any fixed knowledge. It is resent on every turn, so it should
be stable and as short as it can be while still complete.

**The window is finite.** It is measured in tokens and covers the system prompt,
the history, any retrieved documents, and the reply. Cost and latency grow with
what you send. When the conversation would overflow, the common strategies are:

1. **Sliding window:** keep the system prompt and the most recent turns, drop the
   oldest. Simple; loses early facts.
2. **Summarise:** replace old turns with a running summary. Keeps the gist;
   details can be lost or distorted.
3. **Extract state:** keep key facts (name, booking details, preferences) as
   structured notes that are always included.
4. **Retrieve:** store the full history outside the window and pull back only the
   turns relevant to the current question.

Position matters too: models have been shown to use information at the start and
end of a long context more reliably than information buried in the middle.

## Worked example

A travel assistant. Turn 2: "I'm vegetarian and travelling with a wheelchair."
By turn 40 the sliding window has dropped turn 2, and the bot recommends a
steakhouse up a flight of stairs. Fix: extract durable user constraints into a
short "user profile" block placed right after the system prompt on every call,
and summarise the rest.

## Failure modes

- **Silent truncation** of early turns that held lasting constraints.
- **Bloated system prompts** that crowd out the conversation and raise cost on
  every turn.
- **Summaries that drift,** turning "maybe Tuesday" into "Tuesday".
- **Assuming the model remembers** a previous session that was never resent.

## Prerequisites

Background: [[transformer-block]] (the model attends only over the tokens it is
given).

## Checks

```check
q: If an LLM remembers nothing between API calls, how does a chatbot appear to remember the conversation?
a: The application resends the system prompt and the relevant conversation history with every call, so the model sees it again each turn.
why: Catches the belief that memory lives in the model.
```

```check
q: Name three strategies for handling a conversation longer than the context window, with one weakness each.
a: Sliding window (drops early facts), summarisation (loses or distorts details), extracting key facts as structured state (only keeps what you chose to extract), retrieval of relevant past turns (can miss what the retriever fails to find). Any three.
why: Checks the learner can choose among strategies knowingly.
```

```check
q: A user states a lasting constraint in turn 2 and the bot ignores it at turn 40. What is the likely cause and a fix?
a: The turn was dropped by truncation. Keep durable facts in an always-included block (extracted state or profile) near the start of the prompt, rather than relying on raw history.
why: Applies the idea to a common bug.
```
