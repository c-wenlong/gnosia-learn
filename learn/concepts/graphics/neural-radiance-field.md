---
id: neural-radiance-field
title: Neural radiance fields (NeRF)
summary: A neural radiance field is an MLP that maps a 3D position and viewing direction to a density and a colour. It is trained on posed photos of one scene by volume-rendering their rays and matching the pixels, and then renders the scene from new viewpoints.
requires: [volume-rendering-quadrature]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:15.035Z
---

# Neural radiance fields (NeRF)

A neural radiance field is an MLP that maps a 3D position and viewing direction to a density and a colour. It is trained on posed photos of one scene by volume-rendering their rays and matching the pixels, and then renders the scene from new viewpoints.

## Why it matters

NeRF (Mildenhall et al., ECCV 2020) showed that a small network plus differentiable [[volume-rendering-quadrature]] recovers fine geometry and view-dependent effects such as reflections from ordinary photos with known camera poses. In CP4281 it is the centre of module 2 and the reference point for the follow-ups.

## The idea

The field is $F_\theta(x, d) \to (\sigma, c)$. **Density $\sigma$ depends only on position $x$**, so geometry is the same from every angle. **Colour $c$ also depends on direction $d$**, so highlights can change with viewpoint; $d$ joins the network only near the end.

Each input coordinate goes through a **positional encoding** $\gamma(p) = (\sin 2^0 \pi p, \cos 2^0 \pi p, \dots, \sin 2^{L-1} \pi p, \cos 2^{L-1} \pi p)$, with $L = 10$ for position and $L = 4$ for direction. Without it spectral bias blurs the result.

**Training**: cast rays for a batch of pixels using the camera poses (usually from structure-from-motion such as COLMAP), sample points, query the MLP, composite, and minimise squared error against the true colours. Sampling is **hierarchical**: a coarse network's compositing weights decide where a fine network gets extra samples.

Each scene is its own optimisation, about one to two days on one GPU in the paper. Follow-ups by the problem they fix:

| Problem | Follow-up | Change |
| --- | --- | --- |
| Slow training and rendering | Instant-NGP (Müller et al. 2022) | Multiresolution hash grid of trainable features, tiny MLP |
| Aliasing across scales | Mip-NeRF (Barron et al. 2021) | Casts cones and encodes a region per sample |
| Photos with varying light, passers-by | NeRF in the Wild (Martin-Brualla et al. 2021) | Per-image appearance codes, transient component |

## Worked example

Render one $800 \times 800$ image (the paper's synthetic-scene resolution) with 64 coarse and 128 extra fine samples per ray. The coarse network runs 64 times per ray, the fine network at all $64 + 128 = 192$ points: 256 evaluations per ray, and $640{,}000 \times 256 \approx 164$ million per image. That is why vanilla NeRF is far from real time, and why Instant-NGP and Gaussian splatting target this cost.

## Failure modes

- **Bad poses.** Small camera pose errors blur the result or duplicate geometry.
- **Floaters.** Semi-transparent blobs in free space explain training views but look wrong from new ones, especially with few photos.
- **Baked lighting.** Colour includes the capture's lighting, so the scene cannot be relit.
- **One scene per network.** Each new scene is trained from scratch.

## Prerequisites

- [[volume-rendering-quadrature]]

## Checks

```check
q: In NeRF, why does density take only position as input while colour takes position and viewing direction?
a: Geometry should be the same from every viewpoint, so making density view-independent forces consistent shape across views. Colour needs direction to model view-dependent effects such as specular highlights and reflections.
why: Catches assuming every output of the field depends on view direction, which would let geometry cheat per view.
```

```check
q: Roughly how many MLP evaluations does vanilla NeRF need for one 800 by 800 image with 64 coarse and 128 fine samples per ray?
a: The coarse network runs at 64 points and the fine network at 192, so 256 per ray. With 640,000 rays that is about 164 million evaluations per image.
why: Catches underestimating why NeRF is slow, or forgetting the fine network also evaluates the coarse samples.
```

```check
q: A NeRF trained on photos of a room taken in afternoon sun is rendered from a new viewpoint. Can you turn the sun off? Why?
a: No. The colours the network learned already include the afternoon lighting, because it models emitted radiance, not materials and lights separately. Relighting needs a model that separates geometry, materials and illumination.
why: Catches thinking NeRF recovers materials rather than baked radiance.
```
