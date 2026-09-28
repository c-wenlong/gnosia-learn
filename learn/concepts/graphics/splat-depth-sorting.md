---
id: splat-depth-sorting
title: Depth sorting for splat rendering
summary: "Alpha blending gives a different colour for a different order, so a splat renderer must put its Gaussians in depth order every frame. 3DGS does this with one GPU radix sort per frame on each Gaussian's centre depth within each tile, which is fast but approximate: overlapping Gaussians can swap order as the camera rotates, causing visible popping."
requires: [tile-based-gaussian-rasterization]
tags: [graphics]
sources: []
created: 2026-09-28T15:45:00.780Z
---

# Depth sorting for splat rendering

Alpha blending gives a different colour for a different order, so a splat renderer must put its Gaussians in depth order every frame. 3DGS does this with one GPU radix sort per frame on each Gaussian's centre depth within each tile, which is fast but approximate: overlapping Gaussians can swap order as the camera rotates, causing visible popping.

## Why it matters

The sort is a major per-frame cost next to blending, and its approximation is the main source of view-inconsistent flicker. In CP4282 this opens module 3: what to sort, and how often, trades frame rate against correctness.

## The idea

Front-to-back compositing, $C = \sum_i c_i \alpha_i \prod_{j<i}(1-\alpha_j)$, needs each pixel's splats in depth order. Exact rendering would find where each Gaussian contributes most along each pixel's ray and sort per pixel, far too slow with thousands of candidates per ray.

[[tile-based-gaussian-rasterization]] simplifies three ways. Each Gaussian gets one depth, the view-space $z$ of its centre. One radix sort on (tile, depth) keys orders every tile at once. Every pixel uses its tile's order. For small, separated splats this is nearly exact; where large ones overlap in depth, some pixels blend in the wrong order.

Rotating the camera changes each centre's view-space $z$, so two overlapping Gaussians can swap places abruptly and their shared pixels change colour at once: popping. StopThePop (Radl et al., SIGGRAPH 2024) replaces the global order with hierarchical per-pixel re-sorting that removes most of it.

Other savings around the sort:

- **Frustum culling** drops off-screen Gaussians before sorting.
- **Tiling** means a pixel only considers splats overlapping its tile.
- **Skipping faint contributions**: the reference code ignores alphas below $1/255$.
- **Early termination** stops a pixel once its remaining transmittance is negligible.

Real-time viewers, such as browser-based ones, often sort asynchronously or less often than they draw, reusing the last order; frame rate stays steady but fast motion can briefly misorder.

## Worked example

The camera is at the origin looking along $+z$. Large Gaussians A (red) at $(0, 0, 5)$ and B (blue) at $(3, 0, 4.9)$ overlap on screen, each with $\alpha = 0.6$ at a shared pixel. Sorted by $z$, B comes first:
$$C = 0.6\,\text{B} + 0.4 \times 0.6\,\text{R} = 0.6\,\text{B} + 0.24\,\text{R}.$$
Turn the camera 10 degrees towards $+x$ without moving it. The new depth is $z' = x \sin 10^\circ + z \cos 10^\circ$: A gets $5 \times 0.985 = 4.92$, B gets $3 \times 0.174 + 4.9 \times 0.985 = 5.35$. A now comes first and the pixel jumps to $0.6\,\text{R} + 0.24\,\text{B}$, with no change in the scene.

## Failure modes

- **Testing with translation only.** A pure translation shifts every centre's view-space $z$ equally, so the order cannot change; popping appears under rotation, and a test path that never turns misses it.
- **Sorting too rarely.** A stale order is cheap but wrong during fast motion.

## Prerequisites

- [[tile-based-gaussian-rasterization]]

## Checks

```check
q: Why does 3D Gaussian splatting show popping when the camera rotates, even though the scene is static?
a: It orders Gaussians by the view-space depth of their centres. Rotation changes those depths, so two overlapping Gaussians can swap order abruptly and the pixels they share change colour at once.
why: Catches thinking popping comes from training noise or from the scene changing, rather than from the centre-depth sort.
```

```check
q: Two overlapping splats with alpha 0.6 each, one red and one blue. What weight does the back splat get?
a: 0.4 * 0.6 = 0.24, against 0.6 for the front splat, so swapping the order changes the pixel from mostly one colour to mostly the other.
why: Catches believing alpha blending is order independent.
```

```check
q: What does a viewer gain and lose by re-sorting splats only every few frames?
a: It gains steadier frame rate because the sort leaves the per-frame path, and it loses correctness during fast camera motion, where the stale order can mis-blend overlapping splats.
why: Catches not seeing the sort as a speed versus correctness trade-off.
```
