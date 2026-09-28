---
id: rasterization-pipeline
title: The rasterisation pipeline
summary: "The rasterisation pipeline turns triangles described in 3D into coloured pixels by a fixed sequence of stages: transform each vertex to the screen, work out which pixels each triangle covers, shade those pixels, and keep only the nearest surface at each pixel."
requires: []
tags: [graphics]
sources: []
created: 2026-09-28T15:45:47.807Z
---

# The rasterisation pipeline

The rasterisation pipeline turns triangles described in 3D into coloured pixels by a fixed sequence of stages: transform each vertex to the screen, work out which pixels each triangle covers, shade those pixels, and keep only the nearest surface at each pixel.

## Why it matters

Every real-time GPU renderer runs this pipeline. In CP4281 it is the first refresher topic, and later modules either feed it (meshes, textures, skinning) or replace part of it with something learned or differentiable.

## The idea

**Vertex processing.** Each vertex $p = (x, y, z, 1)$ in homogeneous coordinates is multiplied by three $4 \times 4$ matrices, model, view and projection: $p_{clip} = P\,V\,M\,p$. In OpenGL this is the programmable **vertex shader**.

**Primitive assembly and clipping.** Triangles are clipped against the view volume, where a point is inside when $-w \le x, y, z \le w$.

**Perspective divide and viewport transform.** Dividing by $w$ gives normalised device coordinates (NDC) in $[-1, 1]^3$; the viewport transform maps them to pixels and a depth in $[0, 1]$.

**Rasterisation.** The rasteriser finds the pixel centres inside each triangle and computes barycentric weights that interpolate vertex attributes (colour, normal, UV). Linear interpolation in screen space is wrong under perspective, so GPUs interpolate $a/w$ and $1/w$ and divide: perspective-correct interpolation.

**Fragment shading.** The programmable **fragment shader** computes each covered sample's colour, typically from lighting and textures.

**Depth test and blending.** The z-buffer keeps the nearest depth per pixel and discards fragments behind it. Blending combines a fragment with the framebuffer, for transparency.

## Worked example

Take a camera with a 90 degree field of view, square aspect, near plane $n = 1$ and far plane $f = 3$. The OpenGL projection matrix then gives $x_c = x$, $y_c = y$, $z_c = -2z - 3$ and $w_c = -z$.

A triangle has vertices at $(1, 0, -2)$, $(-1, 0, -2)$ and $(0, 1, -2)$ in camera space. For the first vertex, $(x_c, y_c, z_c, w_c) = (1, 0, 1, 2)$. Dividing by $w_c$ gives NDC $(0.5, 0, 0.5)$. On a $100 \times 100$ viewport, $x_s = (0.5 + 1)/2 \times 100 = 75$, $y_s = 50$, and depth $(0.5 + 1)/2 = 0.75$.

The other vertices land at $(25, 50)$ and $(50, 75)$. The rasteriser fills the pixels inside, the fragment shader colours them, and each is written only if $0.75$ beats the stored depth. Note that $z = -2$ is halfway between the planes, yet already uses three quarters of the depth range.

## Failure modes

- **Z-fighting.** Depth precision is concentrated near the near plane, so two surfaces close together and far from the camera round to the same depth and flicker. Pushing the near plane out helps most.
- **Affine texture warping.** Screen-space linear interpolation makes textures swim and bend on triangles receding in depth.
- **Blending without sorting.** Transparent triangles blended in arbitrary order give order-dependent results; they must be sorted back to front.

## Prerequisites

None beyond general background.

## Checks

```check
q: Why can a GPU not interpolate a vertex attribute such as a UV coordinate linearly across a triangle in screen space?
a: Perspective projection is not affine in depth, so equal steps across the screen do not correspond to equal steps across the surface. The GPU interpolates a/w and 1/w linearly and divides the two, which is perspective-correct interpolation.
why: Catches the belief that barycentric weights computed in screen space can be used directly for attributes.
```

```check
q: With near plane 1 and far plane 3, a point at distance 2 gets a depth of 0.75 in [0,1]. What does this tell you about z-fighting?
a: Depth values are spread non-linearly, with most precision near the near plane, so distant surfaces share few depth values and nearby ones can round to the same value and flicker. Moving the near plane further out is the main fix.
why: Catches the assumption that the z-buffer stores depth with uniform precision.
```

```check
q: Which two stages of the OpenGL pipeline are the ones every program must write as shaders, and what does each output?
a: The vertex shader, which outputs each vertex's clip-space position (and attributes to interpolate), and the fragment shader, which outputs a colour for each covered pixel sample. Clipping, rasterisation and the depth test are fixed-function.
why: Catches confusion between programmable and fixed-function stages, such as thinking rasterisation itself is written in a shader.
```
