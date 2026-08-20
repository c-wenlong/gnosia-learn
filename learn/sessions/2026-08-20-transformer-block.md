---
title: Transformer block
date: 2026-08-20T06:28:53.923Z
goal: transformer-block
type: learning-session
---

# Transformer block

> Live log. The tutor appends here as the session runs.
> [!question] Quiz
> Besides the attention sublayer, what else sits inside one transformer block?
>
> 1. A recurrent unit carrying hidden state from one token to the next
> 2. A convolution sliding along the sequence to mix neighbouring positions
> 3. A position-wise feed-forward network, with residuals and normalisation around both sublayers
> 4. A pooling operation that shortens the sequence as it climbs the stack

> [!success] Correct
> **You answered:** 3. Feed-forward + residuals
> **Answer:** 3
>
> The other three all describe architectures the transformer deliberately replaced. Recurrence and convolution are the two it was defined against, and nothing in a block changes the sequence length.

> [!question] Quiz
> What makes self-attention "self"?
>
> 1. It attends only to its own output from the previous layer
> 2. Queries, keys and values are all projected from the same sequence
> 3. Each token attends only to its own position before mixing
> 4. It learns its attention weights without supervision

> [!failure] Not quite
> **You answered:** 3. Each token attends to itself
>
> Held for the teaching phase, so descending into prerequisites stays uncontaminated.

> [!question] Quiz
> Attention weights are used to mix the value vectors. What are the weights themselves computed from?
>
> 1. A softmax applied straight to the raw token embeddings
> 2. Parameters learned during training that stay the same whatever input arrives
> 3. Cosine similarity measured between the value vectors of each pair of tokens
> 4. A softmax over scaled dot products between each query and every key

> [!failure] Not quite
> **You answered:** 3. Similarity between values
>
> Held for the teaching phase.

> [!question] Quiz
> In softmax, why exponentiate the scores before normalising, rather than just dividing by their sum?
>
> 1. Exponentiation forces every term positive and widens the gaps, giving a valid and peaked distribution
> 2. It keeps the output within a fixed range for numerical stability
> 3. It makes the operation differentiable, which plain division would not be
> 4. It makes the weights add up to the number of tokens

> [!success] Correct
> **You answered:** 1. Positive, and widens gaps
> **Answer:** 1
>
> Raw division breaks on negative scores, which can make a weight negative or the denominator zero. Division by a sum is already differentiable, so that is not the reason.

> [!question] Quiz
> Why divide the query-key dot product by the square root of the key dimension before the softmax?
>
> 1. It normalises each vector to unit length before comparison
> 2. It compensates for the number of attention heads
> 3. It keeps the result invariant to sequence length
> 4. Without it the products grow with dimension and push softmax into saturation

> [!failure] Not quite
> **You answered:** Did not answer: "I am not sure. I didn't even know this step happened."
>
> **In your words:** I am not sure. I didn't even know this step happened.
>
> Held for teaching. An explicit don't-know is better evidence than a guess: it rules out the lucky-guess case entirely.

> [!question] Quiz
> What distinct job does the value vector do, compared with query and key?
>
> 1. It measures how alike two tokens are
> 2. Query and key decide the weight; the value is the content actually blended into the output
> 3. It stores each token's position so ordering survives
> 4. It holds the attention weights once softmax has been applied

> [!failure] Not quite
> **You answered:** 4. Holds the weights
>
> Held for teaching.

> [!question] Quiz
> A vector is often written as a list of numbers like [3, -1, 4]. What is that list, strictly?
>
> 1. The vector itself, since the numbers are what it is made of
> 2. A compact stand-in that discards some information
> 3. Its coordinates in some chosen basis; a different basis gives a different list for the same vector
> 4. An approximation that gets more exact as the dimension grows

> [!failure] Not quite
> **You answered:** 4. An approximation
>
> Held for teaching.

## Probe result

Seven questions, from the goal downward. Held: the shape of a transformer
block, and why softmax exponentiates. Gaps: everything in the attention
mechanism itself, and underneath it the idea that coordinates are a choice.

The edge is at the bottom of the graph, not the middle. Teaching starts at
[[vector-as-a-list-of-numbers]].

## Teach

### Step 1 — [[vector-as-a-list-of-numbers]]

First attempt at this step was prose only, describing a rotation in words. The
learner rejected it as badly phrased and asked for a picture, correctly: the
skill says to visualise spatial ideas and the step had skipped it. Redone with
a diagram.

![[vector-as-a-list-of-numbers.svg]]

The misconception being targeted: that the list of numbers is an approximation
of the vector. Both lists in the diagram are exact, and they still differ,
which rules approximation out.

> [!question] Quiz
> With the picture in front of you: what is the list [1, 3] a description of?
>
> 1. The arrow plus a small reading error
> 2. One of several arrows sharing those numbers
> 3. Where the axes sit on the page
> 4. The arrow, stated relative to the axes you chose

> [!success] Correct
> **You answered:** 4. The arrow, given your axes
> **Answer:** 4
>
> The rotated panel is the counter-example to every other option: the arrow is unchanged and unambiguous, and the numbers still move. What varies is the frame you measure against.

## Self-assessment

**Coverage.** Reached one concept of nine. The probe was the bulk of the
session, which was right: the edge turned out to be at the bottom of the graph,
not the middle.

**Restraint.** Held on the probe. No answers revealed while descending, and the
explanations for the four wrong answers are still withheld for teaching.

**Understanding.** Demonstrated on the one concept taught, after the second
attempt. The first attempt failed and the learner said why.

**What the tutor got wrong.** Step 1 was delivered as prose describing a
rotation. Spatial idea, no picture, despite the skill saying to draw one. The
learner rejected it. Redone with a diagram and it landed immediately.

## Close

- Questions answered: 8 (3 correct)
- Concepts touched: 7
  - [[transformer-block]] →  60% shaky
  - [[self-attention]] →   5% gap
  - [[attention-weights]] →   4% gap
  - [[softmax]] →  61% shaky
  - [[dot-product]] →   4% gap
  - [[query-key-value-projections]] →   4% gap
  - [[vector-as-a-list-of-numbers]] →  38% gap

Closed 2026-08-20T07:14:23.710Z

