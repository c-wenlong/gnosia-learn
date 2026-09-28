---
id: differentiable-rendering
title: Differentiable rendering
summary: "A differentiable renderer computes an image and the gradient of its pixels with respect to the scene: geometry, materials, lights and camera. With those gradients a scene can be recovered from photos by adjusting it until the rendering matches, which is inverse graphics."
requires: [rasterization-pipeline]
assumes: [volume-rendering-quadrature]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:52.743Z
---

# Differentiable rendering

A differentiable renderer computes an image and the gradient of its pixels with respect to the scene: geometry, materials, lights and camera. With those gradients a scene can be recovered from photos by adjusting it until the rendering matches, which is inverse graphics.

## Why it matters

Vision wants the reverse of rendering. If rendering is differentiable, the reverse is an optimisation (render, compare, backpropagate, update), and a renderer can sit inside a network's training loop. In CP4281 module 6 this is the step from the forward [[rasterization-pipeline]] to inverse graphics, with Mitsuba 3 as the course's renderer.

## The idea

Shading depends smoothly on normals, materials and lights, so ordinary automatic differentiation of it gives correct gradients.

**Visibility is not smooth.** When an edge crosses a pixel, its colour jumps from object to background. A point-sampled pixel is a step function of the edge position, and autodiff returns zero almost everywhere. The pixel's area integral does change smoothly as the edge moves, and that change is the gradient needed to move silhouettes.

Three ways to recover it:
- **Soft rasterisation** (SoftRas, Liu et al. 2019) replaces hard coverage with a smooth coverage falling off with distance to the triangle, and blends triangles softly by depth, trading a slightly altered image for gradients everywhere.
- **Edge sampling** (Li et al. 2018) differentiates the pixel integral properly, estimating the moving-boundary term by sampling points on silhouette edges.
- **Reparameterisation** changes variables so the discontinuity no longer moves with the parameter; Mitsuba 3 offers integrators built on this.

**Volume rendering** avoids hard visibility: opacity is continuous (see [[volume-rendering-quadrature]]), part of why NeRF and Gaussian splatting optimise readily.

## Worked example

A 1-D pixel covers $[0, 1]$: white ($1$) left of an edge at $e$, black ($0$) right of it.

- **Point sample at the centre:** value $= 1$ if $e > 0.5$, else $0$. The derivative is $0$ except at $e = 0.5$, where it is undefined, so gradient descent never moves the edge.
- **Area integral:** value $= \int_0^1 [x < e]\,dx = e$ for $0 \le e \le 1$. The derivative is $1$, the integrand's jump ($1 - 0$) at the edge: exactly the boundary term edge sampling estimates.
- **Soft coverage:** value $= \text{sigmoid}((e - 0.5)/\tau)$ with, say, $\tau = 0.1$. At $e = 0.3$ the derivative is about $1.05$, so the loss can move the edge.

## Failure modes

- **Missing silhouette gradients.** Autodiff of a standard rasteriser moves shading, not edges, so shape optimisation stalls.
- **Blur trade-off in soft rasterisers.** Large softness gives distant gradients but a biased image; small softness the reverse.
- **Local minima.** Photometric losses are non-convex; a far-off initial guess may never converge.
- **Ambiguity.** Different shape, material and lighting can give the same photo, so priors or multiple views are needed.

## Prerequisites

- [[rasterization-pipeline]]

Useful background: [[volume-rendering-quadrature]].

## Checks

```check
q: Why does plain automatic differentiation of a standard rasteriser give no gradient for moving an object's silhouette?
a: Each pixel is point-sampled, so its colour is a step function of the edge position: it stays constant until the edge crosses the sample and then jumps. The derivative is zero almost everywhere, so nothing tells the optimiser to move the edge.
why: Catches assuming autodiff through any rendering code yields correct gradients.
```

```check
q: A pixel covers [0, 1] and is white left of an edge at e and black to the right. What is its area-averaged value and its derivative with respect to e?
a: The value is e (for e between 0 and 1) and the derivative is 1. The pixel gets brighter in proportion to how far the edge advances, which is the gradient a point-sampled pixel misses.
why: Catches not seeing that the pixel integral is smooth even though a point sample is not.
```

```check
q: Why do NeRF and Gaussian splatting avoid the visibility-gradient problem of mesh rasterisation?
a: They render with continuous opacity composited along each ray, so moving or changing a primitive changes pixel colours smoothly instead of switching which surface is visible. Gradients exist everywhere without special edge handling.
why: Catches thinking volume-style renderers need edge sampling or soft rasterisation to be differentiable.
```
