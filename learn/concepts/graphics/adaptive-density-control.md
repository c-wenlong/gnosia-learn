---
id: adaptive-density-control
title: "Adaptive density control: clone, split, prune"
summary: Adaptive density control changes how many Gaussians 3DGS has. Every 100 iterations, Gaussians with a large average view-space position gradient are cloned if small or split if large, near-transparent ones are removed, and every 3000 iterations all opacities are pushed near zero so unneeded Gaussians fade and get pruned.
requires: [gaussian-splatting-optimization]
tags: [graphics]
sources: []
created: 2026-09-28T15:44:55.498Z
---

# Adaptive density control: clone, split, prune

Adaptive density control changes how many Gaussians 3DGS has. Every 100 iterations, Gaussians with a large average view-space position gradient are cloned if small or split if large, near-transparent ones are removed, and every 3000 iterations all opacities are pushed near zero so unneeded Gaussians fade and get pruned.

## Why it matters

The structure-from-motion seed cloud is sparse and wrong in places, so a fixed set of Gaussians cannot fit the photos. In CP4282 this is the second half of Kerbl et al. (2023): the [[gaussian-splatting-optimization]] loop moves Gaussians, and this step decides how many exist.

## The idea

**Which to densify.** The trainer averages each Gaussian's loss gradient with respect to its projected 2D position over the views it appears in. Under-covered regions and regions covered by one oversized blob both show large positional gradients, since the optimiser keeps trying to move Gaussians there. Gaussians above $\tau_{\text{pos}} = 0.0002$ are densified.

**Clone (under-reconstruction).** A small Gaussian is copied at the same size and the copy moved along the positional gradient, adding a primitive and total volume.

**Split (over-reconstruction).** A large Gaussian is replaced by two, each with scale divided by $\phi = 1.6$ and position sampled using the original Gaussian as a probability density.

**Prune.** Gaussians with opacity below a small threshold (0.005 in the reference code) are removed, as are ones very large in world space or on screen.

**Opacity reset.** Floaters close to the input cameras inflate the count. Every 3000 iterations all opacities are set near zero; the optimiser raises them only where needed, and the rest get pruned. In the reference code, densification runs from iteration 500 to 15,000 of 30,000.

## Worked example

The reference code counts a Gaussian as large if its largest scale exceeds 1% of the scene extent: 0.1 m for a 10 m scene.

| Gaussian | Avg. gradient | Largest scale | Action |
| --- | --- | --- | --- |
| A | 0.0005 | 0.30 m | split: two children, scales $0.30/1.6 \approx 0.19$ m |
| B | 0.0003 | 0.05 m | clone: a same-size copy |
| C | 0.0001 | 0.30 m | nothing (below threshold) |

Each of A's children has $(1/1.6)^3 \approx 0.24$ of the parent's ellipsoid volume, so the pair covers about half of it; sampled inside the parent, they spread across its footprint while being sharper.

## Failure modes

- **Memory blow-up.** A low threshold or long densification window can grow the scene to many millions of Gaussians and exhaust GPU memory.
- **Floaters.** The opacity reset only partly removes blobs hanging near the cameras.
- **Cancelling gradients.** The per-view position gradient sums pulls from many pixels, so opposite pulls on a large blurry Gaussian can cancel and it never crosses the threshold.
- **Empty regions.** Densification copies what exists, so distant sky with no Gaussians nearby is hard to fill.

## Prerequisites

- [[gaussian-splatting-optimization]]

## Checks

```check
q: A Gaussian has a large average view-space position gradient. What decides whether it is cloned or split?
a: Its size. A small Gaussian (under-reconstruction) is cloned into a same-size copy; a large one (over-reconstruction) is split into two with scales divided by 1.6, positioned by sampling from the original.
why: Catches thinking the gradient threshold alone decides the action, or that clone and split are interchangeable.
```

```check
q: Why does 3DGS periodically reset all opacities close to zero?
a: Floaters near the input cameras and other unneeded Gaussians keep their opacity and inflate the count. After a reset the optimiser raises opacity only where the images need it, and the rest drop below the pruning threshold and are removed.
why: Catches assuming the reset is a regulariser on colour, or that it permanently removes Gaussians by itself.
```

```check
q: Why is a large view-space positional gradient a sign that a region needs more Gaussians?
a: It means the optimiser keeps trying to move the Gaussian to reduce error, which happens when the current primitives cannot fit the region, either because detail is missing or because one large blob is stretched over it.
why: Catches reading gradient size as a measure of opacity or colour error rather than of an under-fitted region.
```
