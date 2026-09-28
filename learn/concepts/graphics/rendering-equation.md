---
id: rendering-equation
title: The rendering equation
summary: The rendering equation (Kajiya 1986) says the light leaving a surface point in a direction equals the light it emits plus all incoming light reflected towards that direction, integrated over the hemisphere above the point. Rasterisers approximate it with local shading, path tracers estimate it by random sampling, and radiance fields such as NeRF and 3DGS skip it by fitting outgoing light directly from photos.
requires: []
tags: [graphics]
sources: []
created: 2026-09-28T15:44:26.434Z
---

# The rendering equation

The rendering equation (Kajiya 1986) says the light leaving a surface point in a direction equals the light it emits plus all incoming light reflected towards that direction, integrated over the hemisphere above the point. Rasterisers approximate it with local shading, path tracers estimate it by random sampling, and radiance fields such as NeRF and 3DGS skip it by fitting outgoing light directly from photos.

## Why it matters

Every renderer approximates it, so it shows what a method leaves out. In CP4282 it frames the course: Gaussian splatting reproduces captured images fast but does not solve light transport, so its scenes cannot be relit without extra modelling.

## The idea

In its common hemispherical form,
$$L_o(x, \omega_o) = L_e(x, \omega_o) + \int_{\Omega} f_r(x, \omega_i, \omega_o)\, L_i(x, \omega_i)\, (n \cdot \omega_i)\, d\omega_i.$$
$L_o$ is outgoing radiance, $L_e$ emitted radiance, $f_r$ the BRDF (how much light from $\omega_i$ is reflected towards $\omega_o$), $L_i$ incoming radiance and $n \cdot \omega_i$ the cosine foreshortening. It is recursive: light arriving at $x$ from $\omega_i$ is the outgoing light of whatever surface lies in that direction.

The classic renderers treat the integral differently.

| | Rasterisation | Ray / path tracing |
| --- | --- | --- |
| Loop | over primitives, projected to screen | over pixels, rays into the scene |
| Visibility | z-buffer (or sorted blending) | nearest ray hit |
| Integral | local shading, shadows and reflections by extra tricks | Monte Carlo estimate along bounces |
| Cost | fast | slow; noise falls with more samples |

Radiance fields take a third route. NeRF and 3DGS never evaluate a BRDF or trace bounces; they learn $L_o(x, \omega_o)$ itself, a colour per point and viewing direction, from photographs, so the capture's lighting is baked in. 3DGS stores that view dependence as spherical harmonics and rasterises its Gaussians, borrowing the rasteriser's loop and leaving lighting to the photos.

## Worked example

A grey diffuse (Lambertian) surface has albedo $\rho = 0.5$, so $f_r = \rho/\pi$, under a uniform sky of radiance $L = 2$, with no emission. Since $\int_\Omega (n\cdot\omega_i)\,d\omega_i = \pi$,
$$L_o = \frac{\rho}{\pi} \cdot L \cdot \pi = \rho L = 1.$$
A path tracer samples directions instead. With uniform hemisphere sampling (density $1/(2\pi)$), one sample at angle $\theta$ from the normal gives
$$\frac{f_r L \cos\theta}{1/(2\pi)} = 2\rho L\cos\theta = 2\cos\theta.$$
Samples at $\theta = 0$ and $60^\circ$ give 2 and 1, averaging 1.5. The estimator is unbiased (the hemisphere average of $\cos\theta$ is $1/2$, giving 1), but few samples are noisy.

## Failure modes

- **Thinking splatting solves the rendering equation.** It fits observed outgoing radiance; moving a light or changing a material needs extra modelling.
- **Forgetting the recursion.** Direct lighting alone misses bounced light, which is why local rasterised shading looks flat without extra tricks.
- **Dropping the cosine term.** Grazing light then counts as much as overhead light, and surfaces come out too bright.

## Prerequisites

None beyond general background.

## Checks

```check
q: Why is the rendering equation called recursive?
a: The incoming radiance at a point from some direction is the outgoing radiance of the surface seen in that direction, which is itself given by the same equation, so solving it means following light over many bounces.
why: Catches treating incoming light as a fixed input from light sources only.
```

```check
q: A trained 3D Gaussian splatting scene was captured under noon sun. Can you render it correctly under sunset lighting? Why?
a: Not directly. 3DGS fits the outgoing colour seen in the photos with lighting baked in; it has no BRDF, normals or light sources to re-evaluate, so relighting needs extra modelling.
why: Catches assuming radiance fields solve light transport rather than fitting observed appearance.
```

```check
q: For a Lambertian surface with albedo 0.5 under uniform sky radiance 2, what is the outgoing radiance?
a: L_o = (albedo / pi) * L * pi = albedo * L = 0.5 * 2 = 1, because the cosine-weighted hemisphere integral equals pi.
why: Catches forgetting the 1/pi in the Lambertian BRDF or the value of the cosine integral.
```
