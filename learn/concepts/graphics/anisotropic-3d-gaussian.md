---
id: anisotropic-3d-gaussian
title: Anisotropic 3D Gaussians and their covariance
summary: A 3D Gaussian is a smooth blob given by a centre $\mu$ and a $3\times3$ covariance matrix $\Sigma$; its surfaces of equal value are ellipsoids whose axes are the eigenvectors of $\Sigma$ and whose radii are the square roots of its eigenvalues. 3D Gaussian splatting stores the covariance as a rotation and a scale, $\Sigma = R S S^\top R^\top$, so that every gradient step still yields a valid covariance.
requires: []
assumes: [vector-as-a-list-of-numbers]
tags: [graphics]
sources: []
created: 2026-09-28T15:44:15.643Z
---

# Anisotropic 3D Gaussians and their covariance

A 3D Gaussian is a smooth blob given by a centre $\mu$ and a $3\times3$ covariance matrix $\Sigma$; its surfaces of equal value are ellipsoids whose axes are the eigenvectors of $\Sigma$ and whose radii are the square roots of its eigenvalues. 3D Gaussian splatting stores the covariance as a rotation and a scale, $\Sigma = R S S^\top R^\top$, so that every gradient step still yields a valid covariance.

## Why it matters

3D Gaussian splatting (3DGS, Kerbl et al. 2023) represents a scene as millions of these blobs, each with a colour and an opacity. Letting each blob stretch by different amounts along different axes (anisotropy) lets a few primitives cover thin poles and flat walls that would otherwise need many small spheres. In CP4282 this is the first building block: every later module projects, sorts, blends or compresses these ellipsoids.

## The idea

A point $x$ (a [[vector-as-a-list-of-numbers]]) gets the value
$$G(x) = \exp\left(-\tfrac{1}{2}(x-\mu)^\top \Sigma^{-1} (x-\mu)\right).$$
3DGS drops the normalising constant and multiplies $G$ by a learned opacity, so a blob's peak value is its opacity.

To describe an ellipsoid, $\Sigma$ must be symmetric positive semi-definite (no negative variance in any direction). If gradient descent updated its entries freely, one step could produce a negative eigenvalue, which describes no shape. 3DGS instead stores a scale vector $s = (s_x, s_y, s_z)$ and a quaternion $q$, sets $S = \mathrm{diag}(s)$, normalises $q$ and converts it to a rotation $R$, and forms
$$\Sigma = R S S^\top R^\top.$$
Every $R$ and $S$ give a valid covariance, so the optimiser moves all seven numbers freely. Scales pass through an exponential to stay positive.

The columns of $R$ are the eigenvectors of $\Sigma$ (the ellipsoid's axes) and the eigenvalues are $s_x^2, s_y^2, s_z^2$, so the one-standard-deviation radii are the scales themselves.

## Worked example

Take $s = (2, 0.5, 0.5)$, so before rotation $\Sigma_0 = \mathrm{diag}(4, 0.25, 0.25)$: a cigar along $x$. Rotate it 45 degrees about $z$; with $c = \cos 45^\circ = \sin 45^\circ$, $c^2 = 0.5$. The $xy$ block of $R\Sigma_0R^\top$ is
$$\begin{pmatrix} (4+0.25)c^2 & (4-0.25)c^2 \\ (4-0.25)c^2 & (4+0.25)c^2 \end{pmatrix} = \begin{pmatrix} 2.125 & 1.875 \\ 1.875 & 2.125 \end{pmatrix},$$
with $\Sigma_{zz} = 0.25$ and zeros elsewhere. Check: direction $(1,1,0)/\sqrt{2}$ gives $2.125 + 1.875 = 4$ (radius 2 along the diagonal) and $(1,-1,0)/\sqrt{2}$ gives $0.25$ (radius 0.5). The off-diagonal $1.875$ encodes the tilt.

## Failure modes

- **Optimising $\Sigma$ directly.** Unconstrained updates break positive semi-definiteness. The factored form exists for validity, not memory: it stores 7 numbers where a symmetric matrix has 6 unique entries.
- **Reading a scale as the full extent.** $s$ is one standard deviation. Rasterisers treat about three standard deviations as visible, so the drawn footprint is roughly three times wider.
- **Skipping quaternion normalisation.** $R S S^\top R^\top$ stays positive semi-definite (any $MM^\top$ is), but $R$ is no longer a rotation, so the shape is silently distorted.

## Prerequisites

None beyond general background.

Useful background: [[vector-as-a-list-of-numbers]].

## Checks

```check
q: Why does 3D Gaussian splatting optimise a scale vector and a quaternion instead of the six entries of the covariance matrix directly?
a: A covariance must be symmetric positive semi-definite, and a free gradient step on its entries can create a negative eigenvalue that describes no ellipsoid. Building Sigma = R S S^T R^T from any scale and any unit quaternion always gives a valid covariance, so the optimiser can move those numbers freely.
why: Catches the belief that the factorisation is a compression trick rather than a way to keep the covariance valid under gradient descent.
```

```check
q: A Gaussian has scales (2, 0.5, 0.5) and is rotated 45 degrees about z. What are its covariance eigenvalues, and along which directions do they lie?
a: The eigenvalues are the squared scales, 4, 0.25 and 0.25. The value 4 lies along (1,1,0)/sqrt(2), 0.25 along (1,-1,0)/sqrt(2), and 0.25 along z; rotation changes the axes, not the eigenvalues.
why: Catches confusing the rotated matrix entries (2.125, 1.875) with the ellipsoid's radii, and forgetting that eigenvalues are variances (squared scales).
```

```check
q: If every Gaussian in a scene were forced to be isotropic (a sphere), what would happen to the number of primitives needed for a thin fence wire?
a: It would rise sharply, because a sphere wide enough to cover the wire's length is far too wide across it, so the wire must be tiled with many small spheres. An anisotropic Gaussian can be long along the wire and thin across it, covering it with few primitives.
why: Catches not seeing that anisotropy is what lets few primitives fit thin and flat structures.
```
