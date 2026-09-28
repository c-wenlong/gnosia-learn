---
id: agent-memory-context-vs-store
title: "Agent memory: the context window and external stores"
summary: An agent has two kinds of memory. Short-term memory is whatever sits in the context window for the current model call; long-term memory is a store outside the model that the harness writes to and retrieves from, and it only affects behaviour once something retrieved from it is placed back into the context.
requires: [react-loop]
tags: [agentic-ai]
sources: []
created: 2026-09-28T15:42:22.123Z
---

# Agent memory: the context window and external stores

An agent has two kinds of memory. Short-term memory is whatever sits in the context window for the current model call; long-term memory is a store outside the model that the harness writes to and retrieves from, and it only affects behaviour once something retrieved from it is placed back into the context.

## Why it matters

A [[react-loop]] appends a thought, a tool call and an observation on every step, so the context fills up. Without a policy for what to keep, store and fetch back, a long task overflows the window or loses facts it needs. In CP4284 this is module 3's memory and state topic, and the capstone agent needs it once tasks run long.

## The idea

**Short-term memory** is the prompt: instructions, tool definitions, conversation, scratchpad and recent observations. Weights do not change during a task, so this is all the model can "see". It has a hard limit (the window) and a soft one: accuracy degrades as it grows. Liu et al. (2023, "Lost in the Middle") found models used information at the start or end of a long context better than in the middle.

**Long-term memory** lives outside the model:
- a vector store: text chunks embedded as vectors, retrieved by similarity to the current query;
- key-value facts, such as a user's preferences;
- files, such as a plan or a notes document the agent edits.

**State management** is the policy between them: prune or summarise old turns, choose what to write (facts, reflections, task progress), and when to retrieve (every turn, or when the agent calls a memory tool via [[tool-calling]]).

MemGPT (Packer et al. 2023) treats the context like an operating system's main memory, and the model pages information in and out of external storage with function calls. Generative Agents (Park et al. 2023) keep a memory stream of observations and retrieve by a combined score of recency, importance (rated by the model) and relevance (embedding similarity).

## Worked example

An agent has a 32k-token window. The system prompt and tool schemas take 3k; each ReAct step averages 1.5k. After 18 steps the context holds $3 + 18 \times 1.5 = 30$k tokens, close to the limit.

The harness keeps the last 6 steps verbatim (9k), replaces the first 12 with a 0.5k summary, and writes two facts to the store ("user wants metric units", "settings live in config/app.yaml"). The context drops to $3 + 0.5 + 9 = 12.5$k. At step 40 the user asks about settings; similarity search finds the config fact and puts it back in context.

## Failure modes

- **Wrong memories reinforced.** A mistaken fact is retrieved, restated and written again, and becomes harder to dislodge.
- **Retrieval misses.** The query is phrased unlike the stored memory, so search fails to surface it.
- **Context bloat.** Retrieving too much buries the relevant item and raises cost on every call.
- **Lossy summaries.** Compaction drops a constraint ("do not touch production") that later matters.

## Prerequisites

- [[react-loop]]

## Checks

```check
q: An agent writes a user's preference to a vector store at step 5. At step 50 it ignores that preference. Give the most likely reason, in terms of what the model can see.
a: The model only sees its context window for that call; the stored preference affects behaviour only if retrieval puts it back into context, so most likely the retrieval did not surface it at step 50.
why: Catches the belief that writing to external memory makes the model remember it, when only retrieved content reaches the model.
```

```check
q: Why can a very long context hurt an agent even when everything still fits inside the window?
a: Models use information in long contexts unevenly, often worse in the middle, and every call pays to process the whole context, so accuracy and cost both suffer as it fills.
why: Catches treating the window size as the only limit on short-term memory.
```

```check
q: What is one risk of summarising old turns to save context space?
a: The summary can drop a detail that matters later, such as a constraint or an exact value, and the agent then acts without it.
why: Catches assuming compaction is free and loses nothing.
```
