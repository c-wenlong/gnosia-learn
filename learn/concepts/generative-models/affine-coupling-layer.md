---
id: affine-coupling-layer
title: Affine coupling layers
summary: An affine coupling layer splits its input in two, passes one half through unchanged, and scales and shifts the other half by amounts computed from the first. Its Jacobian is triangular, so the log-determinant is just a sum of the predicted log-scales, and inverting it never requires inverting the networks that compute them.
requires: [change-of-variables-density]
tags: [generative-models]
sources: []
created: 2026-09-28T15:41:09.498Z
---

# Affine coupling layers

An affine coupling layer splits its input in two, passes one half through unchanged, and scales and shifts the other half by amounts computed from the first. Its Jacobian is triangular, so the log-determinant is just a sum of the predicted log-scales, and inverting it never requires inverting the networks that compute them.

## Why it matters

The [[change-of-variables-density]] formula needs every layer to be invertible with a cheap determinant. Coupling layers, from RealNVP (Dinh et al. 2017, the course paper), meet both demands while still letting arbitrary neural networks shape the transformation. In CP4283 they are the practical flow, and the point where flows can be weighed against VAEs and GANs.

## The idea

Split $x$ into $(x_1, x_2)$. RealNVP writes the layer in the data-to-latent direction:

$$y_1 = x_1, \qquad y_2 = x_2 \odot \exp\big(s(x_1)\big) + t(x_1),$$

where $s$ and $t$ are any networks. The Jacobian is

$$\frac{\partial y}{\partial x} = \begin{pmatrix} I & 0 \\ \partial y_2 / \partial x_1 & \mathrm{diag}\big(\exp(s(x_1))\big) \end{pmatrix},$$

lower triangular, so $\log \lvert \det \rvert = \sum_j s(x_1)_j$. The messy block $\partial y_2/\partial x_1$ never enters the determinant.

The inverse reads $x_1 = y_1$ off directly, then $x_2 = (y_2 - t(y_1)) \odot \exp(-s(y_1))$. Since $y_1 = x_1$, the same $s$ and $t$ values are recomputed, never inverted, so they can be deep networks. NICE, the earlier version, used only the shift $t$, which makes each layer volume-preserving.

One layer leaves $x_1$ untouched, so layers alternate which half is transformed. RealNVP uses checkerboard and channel-wise splits; Glow (Kingma and Dhariwal 2018) replaces fixed permutations with learned invertible 1x1 convolutions.

| | VAE | GAN | Flow |
| --- | --- | --- | --- |
| Likelihood | lower bound | none | exact |
| Latent | usually smaller than $x$, approximate encoder | any size, no encoder | same size as $x$, exact inverse |
| Main cost | bound gap, often blurry samples | unstable training | many large layers, invertibility limits |

On images, flows' samples have generally trailed GANs and, later, diffusion models.

## Worked example

Two dimensions, $x = (1.0, 2.0)$, with $s(x_1) = 0.5\,x_1$ and $t(x_1) = 3\,x_1$.

- Forward: $s = 0.5$, $t = 3$, so $y_1 = 1.0$ and $y_2 = 2.0 \cdot e^{0.5} + 3 = 3.297 + 3 = 6.297$.
- Log-determinant: $s = 0.5$. So $\log p(x) = \log p_z(y) + 0.5$.
- Inverse: $x_2 = (6.297 - 3)\, e^{-0.5} = 3.297 \times 0.6065 = 2.000$.

Replace $s$ by any function, say $\sin(x_1^3)$, and both directions still work, because $s$ is only ever evaluated.

## Failure modes

- **Thinking $s$ and $t$ must be invertible.** They are only evaluated, on the half that passes through unchanged.
- **Never alternating the halves.** Stacking layers that all transform the same half leaves the other half as identity forever.
- **Letting scales explode.** $\exp(s)$ can blow up; implementations often bound $s$, for example with $\tanh$.

## Prerequisites

- [[change-of-variables-density]]

## Checks

```check
q: In an affine coupling layer y2 = x2 * exp(s(x1)) + t(x1), why can s and t be arbitrary non-invertible neural networks?
a: Inverting the layer only needs s(y1) and t(y1), and y1 equals x1, so the same values are recomputed from the unchanged half and then undone with subtraction and division. The networks are evaluated, never inverted.
why: Catches assuming every component of an invertible layer must itself be invertible.
```

```check
q: A coupling layer's scale network outputs s = (0.2, -0.5, 0.1) for the transformed half. What is the layer's log-determinant, and why is it that simple?
a: It is 0.2 - 0.5 + 0.1 = -0.2. The Jacobian is triangular, with ones for the untouched half and exp(s) on the diagonal for the transformed half, so the log-determinant is the sum of s.
why: Catches thinking a full Jacobian determinant must be computed for each coupling layer.
```

```check
q: Why must a flow alternate which half of the input its coupling layers transform?
a: Each coupling layer copies one half unchanged, so if every layer transformed the same half, the other half would pass through the whole flow as the identity and never be modelled.
why: Catches not seeing that a single coupling layer is only a partial transformation.
```
