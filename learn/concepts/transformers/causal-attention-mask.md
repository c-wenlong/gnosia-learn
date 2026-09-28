---
id: causal-attention-mask
title: Causal attention mask
summary: "A causal mask sets every attention score above the diagonal to $-\infty$ before the softmax, so position $i$ attends only to positions $j \le i$. That one change turns [[self-attention]] into an autoregressive model: a decoder-only transformer computes every next-token prediction in one parallel pass during training and generates one token at a time at inference."
requires: [self-attention, next-token-prediction]
tags: [transformers, generative-models]
sources: []
created: 2026-09-28T15:41:25.763Z
---

# Causal attention mask

A causal mask sets every attention score above the diagonal to $-\infty$ before the softmax, so position $i$ attends only to positions $j \le i$. That one change turns [[self-attention]] into an autoregressive model: a decoder-only transformer computes every next-token prediction in one parallel pass during training and generates one token at a time at inference.

## Why it matters

[[next-token-prediction]] needs each prediction to depend only on earlier tokens. RNNs enforce that by running in order, which is slow to train; unmasked attention would let every token see the answer. In CP4283 the causal mask places large language models in the same lineage as PixelCNN: the same chain-rule factorisation, with masked attention in place of masked convolutions.

## The idea

Self-attention computes scores $S = QK^\top / \sqrt{d_k}$, one row per query position. The mask $M$ has $M_{ij} = 0$ for $j \le i$ and $-\infty$ for $j > i$, and the weights are

$$A = \mathrm{softmax}(S + M) \text{ row by row}.$$

Since $e^{-\infty} = 0$, future positions get exactly zero weight and each row still sums to 1.

Training uses teacher forcing: feed the true sequence $w_1, \dots, w_T$, and the output at position $t$ predicts $w_{t+1}$. Because each position sees only its prefix, one forward pass yields all $T$ next-token losses at once, with no leakage.

Generation is sequential: sample a token, append it, run again. Because of the mask, earlier positions never change when a token is appended, so a KV cache stores their keys and values. Each step computes $q$, $k$, $v$ for the new token only and attends over the cache, which grows linearly with sequence length.

Images fit the same mould once they are token sequences. Image GPT modelled pixels in raster order; DALL-E (the first version) generated a caption's tokens followed by discrete image tokens from a learned codebook; Parti also generated discrete image tokens, with an encoder-decoder transformer.

## Worked example

Three tokens with raw scores

$$S = \begin{pmatrix} 2 & 1 & 0 \\ 1 & 3 & 1 \\ 0 & 2 & 2 \end{pmatrix} \;\to\; S + M = \begin{pmatrix} 2 & -\infty & -\infty \\ 1 & 3 & -\infty \\ 0 & 2 & 2 \end{pmatrix}.$$

Row-wise softmax:

- Row 1: $(1, 0, 0)$, attending only to itself.
- Row 2: $\mathrm{softmax}(1, 3) = (0.119, 0.881, 0)$.
- Row 3: $\mathrm{softmax}(0, 2, 2) = (0.063, 0.468, 0.468)$, unchanged by the mask.

Unmasked, row 1 would give token 3 weight $e^0/(e^2 + e^1 + e^0) = 0.09$, peeking at a token it must help predict.

## Failure modes

- **Masking after the softmax.** Zeroing weights afterwards leaves rows that no longer sum to 1, and future scores have already shaped the normalisation.
- **Using 0 instead of $-\infty$.** A score of 0 is an ordinary score and still gets weight.
- **Off-by-one targets.** Position $t$ must be trained to predict $w_{t+1}$; predicting $w_t$ lets the model copy its own input.

## Prerequisites

- [[self-attention]]
- [[next-token-prediction]]

## Checks

```check
q: Why does a causal mask set future scores to minus infinity before the softmax instead of zeroing the weights afterwards?
a: Adding minus infinity makes exp of those scores exactly 0, so future positions get zero weight and each row still sums to 1. Zeroing after the softmax leaves rows that no longer sum to 1, and the future scores have already affected the normalisation.
why: Catches thinking the order of masking and softmax does not matter.
```

```check
q: Masked scores for the second row are (1, 3, minus infinity). What are the attention weights?
a: softmax(1, 3) gives about (0.12, 0.88), and the third position gets exactly 0.
why: Catches not being able to carry a mask through the softmax by hand.
```

```check
q: Why is the KV cache correct for a decoder-only transformer, and what does it save at each generation step?
a: Because of the causal mask, earlier positions' keys and values never change when a new token is appended, so they can be stored. Each step then computes query, key and value only for the new token and attends over the cache instead of recomputing the whole prefix.
why: Catches not seeing that the cache relies on the causal mask, or thinking it speeds up training.
```
