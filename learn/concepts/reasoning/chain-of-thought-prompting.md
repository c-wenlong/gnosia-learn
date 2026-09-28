---
id: chain-of-thought-prompting
title: Chain-of-thought prompting
summary: Chain-of-thought (CoT) prompting gets a model to write out intermediate reasoning steps before its final answer. Few-shot CoT (Wei et al. 2022) puts worked examples with written reasoning in the prompt; zero-shot CoT (Kojima et al. 2022) just appends "Let's think step by step".
requires: [next-token-prediction]
tags: [agentic-ai, reasoning]
sources: []
created: 2026-09-28T15:42:05.993Z
---

# Chain-of-thought prompting

Chain-of-thought (CoT) prompting gets a model to write out intermediate reasoning steps before its final answer. Few-shot CoT (Wei et al. 2022) puts worked examples with written reasoning in the prompt; zero-shot CoT (Kojima et al. 2022) just appends "Let's think step by step".

## Why it matters

A language model spends a fixed amount of computation per generated token. If it must emit the answer straight away, the whole calculation has to happen inside the forward passes for those few tokens. CoT gives it more tokens, and so more computation, before it commits. In CP4284 this opens module 2, and every later reasoning method (self-consistency, search over thoughts, reasoning models) builds on it.

## The idea

| Prompt format | What the prompt contains | What the model writes |
|---|---|---|
| Plain few-shot | question and answer exemplars | the answer |
| Few-shot CoT | exemplars with reasoning before each answer | reasoning, then the answer |
| Zero-shot CoT | the question plus "Let's think step by step" | reasoning, then the answer |

In Kojima et al.'s zero-shot version a second prompt then extracts the final answer from the generated reasoning.

The mechanism follows from [[next-token-prediction]]: each generated token is appended to the context, so a written intermediate result ("180 eggs") becomes an input for every later step. The model no longer has to carry partial results inside its activations for one pass; it reads them back.

Scale mattered in the original results. Wei et al. found the gains appeared mainly in models of roughly 100B parameters and above; smaller models wrote fluent but illogical chains and sometimes did worse than plain prompting. Zero-shot CoT raised text-davinci-002 from 17.7% to 78.7% on MultiArith and from 10.4% to 40.7% on GSM8K, with no hand-written exemplars at all.

## Worked example

Question: "A shop has 15 boxes of 12 eggs. 38 break. The rest are packed into cartons of 6. How many full cartons?"

A plain prompt asks for the number immediately. A typical failure is "24": the model roughly divides and rounds, with nowhere to put the intermediate totals.

With "Let's think step by step" the model writes: $15 \times 12 = 180$ eggs. $180 - 38 = 142$. $142 \div 6 = 23$ remainder 4, so 23 full cartons. Each line uses the line before it as context, and each can be checked by a reader.

## Failure modes

- **Unfaithful rationales.** The written reasoning need not be how the answer was reached. Turpin et al. (2023) biased few-shot prompts so the answer was always "(A)"; models shifted towards (A) and their explanations systematically failed to mention it.
- **Error propagation.** A slip in step 2 is carried forward confidently, since later steps treat it as given.
- **Wasted tokens.** On easy lookups CoT adds latency and cost with no accuracy gain.
- **Small models.** Below the scale where it helps, CoT can produce plausible nonsense and lower accuracy.

## Prerequisites

- [[next-token-prediction]]

## Checks

```check
q: In mechanical terms, why can writing out intermediate steps improve a language model's answer?
a: Each generated token is appended to the context, so written intermediate results become inputs for later steps, and the model gets more forward passes of computation before it commits to the answer.
why: Catches the vague belief that CoT works because the model is told to be careful, rather than because of extra computation and written-down state.
```

```check
q: What is the difference between few-shot CoT and zero-shot CoT?
a: Few-shot CoT puts exemplars in the prompt whose answers include written reasoning; zero-shot CoT uses no exemplars and appends a trigger phrase such as Let's think step by step.
why: Catches confusing zero-shot CoT with plain zero-shot prompting, or thinking CoT always needs hand-written examples.
```

```check
q: A model's chain of thought reads as correct and ends in the right answer. Does that show the chain is how the model reached the answer?
a: No. Rationales can be unfaithful: experiments that biased prompts towards a particular option shifted answers while the explanations systematically failed to mention the bias, so the written reasoning may be a plausible story rather than the actual cause.
why: Catches treating the written chain as a faithful trace of the model's internal computation.
```
