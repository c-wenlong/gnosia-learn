---
id: gaussian-splatting-optimization
title: The 3D Gaussian splatting optimisation loop
summary: 3D Gaussian splatting (Kerbl et al., SIGGRAPH 2023) turns each point of a structure-from-motion cloud into a Gaussian with position, scale, rotation, opacity and view-dependent colour, then repeatedly renders a training view, compares it with the photo, and takes an Adam step on every parameter. Adaptive density control runs alongside, adding and removing Gaussians.
requires: [tile-based-gaussian-rasterization]
tags: [graphics]
sources: []
created: 2026-09-28T15:44:50.324Z
---

# The 3D Gaussian splatting optimisation loop

3D Gaussian splatting (Kerbl et al., SIGGRAPH 2023) turns each point of a structure-from-motion cloud into a Gaussian with position, scale, rotation, opacity and view-dependent colour, then repeatedly renders a training view, compares it with the photo, and takes an Adam step on every parameter. Adaptive density control runs alongside, adding and removing Gaussians.

## Why it matters

This loop turns posed photos into a real-time scene; it works because the fast, differentiable rasteriser makes thousands of full-image gradient steps affordable. In CP4282 it is the centre of module 2; later modules compress, scale up, animate or flatten what it produces.

## The idea

**Initialisation.** COLMAP gives camera poses and sparse 3D points. Each point becomes a Gaussian with the point's colour and an isotropic covariance sized by the mean distance to its three nearest neighbours.

**Parameters per Gaussian.**

| Parameter | Numbers | Stored as |
| --- | --- | --- |
| Position | 3 | raw |
| Scale | 3 | log, through an exponential |
| Rotation | 4 | quaternion, normalised |
| Opacity | 1 | through a sigmoid into $[0,1)$ |
| Colour | 48 | spherical harmonics to degree 3: 16 per RGB channel |

Spherical harmonics make colour depend on viewing direction. Training starts at degree 0 and adds one band every 1000 iterations, because higher bands overfit when angular coverage is thin.

**One iteration.** Pick a training camera, render with [[tile-based-gaussian-rasterization]], and compute
$$\mathcal{L} = (1-\lambda)\,\mathcal{L}_1 + \lambda\,\mathcal{L}_{\text{D-SSIM}}, \qquad \lambda = 0.2,$$
where $\mathcal{L}_1$ is mean absolute pixel error and D-SSIM a structural dissimilarity (the reference code uses $1 - \text{SSIM}$). Backpropagate through the rasteriser and take an Adam step on all parameters. The position learning rate decays exponentially.

**Density control.** Every 100 iterations, [[adaptive-density-control]] clones or splits Gaussians in badly fitted regions and prunes near-transparent ones.

The standard schedule is 30,000 iterations, which the paper reports as tens of minutes on one high-end GPU; the result renders at 30 frames per second or more at 1080p. Compared with [[neural-radiance-field]]: NeRF queries a network at many samples along every ray, while 3DGS rasterises explicit primitives with no network in the rendering path.

## Worked example

After rendering one view, suppose $\mathcal{L}_1 = 0.05$ and SSIM is $0.9$. Then
$$\mathcal{L} = 0.8 \times 0.05 + 0.2 \times (1 - 0.9) = 0.04 + 0.02 = 0.06.$$
Its gradient reaches only Gaussians that contributed to that view's pixels, through their blending weights; one hidden behind opaque Gaussians gets no update from it.

## Failure modes

- **Bad poses.** The loop trusts COLMAP's cameras; small pose errors give blur or doubled edges, since no set of Gaussians fits inconsistent views.
- **Sparse initial points.** Regions COLMAP barely reconstructed (sky, blank walls) start empty and rely on densification, often poorly.
- **High SH bands too early.** With little angular coverage they absorb errors and give wrong colours from unseen directions.

## Prerequisites

- [[tile-based-gaussian-rasterization]]

## Checks

```check
q: With lambda = 0.2, an L1 error of 0.05 and SSIM of 0.9, what is the 3DGS training loss, taking D-SSIM as 1 minus SSIM?
a: 0.8 * 0.05 + 0.2 * 0.1 = 0.04 + 0.02 = 0.06.
why: Catches putting lambda on the wrong term or using SSIM itself instead of its dissimilarity.
```

```check
q: Why does rendering a trained 3DGS scene not need any neural network evaluation, unlike NeRF?
a: All scene content is stored explicitly per Gaussian (position, shape, opacity, spherical-harmonic colour), and the image is made by projecting and blending those primitives. NeRF must query its network at many samples along each ray.
why: Catches assuming 3DGS is a neural network or has a decoder at render time.
```

```check
q: Why are opacity and scale stored through a sigmoid and an exponential rather than as raw values?
a: The activations keep opacity in the range 0 to 1 and scales positive whatever values the optimiser reaches, and they give smooth gradients.
why: Catches thinking the optimiser can safely update constrained quantities directly.
```
