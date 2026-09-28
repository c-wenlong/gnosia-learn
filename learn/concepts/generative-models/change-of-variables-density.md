---
id: change-of-variables-density
title: Change of variables for normalising flows
summary: If $x = f(z)$ for an invertible, differentiable $f$ and $z$ has a simple density, then $p_x(x) = p_z(f^{-1}(x))\,\lvert\det \partial f^{-1}/\partial x\rvert$. A normalising flow builds $f$ from many such layers, which gives an exact log-likelihood and an exact latent for every data point, at the cost of keeping each Jacobian determinant cheap.
requires: []
tags: [generative-models]
sources: []
created: 2026-09-28T15:41:04.104Z
---

# Change of variables for normalising flows

If $x = f(z)$ for an invertible, differentiable $f$ and $z$ has a simple density, then $p_x(x) = p_z(f^{-1}(x))\,\lvert\det \partial f^{-1}/\partial x\rvert$. A normalising flow builds $f$ from many such layers, which gives an exact log-likelihood and an exact latent for every data point, at the cost of keeping each Jacobian determinant cheap.

## Why it matters

VAEs only bound the likelihood and GANs have none. Flows get the exact value by making the generator invertible. In CP4283 this is the flows module's foundation: the formula that everything else in it is built to make cheap.

## The idea

Squeezing or stretching space changes density. If $f$ doubles lengths in 1-D, probability mass spreads over twice the length, so density halves. The determinant of the Jacobian measures that local change of volume in $d$ dimensions, and the absolute value is there because orientation does not matter for volume.

For $x = f(z)$ with $z = f^{-1}(x)$,

$$p_x(x) = p_z(z)\,\left\lvert \det \frac{\partial f^{-1}}{\partial x} \right\rvert = p_z(z)\,\left\lvert \det \frac{\partial f}{\partial z} \right\rvert^{-1}.$$

Compose $K$ layers, $x = f_K \circ \cdots \circ f_1(z_0)$ with $z_k = f_k(z_{k-1})$. Logs turn the product into a sum:

$$\log p_x(x) = \log p_z(z_0) - \sum_{k=1}^{K} \log \left\lvert \det \frac{\partial f_k}{\partial z_{k-1}} \right\rvert.$$

Written in the data-to-latent direction, with the inverse maps, the same sum appears with a plus sign.

This gives two things VAEs and GANs lack: exact $\log p(x)$ to train on, and exact inference, $z = f^{-1}(x)$. It also sets the constraints. A general $d \times d$ determinant costs $O(d^3)$, far too much for images, so flow layers are designed to have triangular Jacobians, whose determinant is the product of the diagonal, $O(d)$. And $f$ must be a bijection, so $z$ has exactly the dimension of $x$.

## Worked example

Let $z \sim \mathcal{N}(0, 1)$ and $x = 2z + 1$. Then $f^{-1}(x) = (x - 1)/2$ and $\partial f^{-1}/\partial x = 1/2$, so

$$p_x(x) = \frac{1}{2} \cdot \frac{1}{\sqrt{2\pi}} \exp\!\left(-\frac{(x-1)^2}{8}\right),$$

which is the density of $\mathcal{N}(1, 4)$. At $x = 1$ it is $0.199$, half the base density's peak of $0.399$.

Check it integrates to 1: substitute $u = (x - 1)/2$, so $dx = 2\,du$, and $\int \tfrac12\, \varphi(u)\, 2\, du = \int \varphi(u)\, du = 1$. Leaving out the factor $\tfrac12$ would give a total mass of 2.

## Failure modes

- **Forgetting the Jacobian.** Plugging $f^{-1}(x)$ into $p_z$ alone is not a valid density unless $f$ preserves volume; the mass is wrong wherever $f$ stretches or squeezes.
- **Flipping the sign.** The forward map's log-determinant is subtracted; the inverse map's is added. Mixing the two directions is the common algebra slip.
- **Expecting compression.** A flow's latent has the same dimension as the data, so it does not give a small code the way a VAE can.
- **Fitting discrete data directly.** Pixel values are integers; flows add uniform noise first (dequantisation), or the density can spike without bound.

## Prerequisites

None beyond general background.

## Checks

```check
q: z is standard normal and x = 3z. What is p_x(0), given that the standard normal density at 0 is about 0.399?
a: The inverse is z = x/3 with derivative 1/3, so p_x(0) = 0.399 / 3, about 0.133. Stretching space by 3 spreads the same mass over three times the length.
why: Catches forgetting the Jacobian factor, which would wrongly give 0.399.
```

```check
q: Why do normalising flow layers use architectures with triangular Jacobians?
a: The likelihood needs the log-determinant of the Jacobian at every layer. A general d by d determinant costs O(d^3), which is far too slow for images, while a triangular matrix's determinant is just the product of its diagonal, O(d).
why: Catches not linking the architecture constraint to the cost of computing the exact likelihood.
```

```check
q: Can a normalising flow map 784-dimensional images to a 32-dimensional latent code? Why or why not?
a: No. The change-of-variables formula needs f to be a bijection with a square Jacobian, so the latent must have the same dimension as the data.
why: Catches carrying over the VAE picture of a small bottleneck latent to flows.
```
