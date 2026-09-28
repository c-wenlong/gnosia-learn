---
id: splat-level-of-detail
title: Level of detail for Gaussian splats
summary: Distant parts of a large scene cover few pixels, so drawing all their Gaussians wastes time. Level-of-detail methods build a hierarchy of merged parent Gaussians, pick a cut through it each frame so every chosen node projects to about a target pixel size, and blend between levels so switching does not pop.
requires: [tile-based-gaussian-rasterization]
assumes: [scene-partitioning-for-large-splats]
tags: [graphics]
sources: []
created: 2026-09-28T15:45:16.849Z
---

# Level of detail for Gaussian splats

Distant parts of a large scene cover few pixels, so drawing all their Gaussians wastes time. Level-of-detail methods build a hierarchy of merged parent Gaussians, pick a cut through it each frame so every chosen node projects to about a target pixel size, and blend between levels so switching does not pop.

## Why it matters

A partitioned city ([[scene-partitioning-for-large-splats]]) holds far more Gaussians than a frame can afford; level of detail ties per-frame cost to screen resolution instead. In CP4282 it is the rendering half of module 4, and the same idea as mesh LOD and texture mipmaps: use coarser versions where finer detail would be invisible.

## The idea

**Build.** Group nearby Gaussians spatially (for example in an octree or a bounding-volume hierarchy) and merge each group into one parent Gaussian with combined position, covariance, colour and opacity. Repeat up the tree; the leaves are the full-detail Gaussians.

**Select a cut.** A node's projected screen size is roughly $f \cdot s / d$ for focal length $f$ in pixels, world size $s$ and distance $d$. Walk down from the root and stop at the first node at or below a target $\tau$ pixels. Those nodes form the cut and get rasterised.

**Blend levels.** An instant switch from parent to children would pop, so methods interpolate their attributes by how far past the threshold the node is.

Kerbl et al. (2024), "A Hierarchical 3D Gaussian Representation for Real-Time Rendering of Very Large Datasets", trains in chunks, merges Gaussians into a hierarchy whose interior nodes are optimised further, defines granularity as a node's projected size, selects cuts against a target such as one pixel, and interpolates parent and child attributes. Octree-GS (Ren et al. 2024) organises anchors by octree level and picks levels by viewing distance.

## Worked example

Node sizes halve per level: 16, 8, 4, 2, 1, 0.5 and 0.25 m at the leaves. Take $f = 1000$ px and $\tau = 3$ px.

At $d = 100$ m the projected sizes are 160, 80, 40, 20, 10, 5 and 2.5 px. Only the leaves meet $\tau$, so nearby content renders at full detail.

At $d = 1000$ m they are 16, 8, 4, then 2 px at the 2 m level. The cut stops there, three levels above the leaves. Each chosen node stands in for every leaf below it, so that region draws far fewer Gaussians, each still covering about 2 pixels.

## Failure modes

- **Popping at level switches.** Without interpolation the image jumps when a node crosses the threshold.
- **Poor parents.** One merged Gaussian cannot represent a gap, a hole or strong view-dependent colour among its children, so distant structure can look blurred or too solid.
- **Extra memory.** A binary tree has about as many interior nodes as leaves, so a hierarchy can nearly double storage.
- **A badly chosen $\tau$.** Too large looks soft; too small saves nothing.

## Prerequisites

- [[tile-based-gaussian-rasterization]]

Useful background: [[scene-partitioning-for-large-splats]].

## Checks

```check
q: A 2 m node is 1000 m from a camera with focal length 1000 pixels. About how many pixels does it cover, and would a 3 pixel target render it or its children?
a: About 1000 * 2 / 1000 = 2 pixels, which is at or below the 3 pixel target, so the node itself is rendered and its children are skipped.
why: Catches choosing levels by distance alone without relating size, distance and focal length to screen pixels.
```

```check
q: Why do hierarchical splat methods interpolate between a parent and its children instead of switching when the threshold is crossed?
a: An instant switch changes the image abruptly as the camera moves, which appears as popping; interpolating attributes spreads the change over a range of distances.
why: Catches thinking the cut selection alone gives smooth results.
```

```check
q: What kind of detail does a merged parent Gaussian fail to represent?
a: Anything that needs several separate primitives, such as a gap between railings or strongly view-dependent colour among children, since one Gaussian can only be a single smooth blob.
why: Catches assuming coarse levels are just blurrier versions with no structural loss.
```
