---
id: hybrid-neural-rendering
title: Hybrid neural rendering
summary: "Hybrid neural rendering keeps a classical renderer for what it computes exactly and cheaply, and inserts small learned components where brute force is too expensive: caching light after a few bounces, denoising low-sample images, or upscaling low-resolution frames."
requires: [rendering-equation]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:58.109Z
---

# Hybrid neural rendering

Hybrid neural rendering keeps a classical renderer for what it computes exactly and cheaply, and inserts small learned components where brute force is too expensive: caching light after a few bounces, denoising low-sample images, or upscaling low-resolution frames.

## Why it matters

A path tracer estimates [[rendering-equation]] integrals by Monte Carlo sampling, whose noise falls only as one over the square root of the sample count, so sampling alone cannot give clean real-time images. A fully neural renderer such as [[neural-radiance-field]] is trained per scene and cannot easily edit lights or materials. Hybrids keep the scene explicit and editable and buy speed with learned parts. In CP4281 this closes module 6.

## The idea

The classical pipeline stays in charge; learned parts replace specific expensive steps.

| Component | What it replaces | How |
| --- | --- | --- |
| Neural radiance cache (Müller et al. 2021) | Tracing long paths to the end | A small MLP predicts radiance at a path vertex, so paths stop after a few bounces |
| Learned denoiser | Hundreds of samples per pixel | A network maps a noisy image plus buffers (normals, albedo, depth) to a clean one |
| Neural upscaling (for example DLSS) | Shading every pixel at full resolution | A network reconstructs full resolution from fewer pixels, motion vectors and previous frames |
| Neural textures and materials | Hand-authored textures or complex material models | Learned feature maps or small networks decoded when shading |

The radiance cache is trained **online** while rendering: a fraction of paths are traced further to give training targets, so it adapts as camera, lights or objects change, with no pretraining on the scene. The authors report a few milliseconds per frame at full HD. In fully neural rendering, by contrast, the network is the scene and produces every pixel.

## Worked example

Monte Carlo error falls as $1/\sqrt{N}$ in the sample count $N$. A 1080p frame at 1 sample per pixel is about $2.07$ million paths, and very noisy.

Cutting the noise 16-fold needs $16^2 = 256$ times the samples, about $530$ million paths per frame, far beyond a real-time budget. A learned denoiser takes the 1-sample image and the cheap buffers and outputs something close to the high-sample image for one network pass. The radiance cache helps upstream: shorter paths fit more samples in the same time, and its prediction is less noisy than a random tail of bounces.

## Failure modes

- **Temporal instability.** Networks can flicker or smear between frames, and depend on accurate motion vectors.
- **Generalisation.** Pretrained denoisers and upscalers can produce artefacts on scenes unlike their training data.
- **Inference cost.** Each network pass must cost less than the rendering it saves.
- **Debuggability and bias.** Learned output can look plausible while wrong, and no longer converges to the exact answer with more samples as an unbiased path tracer does.

## Prerequisites

- [[rendering-equation]]

## Checks

```check
q: A path tracer at 1 sample per pixel is too noisy. How many times more samples does it need to cut the noise by a factor of 4, and what does a learned denoiser offer instead?
a: Monte Carlo noise falls as 1 over the square root of the sample count, so it needs 16 times more samples. A denoiser takes the cheap noisy image plus buffers such as normals and albedo and predicts a clean image in one network pass.
why: Catches expecting noise to fall linearly with the sample count.
```

```check
q: In neural radiance caching, how is the cache trained and why does that matter?
a: It is trained online while rendering, using a fraction of paths traced further as training targets. It adapts to the current scene and to changing lights and camera without any pretraining on that scene.
why: Catches assuming every neural rendering component is pretrained offline on the specific scene like a NeRF.
```

```check
q: What is the main difference between hybrid neural rendering and a NeRF?
a: A hybrid keeps a classical renderer with explicit geometry, materials and lights and uses networks for specific expensive steps. A NeRF makes the network the whole scene representation and produces every pixel from it, so lights and materials cannot be edited separately.
why: Catches treating all neural rendering as one approach with the same trade-offs.
```
