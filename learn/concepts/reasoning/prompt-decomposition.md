---
id: prompt-decomposition
title: Decomposing a problem across prompts
summary: "Prompt decomposition splits a hard task into simpler subproblems that are solved in order, in separate prompts or stages, with each answer fed forward into the next. Least-to-most prompting (Zhou et al. 2022, published at ICLR 2023) is the standard example: first ask the model to break the problem down, then solve the pieces from easiest to hardest."
requires: [chain-of-thought-prompting]
tags: [agentic-ai, reasoning]
sources: []
created: 2026-09-28T15:42:16.716Z
---

# Decomposing a problem across prompts

Prompt decomposition splits a hard task into simpler subproblems that are solved in order, in separate prompts or stages, with each answer fed forward into the next. Least-to-most prompting (Zhou et al. 2022, published at ICLR 2023) is the standard example: first ask the model to break the problem down, then solve the pieces from easiest to hardest.

## Why it matters

Chain-of-thought runs all its reasoning in one generation, so it tends to fail on problems harder than its exemplars. Decomposition makes the intermediate structure explicit: each subquestion is a separate call you can inspect, check, retry or route to a tool. In CP4284 this is the "breaking down hard tasks" half of module 2, and it is the "plan" step of the capstone agent.

## The idea

Least-to-most prompting has two stages.

1. **Decompose.** A prompt with a few exemplars shows how to reduce a problem to a list of simpler subquestions.
2. **Solve in order.** Each subquestion is asked in turn, with the earlier subquestions and their answers included in the prompt, so later steps build on earlier results.

Its main result is generalisation from easy exemplars to harder test cases. On SCAN, a benchmark that maps commands like "jump twice after walk" to action sequences, code-davinci-002 with 14 exemplars reached at least 99% accuracy with least-to-most, against 16% with chain-of-thought. On last-letter concatenation it held up better than chain-of-thought as the test lists grew longer than those in the exemplars.

| | Chain-of-thought | Decomposition |
|---|---|---|
| Calls | one generation | several calls or stages |
| Structure | implicit in the text | explicit list of subquestions |
| Checking | read the whole chain | check or retry each step |
| Cost | lowest | more calls, more latency |

Related: Plan-and-Solve prompting (Wang et al. 2023) asks for a plan and its execution in one zero-shot prompt. In applications, prompt chaining wires fixed stages together: extract fields, classify, draft a reply.

## Worked example

Task: concatenate the last letters of "think, machine, learning, reasoning".

Stage 1 decomposes by growing the list: first "think, machine", then add "learning", then add "reasoning".

Stage 2 solves in order:
- "think, machine": k and e give "ke".
- "think, machine, learning": the previous answer "ke" plus g gives "keg".
- "think, machine, learning, reasoning": "keg" plus g gives "kegg".

Each call does one small step on top of the previous answer, so the step is the same size however long the list grows.

## Failure modes

- **Bad decomposition.** Subquestions that miss part of the task, or come in the wrong order, give a clean-looking but wrong answer.
- **Error propagation.** A wrong subanswer is passed forward as if it were a fact; later stages rarely question it.
- **Lost context.** If a stage is not given the original question and the earlier results, it answers a different question.
- **Cost.** More calls, more tokens, more latency.

## Prerequisites

- [[chain-of-thought-prompting]]

## Checks

```check
q: What are the two stages of least-to-most prompting, and what does the second stage include in each prompt?
a: Stage one asks the model to decompose the problem into simpler subquestions; stage two answers them in order, and each prompt includes the earlier subquestions with their answers so later steps build on them.
why: Catches thinking least-to-most is just a longer chain of thought, missing that answers are fed forward between separate stages.
```

```check
q: Give one practical advantage of solving subproblems in separate calls rather than in one chain of thought, and one cost.
a: Advantage: each intermediate answer can be inspected, checked, retried or handed to a tool before it is used. Cost: more model calls, so more tokens and more latency.
why: Catches seeing decomposition and chain-of-thought as the same thing, or ignoring the trade-off.
```

```check
q: In a decomposition pipeline, stage 2 returns a wrong answer. What typically happens at stage 3, and why?
a: Stage 3 usually treats the wrong answer as a given fact and builds on it, so the error propagates to the final answer, because later prompts present earlier results as settled context.
why: Catches assuming later stages will catch and correct earlier mistakes on their own.
```
