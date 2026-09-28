---
id: canonical-space-deformation-field
title: Canonical space plus deformation field
summary: A canonical-space model stores a dynamic scene once, in a rest configuration, and learns a function $D(x, t)$ describing how each part moves at time $t$. For Gaussians, $D$ outputs offsets to position, rotation and scale that carry each canonical Gaussian to its place at time $t$, where it is rasterised as usual.
requires: [temporal-gaussian-splatting]
tags: [graphics]
sources: []
created: 2026-09-28T15:45:27.486Z
---

# Canonical space plus deformation field

A canonical-space model stores a dynamic scene once, in a rest configuration, and learns a function $D(x, t)$ describing how each part moves at time $t$. For Gaussians, $D$ outputs offsets to position, rotation and scale that carry each canonical Gaussian to its place at time $t$, where it is rasterised as usual.

## Why it matters

Storing every frame separately makes memory grow with video length and stops what is learned at one time from helping another; a canonical set shares one geometry across frames. In CP4282 this is the third family of [[temporal-gaussian-splatting]].

## The idea

The idea comes from dynamic NeRFs: D-NeRF (Pumarola et al. 2021) learns a network mapping a point at time $t$ into a canonical scene, and Nerfies (Park et al. 2021) learns per-frame deformations into a canonical template.

The direction of the map differs. A NeRF samples points along rays at time $t$ and must find where each sample sits in the canonical field, so it warps observation to canonical. Gaussians are explicit primitives, so the model warps canonical to time $t$ by moving each one:
$$(\mu_t, r_t, s_t) = (\mu, r, s) + D(\mu, t).$$

- **Deformable 3D Gaussians** (Yang et al., CVPR 2024) feeds positionally encoded position and time into an MLP that outputs $\delta x$, $\delta r$, $\delta s$. During training it adds noise to the time input that shrinks over time (annealing smoothing training) to cope with inaccurate poses.
- **4DGS** (Wu et al., CVPR 2024) reads features from a HexPlane-style factorised space-time grid at each Gaussian's position and time, then decodes position, rotation and scale changes with a lightweight MLP.

Rendering a frame evaluates $D$ once per Gaussian, not per ray sample, so network cost scales with the Gaussian count.

## Worked example

A canonical Gaussian sits at $\mu = (0.2, 1.0, 3.0)$. At $t = 0.5$ the network returns $\delta x = (0.1, 0, 0)$ and no rotation or scale change, so the Gaussian renders at $(0.3, 1.0, 3.0)$ with its canonical colour and opacity.

Memory for 100,000 Gaussians over 300 frames: per-frame motion (position and quaternion) is $100{,}000 \times 300 \times 7 \times 4$ bytes $= 840$ MB. The canonical model is $100{,}000 \times 236$ bytes $\approx 24$ MB plus the network, and half a million 32-bit weights add only 2 MB. Its size does not depend on the number of frames.

## Failure modes

- **Topology changes.** Continuously deforming fixed primitives cannot create content, so things appearing, splitting or tearing (pouring liquid) fit poorly.
- **Large, fast motion.** Big displacements are hard for a smooth network and leave blur or ghosting.
- **Deformation versus appearance.** A colour change can be explained as motion and the reverse, especially from monocular video.
- **Meaningless canonical space.** The rest configuration is whatever optimisation finds and need not match any real frame, which makes edits in it hard to interpret.

## Prerequisites

- [[temporal-gaussian-splatting]]

## Checks

```check
q: Why do dynamic NeRFs usually warp from the observed time into canonical space, while deformable Gaussian methods warp from canonical space to the observed time?
a: A NeRF evaluates its field at ray samples taken at time t, so it must find where each sample sits in the canonical field. Gaussians are explicit primitives, so it is simpler to move each canonical Gaussian forward to time t and rasterise it.
why: Catches assuming the deformation direction is arbitrary or identical in both families.
```

```check
q: How many deformation network evaluations does a deformable Gaussian model need to render one frame?
a: One per Gaussian, since the network moves each Gaussian once and rasterisation then proceeds normally, independent of the number of pixels.
why: Catches carrying over NeRF's per-ray-sample cost to Gaussians.
```

```check
q: Why does a canonical-plus-deformation model struggle with a cup of water being poured?
a: The deformation moves a fixed set of primitives continuously, so it cannot create content that does not exist in the canonical space, and pouring changes topology as liquid appears and separates.
why: Catches thinking a flexible enough deformation network can represent any change in a scene.
```
