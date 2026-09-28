---
id: scene-partitioning-for-large-splats
title: Partitioning large scenes for Gaussian splatting
summary: A city-scale capture is too big for one GPU and one optimisation, so large-scene methods divide the ground into cells, give each cell the cameras and points that see it plus a margin, train cells in parallel, and merge by keeping each cell's Gaussians inside its own region. Per-image appearance modelling absorbs lighting differences between photos.
requires: [gaussian-splatting-optimization]
tags: [graphics]
sources: []
created: 2026-09-28T15:45:11.449Z
---

# Partitioning large scenes for Gaussian splatting

A city-scale capture is too big for one GPU and one optimisation, so large-scene methods divide the ground into cells, give each cell the cameras and points that see it plus a margin, train cells in parallel, and merge by keeping each cell's Gaussians inside its own region. Per-image appearance modelling absorbs lighting differences between photos.

## Why it matters

Plain 3DGS assumes the scene fits in one GPU's memory during training; a city breaks that. In CP4282 this opens module 4: partitioning is how training scales, and the same cells later become the unit of streaming and level of detail.

## The idea

**Partition.** Split the ground plane into cells, usually a grid balanced by cameras and points.

**Assign data with margins.** Expand each cell by a margin. A cell trains on cameras inside its expanded region, on outside cameras that see enough of it, and on the SfM points in the expanded region. VastGaussian (Lin et al., CVPR 2024) does this progressively, with an airspace-aware visibility test for choosing cameras.

**Train independently.** Each cell is an ordinary [[gaussian-splatting-optimization]] and can run on its own GPU.

**Merge.** Keep only Gaussians whose centres lie in each cell's original, unexpanded region, and concatenate. The margins mean Gaussians near a boundary were trained with views from both sides.

**Appearance.** Photos taken over hours or days differ in exposure and weather; without help the model paints those differences in as floaters and blotches. The usual fix is a learned per-image appearance embedding. VastGaussian feeds it with the rendered image into a small CNN that outputs a per-image transformation map, used during training only and discarded afterwards, so rendering pays nothing. CityGaussian (Liu et al., ECCV 2024) is another divide-and-conquer design.

**Streaming.** At view time distant cells can load coarsely or later ([[splat-level-of-detail]]).

## Worked example

A 2 km square area becomes a 4 by 4 grid of 500 m cells, each expanded by 50 m. A drone photo taken 30 m outside cell (1,1), looking in, lies in its expanded region, so it trains both that cell and its own. After training, cell (1,1) drops every Gaussian centred outside its 500 m square.

Why split at all? Suppose the area needs 50 million Gaussians. At 236 bytes each that is 11.8 GB of parameters. Training also holds gradients and Adam's two moment estimates, each the same size, so roughly 47 GB before image buffers, beyond a 24 GB GPU. Sixteen cells average about 3 million Gaussians, roughly 3 GB of that state each.

## Failure modes

- **Seams.** Cells trained apart can disagree at boundaries in colour or density, worse with small margins.
- **Cameras that see everything.** An oblique skyline view overlaps many cells, and cells that skip it lose constraints near their edges.
- **Appearance leakage.** With weak appearance modelling, cells settle on different lighting and the merge looks patchy.
- **Load imbalance.** Uniform grids give dense downtown cells far more work.

## Prerequisites

- [[gaussian-splatting-optimization]]

## Checks

```check
q: Why does each cell train with an overlap margin but keep only the Gaussians inside its original boundary when merging?
a: The margin gives Gaussians near the boundary views and points from both sides so they are well constrained; cropping to the original region then stops neighbouring cells from both contributing duplicate Gaussians at the seam.
why: Catches thinking the margin region's Gaussians are kept, or that margins are unnecessary if cells are merged.
```

```check
q: Photos of a city were taken on a sunny and an overcast day. What goes wrong without appearance modelling, and what is the usual fix?
a: The model tries to explain the lighting differences with geometry and colour, producing floaters and blotches. A per-image appearance embedding absorbs the per-photo differences during training, and it can be dropped at render time.
why: Catches assuming photometric inconsistency averages out harmlessly.
```

```check
q: Why can a scene of 50 million Gaussians not be trained on a single 24 GB GPU even though its parameters are about 12 GB?
a: Training also stores gradients and Adam's two moment estimates, each about as large as the parameters, so the state is roughly four times the parameter size before image buffers.
why: Catches counting only parameter memory when estimating training cost.
```
