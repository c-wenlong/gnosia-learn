---
id: speculative-decoding
title: Speculative decoding
summary: Speculative decoding has a small draft model propose several tokens, then the large target model checks them all in one forward pass. A rejection-sampling rule decides how many to keep and makes the output distribution exactly the target's, so generation gets faster without changing what is generated.
requires: [causal-attention-mask]
tags: [transformers]
sources: []
created: 2026-09-28T15:42:59.282Z
---

# Speculative decoding

Speculative decoding has a small draft model propose several tokens, then the large target model checks them all in one forward pass. A rejection-sampling rule decides how many to keep and makes the output distribution exactly the target's, so generation gets faster without changing what is generated.

## Why it matters

A large model's decoding step is limited by reading its weights from memory, so scoring several positions in one pass costs about the same as scoring one. Speculative decoding spends that spare capacity. In CP4284 it is the second of module 6's inference strategies, next to batching.

## The idea

Call the target distribution $p$ and the draft's $q$. Leviathan et al. (2023) and Chen et al. (2023) proposed the scheme independently.

1. The draft model generates $k$ tokens $x_1, \dots, x_k$ one at a time (cheap).
2. The target runs once over the prefix plus all $k$ drafts. Thanks to the [[causal-attention-mask]], one pass gives $p$ at every position, as in training.
3. For $i = 1, \dots, k$: accept $x_i$ with probability $\min\!\big(1, p(x_i)/q(x_i)\big)$.
4. At the first rejection, sample a replacement from the residual $\max(0,\, p - q)$, normalised, and stop.
5. If all $k$ are accepted, sample one bonus token from the target's distribution at position $k+1$.

Each target call yields 1 to $k+1$ tokens. The rule is exact: token $x$ comes out with probability $\min(p(x), q(x))$ from acceptance plus $p(x) - \min(p(x), q(x))$ from the residual, which sums to $p(x)$. Under greedy decoding it reduces to "keep drafts while they match the target's top token".

With acceptance rate $\alpha$ per token (treated as independent), the expected tokens per target call is

$$\frac{1 - \alpha^{k+1}}{1 - \alpha}.$$

The real speed-up also depends on draft cost. Leviathan et al. reported 2 to 3 times faster generation on T5-XXL with identical outputs.

Variants drop the separate draft model: Medusa (Cai et al. 2024) adds heads to the target that predict several future tokens, and prompt lookup drafts by copying n-grams from the prompt.

## Worked example

Take $\alpha = 0.8$ and $k = 4$.

$$\frac{1 - 0.8^5}{1 - 0.8} = \frac{1 - 0.32768}{0.2} \approx 3.36 \text{ tokens per target call.}$$

Suppose one draft step costs 5% of a target step. One round costs $4 \times 0.05 + 1 = 1.2$ target-step units, so the speed-up is about $3.36 / 1.2 \approx 2.8$ times. If $\alpha$ fell to 0.5, the expected tokens drop to $(1 - 0.5^5)/0.5 \approx 1.94$ and the speed-up to about 1.6 times.

## Failure modes

- **Thinking it approximates the target.** With the acceptance rule above, the output distribution is exactly the target's; only speed changes.
- **Poorly matched draft.** Low acceptance wastes draft work; with a slow draft, decoding can end up slower than plain.
- **Too many drafts.** A large $k$ with modest $\alpha$ drafts tokens that are rarely kept.
- **Heavy batching.** With large batches the target step is less memory-bound, leaving less spare compute, so the gain shrinks.

## Prerequisites

- [[causal-attention-mask]]

## Checks

```check
q: The target model gives a drafted token probability 0.2 and the draft model gave it 0.5. With what probability is it accepted, and what happens if it is rejected?
a: It is accepted with probability min(1, 0.2/0.5) = 0.4. If rejected, a replacement token is sampled from the normalised residual max(0, p_target - p_draft), and the remaining drafts are discarded.
why: Catches not knowing the acceptance rule, or thinking a rejected position just takes the target's top token.
```

```check
q: Does speculative sampling with the standard acceptance rule change the distribution of the generated text compared with sampling from the target model alone?
a: No. Acceptance plus resampling from the residual gives each token exactly the target's probability, so only the speed changes, not the output distribution.
why: Catches the belief that speculative decoding trades quality for speed.
```

```check
q: With acceptance rate 0.5 and 2 drafted tokens per round, how many tokens does each target call yield on average?
a: (1 - 0.5^3) / (1 - 0.5) = 0.875 / 0.5 = 1.75 tokens per target call.
why: Catches forgetting the bonus token when all drafts are accepted, which is why the exponent is k+1.
```
