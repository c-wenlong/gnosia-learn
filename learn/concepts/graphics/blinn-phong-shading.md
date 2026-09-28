---
id: blinn-phong-shading
title: Blinn-Phong shading
summary: Blinn-Phong is an empirical local lighting model that colours a surface point as an ambient term, plus a diffuse term set by the angle to the light, plus a specular highlight set by how closely the normal lines up with the half vector between light and viewer.
requires: [dot-product]
assumes: [rasterization-pipeline]
tags: [graphics]
sources: []
created: 2026-09-28T15:45:53.183Z
---

# Blinn-Phong shading

Blinn-Phong is an empirical local lighting model that colours a surface point as an ambient term, plus a diffuse term set by the angle to the light, plus a specular highlight set by how closely the normal lines up with the half vector between light and viewer.

## Why it matters

It is the standard lighting model of classical real-time graphics, and the one LearnOpenGL's fragment shaders implement. In CP4281 it is the shading refresher: the hand-designed appearance model that learned materials and neural rendering later try to improve on.

## The idea

All vectors are unit length: $n$ the surface normal, $l$ the direction to the light, $v$ the direction to the viewer. Each [[dot-product]] of unit vectors is the cosine of an angle.

$$I = k_a I_a + k_d \max(0, n \cdot l)\, I_l + k_s \max(0, n \cdot h)^{p}\, I_l, \qquad h = \frac{l + v}{\lVert l + v \rVert}$$

**Ambient** $k_a I_a$ is a constant stand-in for indirect light. **Diffuse** is Lambert's cosine law. **Specular** is a highlight, brightest when $h$ lines up with $n$, with shininess $p$ setting its tightness.

Plain Phong uses the mirror direction $r = 2(n \cdot l)n - l$ and $\max(0, r \cdot v)^p$ instead. The angle between $n$ and $h$ is about half that between $r$ and $v$, so Blinn needs a larger exponent (roughly four times) for a similar highlight.

Where the model is evaluated also matters. **Flat** shading lights once per triangle; **Gouraud** lights the vertices and interpolates colours; **Phong shading** interpolates normals and lights each fragment, the only one of the three that catches a highlight inside a large triangle.

It ignores shadows, interreflection and energy conservation (the terms can sum to more light than arrived). It is empirical, not physically based.

## Worked example

Let $n = (0, 0, 1)$, $l = (0, 0.6, 0.8)$, $v = (0, 0, 1)$, a white light with $I_a = I_l = 1$, and $k_a = 0.1$, $k_d = 0.7$, $k_s = 0.5$, $p = 32$.

- Diffuse: $n \cdot l = 0.8$, so $0.7 \times 0.8 = 0.56$.
- Half vector: $l + v = (0, 0.6, 1.8)$ with length $\sqrt{3.6} \approx 1.897$, so $h \approx (0, 0.316, 0.949)$ and $n \cdot h \approx 0.949$.
- Specular: $0.949^{32} \approx 0.185$, times $0.5$ gives $0.093$.
- Total: $0.1 + 0.56 + 0.093 \approx 0.75$.

Plain Phong gives $r = (0, -0.6, 0.8)$, $r \cdot v = 0.8$ and $0.8^{32} \approx 0.0008$: almost no highlight at the same exponent.

## Failure modes

- **Unnormalised vectors.** Interpolated normals shrink, so renormalise per fragment or the dot products stop being cosines.
- **Highlight on the dark side.** If $n \cdot l \le 0$ the light is behind the surface; zero the specular term too.
- **Gouraud missing highlights.** A highlight away from every vertex disappears when colours, not normals, are interpolated.

## Prerequisites

- [[dot-product]]

Useful background: [[rasterization-pipeline]].

## Checks

```check
q: In Blinn-Phong, what is the half vector h and when is the specular term at its maximum?
a: h is the normalised sum of the unit light direction and the unit view direction, h = normalize(l + v). The specular term max(0, n.h)^p is largest when h lines up with the normal n, which is when the surface would mirror the light straight into the eye.
why: Catches confusing the half vector with the reflection vector or with the normal.
```

```check
q: A sphere made of a few large triangles shows no specular highlight with Gouraud shading but does with Phong shading. Why?
a: Gouraud computes lighting only at the vertices and interpolates colours, so a highlight that falls between vertices is never computed. Phong shading interpolates normals and lights each fragment, so it evaluates the highlight where it actually is.
why: Catches mixing up the Phong reflection model with Phong interpolation, and assuming shading frequency does not matter.
```

```check
q: Name two physical effects Blinn-Phong does not model.
a: Any two of: shadows (it never checks whether the light is blocked), interreflection or indirect light (only a constant ambient term stands in for it), and energy conservation (the terms can reflect more light than arrived).
why: Catches treating an empirical shading model as physically based.
```
