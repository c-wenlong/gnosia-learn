---
id: 2d-gaussian-splatting
title: 2D Gaussian splatting (surfels)
summary: 2D Gaussian splatting (2DGS, Huang et al., SIGGRAPH 2024) replaces 3DGS's ellipsoids with flat oriented disks, each with a centre, two tangent directions and two scales, so every primitive has a normal. It renders by intersecting each pixel's ray with each disk's plane, giving the same 3D point from every viewpoint, and regularises depth distortion and normal consistency so disks settle into clean surfaces.
requires: [anisotropic-3d-gaussian, tile-based-gaussian-rasterization]
tags: [graphics]
sources: []
created: 2026-09-28T15:45:32.727Z
---

# 2D Gaussian splatting (surfels)

2D Gaussian splatting (2DGS, Huang et al., SIGGRAPH 2024) replaces 3DGS's ellipsoids with flat oriented disks, each with a centre, two tangent directions and two scales, so every primitive has a normal. It renders by intersecting each pixel's ray with each disk's plane, giving the same 3D point from every viewpoint, and regularises depth distortion and normal consistency so disks settle into clean surfaces.

## Why it matters

3DGS renders good images but poor geometry, while collision, physics, relighting and editing need the surface itself. In CP4282 this is module 6's answer: commit to surfaces and gain accurate geometry. The comparison is in [[surface-vs-volume-splat-tradeoff]].

## The idea

**Primitive.** A 2D Gaussian has centre $p_k$, orthonormal tangents $t_u, t_v$ and scales $(s_u, s_v)$, with normal $t_w = t_u \times t_v$. In the terms of [[anisotropic-3d-gaussian]], it is a 3D Gaussian whose third scale is zero. Points on its plane are
$$P(u, v) = p_k + s_u t_u u + s_v t_v v,$$
with value $G(u, v) = \exp\left(-\tfrac{u^2 + v^2}{2}\right)$. Opacity and colour work as in 3DGS.

**Rendering.** 3DGS's affine projection is exact only at a Gaussian's centre. 2DGS instead finds, per pixel, the exact point where the ray crosses the disk's plane, in $(u, v)$ coordinates, and evaluates $G$ there; a homogeneous plane-intersection formula avoids a matrix inverse. Disks seen edge-on shrink to lines, so a small screen-space low-pass filter keeps them visible. Tiling, sorting and blending follow [[tile-based-gaussian-rasterization]].

**Regularisers.** Photometric loss alone leaves disks scattered in depth. Depth distortion, $\sum_{i,j} \omega_i \omega_j |z_i - z_j|$ over a ray's blending weights, pulls contributing disks together. Normal consistency penalises disagreement between each disk's normal and the normal from the gradient of the rendered depth map.

**Meshes.** Rendered depth maps (the paper uses median depth, where accumulated opacity reaches one half) are fused into a truncated signed distance field (TSDF), and a mesh is extracted.

## Worked example

The camera is at the origin looking along $+z$. A disk centred at $(0, 0, 10)$ is tilted 45 degrees: $t_u = (1, 0, 1)/\sqrt{2}$, $t_v = (0, 1, 0)$, normal $(-1, 0, 1)/\sqrt{2}$, plane $z = 10 + x$, and $s_u = 1$.

The ray $(0.05k, 0, k)$ meets the plane where $k = 10 + 0.05k$, so $k \approx 10.53$, at $(0.526, 0, 10.53)$. Its offset along $t_u$ is $(0.526 + 0.526)/\sqrt{2} \approx 0.744$, so $u = 0.744$ and $G = \exp(-0.277) \approx 0.76$. The ray $(-0.05k, 0, k)$ hits at depth $10/1.05 \approx 9.52$. Depth varies like a real slanted surface, and every camera sees the same points.

A thick 3D Gaussian there has no single surface; the common 3DGS depth render gives all its pixels the centre depth, 10, so the slant disappears.

## Failure modes

- **Fuzzy content.** Hair, foliage and smoke are volumes; disks fit them poorly.
- **Over-regularisation.** Strong regularisers can flatten fine detail.
- **Edge-on disks.** Without the low-pass filter they vanish from side-on views and stop receiving gradients.

## Prerequisites

- [[anisotropic-3d-gaussian]]
- [[tile-based-gaussian-rasterization]]

## Checks

```check
q: Why does 2D Gaussian splatting give multi-view consistent depth while 3D Gaussian splatting does not?
a: A 2DGS disk is evaluated where each pixel ray crosses its plane, which is the same 3D point whichever camera looks at it. A 3D Gaussian is a volume flattened by an approximate projection, so the surface its value is effectively evaluated on changes with viewpoint.
why: Catches thinking the difference is only a thinner shape rather than a different rendering method (ray-splat intersection instead of affine projection).
```

```check
q: What does the normal-consistency loss in 2DGS compare?
a: Each disk's own normal, from the cross product of its tangent vectors, against the surface normal computed from the gradient of the rendered depth map, weighted by the disk's blending weight.
why: Catches assuming 2DGS is supervised with ground-truth normals.
```

```check
q: How is a 2D Gaussian related to a 3D Gaussian's covariance parameterisation?
a: It is a 3D Gaussian with one scale set to exactly zero, so the scale matrix is diag(s_u, s_v, 0) and the third rotation axis is the disk's normal.
why: Catches seeing surfels as an unrelated primitive rather than a degenerate, flat Gaussian.
```
