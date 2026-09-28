---
id: surface-vs-volume-splat-tradeoff
title: "Surface vs volume primitives: the 2DGS and 3DGS trade-off"
summary: Volumetric 3D Gaussians fit appearance flexibly (fuzzy structure, semi-transparency, view-dependent effects) but give noisy geometry, because surfaces are smeared through thick primitives. Flat 2D Gaussians commit to surfaces, giving much better depth, normals and meshes at a small image-quality cost on hard scenes. Choose by what the output is for.
requires: [2d-gaussian-splatting]
tags: [graphics]
sources: []
created: 2026-09-28T15:45:37.971Z
---

# Surface vs volume primitives: the 2DGS and 3DGS trade-off

Volumetric 3D Gaussians fit appearance flexibly (fuzzy structure, semi-transparency, view-dependent effects) but give noisy geometry, because surfaces are smeared through thick primitives. Flat 2D Gaussians commit to surfaces, giving much better depth, normals and meshes at a small image-quality cost on hard scenes. Choose by what the output is for.

## Why it matters

"Which primitive?" comes up whenever a splatting system is designed, and the answer depends on the downstream task. In CP4282 this closes module 6 by setting [[2d-gaussian-splatting]] beside 3D Gaussian splatting.

## The idea

| | 3D Gaussians (volume) | 2D Gaussians (surfels) |
| --- | --- | --- |
| Shape | ellipsoid, three scales | flat disk, two scales, explicit normal |
| Rendering | affine projection to a 2D splat | exact ray-plane intersection |
| Depth and normals | noisy, view-dependent | consistent across views |
| Fuzzy or translucent content | natural | awkward |
| Mesh extraction | rough | clean, via fused depth |
| Extra losses | none needed for images | depth distortion, normal consistency |

The 2DGS paper shows this. On the DTU object benchmark its average Chamfer distance (lower is better) is 0.80 against 1.96 for 3DGS. On Mip-NeRF 360 its PSNR is 24.34 dB against 24.64 outdoors and 30.40 against 30.41 indoors: nearly equal, slightly lower outdoors.

Why: blending only needs the right colour per pixel, so a volume can spread one surface through several overlapping blobs at different depths. That freedom helps image fitting and hurts geometry. A disk has one depth per ray and a normal, so regularisers can pull disks onto a single surface; the same pull can smooth away real fine detail.

Both render in real time; ray-plane intersection adds a little arithmetic per pixel and primitive.

Decision guide: for novel-view video and scenes full of foliage, hair or glass, prefer 3D Gaussians. For meshes, measurement, physics, collision or relighting, which need a surface with normals, prefer 2D Gaussians.

## Worked example

**A glossy car, for a video orbit.** Radiance fields often reproduce mirror-like reflections with semi-transparent content inside or behind the surface, right in images and wrong as geometry. 3DGS volumes accommodate this. 2DGS regularisers push towards one body surface, leaving low-frequency spherical harmonics (degree 3) to carry the reflection, which blurs it. Choose 3DGS.

**A building facade, for a city mesh.** It is mostly diffuse and planar: 2DGS disks align with the walls and TSDF fusion gives a flat, clean mesh. A mesh from 3DGS depth shows bumps where blobs sit at slightly different depths. Choose 2DGS.

## Failure modes

- **Judging by PSNR alone.** Nearly equal image scores hide a large geometry gap.
- **Assuming 2DGS models reflections physically.** Neither method does; both bake appearance into view-dependent colour.
- **Expecting surfels to handle volumes.** Smoke, hair and dense foliage have no single surface.
- **Over-trusting smooth meshes.** Clean surfaces can still miss wires and railings.

## Prerequisites

- [[2d-gaussian-splatting]]

## Checks

```check
q: Why can a 3D Gaussian splatting scene render correct images yet give poor depth and meshes?
a: Blending only needs the right colour at each pixel, so a surface can be spread through several overlapping blobs at different depths; the images come out right while the depth is smeared and view-dependent.
why: Catches assuming good novel-view images imply accurate geometry.
```

```check
q: You need a watertight mesh of a mostly diffuse building for a physics simulation. Which primitive would you choose and why?
a: 2D Gaussians, because their disks have well-defined normals and consistent depth across views, so fused depth maps give a clean surface mesh; 3DGS depth is too noisy.
why: Catches choosing a method by image quality instead of by the downstream task.
```

```check
q: The 2DGS paper reports much lower Chamfer distance on DTU but slightly lower PSNR outdoors on Mip-NeRF 360 than 3DGS. What trade-off does this show?
a: Committing to surfaces greatly improves geometry while costing a little appearance fidelity on complex real scenes, where volumes fit fuzzy and view-dependent content more easily.
why: Catches reading one metric as proof that one method is better overall.
```
