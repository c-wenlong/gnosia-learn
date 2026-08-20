---
title: ReAct agents
date: 2026-08-19T17:37:07.000Z
goal: react-loop
type: learning-session
---

# ReAct agents

> [!warning] Reconstructed
> This log was rebuilt after the session. Nothing was written while it ran,
> which was the defect the session existed to find. From now on `learn observe`
> writes each exchange as it happens.

## Probe

> [!question] Quiz
> In a ReAct-style agent, what does interleaving reasoning with actions actually buy you?
>
> 1. Each tool result re-enters the context before the next decision, so the plan can change partway through
> 2. The agent reasons out a complete plan up front, then carries out each step in order
> 3. Thinking and tool calls happen at the same time, so the agent finishes faster
> 4. It lets the agent fire several tool calls at once in a single step

> [!success] Correct
> **You answered:** 1. Plan can change mid-run
> **Answer:** 1
>
> The alternative it rules out is plan-then-execute, where the plan is committed
> before any observation arrives. Options 3 and 4 describe concurrency and
> batching, which are orthogonal to whether the plan can be revised.

> [!question] Quiz
> When a model "calls a tool", what does the model itself actually produce?
>
> 1. Structured text naming the tool and its arguments, which something outside the model then runs
> 2. It executes the function itself inside its own runtime
> 3. It opens a network connection and sends a request to the tool's API
> 4. Its final answer, which the tool then checks

> [!success] Correct
> **You answered:** 1. Text naming tool and args
> **Answer:** 1
>
> The model only ever emits tokens. Options 2 and 3 both give the model
> capabilities it does not have: there is no execution and no socket on its side
> of the boundary. The harness owns both.

> [!question] Quiz
> Attention weights get used to mix value vectors. What are the weights themselves computed from?
>
> 1. A softmax over scaled dot products between each query and every key
> 2. A softmax applied directly to the raw token embeddings
> 3. Learned parameters fixed during training, the same regardless of input
> 4. Cosine similarity between the value vectors

> [!question] Quiz
> Besides the attention sublayer, what else sits inside a single transformer block?
>
> 1. A position-wise feed-forward network, with residuals and normalisation around both sublayers
> 2. A recurrent unit carrying hidden state between tokens
> 3. A convolution sliding across the sequence
> 4. A pooling step that shortens the sequence

> [!failure] Challenged, and rightly
> **You answered:** "how is this question related to react though"
>
> Not an incorrect answer, so nothing was recorded against you. You had found a
> defect: `tool-calling` declared `transformer-block` as a prerequisite, which
> forced nine concepts of transformer internals in front of a reasoning loop.
> You do not need to know what is inside the model to understand that it emits a
> call and the harness runs it.
>
> That edge was removed mid-session. The plan went from 11 steps to 2.

> [!question] Quiz
> A plain tool-using agent already calls tools in a loop. What does ReAct specifically add?
>
> 1. The model emits its reasoning as tokens before each action, and that trace stays in context
> 2. The ability to use more than one tool
> 3. A second model that plans the sequence of calls before execution
> 4. Retry handling when a tool call fails

> [!success] Correct
> **You answered:** 1. A written reasoning trace
> **Answer:** 1
>
> The trace being *in the context* is the mechanism. It is not a log for humans;
> it conditions the next generation.

> [!question] Quiz
> As a ReAct run gets long, what tends to degrade first?
>
> 1. Raw tool output piles up in context, squeezing out the reasoning and the original goal
> 2. The model loses the ability to emit correctly structured tool calls
> 3. Each call adds delay until the run is too slow to be useful
> 4. The reasoning trace becomes deterministic and stops exploring

> [!success] Correct
> **You answered:** 1. Observations crowd context
> **Answer:** 1
>
> This is why observation summarisation and context pruning exist in production
> agent harnesses.

> [!question] Quiz
> The harness runs the tool and gets a result back. Where does that result go?
>
> 1. Appended to the model's context as a new message
> 2. Applied as a small update to the model's parameters
> 3. Returned directly to the user, bypassing the model
> 4. Written to a separate store the model must query again later

> [!success] Correct
> **You answered:** 1. Back into context
> **Answer:** 1
>
> Option 2 is the common confusion between context and weights: nothing about a
> tool call changes the model. Option 4 describes a memory system, which is a
> thing you can build on top, but not what happens by default.

## Concepts covered

- [[react-loop]]
- [[tool-calling]]

## What happened

Five probe questions answered, five correct. Nothing was taught: the probe found
no gap, so the session stopped rather than manufacturing a lesson.

## Defects this run found

1. **Over-declared prerequisite.** `tool-calling` required `transformer-block`,
   forcing a nine-concept march through transformer internals before ReAct could
   be taught. You caught it before the system did. Fixed: edge removed, plan went
   from 11 steps to 2.

2. **No downward propagation of mastery.** Answering a dependent correctly does
   not raise belief in its prerequisites, so `react-loop` reached 97% mastered
   while `tool-calling` still read 60% shaky. The skill instructs this inference;
   the code does not implement it. Open.

3. **Cold-start probe ranking is uninformative.** With nothing observed, every
   concept scores identical information gain (0.296 bits) and the tiebreak is
   fewest-prerequisites-first, which points at the bottom of the graph. The skill
   says start near the goal, so the ordering had to be overridden by hand. Open.

4. **No `concept edit` command.** Changing a prerequisite meant editing
   frontmatter directly, since `concept add --force` discards the body. Open.

5. **Probe-only sessions schedule nothing for review.** Five answers, three
   checks written, and `reviews.json` stayed empty, because `observe` only
   creates a card when the source is not `probe`. A concept can reach mastered
   and never come back. Open.

6. **Correct answer was always option 1.** All seven questions. "Always pick the
   first option" would have scored the same five out of five, so the session
   measured pattern-matching. SKILL.md had no rule about position at all. Fixed:
   the rule exists now, and these observations are voided.

7. **Nothing was written to this log while the session ran.** Five observations
   recorded, zero lines logged. The log is the interface, and it was empty until
   after the fact. Fixed: `observe` now writes each exchange as a callout at the
   moment it records the evidence.

## Self-assessment

**Coverage.** The goal concept was reached, but only because there was no gap to
cross. No teaching happened, so the teaching half of the pipeline is still
unexercised.

**Restraint.** Held. No answers were revealed during probing, and no lesson was
invented once the probe came back clean.

**Understanding.** Not established. Five correct answers, but every one of them
had the answer in slot 1, so the evidence is void. What the session did establish
is that you can spot a bad prerequisite graph faster than the system can.
