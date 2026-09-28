---
id: pinhole-camera-projection
title: Pinhole camera model and perspective projection
summary: "A pinhole camera maps a 3D world point to a pixel in two steps: the extrinsics $[R \mid t]$ move the point into camera coordinates, and the intrinsics $K$ (focal lengths $f_x, f_y$ and principal point $c_x, c_y$) map it to the image through a divide by depth, $u = f_x X/Z + c_x$. The divide makes projection nonlinear, which is why Gaussian splatting linearises it with a Jacobian."
requires: []
tags: [graphics]
sources: []
created: 2026-09-28T15:44:21.190Z
---

# Pinhole camera model and perspective projection

A pinhole camera maps a 3D world point to a pixel in two steps: the extrinsics $[R \mid t]$ move the point into camera coordinates, and the intrinsics $K$ (focal lengths $f_x, f_y$ and principal point $c_x, c_y$) map it to the image through a divide by depth, $u = f_x X/Z + c_x$. The divide makes projection nonlinear, which is why Gaussian splatting linearises it with a Jacobian.

## Why it matters

Every training photo is compared with a render from that photo's camera, so wrong camera parameters mean fitting the wrong geometry. In CP4282 this is the second foundation after the Gaussian: projection decides where each blob lands and how its shape distorts.

## The idea

A world point $X_w$ moves into the camera frame by $X_c = R X_w + t = (X, Y, Z)$. In the OpenCV and COLMAP convention the camera looks along $+Z$, $x$ points right and $y$ down.

The intrinsics are
$$K = \begin{pmatrix} f_x & 0 & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{pmatrix},$$
with focal lengths in pixels. In homogeneous coordinates projection is one product and a divide:
$$\lambda \begin{pmatrix} u \\ v \\ 1 \end{pmatrix} = K\,[R \mid t] \begin{pmatrix} X_w \\ 1 \end{pmatrix}, \qquad \lambda = Z,$$
so $u = f_x X/Z + c_x$ and $v = f_y Y/Z + c_y$.

Dividing by $Z$ makes this nonlinear, so a 3D Gaussian does not project to an exact 2D Gaussian. Splatting uses the Jacobian at the Gaussian's centre,
$$J = \begin{pmatrix} f_x/Z & 0 & -f_x X/Z^2 \\ 0 & f_y/Z & -f_y Y/Z^2 \end{pmatrix},$$
as a local linear map; [[tile-based-gaussian-rasterization]] uses it to project each covariance.

Cameras usually come from structure-from-motion (COLMAP), which also yields the sparse point cloud 3DGS starts from.

## Worked example

Let $f_x = f_y = 500$, $c_x = 320$, $c_y = 240$ (a 640 by 480 image), $R = I$, $t = (0, 0, 4)$ and world point $(1, 0.5, 1)$. In camera coordinates it is $(1, 0.5, 5)$, so
$$u = 500 \cdot \tfrac{1}{5} + 320 = 420, \qquad v = 500 \cdot \tfrac{0.5}{5} + 240 = 290.$$
At camera coordinates $(1, 0.5, 10)$ instead: $u = 370$, $v = 265$. The offset from the principal point halved from $(100, 50)$ to $(50, 25)$. At the first point, $\partial u/\partial X = 500/5 = 100$ and $\partial u/\partial Z = -500/25 = -20$ pixels per unit.

## Failure modes

- **Mixed axis conventions.** OpenGL and Blender cameras look along $-Z$ with $y$ up. Feeding them to code expecting OpenCV gives mirrored or empty renders.
- **Inverting the pose by mistake.** COLMAP stores world-to-camera transforms; treating them as camera-to-world misplaces every camera.
- **Points at or behind the camera.** When $Z \le 0$ the divide gives nonsense, so renderers cull near the camera plane.

## Prerequisites

None beyond general background.

## Checks

```check
q: With fx = fy = 500 and principal point (320, 240), where does the camera-space point (1, 0.5, 5) project?
a: u = 500 * 1/5 + 320 = 420 and v = 500 * 0.5/5 + 240 = 290, so pixel (420, 290).
why: Catches forgetting the divide by depth or the principal point offset.
```

```check
q: Why can a 3D Gaussian not be projected to an exact 2D Gaussian by a pinhole camera, and what does splatting do about it?
a: Perspective projection divides by depth, so it is nonlinear, and only linear maps send Gaussians to Gaussians. Splatting linearises the projection with its Jacobian at the Gaussian's centre, which is exact there and approximate away from it.
why: Catches treating K [R|t] as a linear map on 3D points, ignoring the perspective divide.
```

```check
q: A point moves from depth 5 to depth 10 along the same camera-space X and Y. What happens to its pixel offset from the principal point?
a: It halves, because the offset is f times X over Z, so doubling Z halves it.
why: Catches thinking image position changes linearly with depth.
```
