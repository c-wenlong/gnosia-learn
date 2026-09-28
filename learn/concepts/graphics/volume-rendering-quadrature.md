---
id: volume-rendering-quadrature
title: Volume rendering by alpha compositing
summary: Volume rendering colours a pixel by marching along its ray through a field of density and colour, adding each sample's colour weighted by its opacity and by how much light still gets through from in front of it. The discrete form is front-to-back alpha compositing, and all of it is differentiable.
requires: []
tags: [graphics]
sources: []
created: 2026-09-28T15:44:39.754Z
---

# Volume rendering by alpha compositing

Volume rendering colours a pixel by marching along its ray through a field of density and colour, adding each sample's colour weighted by its opacity and by how much light still gets through from in front of it. The discrete form is front-to-back alpha compositing, and all of it is differentiable.

## Why it matters

A surface renderer must know where the surface is; volume rendering lets every point contribute a little, so pixel colour is a smooth function of the whole field and gradient descent can recover a scene from photos. In CP4281 it is the rendering half of NeRF, and the same sum blends the Gaussians in 3D Gaussian splatting.

## The idea

Model the scene as an emission-absorption volume: density $\sigma \ge 0$ (the rate per unit length at which the ray is stopped) and colour $c$. Sample depths $t_1 < \dots < t_N$ with spacing $\delta_i = t_{i+1} - t_i$, treating $\sigma$ and $c$ as constant within each interval.

Interval $i$ has opacity $\alpha_i = 1 - e^{-\sigma_i \delta_i}$ and transmittance

$$T_i = \exp\Big(-\sum_{j<i} \sigma_j \delta_j\Big) = \prod_{j<i} (1 - \alpha_j).$$

The colour is

$$C = \sum_{i=1}^{N} T_i\, \alpha_i\, c_i = \sum_i w_i c_i.$$

This is the "over" operator applied front to back. The same weights give accumulated opacity $\sum_i w_i$ (the rest is background) and expected depth $\sum_i w_i t_i$.

Everything is products and exponentials of $\sigma$ and $c$, so backpropagation works. 3D Gaussian splatting uses the same sum, but its $\alpha_i$ is a Gaussian's learned opacity times its projected 2D falloff at the pixel, not $1 - e^{-\sigma \delta}$ (see [[anisotropic-3d-gaussian]]).

## Worked example

Three samples at depths $1.0$, $1.5$, $2.0$, each with $\delta = 0.5$. Densities $\sigma = (0.2, 2.0, 4.0)$; colours red, green, blue.

| $i$ | $\alpha_i$ | $T_i$ | $w_i$ |
| --- | --- | --- | --- |
| 1 | $1 - e^{-0.1} = 0.095$ | $1$ | $0.095$ |
| 2 | $1 - e^{-1} = 0.632$ | $0.905$ | $0.572$ |
| 3 | $1 - e^{-2} = 0.865$ | $0.905 \times 0.368 = 0.333$ | $0.288$ |

So $C = (0.095, 0.572, 0.288)$: mostly green, since the second sample is dense and little blocks it. Accumulated opacity is $0.955$, so $4.5\%$ of the background shows. Expected depth is $0.095 \times 1 + 0.572 \times 1.5 + 0.288 \times 2 \approx 1.53$.

## Failure modes

- **Too few samples.** A thin surface between two samples is missed, which is why NeRF resamples where the first pass found weight.
- **Ignoring $\delta$.** A fixed $\alpha$ per sample makes opacity depend on how finely you sampled.
- **Wrong order.** The sum assumes front-to-back order, which is why Gaussian splatting sorts by depth.
- **Reading density as a surface.** Diffuse density can render plausibly from training views, so good images do not guarantee clean geometry.

## Prerequisites

None beyond general background.

## Checks

```check
q: Along a ray, sample 1 has alpha 0.5 and sample 2 has alpha 0.5. What are their compositing weights?
a: Sample 1 has T = 1 so its weight is 0.5. Sample 2 has T = 1 - 0.5 = 0.5 so its weight is 0.5 x 0.5 = 0.25. Together they cover 0.75 of the pixel, leaving 0.25 for whatever is behind.
why: Catches forgetting the transmittance factor and adding alphas as if nothing in front blocked the later sample.
```

```check
q: Why is alpha computed as 1 - exp(-sigma times delta) rather than as sigma alone?
a: Density is per unit length, so the chance of stopping in an interval depends on its length delta; the exponential comes from integrating constant density over that interval. Using sigma alone would make the image change when the sample spacing changes.
why: Catches treating density as an opacity and ignoring sample spacing.
```

```check
q: What do NeRF and 3D Gaussian splatting share in their rendering, and where do they differ?
a: Both compute colour as the sum over sorted contributions of T times alpha times colour, front-to-back alpha compositing. NeRF gets alpha from density sampled by an MLP along the ray, while splatting gets alpha from each Gaussian's opacity times its projected 2D falloff at the pixel.
why: Catches thinking the two methods use unrelated rendering formulas.
```
