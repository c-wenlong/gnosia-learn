---
id: latent-shape-space
title: Latent shape spaces for shape generation
summary: "A latent shape space is a learned low-dimensional code space for a family of shapes: a decoder turns a code $z$ into a shape, and training on a shape collection makes codes near the training codes decode to plausible members of the family. Generating, completing or interpolating shapes becomes choosing a point in that space."
requires: [neural-signed-distance-field]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:25.612Z
---

# Latent shape spaces for shape generation

A latent shape space is a learned low-dimensional code space for a family of shapes: a decoder turns a code $z$ into a shape, and training on a shape collection makes codes near the training codes decode to plausible members of the family. Generating, completing or interpolating shapes becomes choosing a point in that space.

## Why it matters

Fitting one [[neural-signed-distance-field]] to one shape needs dense data and knows nothing about typical shapes. A latent space adds a **prior**: having seen thousands of chairs, the decoder can fill in a chair's back from a scan of its front. CP4281 pairs this with rigging in module 3, but it is the general basis of learned 3D generation.

## The idea

The decoder is, for example, an SDF network $f_\theta(x, z)$ of a query point $x$ and a code $z$; the shape for $z$ is its zero level set. Point-cloud or mesh decoders follow the same logic.

**Training.** DeepSDF (Park et al. 2019) uses an **auto-decoder**: there is no encoder. Each training shape has its own code $z_i$, optimised jointly with the weights to fit its SDF samples, with a penalty $\lVert z_i \rVert^2$ keeping codes near the origin. Alternatives add an encoder (autoencoder or VAE).

**Using the space.**
- *Completion*: freeze $\theta$ and optimise $z$ so $f_\theta(x_k, z)$ matches observed SDF values $s_k$ from a partial scan, plus the norm penalty.
- *Interpolation*: decode codes between two shapes' codes to morph one into the other.
- *Generation*: fit a generative model over codes (VAE, GAN, or [[denoising-diffusion-process]]), sample $z$, decode.

Each ends the same way: evaluate the decoder on a grid, run marching cubes.

## Worked example

A chair decoder uses 256-number codes. A depth camera sees only the front and seat of a new chair: surface points get target SDF $0$, and points slightly in front along the camera rays get small positive targets.

Start from $z = 0$, roughly a typical chair. Gradient descent on $z$ alone moves the seat and front legs toward the scan. The back and rear legs were never observed, but the decoder only makes chair-like shapes, so they appear consistent with the front. Marching cubes on a $256^3$ grid gives a complete, watertight mesh. (Sizes here are illustrative.)

## Failure modes

- **Mode averaging.** With a regression loss, ambiguous cases decode toward an average, so thin parts such as chair spokes blur or vanish.
- **Out-of-distribution shapes.** An unusual chair gets completed as the nearest ordinary chair, confidently and wrongly.
- **Fixed categories.** A chair space cannot produce a lamp.
- **Holes in the space.** Codes far from training codes can decode to implausible shapes unless the space is regularised.

## Prerequisites

- [[neural-signed-distance-field]]

## Checks

```check
q: In DeepSDF-style shape completion from a partial scan, which parameters are optimised and which are frozen?
a: The decoder weights are frozen and only the latent code z is optimised, so that the decoded SDF matches the observed points (with a norm penalty on z). The frozen decoder supplies the prior that fills in unseen parts.
why: Catches thinking completion retrains the network on the new scan, which would discard the learned prior.
```

```check
q: What is an auto-decoder, and how does it get a code for a shape it has never seen?
a: It is a decoder trained without an encoder, where each training shape's code is a free parameter optimised jointly with the weights. For a new shape, the code is found by optimisation against observations of that shape, not by a forward pass.
why: Catches assuming every latent model has an encoder that maps inputs to codes.
```

```check
q: Why do shapes decoded from a latent space trained with a regression loss tend to lose thin parts?
a: Where several shapes fit the code equally well, a regression loss is minimised by their average, and averaging blurs or erases thin structures that differ between them. This is mode averaging.
why: Catches believing a latent space automatically produces sharp, specific shapes.
```
