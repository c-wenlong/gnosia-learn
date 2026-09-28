---
id: grounded-responses-and-clarification
title: Grounded answers and clarifying questions
summary: An LLM agent should answer from sources it was given or can check, say when it does not know, and ask a clarifying question when a request has readings that lead to different answers, rather than fluently guessing.
requires: []
assumes: [context-window-management, turn-taking-and-grounding]
tags: [agentic-ai, dialogue]
sources: [https://platform.openai.com/docs/guides/prompt-engineering]
created: 2026-09-28T15:28:43.711Z
---

# Grounded answers and clarifying questions

An LLM agent should answer from sources it was given or can check, say when it
does not know, and ask a clarifying question when a request has readings that
lead to different answers, rather than fluently guessing.

CS3249 covers this as grounding responses, ambiguity and repair: hallucination
control and clarification strategies.

## Why it matters

A language model produces fluent text whether or not it has a basis for it.
When it lacks the facts it can produce plausible fabrications (hallucinations),
and when a request is ambiguous it tends to pick one reading silently. In a
conversation both look like confident, helpful answers, which is exactly why
users act on them.

## The idea

**Grounding in sources** (the LLM sense of the word, distinct from
conversational grounding in [[turn-taking-and-grounding]]):

1. Put the facts in the context: retrieve relevant documents, records or tool
   results and include them (retrieval-augmented generation).
2. Instruct the model to answer only from them and to say so when they do not
   contain the answer.
3. Ask for citations to the specific passage, so the user and your code can
   check the claim.
4. Where stakes are high, verify: check that cited passages exist and support the
   statement.

This reduces hallucination; it does not remove it. The model can still misread
or over-generalise a source.

**Clarifying ambiguity.** Ask when two conditions hold: the request has more than
one plausible reading, and the readings lead to materially different answers or
actions. Otherwise, pick the likely reading and state the assumption ("Assuming
you mean the Singapore office..."), which grounds it in the conversational sense
and invites correction. Good clarifying questions offer the options rather than
asking an open "what do you mean?".

**Repair.** When the user corrects the system, acknowledge the correction,
update what is carried forward, and do not repeat the error two turns later.

## Worked example

User: "What's our refund policy for annual plans?" The assistant has the policy
document in context.
Ungrounded: a confident paragraph mixing the real policy with a plausible 30-day
rule that is not in the document.
Grounded: "Annual plans can be refunded within 14 days of purchase (Refund
Policy, section 3). The document doesn't cover upgrades mid-term." And for
"cancel my plan" when the user has two plans: "Your Pro plan or your Team plan?"

## Failure modes

- **Trusting "answer only from the sources"** as a guarantee.
- **Citations that do not support the claim,** or point nowhere.
- **Clarifying everything,** which makes the assistant tiring to use.
- **Silent assumptions** on ambiguous, costly requests.

## Prerequisites

Background: [[context-window-management]] (sources must fit in the window) and
[[turn-taking-and-grounding]] (the conversational sense of grounding).

## Checks

```check
q: "Grounding" means two different things in conversational AI. What are they?
a: In dialogue design it means establishing mutual understanding between the parties (conversational grounding). In LLM work it means tying an answer to sources or facts provided or checkable, to limit hallucination.
why: Separates two senses that are easily confused.
```

```check
q: When should an assistant ask a clarifying question rather than pick a reading and proceed?
a: When the request has more than one plausible reading and those readings lead to materially different answers or actions. Otherwise it can proceed on the likely reading and state its assumption.
why: Checks a usable rule rather than "ask when unsure".
```

```check
q: Name two practices that reduce hallucination in a retrieval-grounded assistant, and one limit of them.
a: Put relevant sources in context and instruct the model to answer only from them and admit when they are silent; require citations and verify them. Limit: the model can still misread or over-generalise the sources, so hallucination is reduced, not eliminated.
why: Checks both the techniques and their limits.
```
