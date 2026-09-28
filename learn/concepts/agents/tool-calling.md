---
id: tool-calling
title: Tool calling
summary: A model emits a structured call against a declared schema; the harness executes it and returns the result into context.
requires: []
assumes: [transformer-block]
tags: [agentic-ai]
sources: []
created: 2026-08-18T01:45:41.367Z
---

# Tool calling

A model emits a structured call against a declared schema; the harness executes
it and returns the result into context.

## Why it matters

It is the entire boundary between a model that can only produce text and a
system that can do things. Everything agentic sits on top of this one move, so
getting the boundary clear early stops a lot of later confusion about what the
model is and is not doing.

## The idea

The model only ever emits tokens. When it "calls a tool" it produces structured
text naming a tool and its arguments, and then it stops. Something outside the
model, the harness, parses that text, runs the actual function, and appends the
result to the context as a new message. The next generation can read it.

Two things follow from this that are easy to get wrong:

- **The model does not execute anything.** It has no runtime, no filesystem, no
  socket. Every capability belongs to the harness.
- **The result lands in the context, not in the weights.** Nothing about a tool
  call changes the model. Close the conversation and the result is gone.

## Worked example

The model emits something shaped like `search(query: "SM-2 algorithm")`. The
harness recognises the name, validates the arguments against the declared
schema, runs the real search, and appends the output as a message. On the next
turn the model sees that output sitting in its context exactly as if a user had
pasted it, and continues from there.

## Failure modes

- **Believing the model made the network request.** It did not. If a tool call
  reaches a service, the harness took it there.
- **Confusing context with memory.** A result in context is available now and
  gone later. Persisting it is a separate thing you have to build.
- **Vague schema descriptions.** The description is the only thing the model
  has to decide when a tool applies. A bad one fails silently, as a tool that
  is simply never chosen.

## Open questions

- How should a harness handle a call whose arguments do not validate: reject and
  re-prompt, repair silently, or surface the error to the model as an
  observation?

## Checks

```check
q: What does the model itself produce on a tool call, and where does the result go?
a: Structured text naming the tool and its arguments. The harness executes it and appends the result back into context.
why: Catches the belief that the model executes the function or makes the network call itself.
```

## Sessions

- [[2026-08-19-react-agents]] — 2/2 correct (voided: answer always in slot 1)
