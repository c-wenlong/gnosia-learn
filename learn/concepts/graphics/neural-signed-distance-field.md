---
id: neural-signed-distance-field
title: Neural signed distance fields
summary: A signed distance field gives, for every point in space, the distance to the nearest surface, negative inside the object and positive outside, so the surface is where the field equals zero. A neural SDF stores that function in the weights of a small network that maps a coordinate to a distance.
requires: []
assumes: [triangle-mesh-representation]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:09.370Z
---

# Neural signed distance fields

A signed distance field gives, for every point in space, the distance to the nearest surface, negative inside the object and positive outside, so the surface is where the field equals zero. A neural SDF stores that function in the weights of a small network that maps a coordinate to a distance.

## Why it matters

A [[triangle-mesh-representation]] has a fixed vertex count and topology, which a network struggles to output. An implicit function has neither: any shape of any topology is the zero set of some function, and the network's size does not depend on the shape. In CP4281 this opens module 2, neural geometry.

## The idea

An **explicit** representation lists the surface; an **implicit** one defines it as a level set, $\{x : f(x) = 0\}$. A true distance function satisfies the **eikonal** property $\lVert \nabla f \rVert = 1$ almost everywhere, and on the surface $\nabla f$ is the outward normal.

A **neural implicit** replaces $f$ with a multilayer perceptron $f_\theta(x)$. DeepSDF (Park et al. 2019) trains one network on many shapes with a per-shape latent code, $f_\theta(x, z)$ (see [[latent-shape-space]]). Occupancy Networks (Mescheder et al. 2019) predict the probability that $x$ is inside, with the surface taken where the probability crosses a chosen threshold. IGR (Gropp et al. 2020) adds an eikonal penalty $(\lVert \nabla f_\theta \rVert - 1)^2$ so the network behaves like a distance field away from the data.

The result is continuous, topology-free and compact. To get a mesh, sample $f$ on a grid and run **marching cubes**. To render directly, **sphere trace**: step along the ray by $f(x)$, safe because no surface is closer.

MLPs learn low frequencies first (spectral bias) and lose fine detail. Mapping $x$ through sines and cosines of increasing frequency (Fourier features, a relative of [[positional-encoding]]) restores it.

## Worked example

The unit sphere has SDF $f(x) = \lVert x \rVert - 1$: $f(0,0,0) = -1$ (inside), $f(2,0,0) = 1$, and $\nabla f = x / \lVert x \rVert$, a unit vector, so the eikonal property holds.

Sphere trace a ray from $(-3, 0.5, 0)$ in direction $(1, 0, 0)$:

| Step | $x$ | $f$ |
| --- | --- | --- |
| 0 | $-3.000$ | $2.041$ |
| 1 | $-0.959$ | $0.081$ |
| 2 | $-0.877$ | $0.0099$ |
| 3 | $-0.8675$ | $0.0013$ |

Each step adds $f$ to $x$; steps shrink near the surface and converge on the true hit $x = -\sqrt{0.75} \approx -0.866$ without passing it.

## Failure modes

- **Not a true distance.** A trained network only approximates an SDF; if it overestimates distance, sphere tracing steps through thin parts.
- **Coarse extraction grid.** Marching cubes on a coarse grid gives a coarse mesh and can miss thin parts.
- **Sign needs a closed surface.** Inside and outside are undefined for non-watertight training meshes, corrupting target signs.

## Prerequisites

None beyond general background.

Useful background: [[triangle-mesh-representation]].

## Checks

```check
q: For an SDF, where is the surface and what is the gradient magnitude of a true distance field?
a: The surface is the zero level set, the points where f(x) = 0, with negative values inside and positive outside. A true distance field has gradient magnitude 1 almost everywhere (the eikonal property), and on the surface the gradient points along the outward normal.
why: Catches treating any function that is zero on the surface as a distance field.
```

```check
q: Why is it safe in sphere tracing to step along a ray by exactly the SDF value at the current point, and when does this break with a neural SDF?
a: The SDF value is the distance to the nearest surface in any direction, so a sphere of that radius contains no surface and the ray cannot skip one. A network that overestimates distance breaks this, and the ray can step through thin geometry.
why: Catches assuming a learned implicit function inherits the distance guarantee automatically.
```

```check
q: An MLP given raw xyz coordinates fits a statue's SDF but loses all the fine carving. What is the usual fix and why does it work?
a: Encode the coordinates with sines and cosines at several frequencies (Fourier features or positional encoding) before the network. MLPs are biased toward low-frequency functions, and the encoding gives them high-frequency inputs to build detail from.
why: Catches blaming network size alone for missing detail rather than spectral bias.
```
