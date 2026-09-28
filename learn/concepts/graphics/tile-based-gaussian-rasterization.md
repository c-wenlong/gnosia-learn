---
id: tile-based-gaussian-rasterization
title: Tile-based Gaussian rasterisation
summary: The 3DGS rasteriser projects each 3D Gaussian to a 2D Gaussian on screen, copies it into every 16 by 16 pixel tile it overlaps, sorts all copies by tile and depth in one GPU radix sort, and alpha-blends each tile's list front to back. It is differentiable, so gradients flow back to every Gaussian.
requires: [anisotropic-3d-gaussian, pinhole-camera-projection, volume-rendering-quadrature]
tags: [graphics]
sources: []
created: 2026-09-28T15:44:45.047Z
---

# Tile-based Gaussian rasterisation

The 3DGS rasteriser projects each 3D Gaussian to a 2D Gaussian on screen, copies it into every 16 by 16 pixel tile it overlaps, sorts all copies by tile and depth in one GPU radix sort, and alpha-blends each tile's list front to back. It is differentiable, so gradients flow back to every Gaussian.

## Why it matters

This rasteriser is why Kerbl et al. (2023) train fast and render in real time: sorted blending of explicit blobs replaces NeRF's many network queries per ray. In CP4282 it is the core of module 2, joining the Gaussian ([[anisotropic-3d-gaussian]]) and the camera ([[pinhole-camera-projection]]) to the compositing formula of [[volume-rendering-quadrature]].

## The idea

**Cull.** Keep Gaussians whose 99% confidence region meets the view frustum; reject those near the near plane, where projection is unstable.

**Project.** The centre is projected as usual; the covariance uses EWA splatting (Zwicker et al. 2001):
$$\Sigma' = J W \Sigma W^\top J^\top,$$
with $W$ the viewing transformation and $J$ the Jacobian of the affine approximation of the projection at the centre. The top-left $2\times2$ block is the screen-space covariance.

**Duplicate and sort.** Each Gaussian is instanced once per 16 by 16 tile its footprint overlaps, with a 64-bit key: tile index in the high bits, view-space depth of the centre in the low 32. One radix sort then gives every tile a depth-ordered list.

**Blend.** One thread block per tile, one thread per pixel. At offset $d$ from a splat's projected centre, its alpha is opacity times 2D falloff,
$$\alpha_i = o_i \exp\left(-\tfrac{1}{2} d^\top \Sigma'^{-1} d\right),$$
and the colour is
$$C = \sum_i c_i \alpha_i \prod_{j<i} (1 - \alpha_j),$$
NeRF's front-to-back compositing with $\alpha_i$ from a splat instead of $1 - e^{-\sigma_i\delta_i}$. A pixel stops once its opacity saturates; a tile stops when all its pixels have.

**Backward pass.** It walks the same sorted tile lists back to front, recovering each step's transmittance from the final accumulated value, so memory per pixel stays constant.

The order comes from Gaussian centres and is shared by the whole tile, so blending is approximate where splats overlap in depth.

## Worked example

Three splats cover a pixel, each with $\alpha = 0.5$: red $(1,0,0)$, green $(0,1,0)$, blue $(0,0,1)$, front to back. The weights are $0.5$, $0.5 \cdot 0.5 = 0.25$ and $0.125$, so
$$C = (0.5,\ 0.25,\ 0.125),$$
with transmittance $0.125$ left for the background. Reversed, the pixel is $(0.125, 0.25, 0.5)$: order matters, which is why the sort exists.

## Failure modes

- **Treating the sort as exact.** Centre-depth order can mis-order overlapping splats at some pixels, seen as popping when the camera rotates.
- **Large splats.** A splat covering many tiles is duplicated into each, so a few huge Gaussians can dominate sort size and blending time.
- **Trusting the affine projection far from the centre.** $J$ is exact only at the centre, so wide Gaussians near the image edge are distorted.

## Prerequisites

- [[anisotropic-3d-gaussian]]
- [[pinhole-camera-projection]]
- [[volume-rendering-quadrature]]

## Checks

```check
q: Three splats with alpha 0.5 each cover a pixel, coloured red, green, blue from front to back. What is the pixel colour and the leftover transmittance?
a: Weights are 0.5, 0.25 and 0.125, so the colour is (0.5, 0.25, 0.125) and transmittance 0.125 remains for the background.
why: Catches summing alphas directly instead of multiplying by the transmittance left by earlier splats.
```

```check
q: Why does the 3DGS rasteriser put the tile index in the high bits of the sort key and the depth in the low bits?
a: One radix sort then groups all instances by tile and orders each group by depth, so every tile gets a contiguous, depth-ordered list without any per-pixel sorting.
why: Catches thinking each pixel sorts its own Gaussians, or that tiles are sorted separately.
```

```check
q: In what sense is 3DGS alpha blending approximate even with a correct sort?
a: The order comes from each Gaussian's centre depth and is shared by the whole tile, so where overlapping Gaussians would swap order along a particular pixel's ray, that pixel blends them in the wrong order.
why: Catches assuming the sorted order is exact per pixel.
```
