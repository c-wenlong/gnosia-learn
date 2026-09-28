---
id: temporal-gaussian-splatting
title: Temporal (4D) Gaussian splatting
summary: Temporal Gaussian splatting reconstructs a moving scene from video for viewing from new angles at any time. Its three main families track one persistent set of 3D Gaussians frame by frame, fit native 4D Gaussians over space and time and slice them at each instant, or keep one canonical set of Gaussians and learn a deformation field that moves them.
requires: [gaussian-splatting-optimization]
tags: [graphics]
sources: []
created: 2026-09-28T15:45:22.149Z
---

# Temporal (4D) Gaussian splatting

Temporal Gaussian splatting reconstructs a moving scene from video for viewing from new angles at any time. Its three main families track one persistent set of 3D Gaussians frame by frame, fit native 4D Gaussians over space and time and slice them at each instant, or keep one canonical set of Gaussians and learn a deformation field that moves them.

## Why it matters

Static 3DGS assumes nothing moves between photos, which people, animals and vehicles break. In CP4282 this opens module 5; the families differ in memory, in how coherent motion stays over time, and in how much capture they need.

## The idea

**1. Per-frame tracking.** Dynamic 3D Gaussians (Luiten et al., 3DV 2024) fixes each Gaussian's colour, opacity and size across time and lets only position and rotation change per timestep. It trains online, one timestep at a time, each initialised from the last, with regularisers for local rigidity, local rotation similarity and long-term local isometry so that neighbours move together. Because the Gaussians persist, their trajectories double as dense 3D tracks. It uses multi-view capture.

**2. Native 4D Gaussians.** Yang et al. (ICLR 2024) give each primitive a 4D mean and covariance over $(x, y, z, t)$. At time $t$ it factors into a conditional 3D Gaussian (where the primitive is) and a 1D marginal in $t$ (how present it is), which scales opacity. When the covariance couples space and time, the conditional mean shifts with $t$, so the primitive moves. Colour uses 4D spherindrical harmonics: spherical harmonics combined with a Fourier series in time.

**3. Canonical space plus deformation.** One set of Gaussians and a learned function of position and time that moves them; see [[canonical-space-deformation-field]].

Per-frame storage grows with the number of frames, while native 4D and deformation models share parameters over time. Monocular video is badly under-constrained: each instant is seen from one viewpoint, so motion and shape can trade off.

## Worked example

Use one spatial dimension. A primitive has mean $(0, 0)$ over $(x, t)$ and covariance
$$\Sigma = \begin{pmatrix} \Sigma_{xx} & \Sigma_{xt} \\ \Sigma_{xt} & \Sigma_{tt} \end{pmatrix} = \begin{pmatrix} 1 & 0.4 \\ 0.4 & 1 \end{pmatrix}.$$
At $t = 1$, conditioning gives mean $\frac{\Sigma_{xt}}{\Sigma_{tt}} \cdot 1 = 0.4$ and variance $\Sigma_{xx} - \Sigma_{xt}^2/\Sigma_{tt} = 0.84$, and the marginal weight is $\exp(-\tfrac12) \approx 0.61$. The primitive moves at 0.4 units per unit time, is slightly narrower, and fades away from its time centre.

Per-frame tracking of 300,000 Gaussians over 150 frames, with 7 motion numbers each (position and quaternion), stores $300{,}000 \times 150 \times 7 \times 4$ bytes $\approx 1.26$ GB of motion alone.

## Failure modes

- **Memory growth.** Per-frame schemes scale linearly with video length.
- **Appearing content.** Persistent Gaussians with fixed colour and opacity struggle with objects that enter or change appearance.
- **Monocular ambiguity.** From one moving camera, results often look right along the training path and break from new views.
- **Flicker.** Without temporal regularisation, independently fitted frames jitter.

## Prerequisites

- [[gaussian-splatting-optimization]]

## Checks

```check
q: In a native 4D Gaussian, how does the coupling term between space and time make a primitive move?
a: Conditioning on time t shifts the spatial mean by (Sigma_xt / Sigma_tt) times (t minus the time centre), so a nonzero space-time covariance gives a mean that moves linearly with t.
why: Catches thinking 4D Gaussians need a separate velocity parameter or network to move.
```

```check
q: Why does storage for per-frame tracking of Gaussians grow with video length while a canonical-plus-deformation model does not?
a: Per-frame tracking stores a new position and rotation for every Gaussian at every timestep, whereas a deformation model stores one set of Gaussians and a fixed-size network that computes their motion for any time.
why: Catches not seeing where each family's memory goes.
```

```check
q: Why is dynamic reconstruction from a single moving camera harder than from a multi-camera rig?
a: Each instant is seen from only one viewpoint, so the model can explain the images with many combinations of shape and motion; multiple simultaneous views pin down the geometry at each time.
why: Catches assuming more frames from one camera substitute for simultaneous views.
```
