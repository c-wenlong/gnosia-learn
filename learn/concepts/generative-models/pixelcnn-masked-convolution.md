---
id: pixelcnn-masked-convolution
title: PixelCNN and masked convolutions
summary: PixelCNN applies the [[chain-rule-factorization]] to images, reading pixels in raster order through convolutions masked so each output sees only earlier pixels. Training scores every pixel in one parallel pass; sampling still generates one pixel at a time.
requires: [chain-rule-factorization]
tags: [generative-models]
sources: []
created: 2026-09-28T15:40:26.270Z
---

# PixelCNN and masked convolutions

PixelCNN applies the [[chain-rule-factorization]] to images, reading pixels in raster order through convolutions masked so each output sees only earlier pixels. Training scores every pixel in one parallel pass; sampling still generates one pixel at a time.

## Why it matters

PixelRNN (van den Oord et al. 2016) modelled the conditionals with LSTMs, slow because each state waits on earlier ones. PixelCNN, from the same paper, swaps the LSTMs for masked convolutions so training parallelises. In CP4283 it is the image case of the autoregressive idea.

## The idea

Order the pixels row by row. Each colour pixel splits into sub-pixels R, G, B, predicted in that order, and each sub-pixel gets a 256-way softmax over its values 0 to 255.

A convolution centred on a pixel normally sees later pixels too. A mask zeroes those kernel weights:

| Mask | Used in | Centre position |
| --- | --- | --- |
| Type A | first layer only | excluded (the pixel's own value is the target) |
| Type B | all later layers | included (it now holds features built only from earlier pixels) |

With colour the centre is split by channel: under mask A, G may still see the current R.

Stacked masked convolutions have a blind spot: a triangle of earlier pixels above and to the right never enters the receptive field, however deep the stack. Gated PixelCNN (van den Oord et al. 2016, the course paper) fixes this with two stacks: a vertical stack that sees every row above, and a horizontal stack that sees the current row to the left and also takes in the vertical stack's output. It replaces ReLU with a gated unit, $y = \tanh(W_f * x) \odot \sigma(W_g * x)$, and adds a conditioning vector $h$ (for example a class label) inside both halves of the gate.

## Worked example

Two 3x3 masks, centred on the pixel being predicted:

$$A = \begin{pmatrix} 1 & 1 & 1 \\ 1 & 0 & 0 \\ 0 & 0 & 0 \end{pmatrix}, \qquad B = \begin{pmatrix} 1 & 1 & 1 \\ 1 & 1 & 0 \\ 0 & 0 & 0 \end{pmatrix}.$$

Layer 1 sees three pixels above and one to the left. Can any stack see the pixel at offset $(-1, +2)$, one row up and two right? Each layer moves the view at most one row up, and only a row-up step can move it right, by one column. One row up therefore allows at most one column right, so $(-1, +2)$ is never seen, though it was already generated: the blind spot.

## Failure modes

- **Expecting fast sampling.** Parallelism is for training only; generating a 32x32 colour image takes one network evaluation per sub-pixel, 3072 in all.
- **Using mask B in the first layer.** The first layer would see the value it must predict, so training loss looks excellent and samples are garbage.

## Prerequisites

- [[chain-rule-factorization]]

## Checks

```check
q: Why does the first masked convolution in PixelCNN use mask A while later layers use mask B?
a: The first layer reads raw pixels, so its centre weight would let the output see the very value it must predict; mask A removes it. In later layers the centre position holds features computed only from earlier pixels, so mask B can include it safely.
why: Catches thinking the two masks are interchangeable, or that later layers must also exclude the centre.
```

```check
q: If PixelCNN trains in one parallel pass, why is sampling a 32x32 RGB image still slow?
a: Each sub-pixel must be sampled before the next conditional can be computed, so generation needs one network evaluation per sub-pixel, 32 x 32 x 3 = 3072 sequential passes.
why: Catches assuming parallel training implies parallel generation.
```

```check
q: What is the blind spot in a stack of masked 3x3 convolutions, and how does Gated PixelCNN remove it?
a: A triangle of already-generated pixels above and to the right of the current pixel never enters the receptive field however many layers are stacked. Gated PixelCNN splits the network into a vertical stack covering all rows above and a horizontal stack covering the current row to the left, feeding the vertical stack into the horizontal one.
why: Catches believing that stacking enough masked layers eventually covers all earlier pixels.
```
